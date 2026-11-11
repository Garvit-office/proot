import { Router } from 'express';
import { z } from 'zod';
import type { HomeResponse } from '@proot/shared';
import { authRequired, type AuthedRequest } from '../auth.js';
import { count, one, query } from '../db.js';
import { h, idParam, notFound, parse } from '../lib/http.js';
import { imageUrl, storeImage } from '../lib/images.js';
import { toBooking, toEvent, toPark } from '../lib/mappers.js';
import { toNotification } from '../lib/notify.js';
import { Params } from '../lib/sql.js';
import { timeline } from './activities.js';
import { BOOKING_SELECT } from './care.js';
import { dayRange, targetKcalFor } from './meals.js';

export const miscRouter = Router();

// ---------------------------------------------------------------- images

miscRouter.post('/images', authRequired, h<AuthedRequest>(async (req, res) => {
  const { dataUrl } = parse(z.object({ dataUrl: z.string().min(30).max(9_000_000) }), req.body);
  const id = await storeImage(dataUrl, req.user!.id);
  res.status(201).json({ id, url: imageUrl(id) });
}));

/** Public, cacheable image bytes. Ids are random UUIDs, so URLs aren't guessable. */
miscRouter.get('/images/:id', h(async (req, res) => {
  const row = await one('SELECT mime_type, data, sha256 FROM images WHERE id = $1', [idParam(req)]);
  if (!row) throw notFound('Image not found.');
  const etag = `"${row.sha256}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.type(row.mime_type).send(row.data);
}));

// ---------------------------------------------------------------- notifications

miscRouter.get('/notifications', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user!.id]);
  const unread = await count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]);
  res.json({ items: rows.map(toNotification), unread });
}));

miscRouter.post('/notifications/read', authRequired, h<AuthedRequest>(async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).max(200).optional() }), req.body ?? {});
  if (ids?.length) await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [req.user!.id, ids]);
  else await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]);
  res.json({ unread: await count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]) });
}));

// ---------------------------------------------------------------- home

miscRouter.get('/home', authRequired, h<AuthedRequest>(async (req, res) => {
  const qy = parse(z.object({ petId: z.string().uuid().optional(), tzOffset: z.coerce.number().optional() }), req.query);
  const me = req.user!;
  const pet = qy.petId
    ? await one('SELECT * FROM pets WHERE id = $1 AND user_id = $2', [qy.petId, me.id])
    : await one('SELECT * FROM pets WHERE user_id = $1 ORDER BY created_at LIMIT 1', [me.id]);

  const { from, to } = dayRange(undefined, qy.tzOffset);
  const today = pet ? (await timeline(pet.id, from, to)).summary : { walkKm: 0, walkMin: 0, playMin: 0, sleepHours: 0, kcalIn: 0 };

  const ev = new Params();
  const eventRow = await one(
    `SELECT e.*, u.name AS manager_name, NULL::float AS distance_km,
       (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) AS rsvp_count,
       EXISTS(SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = ${ev.add(me.id)}) AS rsvped
     FROM events e LEFT JOIN users u ON u.id = e.manager_id
     WHERE e.published AND e.starts_at > now()
     ORDER BY EXISTS(SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $1) DESC, e.starts_at ASC LIMIT 1`,
    ev.values,
  );
  const bookingRow = await one(`${BOOKING_SELECT} WHERE b.user_id = $1 AND b.status IN ('REQUESTED', 'CONFIRMED') AND b.ends_at > now() ORDER BY b.starts_at ASC LIMIT 1`, [me.id]);

  const hasLocation = me.lat != null && me.lng != null;
  const parkRow = await one(
    `SELECT k.*, ${hasLocation ? 'haversine_km($2, $3, k.lat, k.lng)' : 'NULL::float'} AS distance_km,
       (SELECT COUNT(*) FROM park_checkins c WHERE c.park_id = k.id AND c.checked_out_at IS NULL) AS dogs_now,
       EXISTS(SELECT 1 FROM park_checkins c WHERE c.park_id = k.id AND c.checked_out_at IS NULL AND c.user_id = $1) AS checked_in
     FROM parks k ORDER BY ${hasLocation ? 'distance_km ASC' : 'dogs_now DESC'} LIMIT 1`,
    hasLocation ? [me.id, me.lat, me.lng] : [me.id],
  );
  const dogsNearbyNow = hasLocation
    ? await count(`SELECT COUNT(*) AS n FROM park_checkins c JOIN parks k ON k.id = c.park_id WHERE c.checked_out_at IS NULL AND haversine_km($1, $2, k.lat, k.lng) <= 5`, [me.lat, me.lng])
    : await count('SELECT COUNT(*) AS n FROM park_checkins WHERE checked_out_at IS NULL');

  const response: HomeResponse = {
    pet: pet ? { id: pet.id, name: pet.name } : null,
    today: { ...today, targetKcal: pet ? targetKcalFor(pet) : null },
    nextEvent: eventRow ? toEvent(eventRow) : null,
    nextBooking: bookingRow ? toBooking(bookingRow) : null,
    dogsNearbyNow,
    nearestPark: parkRow ? toPark(parkRow) : null,
    unreadNotifications: await count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [me.id]),
  };
  res.json(response);
}));
