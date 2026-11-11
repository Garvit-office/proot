// Applies db/schema.sql to DATABASE_URL. Safe to run repeatedly. Usage: npm run db:migrate
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? path.resolve(here, '../../db/schema.sql');

try {
  const sql = await readFile(file, 'utf8');
  await pool.query(sql);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  console.log(`Applied ${path.basename(file)} — ${rows[0].n} tables ready.`);
} catch (error) {
  console.error(`Migration failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
