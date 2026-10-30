import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  ACTIVITY_LEVELS,
  DIET_TYPES,
  PET_LIMITS,
  PET_SEXES,
  SOCIAL_LEVELS,
  TEMPERAMENTS,
  VACCINATIONS,
  ageParts,
  formatAge,
  type PetRecord,
} from '@proot/shared';
import { authRequired, requireOwnerOrAdmin, type AuthedRequest } from './auth.js';
import { getDb } from './db.js';
import { audit, isoNow, makeId } from './utils.js';

const optionalText = (max: number = PET_LIMITS.textMax) => z.string().trim().max(max).default('');

// Mirrors validateStep() in @proot/shared — the server is the source of truth.
export const petProfileSchema = z.object({
  name: z.string().trim().min(1).max(PET_LIMITS.nameMax),
  photo: z
    .string()
    .max(PET_LIMITS.photoMaxChars)
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, 'Photo must be a PNG, JPEG, or WebP data URL.')
    .nullable()
    .default(null),
  breed: z.string().trim().min(1).max(PET_LIMITS.breedMax),
  sex: z.enum(PET_SEXES),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
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
});

type PetInput = z.infer<typeof petProfileSchema>;

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toPetRecord(row: any): PetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    photo: row.photo ?? null,
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birth_date,
    birthDateApprox: Boolean(row.birth_date_approx),
    // Pets created before onboarding only have the free-text age.
    age: row.birth_date ? formatAge(row.birth_date) : row.age,
    weightKg: row.weight_kg,
    neutered: Boolean(row.neutered),
    vaccinations: parseList(row.vaccinations),
    allergies: row.allergies,
    conditions: row.conditions,
    vetName: row.vet_name,
    vetPhone: row.vet_phone,
    microchipId: row.microchip_id,
    dietType: row.diet_type,
    mealsPerDay: row.meals_per_day,
    activityLevel: row.activity_level,
    temperament: parseList(row.temperament),
    social: row.social,
    bio: row.bio,
    prompt: row.prompt,
    answer: row.answer,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function columnValues(pet: PetInput) {
  return {
    name: pet.name,
    photo: pet.photo,
    breed: pet.breed,
    sex: pet.sex,
    age: formatAge(pet.birthDate),
    birth_date: pet.birthDate,
    birth_date_approx: pet.birthDateApprox ? 1 : 0,
    weight_kg: pet.weightKg,
    neutered: pet.neutered ? 1 : 0,
    vaccinations: JSON.stringify(pet.vaccinations),
    allergies: pet.allergies,
    conditions: pet.conditions,
    vet_name: pet.vetName,
    vet_phone: pet.vetPhone,
    microchip_id: pet.microchipId.toUpperCase(),
    diet_type: pet.dietType,
    meals_per_day: pet.mealsPerDay,
    activity_level: pet.activityLevel,
    temperament: JSON.stringify(pet.temperament),
    social: pet.social,
    bio: pet.bio,
    prompt: pet.answer ? pet.prompt : '',
    answer: pet.answer,
  };
}

function validationError(res: Response, error: z.ZodError) {
  const fields = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  return res.status(400).json({ error: 'Invalid pet payload.', fields });
}

/** Load a pet the caller may access, or send 404 (also for other users' pets, to avoid leaking ids). */
function findAccessiblePet(req: AuthedRequest, res: Response) {
  const row = getDb().prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id) as any;
  if (!row || !requireOwnerOrAdmin(row.user_id, req)) {
    res.status(404).json({ error: 'Pet not found.' });
    return null;
  }
  return row;
}

export function userHasPet(userId: string) {
  return Boolean(getDb().prepare('SELECT 1 FROM pets WHERE user_id = ? LIMIT 1').get(userId));
}

export const petsRouter = Router();

petsRouter.get('/pets', authRequired, (req: AuthedRequest, res: Response) => {
  const rows = getDb()
    .prepare('SELECT * FROM pets WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.user!.id) as any[];
  res.json(rows.map(toPetRecord));
});

petsRouter.get('/pets/:id', authRequired, (req: AuthedRequest, res: Response) => {
  const row = findAccessiblePet(req, res);
  if (row) res.json(toPetRecord(row));
});

petsRouter.post('/pets', authRequired, (req: AuthedRequest, res: Response) => {
  const parsed = petProfileSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const now = isoNow();
  const values = { id: makeId('pet'), user_id: req.user!.id, ...columnValues(parsed.data), created_at: now, updated_at: now };
  const columns = Object.keys(values);
  getDb()
    .prepare(`INSERT INTO pets (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`)
    .run(values);

  audit(req.user!.id, 'pet.create', `Onboarded pet ${values.name}`);
  const row = getDb().prepare('SELECT * FROM pets WHERE id = ?').get(values.id);
  res.status(201).json(toPetRecord(row));
});

petsRouter.patch('/pets/:id', authRequired, (req: AuthedRequest, res: Response) => {
  const existing = findAccessiblePet(req, res);
  if (!existing) return;

  const parsed = petProfileSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const values = { ...columnValues(parsed.data), updated_at: isoNow() };
  getDb()
    .prepare(`UPDATE pets SET ${Object.keys(values).map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
    .run({ ...values, id: existing.id });

  audit(req.user!.id, 'pet.update', `Updated pet ${values.name}`);
  res.json(toPetRecord(getDb().prepare('SELECT * FROM pets WHERE id = ?').get(existing.id)));
});

petsRouter.delete('/pets/:id', authRequired, (req: AuthedRequest, res: Response) => {
  const existing = findAccessiblePet(req, res);
  if (!existing) return;

  getDb().prepare('DELETE FROM pets WHERE id = ?').run(existing.id);
  audit(req.user!.id, 'pet.delete', `Removed pet ${existing.name}`);
  res.status(204).end();
});
