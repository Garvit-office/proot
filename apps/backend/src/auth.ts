import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';
import { verifyToken } from './utils.js';
import type { Role } from '@proot/shared';

export type AuthedRequest = Request & {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
};

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = verifyToken(token);
    const row = getDb()
      .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
      .get(payload.sub) as { id: string; email: string; name: string; role: Role } | undefined;

    if (!row) {
      return res.status(401).json({ error: 'Invalid session.' });
    }

    req.user = row;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
}

export function requireOwnerOrAdmin(userId: string, req: AuthedRequest) {
  return !!req.user && (req.user.id === userId || req.user.role === 'ADMIN');
}
