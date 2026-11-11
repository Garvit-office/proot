import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { appConfig } from '../config.js';

/** Per-request origin, so image URLs point at whatever host the client used (localhost, LAN IP, domain). */
const storage = new AsyncLocalStorage<{ origin: string }>();

export function requestContext(req: Request, _res: Response, next: NextFunction) {
  storage.run({ origin: `${req.protocol}://${req.get('host')}` }, next);
}

export function apiOrigin() {
  const fromRequest = storage.getStore()?.origin;
  if (fromRequest) return fromRequest;
  if (appConfig.publicApiUrl) return appConfig.publicApiUrl.replace(/\/api\/?$/, '');
  return `http://localhost:${appConfig.port}`;
}
