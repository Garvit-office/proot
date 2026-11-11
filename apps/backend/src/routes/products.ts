import { Router } from 'express';
import { z } from 'zod';
import { MAX_PRODUCT_IMAGES, PRODUCT_CATEGORIES, PRODUCT_CONDITIONS, type Product } from '@proot/shared';
import { authOptional, authRequired, isOwnerOrAdmin, type AuthedRequest } from '../auth.js';
import { count, one, query, type Db, pool } from '../db.js';
import { audit } from '../lib/audit.js';
import { forbidden, geoQuery, h, idParam, notFound, optionalNumber, parse } from '../lib/http.js';
import { imageRef, resolveImageRef } from '../lib/images.js';
import { toProduct } from '../lib/mappers.js';
import { broadcast } from '../lib/realtime.js';
import { Params, clampLimit, clampOffset, likePattern } from '../lib/sql.js';

const productSchema = z.object({
  title: z.string().trim().min(2, 'Give the listing a title.').max(120),
  description: z.string().trim().max(4000).default(''),
  category: z.enum(PRODUCT_CATEGORIES),
  condition: z.enum(PRODUCT_CONDITIONS).default('New'),
  pricePaise: z.number().int().min(100, 'The price must be at least ₹1.').max(10_000_000),
  stock: z.number().int().min(0).max(10_000),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).default('ACTIVE'),
  images: z.array(imageRef).max(MAX_PRODUCT_IMAGES, `Up to ${MAX_PRODUCT_IMAGES} photos.`).default([]),
  city: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export function productSelect(p: Params, near?: { lat?: number; lng?: number }) {
  const distance = near?.lat !== undefined && near?.lng !== undefined
    ? `haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, p.lat, p.lng)`
    : 'NULL::float';
  return `SELECT p.*, u.name AS seller_name, u.avatar_image_id AS seller_avatar, ${distance} AS distance_km
          FROM products p JOIN users u ON u.id = p.seller_id`;
}

export async function loadProduct(id: string, db: Db = pool): Promise<Product | null> {
  const p = new Params();
  const row = await one(`${productSelect(p)} WHERE p.id = ${p.add(id)}`, p.values, db);
  return row ? toProduct(row) : null;
}

async function resolveImages(refs: string[], ownerId: string) {
  const ids: string[] = [];
  for (const ref of refs) {
    const id = await resolveImageRef(ref, ownerId);
    if (id) ids.push(id);
  }
  return ids;
}

/** Push stock/status to everyone browsing (product cards and cart badges update live). */
export function broadcastProduct(product: { id: string; stock: number; status: string }, deleted = false) {
  broadcast('product:updated', { id: product.id, stock: product.stock, status: product.status, ...(deleted ? { deleted } : {}) });
}

export const productsRouter = Router();

const listQuery = geoQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  sellerId: z.string().uuid().optional(),
  mine: z.enum(['true', 'false', '1', '0']).optional(),
  sort: z.enum(['new', 'price_asc', 'price_desc', 'distance']).default('new'),
  limit: optionalNumber(z.number()),
  offset: optionalNumber(z.number()),
});

productsRouter.get('/products', authOptional, h<AuthedRequest>(async (req, res) => {
  const qy = parse(listQuery, req.query, 'Invalid filters.');
  const mine = (qy.mine === 'true' || qy.mine === '1') && req.user;
  // Fall back to the signed-in user's saved location for distances.
  const near = qy.lat !== undefined && qy.lng !== undefined ? { lat: qy.lat, lng: qy.lng } : req.user?.lat != null ? { lat: req.user.lat, lng: req.user.lng! } : undefined;

  const p = new Params();
  const select = productSelect(p, near);
  const where: string[] = [];
  if (mine) where.push(`p.seller_id = ${p.add(req.user!.id)}`);
  else where.push(`p.status = 'ACTIVE'`, 'u.is_active');
  if (qy.q) where.push(`(p.title ILIKE ${p.add(likePattern(qy.q))} OR p.description ILIKE $${p.values.length})`);
  if (qy.category) where.push(`p.category = ${p.add(qy.category)}`);
  if (qy.sellerId) where.push(`p.seller_id = ${p.add(qy.sellerId)}`);
  if (qy.radiusKm && near) where.push(`haversine_km(${p.add(near.lat)}, ${p.add(near.lng)}, p.lat, p.lng) <= ${p.add(qy.radiusKm)}`);

  const order = {
    new: 'p.created_at DESC',
    price_asc: 'p.price_paise ASC, p.created_at DESC',
    price_desc: 'p.price_paise DESC, p.created_at DESC',
    distance: near ? 'distance_km ASC NULLS LAST, p.created_at DESC' : 'p.created_at DESC',
  }[qy.sort];

  const limit = clampLimit(qy.limit);
  const offset = clampOffset(qy.offset);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countParams = [...p.values];
  const total = await count(`SELECT COUNT(*) AS n FROM (${select} ${whereSql}) t`, countParams);
  const rows = await query(`${select} ${whereSql} ORDER BY ${order} LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`, p.values);
  res.json({ items: rows.map(toProduct), total, limit, offset });
}));

productsRouter.get('/products/:id', authOptional, h<AuthedRequest>(async (req, res) => {
  const p = new Params();
  const near = req.user?.lat != null ? { lat: req.user.lat, lng: req.user.lng! } : undefined;
  const row = await one(`${productSelect(p, near)} WHERE p.id = ${p.add(idParam(req))}`, p.values);
  // Drafts and removed listings are only visible to their seller and admins.
  if (!row || (row.status !== 'ACTIVE' && row.status !== 'SOLD_OUT' && !isOwnerOrAdmin(req, row.seller_id))) throw notFound('Listing not found.');
  res.json(toProduct(row));
}));

productsRouter.post('/products', authRequired, h<AuthedRequest>(async (req, res) => {
  const body = parse(productSchema, req.body, 'Some listing details need attention.');
  const user = await one('SELECT city, lat, lng FROM users WHERE id = $1', [req.user!.id]);
  const imageIds = await resolveImages(body.images, req.user!.id);
  const status = body.status === 'ACTIVE' && body.stock === 0 ? 'SOLD_OUT' : body.status;
  const row = await one(
    `INSERT INTO products (seller_id, title, description, category, condition, price_paise, stock, status, image_ids, city, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [req.user!.id, body.title, body.description, body.category, body.condition, body.pricePaise, body.stock, status, imageIds,
      body.city ?? user.city, body.lat === undefined ? user.lat : body.lat, body.lng === undefined ? user.lng : body.lng],
  );
  await audit(req.user!.id, 'product.create', `Listed ${body.title}`);
  res.status(201).json(await loadProduct(row.id));
}));

productsRouter.patch('/products/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const existing = await one('SELECT * FROM products WHERE id = $1', [idParam(req)]);
  if (!existing) throw notFound('Listing not found.');
  if (!isOwnerOrAdmin(req, existing.seller_id)) throw forbidden('You can only edit your own listings.');
  if (existing.status === 'REMOVED' && req.user!.role !== 'ADMIN') throw forbidden('This listing was removed by a moderator.');
  const body = parse(productSchema.partial(), req.body, 'Some listing details need attention.');

  const next = {
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    category: body.category ?? existing.category,
    condition: body.condition ?? existing.condition,
    price_paise: body.pricePaise ?? existing.price_paise,
    stock: body.stock ?? existing.stock,
    image_ids: body.images ? await resolveImages(body.images, existing.seller_id) : existing.image_ids,
    city: body.city ?? existing.city,
    lat: body.lat === undefined ? existing.lat : body.lat,
    lng: body.lng === undefined ? existing.lng : body.lng,
  };
  let status: string = body.status ?? (existing.status === 'SOLD_OUT' ? 'ACTIVE' : existing.status);
  if (status === 'ACTIVE' && next.stock === 0) status = 'SOLD_OUT';

  await query(
    `UPDATE products SET title=$2, description=$3, category=$4, condition=$5, price_paise=$6, stock=$7, image_ids=$8, city=$9, lat=$10, lng=$11, status=$12 WHERE id=$1`,
    [existing.id, next.title, next.description, next.category, next.condition, next.price_paise, next.stock, next.image_ids, next.city, next.lat, next.lng, status],
  );
  const product = (await loadProduct(existing.id))!;
  broadcastProduct(product);
  res.json(product);
}));

productsRouter.delete('/products/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const existing = await one('SELECT * FROM products WHERE id = $1', [idParam(req)]);
  if (!existing) throw notFound('Listing not found.');
  if (!isOwnerOrAdmin(req, existing.seller_id)) throw forbidden('You can only delete your own listings.');
  // Listings that were ever ordered are archived instead, so order history stays intact.
  const ordered = await count('SELECT COUNT(*) AS n FROM order_items WHERE product_id = $1', [existing.id]);
  if (ordered) await query(`UPDATE products SET status = 'ARCHIVED' WHERE id = $1`, [existing.id]);
  else await query('DELETE FROM products WHERE id = $1', [existing.id]);
  await query('DELETE FROM cart_items WHERE product_id = $1', [existing.id]);
  await audit(req.user!.id, 'product.delete', `${ordered ? 'Archived' : 'Deleted'} listing ${existing.title}`);
  broadcastProduct({ id: existing.id, stock: existing.stock, status: 'ARCHIVED' }, true);
  res.status(204).end();
}));
