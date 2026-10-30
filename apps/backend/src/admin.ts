import { Router, type Response } from 'express';
import { ROLES, type AdminStats, type Role } from '@proot/shared';
import { authRequired, requireRole, type AuthedRequest } from './auth.js';
import { getDb } from './db.js';
import { audit } from './utils.js';

export const adminRouter = Router();
adminRouter.use('/admin', authRequired, requireRole('ADMIN'));

const count = (sql: string, ...params: unknown[]) => (getDb().prepare(sql).get(...params) as { n: number }).n;

adminRouter.get('/admin/stats', (_req: AuthedRequest, res: Response) => {
  const now = Date.now();
  const byRole = Object.fromEntries(ROLES.map((role) => [role, count('SELECT COUNT(*) AS n FROM users WHERE role = ?', role)])) as Record<Role, number>;
  const stats: AdminStats = {
    users: {
      ...byRole,
      total: count('SELECT COUNT(*) AS n FROM users'),
      newLast7Days: count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', new Date(now - 7 * 864e5).toISOString()),
    },
    pets: count('SELECT COUNT(*) AS n FROM pets'),
    events: {
      total: count('SELECT COUNT(*) AS n FROM events'),
      published: count('SELECT COUNT(*) AS n FROM events WHERE published = 1'),
      upcoming: count('SELECT COUNT(*) AS n FROM events WHERE published = 1 AND starts_at >= ?', new Date(now).toISOString()),
    },
    rsvps: count('SELECT COUNT(*) AS n FROM event_rsvps'),
    auditLast24h: count('SELECT COUNT(*) AS n FROM audit_logs WHERE created_at >= ?', new Date(now - 864e5).toISOString()),
  };
  res.json(stats);
});

adminRouter.get('/admin/users', (_req: AuthedRequest, res: Response) => {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.created_at, COUNT(p.id) AS pet_count
       FROM users u LEFT JOIN pets p ON p.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at DESC`,
    )
    .all() as any[];
  res.json(rows.map((row) => ({ id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at, petCount: row.pet_count })));
});

adminRouter.patch('/admin/users/:id/role', (req: AuthedRequest, res: Response) => {
  const role = req.body?.role;
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const target = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === role) return res.json({ id: target.id, role });

  if (target.id === req.user!.id && role !== 'ADMIN') {
    return res.status(400).json({ error: 'You cannot demote yourself.' });
  }

  if (target.role === 'ADMIN' && count('SELECT COUNT(*) AS n FROM users WHERE role = ?', 'ADMIN') <= 1) {
    return res.status(400).json({ error: 'At least one active administrator must remain.' });
  }

  getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
  audit(req.user!.id, 'user.role_change', `Changed ${target.email} from ${target.role} to ${role}`);
  res.json({ id: target.id, role });
});

adminRouter.get('/admin/audit', (req: AuthedRequest, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const rows = getDb()
    .prepare(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT ?`,
    )
    .all(limit) as any[];
  res.json(rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name ?? null,
    actorEmail: row.actor_email ?? null,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  })));
});
