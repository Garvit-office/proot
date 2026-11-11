import { Router } from 'express';
import { z } from 'zod';
import { formatAge, type ChatMessage, type Match } from '@proot/shared';
import { authRequired, type AuthedRequest } from '../auth.js';
import { one, query, tx } from '../db.js';
import { badRequest, h, idParam, notFound, parse } from '../lib/http.js';
import { imageUrl } from '../lib/images.js';
import { summary } from '../lib/mappers.js';
import { notify } from '../lib/notify.js';
import { emitToUsers } from '../lib/realtime.js';

const DEFAULT_RADIUS_KM = 25;

const toMessage = (r: any): ChatMessage => ({ id: r.id, matchId: r.match_id, senderId: r.sender_id, body: r.body, readAt: r.read_at, createdAt: r.created_at });

function toDiscover(r: any) {
  return {
    id: r.id,
    name: r.name,
    breed: r.breed,
    age: formatAge(r.birth_date),
    sex: r.sex,
    bio: r.bio,
    prompt: r.prompt,
    answer: r.answer,
    temperament: r.temperament ?? [],
    photoUrl: imageUrl(r.photo_image_id),
    ownerName: String(r.owner_name).split(' ')[0],
    distanceKm: r.distance_km === null || r.distance_km === undefined ? null : Math.round(Number(r.distance_km) * 10) / 10,
  };
}

/** Matches for a user, seen from that user's side. */
async function loadMatches(userId: string, matchId?: string): Promise<Match[]> {
  const rows = await query(
    `SELECT m.id, m.created_at,
       CASE WHEN m.user_a_id = $1 THEN m.pet_a_id ELSE m.pet_b_id END AS my_pet_id,
       CASE WHEN m.user_a_id = $1 THEN m.pet_b_id ELSE m.pet_a_id END AS their_pet_id,
       CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END AS other_user_id
     FROM matches m WHERE (m.user_a_id = $1 OR m.user_b_id = $1) ${matchId ? 'AND m.id = $2' : ''}`,
    matchId ? [userId, matchId] : [userId],
  );
  if (!rows.length) return [];
  const petIds = rows.flatMap((r) => [r.my_pet_id, r.their_pet_id]);
  const pets = new Map((await query('SELECT id, name, breed, photo_image_id FROM pets WHERE id = ANY($1::uuid[])', [petIds])).map((p) => [p.id, p]));
  const users = new Map((await query('SELECT id, name, avatar_image_id FROM users WHERE id = ANY($1::uuid[])', [rows.map((r) => r.other_user_id)])).map((u) => [u.id, u]));
  const last = new Map((await query(
    `SELECT DISTINCT ON (match_id) * FROM messages WHERE match_id = ANY($1::uuid[]) ORDER BY match_id, created_at DESC`,
    [rows.map((r) => r.id)],
  )).map((m) => [m.match_id, m]));
  const unread = new Map((await query(
    `SELECT match_id, COUNT(*) AS n FROM messages WHERE match_id = ANY($1::uuid[]) AND sender_id <> $2 AND read_at IS NULL GROUP BY match_id`,
    [rows.map((r) => r.id), userId],
  )).map((u) => [u.match_id, Number(u.n)]));

  return rows
    .map((r) => {
      const mine = pets.get(r.my_pet_id);
      const theirs = pets.get(r.their_pet_id);
      const other = users.get(r.other_user_id);
      return {
        id: r.id,
        myPet: { id: r.my_pet_id, name: mine?.name ?? '', photoUrl: imageUrl(mine?.photo_image_id) },
        theirPet: { id: r.their_pet_id, name: theirs?.name ?? '', photoUrl: imageUrl(theirs?.photo_image_id), breed: theirs?.breed ?? '' },
        otherUser: summary(r.other_user_id, other?.name ?? '', other?.avatar_image_id ?? null),
        lastMessage: last.has(r.id) ? toMessage(last.get(r.id)) : null,
        unreadCount: unread.get(r.id) ?? 0,
        createdAt: r.created_at,
      };
    })
    .sort((a, b) => new Date(b.lastMessage?.createdAt ?? b.createdAt).getTime() - new Date(a.lastMessage?.createdAt ?? a.createdAt).getTime());
}

async function requireMatch(userId: string, matchId: string) {
  const m = await one('SELECT * FROM matches WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2)', [matchId, userId]);
  if (!m) throw notFound('Conversation not found.');
  return m;
}

export const friendsRouter = Router();

friendsRouter.get('/friends/discover', authRequired, h<AuthedRequest>(async (req, res) => {
  const qy = parse(z.object({ petId: z.string().uuid(), radiusKm: z.coerce.number().min(1).max(200).optional() }), req.query);
  const me = req.user!;
  const pet = await one('SELECT id FROM pets WHERE id = $1 AND user_id = $2', [qy.petId, me.id]);
  if (!pet) throw notFound('Pet not found.');
  const radius = qy.radiusKm ?? DEFAULT_RADIUS_KM;
  // Other people's discoverable dogs this pet hasn't answered yet, nearest first.
  // Without a saved location we still show dogs, just without distances.
  const rows = await query(
    `SELECT pe.*, u.name AS owner_name, haversine_km($2, $3, u.lat, u.lng) AS distance_km
     FROM pets pe JOIN users u ON u.id = pe.user_id
     WHERE pe.user_id <> $1 AND pe.discoverable AND u.is_active
       AND NOT EXISTS (SELECT 1 FROM pet_greetings g WHERE g.from_pet_id = $4 AND g.to_pet_id = pe.id)
       AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.pet_a_id = $4 AND m.pet_b_id = pe.id) OR (m.pet_b_id = $4 AND m.pet_a_id = pe.id))
       AND ($2::float IS NULL OR u.lat IS NULL OR haversine_km($2, $3, u.lat, u.lng) <= $5)
     ORDER BY distance_km ASC NULLS LAST, pe.created_at DESC LIMIT 30`,
    [me.id, me.lat, me.lng, pet.id, radius],
  );
  res.json(rows.map(toDiscover));
}));

friendsRouter.post('/friends/greet', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(z.object({ fromPetId: z.string().uuid(), toPetId: z.string().uuid(), liked: z.boolean() }), req.body);
  if (body.fromPetId === body.toPetId) throw badRequest('A dog can’t say hi to itself.');
  const me = req.user!;
  const result = await tx(async (db) => {
    const from = await one('SELECT id, name FROM pets WHERE id = $1 AND user_id = $2', [body.fromPetId, me.id], db);
    if (!from) throw notFound('Pet not found.');
    const to = await one('SELECT p.id, p.name, p.user_id FROM pets p JOIN users u ON u.id = p.user_id WHERE p.id = $1 AND u.is_active', [body.toPetId], db);
    if (!to || to.user_id === me.id) throw notFound('That dog isn’t available.');
    await query(
      `INSERT INTO pet_greetings (from_pet_id, to_pet_id, liked) VALUES ($1, $2, $3)
       ON CONFLICT (from_pet_id, to_pet_id) DO UPDATE SET liked = EXCLUDED.liked, created_at = now()`,
      [from.id, to.id, body.liked],
      db,
    );
    if (!body.liked) return { matched: false as const, from, to };
    const mutual = await one('SELECT 1 FROM pet_greetings WHERE from_pet_id = $1 AND to_pet_id = $2 AND liked', [to.id, from.id], db);
    if (!mutual) return { matched: false as const, from, to };
    const [a, b] = from.id < to.id ? [from, { ...to }] : [to, from];
    const userA = a.id === from.id ? me.id : to.user_id;
    const userB = b.id === from.id ? me.id : to.user_id;
    const match = await one(
      `INSERT INTO matches (pet_a_id, pet_b_id, user_a_id, user_b_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (pet_a_id, pet_b_id) DO UPDATE SET pet_a_id = EXCLUDED.pet_a_id RETURNING id`,
      [a.id, b.id, userA, userB],
      db,
    );
    return { matched: true as const, matchId: match.id as string, from, to };
  });

  if (!result.matched) {
    if (body.liked) await notify(result.to.user_id, { type: 'friends.hello', title: `${result.from.name} said hi to ${result.to.name}`, body: 'Say hi back to start chatting.', link: '/friends' });
    return res.json({ matched: false, match: null });
  }
  const [mine] = await loadMatches(me.id, result.matchId);
  const [theirs] = await loadMatches(result.to.user_id, result.matchId);
  emitToUsers([result.to.user_id], 'match:new', theirs);
  emitToUsers([me.id], 'match:new', mine);
  await notify(result.to.user_id, { type: 'friends.match', title: `${result.from.name} and ${result.to.name} are friends!`, body: 'You can chat now.', link: `/friends/chat/${result.matchId}` });
  res.json({ matched: true, match: mine });
}));

friendsRouter.get('/friends/pending', authRequired, h<AuthedRequest>(async (req, res) => {
  const me = req.user!;
  const incoming = await query(
    `SELECT pe.*, u.name AS owner_name, haversine_km($2, $3, u.lat, u.lng) AS distance_km, mine.id AS to_pet_id, mine.name AS to_pet_name
     FROM pet_greetings g JOIN pets pe ON pe.id = g.from_pet_id JOIN users u ON u.id = pe.user_id JOIN pets mine ON mine.id = g.to_pet_id
     WHERE mine.user_id = $1 AND g.liked AND u.is_active
       AND NOT EXISTS (SELECT 1 FROM pet_greetings back WHERE back.from_pet_id = g.to_pet_id AND back.to_pet_id = g.from_pet_id)
     ORDER BY g.created_at DESC`,
    [me.id, me.lat, me.lng],
  );
  const outgoing = await query(
    `SELECT pe.*, u.name AS owner_name, haversine_km($2, $3, u.lat, u.lng) AS distance_km, mine.id AS from_pet_id, mine.name AS from_pet_name
     FROM pet_greetings g JOIN pets pe ON pe.id = g.to_pet_id JOIN users u ON u.id = pe.user_id JOIN pets mine ON mine.id = g.from_pet_id
     WHERE mine.user_id = $1 AND g.liked
       AND NOT EXISTS (SELECT 1 FROM pet_greetings back WHERE back.from_pet_id = g.to_pet_id AND back.to_pet_id = g.from_pet_id)
     ORDER BY g.created_at DESC`,
    [me.id, me.lat, me.lng],
  );
  res.json({
    incoming: incoming.map((r) => ({ ...toDiscover(r), toPetId: r.to_pet_id, toPetName: r.to_pet_name })),
    outgoing: outgoing.map((r) => ({ ...toDiscover(r), fromPetId: r.from_pet_id, fromPetName: r.from_pet_name })),
  });
}));

friendsRouter.get('/friends/matches', authRequired, h<AuthedRequest>(async (req, res) => {
  res.json(await loadMatches(req.user!.id));
}));

friendsRouter.delete('/friends/matches/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const m = await requireMatch(req.user!.id, idParam(req));
  await tx(async (db) => {
    await query('DELETE FROM matches WHERE id = $1', [m.id], db);
    // Mark as "not now" both ways so they don't immediately reappear in discovery.
    await query(
      `UPDATE pet_greetings SET liked = false WHERE (from_pet_id = $1 AND to_pet_id = $2) OR (from_pet_id = $2 AND to_pet_id = $1)`,
      [m.pet_a_id, m.pet_b_id],
      db,
    );
  });
  emitToUsers([m.user_a_id, m.user_b_id], 'match:removed', { id: m.id });
  res.status(204).end();
}));

friendsRouter.get('/friends/matches/:id/messages', authRequired, h<AuthedRequest>(async (req, res) => {
  const m = await requireMatch(req.user!.id, idParam(req));
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
  const rows = await query(
    `SELECT * FROM (SELECT * FROM messages WHERE match_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2) ORDER BY created_at DESC LIMIT 50) t ORDER BY created_at ASC`,
    [m.id, before],
  );
  res.json(rows.map(toMessage));
}));

friendsRouter.post('/friends/matches/:id/messages', authRequired, h<AuthedRequest>(async (req, res) => {
  const m = await requireMatch(req.user!.id, idParam(req));
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'Write a message.').max(2000) }), req.body);
  const row = await one('INSERT INTO messages (match_id, sender_id, body) VALUES ($1, $2, $3) RETURNING *', [m.id, req.user!.id, body]);
  const message = toMessage(row);
  const other = m.user_a_id === req.user!.id ? m.user_b_id : m.user_a_id;
  emitToUsers([m.user_a_id, m.user_b_id], 'message:new', message);
  await notify(other, { type: 'friends.message', title: `Message from ${req.user!.name}`, body: body.slice(0, 120), link: `/friends/chat/${m.id}` });
  res.status(201).json(message);
}));

friendsRouter.post('/friends/matches/:id/read', authRequired, h<AuthedRequest>(async (req, res) => {
  const m = await requireMatch(req.user!.id, idParam(req));
  await query('UPDATE messages SET read_at = now() WHERE match_id = $1 AND sender_id <> $2 AND read_at IS NULL', [m.id, req.user!.id]);
  res.status(204).end();
}));
