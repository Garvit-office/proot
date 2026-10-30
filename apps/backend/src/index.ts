import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { appConfig } from './config.js';
import { getDb } from './db.js';
import { adminRouter } from './admin.js';
import { authRequired, type AuthedRequest } from './auth.js';
import { bootstrapAdminFromEnv } from './bootstrap.js';
import { eventsRouter } from './events.js';
import { petsRouter, userHasPet } from './pets.js';
import { hashPassword, makeId, signToken, comparePassword, isoNow } from './utils.js';
import { z } from 'zod';
import { analyzeMealFromName, careServices, events as eventSeed, parks, nearbyPets, products, todayActivity, userPet } from '@proot/shared';

const app = express();
app.use(cors());
app.use(helmet());
// Pet photos arrive as downscaled data URLs during onboarding.
app.use(express.json({ limit: '3mb' }));
app.use(morgan('dev'));

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const nutritionSchema = z.object({
  label: z.string().min(1),
  photo: z.string().nullable().optional(),
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'proot-backend', time: new Date().toISOString() });
});

app.post('/api/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid registration payload.' });
  }

  const { name, email, password } = parsed.data;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const userId = `user_${crypto.randomUUID()}`;
  const createdAt = isoNow();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, email.toLowerCase(), hashPassword(password), name, 'USER', createdAt);

  db.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(`audit_${crypto.randomUUID()}`, userId, 'user.register', `Registered new user ${email}`, createdAt);

  const token = signToken({ sub: userId, email: email.toLowerCase(), name, role: 'USER' });
  return res.status(201).json({ token, user: { id: userId, name, email: email.toLowerCase(), role: 'USER' } });
});

app.post('/api/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid login payload.' });
  }

  const { email, password } = parsed.data;
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;

  if (!row || !comparePassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken({ sub: row.id, email: row.email, name: row.name, role: row.role });
  return res.json({ token, user: { id: row.id, name: row.name, email: row.email, role: row.role } });
});

app.get('/api/me', authRequired, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, onboarded: userHasPet(user.id) });
});

app.get('/api/catalog', (_req, res) => {
  res.json({
    userPet,
    products,
    careServices,
    events: eventSeed,
    parks,
    nearbyPets,
    todayActivity,
    mealCatalog: analyzeMealFromName('salmon'),
  });
});

app.use('/api', petsRouter);

app.get('/api/nutrition', authRequired, (req: AuthedRequest, res: Response) => {
  const rows = getDb()
    .prepare('SELECT * FROM nutrition_records WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id) as any[];

  res.json(rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    label: row.label,
    kcal: row.kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    verdict: row.verdict,
    notes: row.notes,
    photo: row.photo,
    at: row.created_at,
    createdAt: row.created_at,
  })));
});

app.post('/api/nutrition', authRequired, (req: AuthedRequest, res: Response) => {
  const parsed = nutritionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid nutrition payload.' });
  }

  const analysis = analyzeMealFromName(parsed.data.label);
  const createdAt = isoNow();
  const item = {
    id: makeId('meal'),
    userId: req.user!.id,
    label: parsed.data.label,
    kcal: analysis.kcal,
    proteinG: analysis.proteinG,
    fatG: analysis.fatG,
    verdict: analysis.verdict,
    notes: analysis.notes,
    photo: parsed.data.photo ?? null,
    createdAt,
  };

  getDb().prepare(
    'INSERT INTO nutrition_records (id, user_id, label, kcal, protein_g, fat_g, verdict, notes, photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(item.id, item.userId, item.label, item.kcal, item.proteinG, item.fatG, item.verdict, item.notes, item.photo, item.createdAt);

  res.status(201).json(item);
});

app.use('/api', eventsRouter);
app.use('/api', adminRouter);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That upload is too large. Try a smaller photo.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

bootstrapAdminFromEnv();

app.listen(appConfig.port, () => {
  console.log(`Proot backend listening on http://localhost:${appConfig.port}`);
});
