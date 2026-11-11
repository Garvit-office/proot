import { Router } from 'express';
import { z } from 'zod';
import { LISTING_STATUSES, ROLES, type AdminStats, type Role } from '@proot/shared';
import { authRequired, requireRole, type AuthedRequest } from '../auth.js';
import { count, one, query } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, h, idParam, notFound, parse } from '../lib/http.js';
import { toBooking, toProduct, toService, toUser } from '../lib/mappers.js';
import { notify } from '../lib/notify.js';
import { disconnectUser } from '../lib/realtime.js';
import { Params, clampLimit, clampOffset, likePattern } from '../lib/sql.js';
import { BOOKING_SELECT } from './care.js';
import { cancelOrder, loadOrders, pushOrder, syncOrderStatus } from './orders.js';
import { broadcastProduct, loadProduct, productSelect } from './products.js';

export const adminRouter = Router();
adminRouter.use('/admin', authRequired, requireRole('ADMIN'));

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

adminRouter.get('/admin/stats', h(async (_req, res) => {
  const byRole = Object.fromEntries(await Promise.all(ROLES.map(async (role) => [role, await count('SELECT COUNT(*) AS n FROM users WHERE role = $1', [role])]))) as Record<Role, number>;
  const [orders, bookings] = await Promise.all([
    one(`SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status IN ('PAID', 'SHIPPED', 'DELIVERED')) AS paid,
           COUNT(*) FILTER (WHERE status = 'PENDING_PAYMENT') AS pending,
           COALESCE(SUM(total_paise) FILTER (WHERE status IN ('PAID', 'SHIPPED', 'DELIVERED')), 0) AS revenue,
           COALESCE(SUM(total_paise) FILTER (WHERE status IN ('PAID', 'SHIPPED', 'DELIVERED') AND paid_at > now() - interval '30 days'), 0) AS revenue30
         FROM orders`),
    one(`SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'REQUESTED' AND is_paid) AS requested,
           COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
           COALESCE(SUM(price_paise) FILTER (WHERE is_paid AND status IN ('REQUESTED', 'CONFIRMED', 'COMPLETED')), 0) AS revenue
         FROM bookings`),
  ]);
  const stats: AdminStats = {
    users: {
      ...byRole,
      total: await count('SELECT COUNT(*) AS n FROM users'),
      newLast7Days: await count(`SELECT COUNT(*) AS n FROM users WHERE created_at >= now() - interval '7 days'`),
      inactive: await count('SELECT COUNT(*) AS n FROM users WHERE NOT is_active'),
    },
    pets: await count('SELECT COUNT(*) AS n FROM pets'),
    events: {
      total: await count('SELECT COUNT(*) AS n FROM events'),
      published: await count('SELECT COUNT(*) AS n FROM events WHERE published'),
      upcoming: await count('SELECT COUNT(*) AS n FROM events WHERE published AND starts_at >= now()'),
    },
    rsvps: await count('SELECT COUNT(*) AS n FROM event_rsvps'),
    products: { total: await count('SELECT COUNT(*) AS n FROM products'), active: await count(`SELECT COUNT(*) AS n FROM products WHERE status = 'ACTIVE'`) },
    orders: { total: orders.total, paid: orders.paid, pendingPayment: orders.pending, revenuePaise: orders.revenue, revenueLast30DaysPaise: orders.revenue30 },
    bookings: { total: bookings.total, requested: bookings.requested, confirmed: bookings.confirmed, completed: bookings.completed, revenuePaise: bookings.revenue },
    services: { total: await count('SELECT COUNT(*) AS n FROM care_services'), active: await count('SELECT COUNT(*) AS n FROM care_services WHERE is_active') },
    parks: { total: await count('SELECT COUNT(*) AS n FROM parks'), dogsNow: await count('SELECT COUNT(*) AS n FROM park_checkins WHERE checked_out_at IS NULL') },
    auditLast24h: await count(`SELECT COUNT(*) AS n FROM audit_logs WHERE created_at >= now() - interval '24 hours'`),
  };
  res.json(stats);
}));

// ---------------------------------------------------------------- users

adminRouter.get('/admin/users', h(async (req, res) => {
  const qy = parse(listQuery, req.query);
  const p = new Params();
  const where: string[] = [];
  if (qy.q) where.push(`(u.email ILIKE ${p.add(likePattern(qy.q))} OR u.name ILIKE $${p.values.length})`);
  if (qy.status && (ROLES as readonly string[]).includes(qy.status)) where.push(`u.role = ${p.add(qy.status)}`);
  if (qy.status === 'inactive') where.push('NOT u.is_active');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await count(`SELECT COUNT(*) AS n FROM users u ${whereSql}`, [...p.values]);
  const limit = clampLimit(qy.limit, 50, 200);
  const offset = clampOffset(qy.offset);
  const rows = await query(
    `SELECT u.*, (SELECT COUNT(*) FROM pets p WHERE p.user_id = u.id) AS pet_count FROM users u ${whereSql}
     ORDER BY u.created_at DESC LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`,
    p.values,
  );
  res.json({ items: rows.map((r) => ({ ...toUser(r), petCount: r.pet_count, lastLoginAt: r.last_login_at })), total, limit, offset });
}));

adminRouter.patch('/admin/users/:id/role', h<AuthedRequest>(async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body, 'Invalid role.');
  const target = await one('SELECT * FROM users WHERE id = $1', [idParam(req)]);
  if (!target) throw notFound('User not found.');
  if (target.role === role) return res.json({ id: target.id, role });
  if (target.id === req.user!.id && role !== 'ADMIN') throw badRequest('You cannot demote yourself.');
  if (target.role === 'ADMIN' && (await count(`SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND is_active`)) <= 1) {
    throw badRequest('At least one active administrator must remain.');
  }
  await query('UPDATE users SET role = $2 WHERE id = $1', [target.id, role]);
  await audit(req.user!.id, 'user.role_change', `Changed ${target.email} from ${target.role} to ${role}`);
  await notify(target.id, { type: 'account.role', title: 'Your account was updated', body: `You now have ${role.replace('_', ' ').toLowerCase()} access.` });
  res.json({ id: target.id, role });
}));

adminRouter.patch('/admin/users/:id/active', h<AuthedRequest>(async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const target = await one('SELECT * FROM users WHERE id = $1', [idParam(req)]);
  if (!target) throw notFound('User not found.');
  if (target.id === req.user!.id) throw badRequest('You cannot deactivate your own account.');
  if (!isActive && target.role === 'ADMIN' && (await count(`SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND is_active`)) <= 1) {
    throw badRequest('At least one active administrator must remain.');
  }
  // Deactivating also invalidates every token the user holds.
  await query('UPDATE users SET is_active = $2, token_version = token_version + CASE WHEN $2 THEN 0 ELSE 1 END WHERE id = $1', [target.id, isActive]);
  if (!isActive) {
    disconnectUser(target.id);
    await query(`UPDATE products SET status = 'ARCHIVED' WHERE seller_id = $1 AND status = 'ACTIVE'`, [target.id]);
    await query('UPDATE care_services SET is_active = false WHERE provider_id = $1', [target.id]);
  }
  await audit(req.user!.id, isActive ? 'user.reactivate' : 'user.deactivate', `${isActive ? 'Reactivated' : 'Deactivated'} ${target.email}`);
  res.json({ id: target.id, isActive });
}));

// ---------------------------------------------------------------- marketplace

adminRouter.get('/admin/products', h(async (req, res) => {
  const qy = parse(listQuery, req.query);
  const p = new Params();
  const select = productSelect(p);
  const where: string[] = [];
  if (qy.q) where.push(`(p.title ILIKE ${p.add(likePattern(qy.q))} OR u.name ILIKE $${p.values.length})`);
  if (qy.status && (LISTING_STATUSES as readonly string[]).includes(qy.status)) where.push(`p.status = ${p.add(qy.status)}`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await count(`SELECT COUNT(*) AS n FROM (${select} ${whereSql}) t`, [...p.values]);
  const limit = clampLimit(qy.limit, 50, 200);
  const offset = clampOffset(qy.offset);
  const rows = await query(`${select} ${whereSql} ORDER BY p.created_at DESC LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`, p.values);
  res.json({ items: rows.map(toProduct), total, limit, offset });
}));

adminRouter.patch('/admin/products/:id/status', h<AuthedRequest>(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(LISTING_STATUSES) }), req.body);
  const existing = await one('SELECT * FROM products WHERE id = $1', [idParam(req)]);
  if (!existing) throw notFound('Listing not found.');
  await query('UPDATE products SET status = $2 WHERE id = $1', [existing.id, status]);
  if (status !== 'ACTIVE') await query('DELETE FROM cart_items WHERE product_id = $1', [existing.id]);
  await audit(req.user!.id, 'product.moderate', `Set ${existing.title} to ${status}`);
  if (status === 'REMOVED') await notify(existing.seller_id, { type: 'product.removed', title: 'A listing was removed', body: `${existing.title} was removed by a moderator.`, link: '/selling' });
  const product = (await loadProduct(existing.id))!;
  broadcastProduct(product);
  res.json(product);
}));

adminRouter.get('/admin/orders', h(async (req, res) => {
  const qy = parse(listQuery, req.query);
  const p = new Params();
  const where: string[] = [];
  if (qy.status) where.push(`o.status::text = ${p.add(qy.status)}`);
  if (qy.q) where.push(`(u.email ILIKE ${p.add(likePattern(qy.q))} OR u.name ILIKE $${p.values.length} OR o.id::text ILIKE $${p.values.length})`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM orders o JOIN users u ON u.id = o.buyer_id';
  const total = await count(`SELECT COUNT(*) AS n ${from} ${whereSql}`, [...p.values]);
  const limit = clampLimit(qy.limit, 50, 200);
  const offset = clampOffset(qy.offset);
  const rows = await query(
    `SELECT o.*, u.name AS buyer_name, u.email AS buyer_email, u.avatar_image_id AS buyer_avatar ${from} ${whereSql}
     ORDER BY o.placed_at DESC LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`,
    p.values,
  );
  res.json({ items: await loadOrders(rows), total, limit, offset });
}));

adminRouter.patch('/admin/orders/:id/status', h<AuthedRequest>(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['CANCELLED', 'SHIPPED', 'DELIVERED']) }), req.body);
  const id = idParam(req);
  const order = await one('SELECT * FROM orders WHERE id = $1', [id]);
  if (!order) throw notFound('Order not found.');
  if (status === 'CANCELLED') return res.json(await cancelOrder(id, req.user!.id, 'Cancelled by Proot support'));
  if (!['PAID', 'SHIPPED'].includes(order.status)) throw conflict('Only paid orders can be marked shipped or delivered.');
  const allowedFrom = status === 'SHIPPED' ? ['PENDING'] : ['PENDING', 'SHIPPED'];
  await query(`UPDATE order_items SET fulfilment = $2 WHERE order_id = $1 AND fulfilment = ANY($3::text[])`, [id, status, allowedFrom]);
  await syncOrderStatus(id);
  await audit(req.user!.id, 'order.status', `Marked order ${id.slice(0, 8)} ${status.toLowerCase()}`);
  await notify(order.buyer_id, { type: `order.${status.toLowerCase()}`, title: status === 'SHIPPED' ? 'Your order has shipped' : 'Your order was delivered', link: `/orders/${id}` });
  await pushOrder(id);
  const rows = await query(`SELECT o.*, u.name AS buyer_name, u.email AS buyer_email, u.avatar_image_id AS buyer_avatar FROM orders o JOIN users u ON u.id = o.buyer_id WHERE o.id = $1`, [id]);
  res.json((await loadOrders(rows))[0]);
}));

// ---------------------------------------------------------------- care

adminRouter.get('/admin/bookings', h(async (req, res) => {
  const qy = parse(listQuery, req.query);
  const p = new Params();
  const where: string[] = [];
  if (qy.status) where.push(`b.status::text = ${p.add(qy.status)}`);
  if (qy.q) where.push(`(cu.name ILIKE ${p.add(likePattern(qy.q))} OR pu.name ILIKE $${p.values.length} OR s.title ILIKE $${p.values.length})`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await count(`SELECT COUNT(*) AS n FROM (${BOOKING_SELECT} ${whereSql}) t`, [...p.values]);
  const limit = clampLimit(qy.limit, 50, 200);
  const offset = clampOffset(qy.offset);
  const rows = await query(`${BOOKING_SELECT} ${whereSql} ORDER BY b.starts_at DESC LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`, p.values);
  res.json({ items: rows.map(toBooking), total, limit, offset });
}));

adminRouter.get('/admin/services', h(async (req, res) => {
  const qy = parse(listQuery, req.query);
  const p = new Params();
  const where: string[] = [];
  if (qy.q) where.push(`(s.title ILIKE ${p.add(likePattern(qy.q))} OR u.name ILIKE $${p.values.length})`);
  if (qy.status === 'active') where.push('s.is_active');
  if (qy.status === 'paused') where.push('NOT s.is_active');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM care_services s JOIN users u ON u.id = s.provider_id';
  const total = await count(`SELECT COUNT(*) AS n ${from} ${whereSql}`, [...p.values]);
  const limit = clampLimit(qy.limit, 50, 200);
  const offset = clampOffset(qy.offset);
  const rows = await query(
    `SELECT s.*, u.name AS provider_name, u.avatar_image_id AS provider_avatar, NULL::float AS distance_km ${from} ${whereSql}
     ORDER BY s.created_at DESC LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`,
    p.values,
  );
  res.json({ items: rows.map(toService), total, limit, offset });
}));

// ---------------------------------------------------------------- audit

adminRouter.get('/admin/audit', h(async (req, res) => {
  const limit = clampLimit(req.query.limit, 100, 500);
  const rows = await query(
    `SELECT a.*, u.name AS actor_name, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit],
  );
  res.json(rows.map((row) => ({ id: row.id, actorId: row.actor_id, actorName: row.actor_name ?? null, actorEmail: row.actor_email ?? null, action: row.action, details: row.details, createdAt: row.created_at })));
}));
