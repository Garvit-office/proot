import './env.js';

function list(value: string | undefined) {
  return (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET ?? '';
if (isProduction && (jwtSecret.length < 32 || jwtSecret.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const appConfig = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** Set DATABASE_SSL=true for hosted databases that need TLS (Supabase, Neon, RDS…). */
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: jwtSecret || 'dev-only-secret-change-me-dev-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  /** Comma-separated list of allowed browser origins. Empty = allow all (development only). */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /** Public base URL of this API (used in hosted checkout pages and links); falls back to the request host. */
  publicApiUrl: process.env.API_BASE_URL ?? '',
  webUserUrl: process.env.WEBUSER_URL ?? 'http://localhost:3000',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  },
  /** Unpaid orders are cancelled (and their stock released) after this many minutes. */
  pendingOrderTtlMin: Number(process.env.PENDING_ORDER_TTL_MIN ?? 30),
  /** Park check-ins close automatically after this many minutes. */
  checkinTtlMin: Number(process.env.CHECKIN_TTL_MIN ?? 180),
};

export const paymentsEnabled = () => Boolean(appConfig.razorpay.keyId && appConfig.razorpay.keySecret);
export const aiEnabled = () => Boolean(appConfig.anthropic.apiKey);
