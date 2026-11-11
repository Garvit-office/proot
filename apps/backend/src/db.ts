import pg from 'pg';
import { appConfig } from './config.js';

// Return BIGINT/NUMERIC counts as JS numbers (all our values fit comfortably), and DATE as plain 'YYYY-MM-DD'.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

if (!appConfig.databaseUrl) {
  console.error('\nDATABASE_URL is not set. Add your PostgreSQL connection string to .env — see DATABASE_SETUP.md.\n');
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: appConfig.databaseUrl,
  ssl: appConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));

export type Db = Pick<pg.PoolClient, 'query'>;

/** Run a parameterised query and return the rows. */
export async function query<T = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const result = await db.query(sql, params as any[]);
  return result.rows as T[];
}

/** First row or null. */
export async function one<T = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

export async function count(sql: string, params: unknown[] = [], db: Db = pool): Promise<number> {
  const row = await one<{ n: number }>(sql, params, db);
  return Number(row?.n ?? 0);
}

/** Run `fn` inside a transaction; rolls back if it throws. */
export async function tx<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    console.error(`\nCould not connect to PostgreSQL: ${(error as Error).message}\nCheck DATABASE_URL in .env — see DATABASE_SETUP.md.\n`);
    process.exit(1);
  }
  const table = await one<{ exists: boolean }>("SELECT to_regclass('public.users') IS NOT NULL AS exists");
  if (!table?.exists) {
    console.error('\nThe database is reachable but has no tables yet. Run: npm run db:migrate\n');
    process.exit(1);
  }
}
