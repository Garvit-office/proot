import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: { field: string; message: string }[]) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: { field: string; message: string }[]) => new HttpError(400, message, fields);
export const notFound = (what = 'Not found.') => new HttpError(404, what);
export const forbidden = (message = 'You don’t have permission to do that.') => new HttpError(403, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Wrap an async route so rejected promises reach the error handler (Express 4). */
export function h<Req extends Request = Request>(fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };
}

/** Parse a body/query with zod or throw a 400 listing the invalid fields. */
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, message = 'Some fields need attention.'): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(message, result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}

export const uuid = z.string().uuid();

/** Validate a :id route param as a UUID (404 rather than a database error for junk ids). */
export function idParam(req: Request, name = 'id') {
  const value = String(req.params[name] ?? '');
  if (!uuid.safeParse(value).success) throw notFound();
  return value;
}

export const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === undefined || v === null || v === '' ? undefined : Number(v)), schema.optional());

export const geoQuery = z.object({
  lat: optionalNumber(z.number().min(-90).max(90)),
  lng: optionalNumber(z.number().min(-180).max(180)),
  radiusKm: optionalNumber(z.number().min(0.1).max(500)),
});

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large. Try a smaller photo.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  // PostgreSQL constraint errors that slipped past validation.
  if (err?.code === '23505') return res.status(409).json({ error: 'That already exists.' });
  if (err?.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist.' });
  if (err?.code === '23514' || err?.code === '22P02') return res.status(400).json({ error: 'Some values are out of range.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
