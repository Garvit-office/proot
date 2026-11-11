import { Router } from 'express';
import { z } from 'zod';
import { analyzeMealFromName, estimateDailyKcal, formatAge, type ActivityLevel, type MealRecord } from '@proot/shared';
import { authRequired, type AuthedRequest } from '../auth.js';
import { one, query } from '../db.js';
import { analyzeMealPhoto } from '../lib/ai.js';
import { badRequest, h, idParam, notFound, parse } from '../lib/http.js';
import { decodeDataUrl, imageUrl, storeImage } from '../lib/images.js';
import { findOwnPet } from './pets.js';

export const targetKcalFor = (pet: any) => estimateDailyKcal(Number(pet.weight_kg), pet.activity_level as ActivityLevel, pet.neutered, pet.birth_date);

/** [start, end) of a local calendar day, given the client's Date#getTimezoneOffset() in minutes. */
export function dayRange(date: string | undefined, tzOffset: number | undefined, days = 1) {
  const offset = Number.isFinite(tzOffset) ? Number(tzOffset) : -330; // default IST
  const key = date ?? new Date(Date.now() - offset * 60_000).toISOString().slice(0, 10);
  const start = new Date(`${key}T00:00:00.000Z`).getTime() + offset * 60_000 - (days - 1) * 864e5;
  return { from: new Date(start), to: new Date(start + days * 864e5) };
}

const toMeal = (r: any): MealRecord => ({
  id: r.id, petId: r.pet_id, label: r.label, kcal: r.kcal, proteinG: r.protein_g, fatG: r.fat_g, verdict: r.verdict, notes: r.notes,
  source: r.source, imageUrl: imageUrl(r.image_id), eatenAt: r.eaten_at, createdAt: r.created_at,
});

export const mealsRouter = Router();

mealsRouter.post('/meals/analyze', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({ petId: z.string().uuid(), photo: z.string().max(9_000_000).nullable().optional(), label: z.string().trim().max(80).optional() }), req.body);
  if (!body.photo && !body.label) throw badRequest('Add a photo or a meal name.');
  const pet = await findOwnPet(req, body.petId);

  let imageId: string | null = null;
  let analysis = null;
  if (body.photo) {
    const { mime, bytes } = decodeDataUrl(body.photo);
    imageId = await storeImage(body.photo, req.user!.id);
    analysis = await analyzeMealPhoto(
      { mime, base64: bytes.toString('base64') },
      { name: pet.name, breed: pet.breed, weightKg: Number(pet.weight_kg), age: formatAge(pet.birth_date), activityLevel: pet.activity_level, allergies: pet.allergies, conditions: pet.conditions, dietType: pet.diet_type, targetKcal: targetKcalFor(pet) },
      body.label,
    );
  }
  const source = analysis ? 'ai' : 'rules';
  if (!analysis) {
    const { id: _id, ...rest } = analyzeMealFromName(body.label || 'Meal');
    analysis = rest;
  }
  res.json({ analysis, source, imageId, imageUrl: imageUrl(imageId) });
}));

const mealSchema = z.object({
  petId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  kcal: z.number().int().min(0).max(5000),
  proteinG: z.number().int().min(0).max(1000),
  fatG: z.number().int().min(0).max(1000),
  verdict: z.enum(['Good', 'Okay', 'Skip']),
  notes: z.string().trim().max(500).default(''),
  source: z.enum(['ai', 'rules']),
  imageId: z.string().uuid().nullable().optional(),
  eatenAt: z.string().datetime({ offset: true }).optional(),
});

mealsRouter.post('/meals', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(mealSchema, req.body, 'Some meal details need attention.');
  await findOwnPet(req, body.petId);
  if (body.imageId && !(await one('SELECT 1 FROM images WHERE id = $1 AND owner_id = $2', [body.imageId, req.user!.id]))) throw notFound('Photo not found.');
  const row = await one(
    `INSERT INTO meals (user_id, pet_id, image_id, label, kcal, protein_g, fat_g, verdict, notes, source, eaten_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11::timestamptz, now())) RETURNING *`,
    [req.user!.id, body.petId, body.imageId ?? null, body.label, body.kcal, body.proteinG, body.fatG, body.verdict, body.notes, body.source, body.eatenAt ?? null],
  );
  res.status(201).json(toMeal(row));
}));

mealsRouter.get('/meals', authRequired, h<AuthedRequest>(async (req, res) => {
  const qy = parse(z.object({ petId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), tzOffset: z.coerce.number().min(-840).max(840).optional() }), req.query);
  const pet = await findOwnPet(req, qy.petId);
  const { from, to } = dayRange(qy.date, qy.tzOffset);
  const rows = await query('SELECT * FROM meals WHERE pet_id = $1 AND eaten_at >= $2 AND eaten_at < $3 ORDER BY eaten_at DESC', [pet.id, from, to]);
  res.json({ items: rows.map(toMeal), totalKcal: rows.reduce((n, r) => n + r.kcal, 0), targetKcal: targetKcalFor(pet) });
}));

mealsRouter.delete('/meals/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query('DELETE FROM meals WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(req), req.user!.id]);
  if (!rows.length) throw notFound('Meal not found.');
  res.status(204).end();
}));
