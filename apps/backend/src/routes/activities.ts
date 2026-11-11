import { Router } from 'express';
import { z } from 'zod';
import { LOGGABLE_ACTIVITY_TYPES, type ActivityRecord, type ActivitySummary } from '@proot/shared';
import { authRequired, type AuthedRequest } from '../auth.js';
import { one, query } from '../db.js';
import { badRequest, h, idParam, notFound, parse } from '../lib/http.js';
import { dayRange } from './meals.js';
import { findOwnPet } from './pets.js';

const n = (v: any) => (v === null || v === undefined ? null : Number(v));

const toActivity = (r: any): ActivityRecord => ({
  id: r.id, petId: r.pet_id, type: r.type, title: r.title, detail: r.detail, distanceKm: n(r.distance_km), durationMin: n(r.duration_min),
  kcal: n(r.kcal), occurredAt: r.occurred_at, source: r.source,
});

/** Activities plus meals, merged into one timeline for [from, to). */
export async function timeline(petId: string, from: Date, to: Date) {
  const rows = await query(
    `SELECT id, pet_id, type::text, title, detail, distance_km, duration_min, kcal, occurred_at, 'activity' AS source
       FROM activities WHERE pet_id = $1 AND occurred_at >= $2 AND occurred_at < $3
     UNION ALL
     SELECT id, pet_id, 'Meal', label, verdict || ' · ' || kcal || ' kcal', NULL, NULL, kcal, eaten_at, 'meal'
       FROM meals WHERE pet_id = $1 AND eaten_at >= $2 AND eaten_at < $3
     ORDER BY occurred_at DESC`,
    [petId, from, to],
  );
  const items = rows.map(toActivity);
  const sum = (type: string, pick: (a: ActivityRecord) => number | null) => items.filter((a) => a.type === type).reduce((t, a) => t + (pick(a) ?? 0), 0);
  const summary: ActivitySummary = {
    walkKm: Math.round(sum('Walk', (a) => a.distanceKm) * 100) / 100,
    walkMin: sum('Walk', (a) => a.durationMin),
    playMin: sum('Play', (a) => a.durationMin) + sum('Park', (a) => a.durationMin),
    sleepHours: Math.round((sum('Sleep', (a) => a.durationMin) / 60) * 10) / 10,
    kcalIn: sum('Meal', (a) => a.kcal),
  };
  return { items, summary };
}

export const activitiesRouter = Router();

activitiesRouter.get('/activities', authRequired, h<AuthedRequest>(async (req, res) => {
  const qy = parse(z.object({
    petId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.coerce.number().int().min(1).max(31).default(1),
    tzOffset: z.coerce.number().min(-840).max(840).optional(),
  }), req.query);
  const pet = await findOwnPet(req, qy.petId);
  const { from, to } = dayRange(qy.date, qy.tzOffset, qy.days);
  res.json({ ...(await timeline(pet.id, from, to)), from: from.toISOString(), to: to.toISOString() });
}));

activitiesRouter.post('/activities', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({
    petId: z.string().uuid(),
    type: z.enum(LOGGABLE_ACTIVITY_TYPES),
    title: z.string().trim().min(1).max(80),
    detail: z.string().trim().max(300).default(''),
    distanceKm: z.number().min(0).max(200).nullable().optional(),
    durationMin: z.number().int().min(0).max(24 * 60).nullable().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  }), req.body, 'Some activity details need attention.');
  await findOwnPet(req, body.petId);
  if (body.occurredAt && new Date(body.occurredAt).getTime() > Date.now() + 5 * 60_000) throw badRequest('Activities can’t be in the future.');
  const row = await one(
    `INSERT INTO activities (user_id, pet_id, type, title, detail, distance_km, duration_min, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, now())) RETURNING *, 'activity' AS source`,
    [req.user!.id, body.petId, body.type, body.title, body.detail, body.distanceKm ?? null, body.durationMin ?? null, body.occurredAt ?? null],
  );
  res.status(201).json(toActivity(row));
}));

activitiesRouter.delete('/activities/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query('DELETE FROM activities WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(req), req.user!.id]);
  if (!rows.length) throw notFound('Activity not found.');
  res.status(204).end();
}));
