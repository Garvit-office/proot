import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload, Role } from '@proot/shared';
import { appConfig } from '../config.js';

export const hashPassword = (password: string) => bcrypt.hash(password, 11);
export const comparePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function signToken(user: { id: string; role: Role; token_version: number }) {
  const payload: AuthTokenPayload = { sub: user.id, role: user.role, ver: user.token_version };
  return jwt.sign(payload, appConfig.jwtSecret, { expiresIn: appConfig.jwtExpiresIn as any });
}

export function verifyToken(token: string) {
  return jwt.verify(token, appConfig.jwtSecret) as AuthTokenPayload;
}
