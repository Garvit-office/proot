import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@proot/shared';
import { one } from './db.js';
import { HttpError } from './lib/http.js';
import { verifyToken } from './lib/security.js';

export type AuthUser = { id: string; email: string; name: string; role: Role; phone: string; lat: number | null; lng: number | null };

export type AuthedRequest = Request & { user?: AuthUser };

/**
 * Resolve a bearer token to the CURRENT user row. Role, active flag and token version always come from
 * the database, so role changes, deactivation and "sign out everywhere" apply on the next request.
 */
export async function userFromToken(token: string): Promise<AuthUser | null> {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  const row = await one<AuthUser & { is_active: boolean; token_version: number }>(
    'SELECT id, email, name, role, phone, lat, lng, is_active, token_version FROM users WHERE id = $1',
    [payload.sub],
  );
  if (!row || !row.is_active || row.token_version !== payload.ver) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, phone: row.phone, lat: row.lat, lng: row.lng };
}

function bearer(req: Request) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function authRequired(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next(new HttpError(401, 'Please sign in to continue.'));
  userFromToken(token)
    .then((user) => {
      if (!user) return next(new HttpError(401, 'Your session has expired. Please sign in again.'));
      req.user = user;
      next();
    })
    .catch(next);
}

/** Attach the user when a valid token is present, but don't require one. */
export function authOptional(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next();
  userFromToken(token)
    .then((user) => {
      if (user) req.user = user;
      next();
    })
    .catch(next);
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Your account doesn’t have access to this.'));
    next();
  };
}

export const isOwnerOrAdmin = (req: AuthedRequest, ownerId: string | null) =>
  Boolean(req.user && (req.user.id === ownerId || req.user.role === 'ADMIN'));
