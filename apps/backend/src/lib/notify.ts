import type { NotificationRecord } from '@proot/shared';
import { count, one, type Db, pool } from '../db.js';
import { emitToUsers } from './realtime.js';

export function toNotification(row: any): NotificationRecord {
  return { id: row.id, type: row.type, title: row.title, body: row.body, link: row.link, readAt: row.read_at, createdAt: row.created_at };
}

/** Store a notification and push it to the user's open sessions. Never throws. */
export async function notify(userId: string | null | undefined, n: { type: string; title: string; body?: string; link?: string }, db: Db = pool) {
  if (!userId) return;
  try {
    const row = await one(
      'INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, n.type, n.title, n.body ?? '', n.link ?? ''],
      db,
    );
    const unread = await count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId], db);
    emitToUsers([userId], 'notification', { ...toNotification(row), unread });
  } catch (error) {
    console.error('notify failed:', (error as Error).message);
  }
}
