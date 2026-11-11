import { query, type Db, pool } from '../db.js';

export async function audit(actorId: string | null, action: string, details: string, db: Db = pool) {
  await query('INSERT INTO audit_logs (actor_id, action, details) VALUES ($1, $2, $3)', [actorId, action, details], db);
}
