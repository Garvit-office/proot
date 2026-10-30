import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Role } from '@proot/shared';
import { appConfig } from './config.js';
import { getDb } from './db.js';

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: { sub: string; email: string; name: string; role: Role }) {
  return jwt.sign(payload, appConfig.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, appConfig.jwtSecret) as {
    sub: string;
    email: string;
    name: string;
    role: Role;
  };
}

export function makeId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function isoNow() {
  return new Date().toISOString();
}

export function audit(actorId: string | null, action: string, details: string) {
  getDb()
    .prepare('INSERT INTO audit_logs (id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(makeId('audit'), actorId, action, details, isoNow());
}
