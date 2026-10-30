import { getDb } from './db.js';
import { audit, hashPassword, isoNow, makeId } from './utils.js';

export type EnsureAdminResult = 'created' | 'promoted' | 'unchanged';

/**
 * Make sure `email` is an ADMIN: creates the account if it doesn't exist (password required),
 * or promotes an existing account. Existing passwords are never overwritten.
 */
export function ensureAdmin({ email, password, name }: { email: string; password?: string; name?: string }): EnsureAdminResult {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(normalized) as { id: string; role: string } | undefined;

  if (existing) {
    if (existing.role === 'ADMIN') return 'unchanged';
    db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(existing.id);
    audit(null, 'user.role_change', `Bootstrap promoted ${normalized} from ${existing.role} to ADMIN`);
    return 'promoted';
  }

  if (!password || password.length < 8) throw new Error('A password of at least 8 characters is required to create a new admin.');
  const id = makeId('user');
  db.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, normalized, hashPassword(password), name?.trim() || 'Admin', 'ADMIN', isoNow());
  audit(null, 'user.register', `Bootstrap created admin ${normalized}`);
  return 'created';
}

/** On startup: if ADMIN_EMAIL is set and there is no admin yet, create or promote that account. */
export function bootstrapAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return;
  const admins = (getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN'").get() as { n: number }).n;
  if (admins > 0) return;
  try {
    const result = ensureAdmin({ email, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME });
    console.log(`Admin bootstrap: ${result} ${email}`);
  } catch (error) {
    console.error(`Admin bootstrap failed: ${(error as Error).message}`);
  }
}
