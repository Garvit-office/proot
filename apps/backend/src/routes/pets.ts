import { Router } from 'express';
import { z } from 'zod';
import { ACTIVITY_LEVELS, DIET_TYPES, PET_LIMITS, PET_SEXES, SOCIAL_LEVELS, TEMPERAMENTS, VACCINATIONS, ageParts } from '@proot/shared';
import { authRequired, isOwnerOrAdmin, type AuthedRequest } from '../auth.js';
import { one, query } from '../db.js';
import { audit } from '../lib/audit.js';
import { h, idParam, notFound, parse } from '../lib/http.js';
import { imageRef, resolveImageRef } from '../lib/images.js';
import { toPet } from '../lib/mappers.js';

const optionalText = (max: number = PET_LIMITS.textMax) => z.string().trim().max(max).default('');

// Mirrors validateStep() in @proot/shared — the server is the source of truth.
export const petSchema = z.object({
  name: z.string().trim().min(1).max(PET_LIMITS.nameMax),
  photo: imageRef.nullable().default(null),
  breed: z.string().trim().min(1).max(PET_LIMITS.breedMax),
  sex: z.enum(PET_SEXES),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now() && ageParts(value).years <= PET_LIMITS.maxAgeYears;
  }, 'Birth date must be a real date in the past.'),
  birthDateApprox: z.boolean().default(false),
  weightKg: z.number().min(PET_LIMITS.weightMin).max(PET_LIMITS.weightMax),
  neutered: z.boolean(),
  vaccinations: z.array(z.enum(VACCINATIONS)).max(VACCINATIONS.length).default([]),
  allergies: optionalText(),
  conditions: optionalText(),
  vetName: optionalText(80),
  vetPhone: z.string().trim().max(20).regex(/^$|^[+\d][\d\s()-]{5,19}$/).default(''),
  microchipId: z.string().trim().regex(/^$|^[A-Za-z0-9]{9,15}$/).default(''),
  dietType: z.enum(DIET_TYPES),
  mealsPerDay: z.number().int().min(1).max(4),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  temperament: z.array(z.enum(TEMPERAMENTS)).max(TEMPERAMENTS.length).default([]),
  social: z.enum(SOCIAL_LEVELS),
  bio: optionalText(),
  prompt: optionalText(80),
  answer: optionalText(),
  discoverable: z.boolean().optional(),
});

type PetBody = z.infer<typeof petSchema>;

async function columns(pet: PetBody, ownerId: string) {
  return {
    name: pet.name,
    photo_image_id: (await resolveImageRef(pet.photo, ownerId)) ?? null,
    breed: pet.breed,
    sex: pet.sex,
    birth_date: pet.birthDate,
    birth_date_approx: pet.birthDateApprox,
    weight_kg: pet.weightKg,
    neutered: pet.neutered,
    vaccinations: pet.vaccinations,
    allergies: pet.allergies,
    conditions: pet.conditions,
    vet_name: pet.vetName,
    vet_phone: pet.vetPhone,
    microchip_id: pet.microchipId.toUpperCase(),
    diet_type: pet.dietType,
    meals_per_day: pet.mealsPerDay,
    activity_level: pet.activityLevel,
    temperament: pet.temperament,
    social: pet.social,
    bio: pet.bio,
    prompt: pet.answer ? pet.prompt : '',
    answer: pet.answer,
    ...(pet.discoverable === undefined ? {} : { discoverable: pet.discoverable }),
  };
}

/** Load a pet the caller may access, else 404 (also for other users' pets, so ids don't leak). */
export async function findOwnPet(req: AuthedRequest, id: string) {
  const row = await one('SELECT * FROM pets WHERE id = $1', [id]);
  if (!row || !isOwnerOrAdmin(req, row.user_id)) throw notFound('Pet not found.');
  return row;
}

export const petsRouter = Router();

petsRouter.get('/pets', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query('SELECT * FROM pets WHERE user_id = $1 ORDER BY created_at ASC', [req.user!.id]);
  res.json(rows.map(toPet));
}));

petsRouter.get('/pets/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  res.json(toPet(await findOwnPet(req, idParam(req))));
}));

petsRouter.post('/pets', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(petSchema, req.body, 'Some pet details need attention.');
  const values: Record<string, unknown> = { user_id: req.user!.id, ...(await columns(body, req.user!.id)) };
  const keys = Object.keys(values);
  const row = await one(
    `INSERT INTO pets (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(values),
  );
  await audit(req.user!.id, 'pet.create', `Onboarded pet ${body.name}`);
  res.status(201).json(toPet(row));
}));

petsRouter.patch('/pets/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const existing = await findOwnPet(req, idParam(req));
  const body = parse(petSchema, req.body, 'Some pet details need attention.');
  const values = await columns(body, existing.user_id);
  const keys = Object.keys(values);
  const row = await one(
    `UPDATE pets SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
    [existing.id, ...Object.values(values)],
  );
  await audit(req.user!.id, 'pet.update', `Updated pet ${body.name}`);
  res.json(toPet(row));
}));

petsRouter.delete('/pets/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const existing = await findOwnPet(req, idParam(req));
  await query('DELETE FROM pets WHERE id = $1', [existing.id]);
  await audit(req.user!.id, 'pet.delete', `Removed pet ${existing.name}`);
  res.status(204).end();
}));
