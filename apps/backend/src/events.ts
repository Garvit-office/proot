import { Router, type Response } from 'express';
import { z } from 'zod';
import { canManageEvents, isAdmin, type EventRecord } from '@proot/shared';
import { authRequired, requireRole, type AuthedRequest } from './auth.js';
import { getDb } from './db.js';
import { audit, isoNow, makeId } from './utils.js';

const eventSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  location: z.string().trim().min(1).max(120),
  startsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'startsAt must be a date.'),
  capacity: z.number().int().min(0).max(10_000).default(0),
  published: z.boolean().default(false),
});

const EVENT_SELECT = `
  SELECT e.*, u.name AS manager_name,
    (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) AS rsvp_count,
    EXISTS(SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = @viewer) AS rsvped
  FROM events e LEFT JOIN users u ON u.id = e.manager_id`;

function toEventRecord(row: any): EventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    capacity: row.capacity ?? 0,
    published: Boolean(row.published),
    managerId: row.manager_id,
    managerName: row.manager_name ?? null,
    rsvpCount: row.rsvp_count ?? 0,
    rsvped: Boolean(row.rsvped),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function loadEvent(id: string, viewer: string) {
  const row = getDb().prepare(`${EVENT_SELECT} WHERE e.id = @id`).get({ id, viewer });
  return row ? toEventRecord(row) : null;
}

/** Admins may change any event; event managers only the ones they created. */
function canEdit(req: AuthedRequest, event: EventRecord) {
  return isAdmin(req.user!.role) || (canManageEvents(req.user!.role) && event.managerId === req.user!.id);
}

/** Load an event the caller may edit, or respond 404/403 and return null. */
function findEditable(req: AuthedRequest, res: Response) {
  const event = loadEvent(String(req.params.id), req.user!.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return null;
  }
  if (!canEdit(req, event)) {
    res.status(403).json({ error: 'You can only change events you manage.' });
    return null;
  }
  return event;
}

export const eventsRouter = Router();

eventsRouter.get('/events', authRequired, (req: AuthedRequest, res: Response) => {
  const viewer = req.user!.id;
  const db = getDb();
  // A little grace so events that just started still show up.
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const visible = db
    .prepare(`${EVENT_SELECT} WHERE e.published = 1 AND e.starts_at >= @since ORDER BY e.starts_at ASC`)
    .all({ viewer, since }) as any[];

  let manageable: any[] = [];
  if (isAdmin(req.user!.role)) {
    manageable = db.prepare(`${EVENT_SELECT} ORDER BY e.starts_at DESC`).all({ viewer }) as any[];
  } else if (canManageEvents(req.user!.role)) {
    manageable = db.prepare(`${EVENT_SELECT} WHERE e.manager_id = @viewer ORDER BY e.starts_at DESC`).all({ viewer }) as any[];
  }

  res.json({ visible: visible.map(toEventRecord), manageable: manageable.map(toEventRecord) });
});

eventsRouter.post('/events', authRequired, requireRole('EVENT_MANAGER', 'ADMIN'), (req: AuthedRequest, res: Response) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event payload.', fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });

  const now = isoNow();
  const id = makeId('event');
  getDb()
    .prepare(
      `INSERT INTO events (id, title, description, location, starts_at, capacity, published, manager_id, created_at, updated_at)
       VALUES (@id, @title, @description, @location, @startsAt, @capacity, @published, @managerId, @now, @now)`,
    )
    .run({ ...parsed.data, startsAt: new Date(parsed.data.startsAt).toISOString(), published: parsed.data.published ? 1 : 0, id, managerId: req.user!.id, now });

  audit(req.user!.id, 'event.create', `Created event ${parsed.data.title}${parsed.data.published ? ' (published)' : ''}`);
  res.status(201).json(loadEvent(id, req.user!.id));
});

eventsRouter.patch('/events/:id', authRequired, requireRole('EVENT_MANAGER', 'ADMIN'), (req: AuthedRequest, res: Response) => {
  const event = findEditable(req, res);
  if (!event) return;

  const parsed = eventSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event payload.' });

  const next = { ...event, ...parsed.data };
  if (next.capacity > 0 && next.capacity < event.rsvpCount) {
    return res.status(400).json({ error: `${event.rsvpCount} people have already RSVPed; capacity can’t go below that.` });
  }

  getDb()
    .prepare(
      `UPDATE events SET title = @title, description = @description, location = @location, starts_at = @startsAt,
       capacity = @capacity, published = @published, updated_at = @now WHERE id = @id`,
    )
    .run({
      id: event.id,
      title: next.title,
      description: next.description,
      location: next.location,
      startsAt: new Date(next.startsAt).toISOString(),
      capacity: next.capacity,
      published: next.published ? 1 : 0,
      now: isoNow(),
    });

  const verb = next.published === event.published ? 'update' : next.published ? 'publish' : 'unpublish';
  const pastTense = { update: 'Updated', publish: 'Published', unpublish: 'Unpublished' }[verb];
  audit(req.user!.id, `event.${verb}`, `${pastTense} event ${next.title}`);
  res.json(loadEvent(event.id, req.user!.id));
});

eventsRouter.delete('/events/:id', authRequired, requireRole('EVENT_MANAGER', 'ADMIN'), (req: AuthedRequest, res: Response) => {
  const event = findEditable(req, res);
  if (!event) return;

  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM event_rsvps WHERE event_id = ?').run(event.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
  })();
  audit(req.user!.id, 'event.delete', `Deleted event ${event.title} (${event.rsvpCount} RSVPs)`);
  res.status(204).end();
});

eventsRouter.post('/events/:id/rsvp', authRequired, (req: AuthedRequest, res: Response) => {
  const event = loadEvent(String(req.params.id), req.user!.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (!event.published) return res.status(403).json({ error: 'This event is not published.' });
  if (event.rsvped) return res.status(409).json({ error: 'You have already RSVPed to this event.' });
  if (event.capacity > 0 && event.rsvpCount >= event.capacity) return res.status(409).json({ error: 'This event is full.' });

  getDb().prepare('INSERT INTO event_rsvps (id, event_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(makeId('rsvp'), event.id, req.user!.id, isoNow());
  res.status(201).json(loadEvent(event.id, req.user!.id));
});

eventsRouter.delete('/events/:id/rsvp', authRequired, (req: AuthedRequest, res: Response) => {
  const result = getDb().prepare('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  if (!result.changes) return res.status(404).json({ error: 'No RSVP to cancel.' });
  res.json(loadEvent(String(req.params.id), req.user!.id));
});
