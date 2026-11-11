import { appConfig } from '../config.js';

/** Allowed origins come from CORS_ORIGINS. With none configured, every origin is allowed outside production. */
export function corsOriginCheck(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return cb(null, true); // native apps, curl, server-to-server
  if (appConfig.corsOrigins.length === 0) return cb(null, !appConfig.isProduction);
  cb(null, appConfig.corsOrigins.includes(origin));
}
