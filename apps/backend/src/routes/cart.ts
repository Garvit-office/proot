import { Router } from 'express';
import { z } from 'zod';
import { FREE_SHIPPING_PAISE, SHIPPING_FEE_PAISE, type Cart } from '@proot/shared';
import { authRequired, type AuthedRequest } from '../auth.js';
import { one, query, type Db, pool } from '../db.js';
import { badRequest, h, idParam, notFound, parse } from '../lib/http.js';
import { toProduct } from '../lib/mappers.js';
import { emitToUsers } from '../lib/realtime.js';

export const shippingFor = (subtotal: number) => (subtotal === 0 || subtotal >= FREE_SHIPPING_PAISE ? 0 : SHIPPING_FEE_PAISE);

export async function loadCart(userId: string, db: Db = pool): Promise<Cart> {
  const rows = await query(
    `SELECT c.quantity, p.*, u.name AS seller_name, u.avatar_image_id AS seller_avatar, NULL::float AS distance_km, u.is_active AS seller_active
     FROM cart_items c JOIN products p ON p.id = c.product_id JOIN users u ON u.id = p.seller_id
     WHERE c.user_id = $1 ORDER BY c.added_at ASC`,
    [userId],
    db,
  );
  const items = rows.map((row) => {
    const available = row.status === 'ACTIVE' && row.seller_active && row.stock >= row.quantity;
    return { product: toProduct(row), quantity: row.quantity, lineTotalPaise: row.price_paise * row.quantity, available };
  });
  const subtotalPaise = items.filter((i) => i.available).reduce((sum, i) => sum + i.lineTotalPaise, 0);
  const shippingPaise = shippingFor(subtotalPaise);
  return { items, subtotalPaise, shippingPaise, totalPaise: subtotalPaise + shippingPaise, count: items.reduce((n, i) => n + i.quantity, 0) };
}

async function respond(userId: string, res: any) {
  const cart = await loadCart(userId);
  emitToUsers([userId], 'cart:updated', { count: cart.count });
  res.json(cart);
}

export const cartRouter = Router();

cartRouter.get('/cart', authRequired, h<AuthedRequest>(async (req, res) => {
  res.json(await loadCart(req.user!.id));
}));

cartRouter.put('/cart/items/:productId', authRequired, h<AuthedRequest>(async (req, res) => {
  const productId = idParam(req, 'productId');
  const { quantity } = parse(z.object({ quantity: z.number().int().min(0).max(20) }), req.body);
  if (quantity === 0) {
    await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user!.id, productId]);
    return respond(req.user!.id, res);
  }
  const product = await one('SELECT seller_id, status, stock, title FROM products WHERE id = $1', [productId]);
  if (!product || product.status !== 'ACTIVE') throw notFound('This item is no longer available.');
  if (product.seller_id === req.user!.id) throw badRequest('You can’t buy your own listing.');
  if (quantity > product.stock) throw badRequest(`Only ${product.stock} left of ${product.title}.`);
  await query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [req.user!.id, productId, quantity],
  );
  await respond(req.user!.id, res);
}));

cartRouter.delete('/cart/items/:productId', authRequired, h<AuthedRequest>(async (req, res) => {
  await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user!.id, idParam(req, 'productId')]);
  await respond(req.user!.id, res);
}));

cartRouter.delete('/cart', authRequired, h<AuthedRequest>(async (req, res) => {
  await query('DELETE FROM cart_items WHERE user_id = $1', [req.user!.id]);
  await respond(req.user!.id, res);
}));
