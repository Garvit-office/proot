import { Router } from 'express';
import { z } from 'zod';
import { rupees, type FulfilmentStatus, type Order, type OrderStatus } from '@proot/shared';
import { authRequired, type AuthedRequest } from '../auth.js';
import { appConfig } from '../config.js';
import { one, query, tx, type Db, pool } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, h, idParam, notFound, parse } from '../lib/http.js';
import { toOrder } from '../lib/mappers.js';
import { notify } from '../lib/notify.js';
import { assertPaymentsReady, createPaymentIntent, refundFor, registerPaymentHandler } from '../lib/payments.js';
import { emitToUsers } from '../lib/realtime.js';
import { loadCart, shippingFor } from './cart.js';
import { broadcastProduct } from './products.js';

const ORDER_SELECT = `SELECT o.*, u.name AS buyer_name, u.email AS buyer_email, u.avatar_image_id AS buyer_avatar
                      FROM orders o JOIN users u ON u.id = o.buyer_id`;

const ITEMS_SELECT = `SELECT i.*, s.name AS seller_name, s.avatar_image_id AS seller_avatar,
                        p.image_ids AS product_image_ids, p.image_url AS product_image_url
                      FROM order_items i JOIN users s ON s.id = i.seller_id LEFT JOIN products p ON p.id = i.product_id`;

/** Load orders with their items. With `sellerId`, only that seller's line items are included. */
export async function loadOrders(orderRows: any[], sellerId?: string, db: Db = pool): Promise<Order[]> {
  if (!orderRows.length) return [];
  const ids = orderRows.map((o) => o.id);
  const items = await query(
    `${ITEMS_SELECT} WHERE i.order_id = ANY($1::uuid[]) ${sellerId ? 'AND i.seller_id = $2' : ''} ORDER BY i.title`,
    sellerId ? [ids, sellerId] : [ids],
    db,
  );
  return orderRows.map((row) => toOrder(row, items.filter((i) => i.order_id === row.id)));
}

export async function loadOrder(id: string, sellerId?: string, db: Db = pool) {
  const row = await one(`${ORDER_SELECT} WHERE o.id = $1`, [id], db);
  return row ? (await loadOrders([row], sellerId, db))[0] : null;
}

/** Push the order to the buyer (full) and to each seller (their items only). */
export async function pushOrder(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  emitToUsers([order.buyer.id], 'order:updated', order);
  for (const sellerId of new Set(order.items.map((i) => i.seller.id))) {
    emitToUsers([sellerId], 'order:updated', { ...order, items: order.items.filter((i) => i.seller.id === sellerId) });
  }
}

/** Return reserved stock for every line item to its listing. */
async function restock(orderId: string, db: Db) {
  const rows = await query(
    `UPDATE products p SET stock = p.stock + i.quantity,
            status = CASE WHEN p.status = 'SOLD_OUT' THEN 'ACTIVE'::listing_status ELSE p.status END
     FROM order_items i WHERE i.order_id = $1 AND i.product_id = p.id AND i.fulfilment <> 'CANCELLED'
     RETURNING p.id, p.stock, p.status`,
    [orderId],
    db,
  );
  return rows;
}

/** Cancel an order: refund if paid, release stock. Caller has checked permissions. */
export async function cancelOrder(orderId: string, actorId: string, reason: string) {
  const { order, restocked, refunded } = await tx(async (db) => {
    const order = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], db);
    if (!order) throw notFound('Order not found.');
    if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)) throw conflict(`This order is already ${order.status.toLowerCase()}.`);
    if (order.status === 'SHIPPED') throw conflict('This order has shipped and can no longer be cancelled.');
    const refunded = order.status === 'PAID' ? await refundFor('ORDER', order.id, db) : false;
    const restocked = await restock(order.id, db);
    await query(`UPDATE order_items SET fulfilment = 'CANCELLED' WHERE order_id = $1`, [order.id], db);
    await query(`UPDATE orders SET status = $2 WHERE id = $1`, [order.id, refunded ? 'REFUNDED' : 'CANCELLED'], db);
    await query(`UPDATE payments SET status = 'FAILED', failure_reason = $2 WHERE purpose = 'ORDER' AND reference_id = $1 AND status = 'CREATED'`, [order.id, reason], db);
    return { order, restocked, refunded };
  });
  restocked.forEach((p) => broadcastProduct(p));
  await audit(actorId, 'order.cancel', `Cancelled order ${order.id.slice(0, 8)} (${reason})${refunded ? ', refunded' : ''}`);
  await notify(order.buyer_id, {
    type: 'order.cancelled',
    title: refunded ? 'Order cancelled and refunded' : 'Order cancelled',
    body: refunded ? `${rupees(order.total_paise)} is on its way back to you.` : reason,
    link: `/orders/${order.id}`,
  });
  await pushOrder(order.id);
  return (await loadOrder(order.id))!;
}

// ------------------------------------------------------------- payment hook

registerPaymentHandler('ORDER', {
  async onPaid(orderId, db) {
    await query(`UPDATE orders SET status = 'PAID', paid_at = now() WHERE id = $1 AND status = 'PENDING_PAYMENT'`, [orderId], db);
  },
  async afterPaid(orderId) {
    const order = await one('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!order) return;
    if (order.status !== 'PAID') {
      // Paid after the order expired or was cancelled: give the money back.
      await refundFor('ORDER', orderId);
      await notify(order.buyer_id, { type: 'order.refunded', title: 'Payment refunded', body: 'Your order had expired before payment arrived, so we refunded it.', link: `/orders/${orderId}` });
      return;
    }
    await notify(order.buyer_id, { type: 'order.paid', title: 'Order confirmed', body: `We’ve received ${rupees(order.total_paise)}. Sellers will ship soon.`, link: `/orders/${orderId}` });
    const sellers = await query(`SELECT seller_id, string_agg(title || ' × ' || quantity, ', ') AS items FROM order_items WHERE order_id = $1 GROUP BY seller_id`, [orderId]);
    for (const s of sellers) {
      await notify(s.seller_id, { type: 'order.new_sale', title: 'New sale', body: `${s.items} — please ship it.`, link: `/selling/orders` });
    }
    await pushOrder(orderId);
  },
});

/** Cancel unpaid orders past their TTL (runs on an interval). */
export async function expireUnpaidOrders() {
  const stale = await query(
    `SELECT id, buyer_id FROM orders WHERE status = 'PENDING_PAYMENT' AND placed_at < now() - ($1 || ' minutes')::interval`,
    [String(appConfig.pendingOrderTtlMin)],
  );
  for (const order of stale) {
    await cancelOrder(order.id, order.buyer_id, 'Payment not completed in time').catch((e) => console.error('expire order', e.message));
  }
}

// ------------------------------------------------------------- routes

const addressSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.'),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).default(''),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN codes have 6 digits.'),
});

const checkoutSchema = z.union([
  z.object({ addressId: z.string().uuid() }),
  z.object({ address: addressSchema, saveAddress: z.boolean().default(false) }),
]);

export const ordersRouter = Router();

ordersRouter.post('/orders', authRequired, h<AuthedRequest>(async (req, res) => {
  assertPaymentsReady();
  const body = parse(checkoutSchema, req.body, 'Add a delivery address.');
  const user = req.user!;

  let address: z.infer<typeof addressSchema>;
  if ('addressId' in body) {
    const saved = await one('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [body.addressId, user.id]);
    if (!saved) throw notFound('Address not found.');
    address = { fullName: saved.full_name, phone: saved.phone, line1: saved.line1, line2: saved.line2, city: saved.city, state: saved.state, pincode: saved.pincode };
  } else {
    address = body.address;
    if (body.saveAddress) {
      await query(
        `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
         VALUES ($1, 'Home', $2, $3, $4, $5, $6, $7, $8, NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1))`,
        [user.id, address.fullName, address.phone, address.line1, address.line2, address.city, address.state, address.pincode],
      );
    }
  }

  const { orderId, payment, touched } = await tx(async (db) => {
    // Lock the listings in the cart so two buyers can't take the last unit.
    const lines = await query(
      `SELECT c.quantity, p.id, p.title, p.price_paise, p.stock, p.status, p.seller_id, s.is_active AS seller_active
       FROM cart_items c JOIN products p ON p.id = c.product_id JOIN users s ON s.id = p.seller_id
       WHERE c.user_id = $1 ORDER BY p.id FOR UPDATE OF p`,
      [user.id],
      db,
    );
    if (!lines.length) throw badRequest('Your cart is empty.');
    const problems = lines.filter((l) => l.status !== 'ACTIVE' || !l.seller_active || l.stock < l.quantity || l.seller_id === user.id);
    if (problems.length) {
      throw conflict(`Some items changed: ${problems.map((l) => (l.stock < l.quantity && l.status === 'ACTIVE' ? `only ${l.stock} left of ${l.title}` : `${l.title} is unavailable`)).join('; ')}. Update your cart and try again.`);
    }

    const subtotal = lines.reduce((sum, l) => sum + l.price_paise * l.quantity, 0);
    const shipping = shippingFor(subtotal);
    const order = await one(
      `INSERT INTO orders (buyer_id, subtotal_paise, shipping_paise, total_paise, shipping_address) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.id, subtotal, shipping, subtotal + shipping, address],
      db,
    );
    const touched = [];
    for (const l of lines) {
      await query(
        `INSERT INTO order_items (order_id, product_id, seller_id, title, unit_paise, quantity) VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, l.id, l.seller_id, l.title, l.price_paise, l.quantity],
        db,
      );
      touched.push(await one(
        `UPDATE products SET stock = stock - $2, status = CASE WHEN stock - $2 = 0 THEN 'SOLD_OUT'::listing_status ELSE status END
         WHERE id = $1 RETURNING id, stock, status`,
        [l.id, l.quantity],
        db,
      ));
    }
    await query('DELETE FROM cart_items WHERE user_id = $1', [user.id], db);
    const count = lines.reduce((n, l) => n + l.quantity, 0);
    const payment = await createPaymentIntent({
      user,
      purpose: 'ORDER',
      referenceId: order.id,
      amountPaise: subtotal + shipping,
      description: `${count} item${count === 1 ? '' : 's'} from Proot`,
    }, db);
    return { orderId: order.id, payment, touched };
  });

  touched.forEach((p) => broadcastProduct(p));
  emitToUsers([user.id], 'cart:updated', { count: 0 });
  await audit(user.id, 'order.create', `Placed order ${orderId.slice(0, 8)} for ${rupees(payment.amountPaise)}`);
  res.status(201).json({ order: await loadOrder(orderId), payment });
}));

ordersRouter.get('/orders', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query(`${ORDER_SELECT} WHERE o.buyer_id = $1 ORDER BY o.placed_at DESC LIMIT 200`, [req.user!.id]);
  res.json(await loadOrders(rows));
}));

ordersRouter.get('/orders/selling', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query(
    `${ORDER_SELECT} WHERE o.status <> 'PENDING_PAYMENT' AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.seller_id = $1)
     ORDER BY o.placed_at DESC LIMIT 200`,
    [req.user!.id],
  );
  res.json(await loadOrders(rows, req.user!.id));
}));

ordersRouter.get('/orders/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const order = await loadOrder(idParam(req));
  if (!order) throw notFound('Order not found.');
  const user = req.user!;
  if (order.buyer.id === user.id || user.role === 'ADMIN') return res.json(order);
  if (order.items.some((i) => i.seller.id === user.id) && order.status !== 'PENDING_PAYMENT') {
    return res.json({ ...order, items: order.items.filter((i) => i.seller.id === user.id) });
  }
  throw notFound('Order not found.');
}));

ordersRouter.post('/orders/:id/pay', authRequired, h<AuthedRequest>(async (req, res) => {
  const order = await one('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [idParam(req), req.user!.id]);
  if (!order) throw notFound('Order not found.');
  if (order.status !== 'PENDING_PAYMENT') throw conflict('This order doesn’t need payment.');
  res.json(await createPaymentIntent({ user: req.user!, purpose: 'ORDER', referenceId: order.id, amountPaise: order.total_paise, description: 'Proot order' }));
}));

ordersRouter.post('/orders/:id/cancel', authRequired, h<AuthedRequest>(async (req, res) => {
  const order = await one('SELECT * FROM orders WHERE id = $1', [idParam(req)]);
  if (!order || (order.buyer_id !== req.user!.id && req.user!.role !== 'ADMIN')) throw notFound('Order not found.');
  if (order.status === 'PAID') {
    const shipped = await one(`SELECT 1 FROM order_items WHERE order_id = $1 AND fulfilment IN ('SHIPPED', 'DELIVERED')`, [order.id]);
    if (shipped) throw conflict('Part of this order has shipped, so it can’t be cancelled.');
  }
  res.json(await cancelOrder(order.id, req.user!.id, 'Cancelled by buyer'));
}));

const NEXT: Record<FulfilmentStatus, FulfilmentStatus[]> = { PENDING: ['SHIPPED', 'DELIVERED'], SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };

/** Derive the order status from its line items after fulfilment changes. */
export async function syncOrderStatus(orderId: string, db: Db = pool) {
  const items = await query(`SELECT fulfilment FROM order_items WHERE order_id = $1 AND fulfilment <> 'CANCELLED'`, [orderId], db);
  let status: OrderStatus | null = null;
  if (items.length && items.every((i) => i.fulfilment === 'DELIVERED')) status = 'DELIVERED';
  else if (items.length && items.every((i) => i.fulfilment !== 'PENDING')) status = 'SHIPPED';
  if (status) await query(`UPDATE orders SET status = $2 WHERE id = $1 AND status IN ('PAID', 'SHIPPED')`, [orderId, status], db);
  return status;
}

ordersRouter.patch('/orders/:orderId/items/:itemId', authRequired, h<AuthedRequest>(async (req, res) => {
  const { fulfilment } = parse(z.object({ fulfilment: z.enum(['SHIPPED', 'DELIVERED']) }), req.body);
  const item = await one(
    `SELECT i.*, o.status AS order_status, o.buyer_id FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = $1 AND i.order_id = $2`,
    [idParam(req, 'itemId'), idParam(req, 'orderId')],
  );
  if (!item) throw notFound('Order item not found.');
  if (item.seller_id !== req.user!.id && req.user!.role !== 'ADMIN') throw forbidden('Only the seller can update this item.');
  if (!['PAID', 'SHIPPED'].includes(item.order_status)) throw conflict('This order isn’t ready to ship.');
  if (!NEXT[item.fulfilment as FulfilmentStatus].includes(fulfilment)) throw conflict(`This item is already ${item.fulfilment.toLowerCase()}.`);

  await query('UPDATE order_items SET fulfilment = $2 WHERE id = $1', [item.id, fulfilment]);
  const status = await syncOrderStatus(item.order_id);
  await notify(item.buyer_id, {
    type: `order.${fulfilment.toLowerCase()}`,
    title: fulfilment === 'SHIPPED' ? 'Your item has shipped' : 'Your item was delivered',
    body: item.title + (status === 'DELIVERED' ? ' — your whole order has arrived.' : ''),
    link: `/orders/${item.order_id}`,
  });
  await pushOrder(item.order_id);
  const order = (await loadOrder(item.order_id, req.user!.role === 'ADMIN' ? undefined : req.user!.id))!;
  res.json(order);
}));
