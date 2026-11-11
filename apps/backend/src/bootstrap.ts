import { count, one, query } from './db.js';
import { audit } from './lib/audit.js';
import { hashPassword } from './lib/security.js';

export type EnsureAdminResult = 'created' | 'promoted' | 'unchanged';

/**
 * Make sure `email` is an ADMIN: creates the account if it doesn't exist (password required),
 * or promotes an existing account. Existing passwords are never overwritten.
 */
export async function ensureAdmin({ email, password, name }: { email: string; password?: string; name?: string }): Promise<EnsureAdminResult> {
  const normalized = email.trim().toLowerCase();
  const existing = await one<{ id: string; role: string }>('SELECT id, role FROM users WHERE email = $1', [normalized]);
  if (existing) {
    if (existing.role === 'ADMIN') return 'unchanged';
    await query(`UPDATE users SET role = 'ADMIN', is_active = true WHERE id = $1`, [existing.id]);
    await audit(null, 'user.role_change', `Bootstrap promoted ${normalized} from ${existing.role} to ADMIN`);
    return 'promoted';
  }
  if (!password || password.length < 8) throw new Error('A password of at least 8 characters is required to create a new admin.');
  await query(`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'ADMIN')`, [normalized, await hashPassword(password), name?.trim() || 'Admin']);
  await audit(null, 'user.register', `Bootstrap created admin ${normalized}`);
  return 'created';
}

/** On startup: if ADMIN_EMAIL is set and there is no admin yet, create or promote that account. */
export async function bootstrapAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return;
  if ((await count(`SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN'`)) > 0) return;
  try {
    const result = await ensureAdmin({ email, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME });
    console.log(`Admin bootstrap: ${result} ${email}`);
  } catch (error) {
    console.error(`Admin bootstrap failed: ${(error as Error).message}`);
  }
}
