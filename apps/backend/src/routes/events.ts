import { Router } from 'express';
import { z } from 'zod';
import { canManageEvents, isAdmin, type EventRecord } from '@proot/shared';
import { authRequired, requireRole, type AuthedRequest } from '../auth.js';
import { one, query, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, geoQuery, h, idParam, notFound, parse } from '../lib/http.js';
import { imageRef, imageUrl, resolveImageField } from '../lib/images.js';
import { toEvent } from '../lib/mappers.js';
import { notify } from '../lib/notify.js';
import { broadcast } from '../lib/realtime.js';
import { Params } from '../lib/sql.js';

const eventSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  location: z.string().trim().min(1).max(160),
  startsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'startsAt must be a date.'),
  capacity: z.number().int().min(0).max(10_000).default(0),
  published: z.boolean().default(false),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  image: imageRef.nullable().optional(),
});

function eventSelect(p: Params, viewer: string, near?: { lat: number; lng: number }) {
  const distance = near ? `haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, e.lat, e.lng)` : 'NULL::float';
  const v = p.add(viewer);
  return `SELECT e.*, u.name AS manager_name, ${distance} AS distance_km,
            (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) AS rsvp_count,
            EXISTS(SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = ${v}) AS rsvped
          FROM events e LEFT JOIN users u ON u.id = e.manager_id`;
}

async function loadEvent(id: string, viewer: string): Promise<EventRecord | null> {
  const p = new Params();
  const row = await one(`${eventSelect(p, viewer)} WHERE e.id = ${p.add(id)}`, p.values);
  return row ? toEvent(row) : null;
}

const canEdit = (req: AuthedRequest, event: EventRecord) =>
  isAdmin(req.user!.role) || (canManageEvents(req.user!.role) && event.managerId === req.user!.id);

async function findEditable(req: AuthedRequest) {
  const event = await loadEvent(idParam(req), req.user!.id);
  if (!event) throw notFound('Event not found.');
  if (!canEdit(req, event)) throw forbidden('You can only change events you manage.');
  return event;
}

export const eventsRouter = Router();

eventsRouter.get('/events', authRequired, h<AuthedRequest>(async (req, res) => {
  const geo = parse(geoQuery, req.query);
  const near = geo.lat !== undefined && geo.lng !== undefined ? { lat: geo.lat, lng: geo.lng } : req.user!.lat != null ? { lat: req.user!.lat, lng: req.user!.lng! } : undefined;
  const viewer = req.user!.id;
  // A little grace so events that just started still show up.
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const p = new Params();
  const visible = await query(`${eventSelect(p, viewer, near)} WHERE e.published AND e.starts_at >= ${p.add(since)} ORDER BY e.starts_at ASC`, p.values);

  let manageable: any[] = [];
  if (isAdmin(req.user!.role)) {
    const q = new Params();
    manageable = await query(`${eventSelect(q, viewer)} ORDER BY e.starts_at DESC`, q.values);
  } else if (canManageEvents(req.user!.role)) {
    const q = new Params();
    manageable = await query(`${eventSelect(q, viewer)} WHERE e.manager_id = ${q.add(viewer)} ORDER BY e.starts_at DESC`, q.values);
  }
  res.json({ visible: visible.map(toEvent), manageable: manageable.map(toEvent) });
}));

eventsRouter.get('/events/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const event = await loadEvent(idParam(req), req.user!.id);
  if (!event || (!event.published && !canEdit(req, event))) throw notFound('Event not found.');
  const attendees = canEdit(req, event)
    ? (await query(
        `SELECT r.user_id, r.created_at, u.name, u.avatar_image_id FROM event_rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = $1 ORDER BY r.created_at`,
        [event.id],
      )).map((r) => ({ userId: r.user_id, name: r.name, avatarUrl: imageUrl(r.avatar_image_id), createdAt: r.created_at }))
    : [];
  res.json({ ...event, attendees });
}));

eventsRouter.post('/events', authRequired, requireRole('EVENT_MANAGER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  const body = parse(eventSchema, req.body, 'Invalid event payload.');
  const [imageId, extUrl] = (await resolveImageField(body.image, req.user!.id)) ?? [null, null];
  const row = await one(
    `INSERT INTO events (title, description, location, starts_at, capacity, published, manager_id, lat, lng, image_id, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [body.title, body.description, body.location, new Date(body.startsAt), body.capacity, body.published, req.user!.id, body.lat ?? null, body.lng ?? null, imageId, extUrl],
  );
  await audit(req.user!.id, 'event.create', `Created event ${body.title}${body.published ? ' (published)' : ''}`);
  res.status(201).json(await loadEvent(row.id, req.user!.id));
}));

eventsRouter.patch('/events/:id', authRequired, requireRole('EVENT_MANAGER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  const event = await findEditable(req);
  const body = parse(eventSchema.partial(), req.body, 'Invalid event payload.');
  const next = { ...event, ...body };
  if (next.capacity > 0 && next.capacity < event.rsvpCount) {
    throw badRequest(`${event.rsvpCount} people have already RSVPed; capacity can’t go below that.`);
  }
  const existing = await one('SELECT image_id, image_url FROM events WHERE id = $1', [event.id]);
  const image = await resolveImageField(body.image, req.user!.id);
  await query(
    `UPDATE events SET title=$2, description=$3, location=$4, starts_at=$5, capacity=$6, published=$7, lat=$8, lng=$9, image_id=$10, image_url=$11 WHERE id=$1`,
    [event.id, next.title, next.description, next.location, new Date(next.startsAt), next.capacity, next.published,
      body.lat === undefined ? event.lat : body.lat, body.lng === undefined ? event.lng : body.lng,
      image ? image[0] : existing.image_id, image ? image[1] : existing.image_url],
  );
  const verb = next.published === event.published ? 'update' : next.published ? 'publish' : 'unpublish';
  await audit(req.user!.id, `event.${verb}`, `${{ update: 'Updated', publish: 'Published', unpublish: 'Unpublished' }[verb]} event ${next.title}`);

  // Tell attendees when the time or place changes.
  if (event.published && (next.startsAt !== event.startsAt || next.location !== event.location)) {
    const attendees = await query('SELECT user_id FROM event_rsvps WHERE event_id = $1', [event.id]);
    for (const a of attendees) await notify(a.user_id, { type: 'event.changed', title: `${next.title} has changed`, body: `Now at ${next.location}, ${new Date(next.startsAt).toLocaleString('en-IN', { timeZone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`, link: `/events/${event.id}` });
  }
  const updated = (await loadEvent(event.id, req.user!.id))!;
  broadcast('event:updated', { id: updated.id, rsvpCount: updated.rsvpCount });
  res.json(updated);
}));

eventsRouter.delete('/events/:id', authRequired, requireRole('EVENT_MANAGER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  const event = await findEditable(req);
  const attendees = await query('SELECT user_id FROM event_rsvps WHERE event_id = $1', [event.id]);
  await query('DELETE FROM events WHERE id = $1', [event.id]);
  await audit(req.user!.id, 'event.delete', `Deleted event ${event.title} (${event.rsvpCount} RSVPs)`);
  if (event.published && new Date(event.startsAt).getTime() > Date.now()) {
    for (const a of attendees) await notify(a.user_id, { type: 'event.cancelled', title: `${event.title} was cancelled`, body: 'The organiser cancelled this event.', link: '/events' });
  }
  broadcast('event:updated', { id: event.id, rsvpCount: 0, deleted: true });
  res.status(204).end();
}));

eventsRouter.post('/events/:id/rsvp', authRequired, h<AuthedRequest>(async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    // Lock the event row so the capacity check and insert are atomic.
    const event = await one('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id], db);
    if (!event) throw notFound('Event not found.');
    if (!event.published) throw forbidden('This event is not published.');
    if (new Date(event.starts_at).getTime() < Date.now() - 3 * 3600_000) throw conflict('This event has already happened.');
    if (await one('SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [id, req.user!.id], db)) throw conflict('You’ve already RSVPed to this event.');
    const taken = Number((await one('SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = $1', [id], db)).n);
    if (event.capacity > 0 && taken >= event.capacity) throw conflict('This event is full.');
    await query('INSERT INTO event_rsvps (event_id, user_id) VALUES ($1, $2)', [id, req.user!.id], db);
  });
  const event = (await loadEvent(id, req.user!.id))!;
  broadcast('event:updated', { id, rsvpCount: event.rsvpCount });
  if (event.managerId && event.managerId !== req.user!.id) {
    await notify(event.managerId, { type: 'event.rsvp', title: `New RSVP for ${event.title}`, body: `${req.user!.name} is coming (${event.rsvpCount}${event.capacity ? `/${event.capacity}` : ''}).`, link: `/events` });
  }
  res.status(201).json(event);
}));

eventsRouter.delete('/events/:id/rsvp', authRequired, h<AuthedRequest>(async (req, res) => {
  const id = idParam(req);
  const removed = await query('DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2 RETURNING event_id', [id, req.user!.id]);
  if (!removed.length) throw notFound('No RSVP to cancel.');
  const event = (await loadEvent(id, req.user!.id))!;
  broadcast('event:updated', { id, rsvpCount: event.rsvpCount });
  res.json(event);
}));
