import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole, type AuthedRequest } from '../auth.js';
import { appConfig } from '../config.js';
import { one, query, tx, type Db, pool } from '../db.js';
import { audit } from '../lib/audit.js';
import { geoQuery, h, idParam, notFound, parse } from '../lib/http.js';
import { imageRef, imageUrl, resolveImageField } from '../lib/images.js';
import { toPark } from '../lib/mappers.js';
import { broadcast } from '../lib/realtime.js';
import { Params } from '../lib/sql.js';

const parkSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  address: z.string().trim().max(300).default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  hours: z.string().trim().max(120).default(''),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  image: imageRef.nullable().optional(),
});

function parkSelect(p: Params, viewer: string, near?: { lat: number; lng: number }) {
  const distance = near ? `haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, k.lat, k.lng)` : 'NULL::float';
  return `SELECT k.*, ${distance} AS distance_km,
            (SELECT COUNT(*) FROM park_checkins c WHERE c.park_id = k.id AND c.checked_out_at IS NULL) AS dogs_now,
            EXISTS(SELECT 1 FROM park_checkins c WHERE c.park_id = k.id AND c.checked_out_at IS NULL AND c.user_id = ${p.add(viewer)}) AS checked_in
          FROM parks k`;
}

async function dogsNow(parkId: string, db: Db = pool) {
  return Number((await one('SELECT COUNT(*) AS n FROM park_checkins WHERE park_id = $1 AND checked_out_at IS NULL', [parkId], db)).n);
}

/** Close a user's open check-in and log the visit on the pet's timeline. Returns the park id. */
async function closeCheckin(userId: string, db: Db, auto = false) {
  const open = await one(
    `UPDATE park_checkins c SET checked_out_at = LEAST(now(), c.checked_in_at + ($2 || ' minutes')::interval)
     WHERE c.user_id = $1 AND c.checked_out_at IS NULL RETURNING c.*`,
    [userId, String(appConfig.checkinTtlMin)],
    db,
  );
  if (!open) return null;
  const minutes = Math.max(1, Math.round((new Date(open.checked_out_at).getTime() - new Date(open.checked_in_at).getTime()) / 60000));
  if (open.pet_id) {
    const park = await one('SELECT name FROM parks WHERE id = $1', [open.park_id], db);
    await query(
      `INSERT INTO activities (user_id, pet_id, type, title, detail, duration_min, occurred_at) VALUES ($1, $2, 'Park', $3, $4, $5, $6)`,
      [userId, open.pet_id, park?.name ?? 'Park visit', auto ? 'Checked out automatically' : 'Park visit', minutes, open.checked_in_at],
      db,
    );
  }
  return open.park_id as string;
}

/** Close check-ins older than the TTL (people forget to check out). */
export async function expireCheckins() {
  const stale = await query(`SELECT DISTINCT user_id FROM park_checkins WHERE checked_out_at IS NULL AND checked_in_at < now() - ($1 || ' minutes')::interval`, [String(appConfig.checkinTtlMin)]);
  for (const s of stale) {
    const parkId = await tx((db) => closeCheckin(s.user_id, db, true));
    if (parkId) broadcast('park:presence', { parkId, dogsNow: await dogsNow(parkId) });
  }
}

export const parksRouter = Router();

parksRouter.get('/parks', authRequired, h<AuthedRequest>(async (req, res) => {
  const geo = parse(geoQuery, req.query);
  const near = geo.lat !== undefined && geo.lng !== undefined ? { lat: geo.lat, lng: geo.lng } : req.user!.lat != null ? { lat: req.user!.lat, lng: req.user!.lng! } : undefined;
  const p = new Params();
  const select = parkSelect(p, req.user!.id, near);
  const where = geo.radiusKm && near ? `WHERE haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, k.lat, k.lng) <= ${p.add(geo.radiusKm)}` : '';
  const rows = await query(`${select} ${where} ORDER BY ${near ? 'distance_km ASC' : 'k.name ASC'} LIMIT 200`, p.values);
  res.json(rows.map(toPark));
}));

parksRouter.get('/parks/checkin/current', authRequired, h<AuthedRequest>(async (req, res) => {
  const row = await one(
    `SELECT c.*, k.name AS park_name FROM park_checkins c JOIN parks k ON k.id = c.park_id WHERE c.user_id = $1 AND c.checked_out_at IS NULL`,
    [req.user!.id],
  );
  res.json(row ? { id: row.id, parkId: row.park_id, parkName: row.park_name, petId: row.pet_id, checkedInAt: row.checked_in_at } : null);
}));

parksRouter.get('/parks/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const p = new Params();
  const near = req.user!.lat != null ? { lat: req.user!.lat, lng: req.user!.lng! } : undefined;
  const row = await one(`${parkSelect(p, req.user!.id, near)} WHERE k.id = ${p.add(idParam(req))}`, p.values);
  if (!row) throw notFound('Park not found.');
  const present = await query(
    `SELECT c.pet_id, c.checked_in_at, pe.name AS pet_name, pe.photo_image_id, u.name AS owner_name
     FROM park_checkins c JOIN users u ON u.id = c.user_id LEFT JOIN pets pe ON pe.id = c.pet_id
     WHERE c.park_id = $1 AND c.checked_out_at IS NULL ORDER BY c.checked_in_at DESC`,
    [row.id],
  );
  res.json({
    ...toPark(row),
    present: present.map((r) => ({ petId: r.pet_id, petName: r.pet_name ?? 'A dog', photoUrl: imageUrl(r.photo_image_id), ownerName: r.owner_name.split(' ')[0], since: r.checked_in_at })),
  });
}));

parksRouter.post('/parks/:id/checkin', authRequired, h<AuthedRequest>(async (req, res) => {
  const parkId = idParam(req);
  const { petId } = parse(z.object({ petId: z.string().uuid() }), req.body);
  const { previous, row, park } = await tx(async (db) => {
    const park = await one('SELECT id, name FROM parks WHERE id = $1', [parkId], db);
    if (!park) throw notFound('Park not found.');
    const pet = await one('SELECT id FROM pets WHERE id = $1 AND user_id = $2', [petId, req.user!.id], db);
    if (!pet) throw notFound('Pet not found.');
    // Checking in somewhere new checks you out of the previous park.
    const previous = await closeCheckin(req.user!.id, db);
    const row = await one('INSERT INTO park_checkins (park_id, user_id, pet_id) VALUES ($1, $2, $3) RETURNING *', [parkId, req.user!.id, petId], db);
    return { previous, row, park };
  });
  if (previous && previous !== parkId) broadcast('park:presence', { parkId: previous, dogsNow: await dogsNow(previous) });
  broadcast('park:presence', { parkId, dogsNow: await dogsNow(parkId) });
  res.status(201).json({ id: row.id, parkId, parkName: park.name, petId: row.pet_id, checkedInAt: row.checked_in_at });
}));

parksRouter.post('/parks/checkout', authRequired, h<AuthedRequest>(async (req, res) => {
  const parkId = await tx((db) => closeCheckin(req.user!.id, db));
  if (parkId) broadcast('park:presence', { parkId, dogsNow: await dogsNow(parkId) });
  res.status(204).end();
}));

// ---------------------------------------------------------------- admin CRUD

parksRouter.post('/parks', authRequired, requireRole('ADMIN'), h<AuthedRequest>(async (req, res) => {
  const body = parse(parkSchema, req.body, 'Some park details need attention.');
  const [imageId, extUrl] = (await resolveImageField(body.image, req.user!.id)) ?? [null, null];
  const row = await one(
    `INSERT INTO parks (name, description, address, lat, lng, hours, amenities, image_id, image_url, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [body.name, body.description, body.address, body.lat, body.lng, body.hours, body.amenities, imageId, extUrl, req.user!.id],
  );
  await audit(req.user!.id, 'park.create', `Added park ${body.name}`);
  const p = new Params();
  res.status(201).json(toPark(await one(`${parkSelect(p, req.user!.id)} WHERE k.id = ${p.add(row.id)}`, p.values)));
}));

parksRouter.patch('/parks/:id', authRequired, requireRole('ADMIN'), h<AuthedRequest>(async (req, res) => {
  const existing = await one('SELECT * FROM parks WHERE id = $1', [idParam(req)]);
  if (!existing) throw notFound('Park not found.');
  const body = parse(parkSchema.partial(), req.body, 'Some park details need attention.');
  const image = await resolveImageField(body.image, req.user!.id);
  await query(
    `UPDATE parks SET name=$2, description=$3, address=$4, lat=$5, lng=$6, hours=$7, amenities=$8, image_id=$9, image_url=$10 WHERE id=$1`,
    [existing.id, body.name ?? existing.name, body.description ?? existing.description, body.address ?? existing.address, body.lat ?? existing.lat,
      body.lng ?? existing.lng, body.hours ?? existing.hours, body.amenities ?? existing.amenities, image ? image[0] : existing.image_id, image ? image[1] : existing.image_url],
  );
  await audit(req.user!.id, 'park.update', `Updated park ${body.name ?? existing.name}`);
  const p = new Params();
  res.json(toPark(await one(`${parkSelect(p, req.user!.id)} WHERE k.id = ${p.add(existing.id)}`, p.values)));
}));

parksRouter.delete('/parks/:id', authRequired, requireRole('ADMIN'), h<AuthedRequest>(async (req, res) => {
  const rows = await query('DELETE FROM parks WHERE id = $1 RETURNING name', [idParam(req)]);
  if (!rows.length) throw notFound('Park not found.');
  await audit(req.user!.id, 'park.delete', `Removed park ${rows[0].name}`);
  res.status(204).end();
}));
