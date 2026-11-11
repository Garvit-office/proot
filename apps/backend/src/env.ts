// Loads the repository-root .env (and apps/backend/.env if present) before anything reads process.env.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../../../.env'), quiet: true });
