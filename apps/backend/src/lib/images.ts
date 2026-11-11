import { createHash } from 'node:crypto';
import { z } from 'zod';
import { one, type Db, pool } from '../db.js';
import { apiOrigin } from './context.js';
import { badRequest } from './http.js';

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$/;
const IMAGE_URL = /\/api\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:$|[?#])/i;

/** Accepts a data URL (new image), one of our image URLs (keep), or an http(s) URL (external, kept as-is). */
export const imageRef = z.string().max(9_000_000);

function sniff(bytes: Buffer): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export function decodeDataUrl(dataUrl: string) {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw badRequest('Images must be PNG, JPEG or WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw badRequest('That image is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw badRequest('Images must be 6 MB or smaller.');
  // Trust the bytes, not the declared type.
  const mime = sniff(bytes);
  if (!mime) throw badRequest('That file is not a valid PNG, JPEG or WebP image.');
  return { mime, bytes };
}

export async function storeImage(dataUrl: string, ownerId: string | null, db: Db = pool): Promise<string> {
  const { mime, bytes } = decodeDataUrl(dataUrl);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const row = await one<{ id: string }>(
    'INSERT INTO images (owner_id, mime_type, byte_size, data, sha256) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [ownerId, mime, bytes.length, bytes, sha256],
    db,
  );
  return row!.id;
}

export const imageUrl = (id: string | null | undefined) => (id ? `${apiOrigin()}/api/images/${id}` : null);

/** Our image id inside a URL we issued, else null. */
export const imageIdFromUrl = (url: string) => IMAGE_URL.exec(url)?.[1]?.toLowerCase() ?? null;

/**
 * Resolve an image reference from a client:
 *   data URL -> stored, returns new id; our URL -> existing id; null -> null; undefined -> unchanged.
 */
export async function resolveImageRef(ref: string | null | undefined, ownerId: string, db: Db = pool): Promise<string | null | undefined> {
  if (ref === undefined) return undefined;
  if (ref === null || ref === '') return null;
  if (ref.startsWith('data:')) return storeImage(ref, ownerId, db);
  const id = imageIdFromUrl(ref);
  if (id) return id;
  throw badRequest('Unrecognised image. Upload a PNG, JPEG or WebP photo.');
}

/** For single-image fields that may also hold an external URL (seed data). Returns [imageId, imageUrl]. */
export async function resolveImageField(ref: string | null | undefined, ownerId: string, db: Db = pool): Promise<[string | null, string | null] | undefined> {
  if (ref === undefined) return undefined;
  if (ref && /^https?:\/\//.test(ref) && !imageIdFromUrl(ref)) return [null, ref];
  const id = await resolveImageRef(ref, ownerId, db);
  return [id ?? null, null];
}

/** Prefer an uploaded image, then an external URL. */
export const pickImage = (imageId: string | null | undefined, externalUrl?: string | null) => imageUrl(imageId) ?? externalUrl ?? null;
