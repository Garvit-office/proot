import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authRequired, type AuthedRequest } from '../auth.js';
import { count, one, pool, query } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, conflict, h, parse } from '../lib/http.js';
import { resolveImageRef } from '../lib/images.js';
import { toMe } from '../lib/mappers.js';
import { disconnectUser } from '../lib/realtime.js';
import { comparePassword, hashPassword, signToken } from '../lib/security.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(8, 'Use at least 8 characters.').max(128);

const registerSchema = z.object({ name: z.string().trim().min(1, 'Enter your name.').max(80), email, password });
const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

// Slow down password guessing: AUTH_RATE_LIMIT (default 20) attempts per 15 minutes per IP.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT ?? 20), standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

export async function loadMe(userId: string) {
  const row = await one('SELECT * FROM users WHERE id = $1', [userId]);
  const [onboarded, unread, cart] = await Promise.all([
    count('SELECT COUNT(*) AS n FROM pets WHERE user_id = $1', [userId]),
    count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]),
    count('SELECT COALESCE(SUM(quantity), 0) AS n FROM cart_items WHERE user_id = $1', [userId]),
  ]);
  return toMe(row, { onboarded: onboarded > 0, unreadNotifications: unread, cartCount: cart });
}

export const authRouter = Router();

async function register(req: AuthedRequest, res: any) {
  const body = parse(registerSchema, req.body, 'Check your sign-up details.');
  if (await one('SELECT 1 FROM users WHERE email = $1', [body.email])) throw conflict('An account with that email already exists. Try signing in.');
  // Public sign-up always creates a USER; other roles are granted by an admin.
  const user = await one(
    `INSERT INTO users (email, password_hash, name, role, last_login_at) VALUES ($1, $2, $3, 'USER', now()) RETURNING *`,
    [body.email, await hashPassword(body.password), body.name],
  );
  await audit(user.id, 'user.register', `Registered ${body.email}`);
  res.status(201).json({ token: signToken(user), user: await loadMe(user.id) });
}

async function login(req: AuthedRequest, res: any) {
  const body = parse(loginSchema, req.body, 'Enter your email and password.');
  const user = await one('SELECT * FROM users WHERE email = $1', [body.email]);
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  if (!user || !(await comparePassword(body.password, user.password_hash))) throw new HttpError(401, 'Incorrect email or password.');
  if (!user.is_active) throw new HttpError(403, 'This account has been deactivated. Contact support.');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  res.json({ token: signToken(user), user: await loadMe(user.id) });
}

authRouter.post('/auth/register', authLimiter, h(register));
authRouter.post('/auth/login', authLimiter, h(login));
// Older clients used these paths.
authRouter.post('/register', authLimiter, h(register));
authRouter.post('/login', authLimiter, h(login));

authRouter.post('/auth/logout-all', authRequired, h<AuthedRequest>(async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user!.id]);
  await audit(req.user!.id, 'user.logout_all', 'Signed out of every device');
  disconnectUser(req.user!.id);
  res.status(204).end();
}));

authRouter.post('/auth/password', authRequired, authLimiter, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
  const user = await one('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  if (!(await comparePassword(body.currentPassword, user.password_hash))) throw new HttpError(400, 'Your current password is incorrect.', [{ field: 'currentPassword', message: 'Incorrect password.' }]);
  // Changing the password signs out every other session; the caller gets a fresh token.
  const updated = await one('UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING *', [user.id, await hashPassword(body.newPassword)]);
  await audit(user.id, 'user.password_change', 'Changed password');
  disconnectUser(user.id);
  res.json({ token: signToken(updated) });
}));

// ---------------------------------------------------------------- account

authRouter.get('/me', authRequired, h<AuthedRequest>(async (req, res) => {
  res.json(await loadMe(req.user!.id));
}));

authRouter.patch('/me', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().regex(/^$|^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.').optional(),
    city: z.string().trim().max(80).optional(),
  }), req.body);
  await query(
    'UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone), city = COALESCE($4, city) WHERE id = $1',
    [req.user!.id, body.name ?? null, body.phone ?? null, body.city ?? null],
  );
  res.json(await loadMe(req.user!.id));
}));

authRouter.put('/me/location', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), city: z.string().trim().max(80).optional() }), req.body);
  await query(
    'UPDATE users SET lat = $2, lng = $3, city = COALESCE($4, city), location_updated_at = now() WHERE id = $1',
    [req.user!.id, body.lat, body.lng, body.city ?? null],
  );
  res.json(await loadMe(req.user!.id));
}));

authRouter.put('/me/avatar', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({ photo: z.string().nullable() }), req.body);
  const id = await resolveImageRef(body.photo, req.user!.id);
  await query('UPDATE users SET avatar_image_id = $2 WHERE id = $1', [req.user!.id, id ?? null]);
  res.json(await loadMe(req.user!.id));
}));

// ---------------------------------------------------------------- addresses

const addressSchema = z.object({
  label: z.string().trim().min(1).max(30).default('Home'),
  fullName: z.string().trim().min(1, 'Enter a name.').max(80),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.'),
  line1: z.string().trim().min(3, 'Enter the address.').max(160),
  line2: z.string().trim().max(160).default(''),
  city: z.string().trim().min(2, 'Enter a city.').max(80),
  state: z.string().trim().min(2, 'Enter a state.').max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN codes have 6 digits.'),
  isDefault: z.boolean().default(false),
});

const toAddress = (r: any) => ({ id: r.id, label: r.label, fullName: r.full_name, phone: r.phone, line1: r.line1, line2: r.line2, city: r.city, state: r.state, pincode: r.pincode, isDefault: r.is_default, createdAt: r.created_at });

authRouter.get('/me/addresses', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', [req.user!.id]);
  res.json(rows.map(toAddress));
}));

async function saveAddress(userId: string, body: z.infer<typeof addressSchema>, id?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const first = (await client.query('SELECT COUNT(*)::int AS n FROM addresses WHERE user_id = $1', [userId])).rows[0].n === 0;
    const isDefault = body.isDefault || first;
    if (isDefault) await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    const values = [body.label, body.fullName, body.phone, body.line1, body.line2, body.city, body.state, body.pincode, isDefault];
    const result = id
      ? await client.query(`UPDATE addresses SET label=$1, full_name=$2, phone=$3, line1=$4, line2=$5, city=$6, state=$7, pincode=$8, is_default=$9 WHERE id=$10 AND user_id=$11 RETURNING *`, [...values, id, userId])
      : await client.query(`INSERT INTO addresses (label, full_name, phone, line1, line2, city, state, pincode, is_default, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [...values, userId]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

authRouter.post('/me/addresses', authRequired, h<AuthedRequest>(async (req, res) => {
  res.status(201).json(toAddress(await saveAddress(req.user!.id, parse(addressSchema, req.body))));
}));

authRouter.patch('/me/addresses/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const row = await saveAddress(req.user!.id, parse(addressSchema, req.body), String(req.params.id));
  if (!row) throw new HttpError(404, 'Address not found.');
  res.json(toAddress(row));
}));

authRouter.delete('/me/addresses/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query('DELETE FROM addresses WHERE id::text = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user!.id]);
  if (!rows.length) throw new HttpError(404, 'Address not found.');
  res.status(204).end();
}));
