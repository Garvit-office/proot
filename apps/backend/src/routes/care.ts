import { Router } from 'express';
import { z } from 'zod';
import { BOOKING_STATUS_LABELS, CARE_CATEGORIES, rupees, type Booking, type BookingStatus } from '@proot/shared';
import { authOptional, authRequired, isOwnerOrAdmin, requireRole, type AuthedRequest } from '../auth.js';
import { appConfig } from '../config.js';
import { one, query, tx, type Db, pool } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, geoQuery, h, idParam, notFound, parse } from '../lib/http.js';
import { imageRef, resolveImageField } from '../lib/images.js';
import { toBooking, toReview, toService } from '../lib/mappers.js';
import { notify } from '../lib/notify.js';
import { assertPaymentsReady, createPaymentIntent, refundFor, registerPaymentHandler } from '../lib/payments.js';
import { emitToUsers } from '../lib/realtime.js';
import { Params, likePattern } from '../lib/sql.js';

/** Bookable hours, in the app's time zone. */
const TIMEZONE = process.env.APP_TIMEZONE ?? 'Asia/Kolkata';
const DAY_START = '08:00';
const DAY_END = '20:00';
const SLOT_STEP_MIN = 30;
/** Customers can cancel a confirmed booking up to this many hours before it starts. */
const CANCEL_CUTOFF_HOURS = 2;

const serviceSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.enum(CARE_CATEGORIES),
  description: z.string().trim().max(2000).default(''),
  pricePaise: z.number().int().min(100).max(5_000_000),
  durationMin: z.number().int().min(10).max(1440),
  image: imageRef.nullable().optional(),
  city: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  serviceRadiusKm: z.number().min(0.5).max(100).optional(),
  isActive: z.boolean().optional(),
});

function serviceSelect(p: Params, near?: { lat: number; lng: number }) {
  const distance = near ? `haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, s.lat, s.lng)` : 'NULL::float';
  return `SELECT s.*, u.name AS provider_name, u.avatar_image_id AS provider_avatar, ${distance} AS distance_km
          FROM care_services s JOIN users u ON u.id = s.provider_id`;
}

export async function loadService(id: string, near?: { lat: number; lng: number }) {
  const p = new Params();
  const row = await one(`${serviceSelect(p, near)} WHERE s.id = ${p.add(id)}`, p.values);
  return row ? toService(row) : null;
}

export const BOOKING_SELECT = `
  SELECT b.*, s.title AS service_title, s.category AS service_category, s.image_id AS service_image_id, s.image_url AS service_image_url,
    pu.name AS provider_name, pu.avatar_image_id AS provider_avatar,
    cu.name AS customer_name, cu.avatar_image_id AS customer_avatar, cu.phone AS customer_phone,
    pe.name AS pet_name, pe.photo_image_id AS pet_photo,
    r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment, r.created_at AS review_created_at
  FROM bookings b
  JOIN care_services s ON s.id = b.service_id
  JOIN users pu ON pu.id = b.provider_id
  JOIN users cu ON cu.id = b.user_id
  LEFT JOIN pets pe ON pe.id = b.pet_id
  LEFT JOIN reviews r ON r.booking_id = b.id`;

export async function loadBooking(id: string, db: Db = pool): Promise<Booking | null> {
  const row = await one(`${BOOKING_SELECT} WHERE b.id = $1`, [id], db);
  return row ? toBooking(row) : null;
}

async function pushBooking(id: string) {
  const booking = await loadBooking(id);
  if (booking) emitToUsers([booking.customer.id, booking.provider.id], 'booking:updated', booking);
  return booking;
}

// ------------------------------------------------------------- payments

registerPaymentHandler('BOOKING', {
  async onPaid(bookingId, db) {
    await query(`UPDATE bookings SET is_paid = true WHERE id = $1`, [bookingId], db);
  },
  async afterPaid(bookingId) {
    const booking = await loadBooking(bookingId);
    if (!booking) return;
    if (booking.status === 'CANCELLED' || booking.status === 'DECLINED') {
      await refundFor('BOOKING', bookingId);
      return;
    }
    const when = new Date(booking.startsAt).toLocaleString('en-IN', { timeZone: TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });
    await notify(booking.provider.id, { type: 'booking.request', title: 'New booking request', body: `${booking.customer.name} booked ${booking.service.title} for ${when}.`, link: '/provider/bookings' });
    await notify(booking.customer.id, { type: 'booking.paid', title: 'Booking requested', body: `Paid ${rupees(booking.pricePaise)}. ${booking.provider.name} will confirm shortly.`, link: '/bookings' });
    await pushBooking(bookingId);
  },
});

/** Unpaid booking requests release their slot after the pending TTL. */
export async function expireUnpaidBookings() {
  const rows = await query(
    `UPDATE bookings SET status = 'CANCELLED' WHERE status = 'REQUESTED' AND NOT is_paid AND created_at < now() - ($1 || ' minutes')::interval RETURNING id`,
    [String(appConfig.pendingOrderTtlMin)],
  );
  for (const r of rows) {
    await query(`UPDATE payments SET status = 'FAILED', failure_reason = 'Expired' WHERE purpose = 'BOOKING' AND reference_id = $1 AND status = 'CREATED'`, [r.id]);
    await pushBooking(r.id);
  }
}

// ------------------------------------------------------------- services

export const careRouter = Router();

careRouter.get('/care/services', authOptional, h<AuthedRequest>(async (req, res) => {
  const qy = parse(geoQuery.extend({
    q: z.string().trim().max(100).optional(),
    category: z.enum(CARE_CATEGORIES).optional(),
    providerId: z.string().uuid().optional(),
    mine: z.enum(['true', 'false', '1', '0']).optional(),
    sort: z.enum(['rating', 'price_asc', 'distance', 'new']).default('rating'),
  }), req.query);
  const near = qy.lat !== undefined && qy.lng !== undefined ? { lat: qy.lat, lng: qy.lng } : req.user?.lat != null ? { lat: req.user.lat, lng: req.user.lng! } : undefined;
  const mine = (qy.mine === 'true' || qy.mine === '1') && req.user;

  const p = new Params();
  const where: string[] = [];
  const select = serviceSelect(p, near);
  if (mine) where.push(`s.provider_id = ${p.add(req.user!.id)}`);
  else where.push('s.is_active', 'u.is_active');
  if (qy.q) where.push(`(s.title ILIKE ${p.add(likePattern(qy.q))} OR s.description ILIKE $${p.values.length} OR u.name ILIKE $${p.values.length})`);
  if (qy.category) where.push(`s.category = ${p.add(qy.category)}`);
  if (qy.providerId) where.push(`s.provider_id = ${p.add(qy.providerId)}`);
  if (qy.radiusKm && near) where.push(`haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, s.lat, s.lng) <= ${p.add(qy.radiusKm)}`);
  const order = {
    rating: 's.rating_avg DESC, s.rating_count DESC',
    price_asc: 's.price_paise ASC',
    distance: near ? 'distance_km ASC NULLS LAST' : 's.rating_avg DESC',
    new: 's.created_at DESC',
  }[qy.sort];
  const rows = await query(`${select} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`, p.values);
  res.json(rows.map(toService));
}));

careRouter.get('/care/services/:id', authOptional, h<AuthedRequest>(async (req, res) => {
  const near = req.user?.lat != null ? { lat: req.user.lat, lng: req.user.lng! } : undefined;
  const service = await loadService(idParam(req), near);
  if (!service || (!service.isActive && !isOwnerOrAdmin(req, service.provider.id))) throw notFound('Service not found.');
  const reviews = await query(
    `SELECT r.*, u.name AS user_name, u.avatar_image_id AS user_avatar FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.service_id = $1 ORDER BY r.created_at DESC LIMIT 30`,
    [service.id],
  );
  res.json({ ...service, reviews: reviews.map(toReview) });
}));

careRouter.get('/care/services/:id/slots', h(async (req, res) => {
  const { date } = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.') }), req.query);
  const service = await one('SELECT id, provider_id, duration_min, is_active FROM care_services WHERE id = $1', [idParam(req)]);
  if (!service || !service.is_active) throw notFound('Service not found.');
  const rows = await query(
    `WITH candidates AS (
       SELECT gs AS starts_at, gs + make_interval(mins => $3) AS ends_at
       FROM generate_series(($1 || ' ' || $4)::timestamp AT TIME ZONE $6,
                            ($1 || ' ' || $5)::timestamp AT TIME ZONE $6 - make_interval(mins => $3),
                            make_interval(mins => $7)) gs
     )
     SELECT c.starts_at FROM candidates c
     WHERE c.starts_at > now() + interval '1 hour'
       AND NOT EXISTS (
         SELECT 1 FROM bookings b WHERE b.provider_id = $2 AND b.status IN ('REQUESTED', 'CONFIRMED')
           AND tstzrange(b.starts_at, b.ends_at) && tstzrange(c.starts_at, c.ends_at))
     ORDER BY c.starts_at`,
    [date, service.provider_id, service.duration_min, DAY_START, DAY_END, TIMEZONE, SLOT_STEP_MIN],
  );
  res.json({ date, durationMin: service.duration_min, slots: rows.map((r) => r.starts_at.toISOString()) });
}));

careRouter.post('/care/services', authRequired, requireRole('PROVIDER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  const body = parse(serviceSchema, req.body, 'Some service details need attention.');
  const user = await one('SELECT city, lat, lng FROM users WHERE id = $1', [req.user!.id]);
  const [imageId, imageUrl] = (await resolveImageField(body.image, req.user!.id)) ?? [null, null];
  const row = await one(
    `INSERT INTO care_services (provider_id, title, category, description, price_paise, duration_min, image_id, image_url, city, lat, lng, service_radius_km, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [req.user!.id, body.title, body.category, body.description, body.pricePaise, body.durationMin, imageId, imageUrl,
      body.city ?? user.city, body.lat === undefined ? user.lat : body.lat, body.lng === undefined ? user.lng : body.lng, body.serviceRadiusKm ?? 10, body.isActive ?? true],
  );
  await audit(req.user!.id, 'service.create', `Created care service ${body.title}`);
  res.status(201).json(await loadService(row.id));
}));

careRouter.patch('/care/services/:id', authRequired, requireRole('PROVIDER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  const existing = await one('SELECT * FROM care_services WHERE id = $1', [idParam(req)]);
  if (!existing) throw notFound('Service not found.');
  if (!isOwnerOrAdmin(req, existing.provider_id)) throw forbidden('You can only edit your own services.');
  const body = parse(serviceSchema.partial(), req.body, 'Some service details need attention.');
  const image = await resolveImageField(body.image, existing.provider_id);
  await query(
    `UPDATE care_services SET title=$2, category=$3, description=$4, price_paise=$5, duration_min=$6, image_id=$7, image_url=$8,
       city=$9, lat=$10, lng=$11, service_radius_km=$12, is_active=$13 WHERE id=$1`,
    [existing.id, body.title ?? existing.title, body.category ?? existing.category, body.description ?? existing.description,
      body.pricePaise ?? existing.price_paise, body.durationMin ?? existing.duration_min,
      image ? image[0] : existing.image_id, image ? image[1] : existing.image_url,
      body.city ?? existing.city, body.lat === undefined ? existing.lat : body.lat, body.lng === undefined ? existing.lng : body.lng,
      body.serviceRadiusKm ?? existing.service_radius_km, body.isActive ?? existing.is_active],
  );
  await audit(req.user!.id, 'service.update', `Updated care service ${body.title ?? existing.title}`);
  res.json(await loadService(existing.id));
}));

careRouter.delete('/care/services/:id', authRequired, requireRole('PROVIDER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  const existing = await one('SELECT * FROM care_services WHERE id = $1', [idParam(req)]);
  if (!existing) throw notFound('Service not found.');
  if (!isOwnerOrAdmin(req, existing.provider_id)) throw forbidden('You can only delete your own services.');
  const upcoming = await one(`SELECT 1 FROM bookings WHERE service_id = $1 AND status IN ('REQUESTED', 'CONFIRMED') AND ends_at > now()`, [existing.id]);
  if (upcoming) throw conflict('This service has upcoming bookings. Finish or cancel them first, or pause the service instead.');
  const history = await one('SELECT 1 FROM bookings WHERE service_id = $1', [existing.id]);
  // Keep services with booking history (paused), so past bookings still make sense.
  if (history) await query('UPDATE care_services SET is_active = false WHERE id = $1', [existing.id]);
  else await query('DELETE FROM care_services WHERE id = $1', [existing.id]);
  await audit(req.user!.id, 'service.delete', `${history ? 'Paused' : 'Deleted'} care service ${existing.title}`);
  res.status(204).end();
}));

// ------------------------------------------------------------- bookings

const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  petId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  address: z.string().trim().min(5, 'Add the address for the visit.').max(300),
  notes: z.string().trim().max(1000).default(''),
});

careRouter.post('/bookings', authRequired, h<AuthedRequest>(async (req, res) => {
  assertPaymentsReady();
  const body = parse(bookingSchema, req.body, 'Some booking details need attention.');
  const user = req.user!;
  const startsAt = new Date(body.startsAt);
  if (startsAt.getTime() < Date.now() + 60 * 60 * 1000) throw badRequest('Pick a time at least an hour from now.');

  const { bookingId, payment } = await tx(async (db) => {
    const service = await one('SELECT * FROM care_services WHERE id = $1 AND is_active', [body.serviceId], db);
    if (!service) throw notFound('This service isn’t taking bookings.');
    if (service.provider_id === user.id) throw badRequest('You can’t book your own service.');
    const pet = await one('SELECT id, name FROM pets WHERE id = $1 AND user_id = $2', [body.petId, user.id], db);
    if (!pet) throw notFound('Pet not found.');
    // Serialise bookings per provider so two people can't take the same slot.
    await query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [service.provider_id], db);
    const endsAt = new Date(startsAt.getTime() + service.duration_min * 60_000);
    const clash = await one(
      `SELECT 1 FROM bookings WHERE provider_id = $1 AND status IN ('REQUESTED', 'CONFIRMED') AND tstzrange(starts_at, ends_at) && tstzrange($2, $3)`,
      [service.provider_id, startsAt, endsAt],
      db,
    );
    if (clash) throw conflict('That time was just taken. Please pick another slot.');
    const booking = await one(
      `INSERT INTO bookings (service_id, provider_id, user_id, pet_id, starts_at, ends_at, address, notes, price_paise)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [service.id, service.provider_id, user.id, pet.id, startsAt, endsAt, body.address, body.notes, service.price_paise],
      db,
    );
    const payment = await createPaymentIntent({ user, purpose: 'BOOKING', referenceId: booking.id, amountPaise: service.price_paise, description: `${service.title} for ${pet.name}` }, db);
    return { bookingId: booking.id, payment };
  });
  await audit(user.id, 'booking.create', `Requested booking ${bookingId.slice(0, 8)}`);
  res.status(201).json({ booking: await loadBooking(bookingId), payment });
}));

careRouter.get('/bookings', authRequired, h<AuthedRequest>(async (req, res) => {
  const rows = await query(`${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.starts_at DESC LIMIT 200`, [req.user!.id]);
  res.json(rows.map(toBooking));
}));

careRouter.get('/bookings/provider', authRequired, requireRole('PROVIDER', 'ADMIN'), h<AuthedRequest>(async (req, res) => {
  // Unpaid requests are hidden from providers until payment arrives.
  const rows = await query(
    `${BOOKING_SELECT} WHERE b.provider_id = $1 AND (b.is_paid OR b.status <> 'REQUESTED') ORDER BY b.starts_at ASC LIMIT 300`,
    [req.user!.id],
  );
  res.json(rows.map(toBooking));
}));

careRouter.get('/bookings/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const booking = await loadBooking(idParam(req));
  if (!booking || ![booking.customer.id, booking.provider.id].includes(req.user!.id) && req.user!.role !== 'ADMIN') throw notFound('Booking not found.');
  res.json(booking);
}));

careRouter.post('/bookings/:id/pay', authRequired, h<AuthedRequest>(async (req, res) => {
  const booking = await one('SELECT b.*, s.title FROM bookings b JOIN care_services s ON s.id = b.service_id WHERE b.id = $1 AND b.user_id = $2', [idParam(req), req.user!.id]);
  if (!booking) throw notFound('Booking not found.');
  if (booking.is_paid || booking.status !== 'REQUESTED') throw conflict('This booking doesn’t need payment.');
  res.json(await createPaymentIntent({ user: req.user!, purpose: 'BOOKING', referenceId: booking.id, amountPaise: booking.price_paise, description: booking.title }));
}));

careRouter.patch('/bookings/:id/status', authRequired, h<AuthedRequest>(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['CONFIRMED', 'DECLINED', 'COMPLETED', 'CANCELLED']) }), req.body);
  const user = req.user!;
  const id = idParam(req);

  const result = await tx(async (db) => {
    const b = await one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id], db);
    if (!b) throw notFound('Booking not found.');
    const isProvider = b.provider_id === user.id || (user.role === 'ADMIN');
    const isCustomer = b.user_id === user.id;
    if (!isProvider && !isCustomer) throw notFound('Booking not found.');
    const from = b.status as BookingStatus;

    const allowed =
      (isProvider && from === 'REQUESTED' && (status === 'CONFIRMED' || status === 'DECLINED')) ||
      (isProvider && from === 'CONFIRMED' && (status === 'COMPLETED' || status === 'CANCELLED')) ||
      (isCustomer && (from === 'REQUESTED' || from === 'CONFIRMED') && status === 'CANCELLED');
    if (!allowed) throw conflict(`A ${BOOKING_STATUS_LABELS[from].toLowerCase()} booking can’t be marked ${BOOKING_STATUS_LABELS[status].toLowerCase()}.`);
    if (status === 'CONFIRMED' && !b.is_paid) throw conflict('This booking hasn’t been paid yet.');
    if (status === 'COMPLETED' && new Date(b.starts_at).getTime() > Date.now()) throw conflict('You can mark it complete once the visit has started.');
    if (status === 'CANCELLED' && isCustomer && !isProvider && from === 'CONFIRMED' && new Date(b.starts_at).getTime() - Date.now() < CANCEL_CUTOFF_HOURS * 3600_000) {
      throw conflict(`Confirmed bookings can be cancelled up to ${CANCEL_CUTOFF_HOURS} hours before the visit. Please contact the provider.`);
    }

    const refunded = (status === 'DECLINED' || status === 'CANCELLED') && b.is_paid ? await refundFor('BOOKING', b.id, db) : false;
    await query('UPDATE bookings SET status = $2 WHERE id = $1', [b.id, status], db);
    await query(`UPDATE payments SET status = 'FAILED', failure_reason = 'Booking closed' WHERE purpose = 'BOOKING' AND reference_id = $1 AND status = 'CREATED'`, [b.id], db);
    if (status === 'COMPLETED' && b.pet_id) {
      const service = await one('SELECT title, duration_min FROM care_services WHERE id = $1', [b.service_id], db);
      await query(
        `INSERT INTO activities (user_id, pet_id, type, title, detail, duration_min, occurred_at) VALUES ($1, $2, 'Care', $3, $4, $5, $6)`,
        [b.user_id, b.pet_id, service.title, 'Completed booking', service.duration_min, b.starts_at],
        db,
      );
    }
    return { b, refunded, actorIsProvider: isProvider && b.user_id !== user.id };
  });

  const booking = (await pushBooking(id))!;
  const titles: Record<string, string> = { CONFIRMED: 'Booking confirmed', DECLINED: 'Booking declined', COMPLETED: 'Visit completed', CANCELLED: 'Booking cancelled' };
  const refundNote = result.refunded ? ` ${rupees(booking.pricePaise)} has been refunded.` : '';
  if (result.actorIsProvider) {
    await notify(booking.customer.id, { type: `booking.${status.toLowerCase()}`, title: titles[status], body: `${booking.service.title} with ${booking.provider.name}.${refundNote}${status === 'COMPLETED' ? ' Leave a review?' : ''}`, link: '/bookings' });
  } else {
    await notify(booking.provider.id, { type: 'booking.cancelled', title: 'Booking cancelled', body: `${booking.customer.name} cancelled ${booking.service.title}.`, link: '/provider/bookings' });
    if (result.refunded) await notify(booking.customer.id, { type: 'booking.refunded', title: 'Refund on its way', body: `${rupees(booking.pricePaise)} for ${booking.service.title}.`, link: '/bookings' });
  }
  await audit(user.id, `booking.${status.toLowerCase()}`, `Booking ${id.slice(0, 8)} → ${status}`);
  res.json(booking);
}));

careRouter.post('/bookings/:id/review', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default('') }), req.body);
  const id = idParam(req);
  const review = await tx(async (db) => {
    const b = await one('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user!.id], db);
    if (!b) throw notFound('Booking not found.');
    if (b.status !== 'COMPLETED') throw conflict('You can review a visit once it’s completed.');
    if (await one('SELECT 1 FROM reviews WHERE booking_id = $1', [id], db)) throw conflict('You’ve already reviewed this visit.');
    const row = await one(
      'INSERT INTO reviews (booking_id, service_id, user_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, b.service_id, req.user!.id, body.rating, body.comment],
      db,
    );
    await query(
      `UPDATE care_services s SET rating_avg = sub.avg, rating_count = sub.n
       FROM (SELECT ROUND(AVG(rating)::numeric, 2) AS avg, COUNT(*) AS n FROM reviews WHERE service_id = $1) sub WHERE s.id = $1`,
      [b.service_id],
      db,
    );
    return { ...row, user_name: req.user!.name, user_avatar: null, provider_id: b.provider_id };
  });
  await notify(review.provider_id, { type: 'review.new', title: `New ${body.rating}★ review`, body: body.comment.slice(0, 120), link: '/provider/services' });
  await pushBooking(id);
  res.status(201).json(toReview(review));
}));

