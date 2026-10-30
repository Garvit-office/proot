import Database from 'better-sqlite3';
import { appConfig } from './config.js';

export const db = new Database(appConfig.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('USER','EVENT_MANAGER','ADMIN')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    breed TEXT NOT NULL,
    age TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS nutrition_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    kcal INTEGER NOT NULL,
    protein_g INTEGER NOT NULL,
    fat_g INTEGER NOT NULL,
    verdict TEXT NOT NULL CHECK(verdict IN ('Good','Okay','Skip')),
    notes TEXT NOT NULL,
    photo TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    manager_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS event_rsvps (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_id) REFERENCES users(id)
  );
`);

// Onboarding profile columns. CREATE TABLE IF NOT EXISTS won't touch an existing
// pets table, so add whatever is missing — this upgrades older local databases in place.
const petColumns: [name: string, definition: string][] = [
  ['sex', "TEXT NOT NULL DEFAULT 'Female'"],
  ['birth_date', "TEXT NOT NULL DEFAULT ''"],
  ['birth_date_approx', 'INTEGER NOT NULL DEFAULT 0'],
  ['photo', 'TEXT'],
  ['neutered', 'INTEGER NOT NULL DEFAULT 0'],
  ['vaccinations', "TEXT NOT NULL DEFAULT '[]'"],
  ['allergies', "TEXT NOT NULL DEFAULT ''"],
  ['conditions', "TEXT NOT NULL DEFAULT ''"],
  ['vet_name', "TEXT NOT NULL DEFAULT ''"],
  ['vet_phone', "TEXT NOT NULL DEFAULT ''"],
  ['microchip_id', "TEXT NOT NULL DEFAULT ''"],
  ['diet_type', "TEXT NOT NULL DEFAULT 'Kibble'"],
  ['meals_per_day', 'INTEGER NOT NULL DEFAULT 2'],
  ['activity_level', "TEXT NOT NULL DEFAULT 'Moderate'"],
  ['temperament', "TEXT NOT NULL DEFAULT '[]'"],
  ['social', "TEXT NOT NULL DEFAULT 'Selective'"],
  ['bio', "TEXT NOT NULL DEFAULT ''"],
  ['prompt', "TEXT NOT NULL DEFAULT ''"],
  ['answer', "TEXT NOT NULL DEFAULT ''"],
  ['updated_at', "TEXT NOT NULL DEFAULT ''"],
];

const existingPetColumns = new Set((db.prepare('PRAGMA table_info(pets)').all() as { name: string }[]).map((col) => col.name));
for (const [name, definition] of petColumns) {
  if (!existingPetColumns.has(name)) db.exec(`ALTER TABLE pets ADD COLUMN ${name} ${definition}`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_pets_user ON pets(user_id)');

const existingEventColumns = new Set((db.prepare('PRAGMA table_info(events)').all() as { name: string }[]).map((col) => col.name));
if (!existingEventColumns.has('capacity')) db.exec('ALTER TABLE events ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0');
if (!existingEventColumns.has('updated_at')) db.exec("ALTER TABLE events ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_rsvps_event ON event_rsvps(event_id)');

export function getDb() {
  return db;
}
