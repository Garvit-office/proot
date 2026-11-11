-- =====================================================================
-- Proot — PostgreSQL schema
-- ---------------------------------------------------------------------
-- Safe to run more than once: every statement is IF NOT EXISTS / OR REPLACE.
-- Apply with:   npm run db:migrate          (uses DATABASE_URL from .env)
--          or:  psql "$DATABASE_URL" -f apps/backend/db/schema.sql
--
-- Conventions
--   * Primary keys are UUIDs (gen_random_uuid(), built into PostgreSQL 13+).
--   * Money is stored as integer paise (₹1 = 100 paise) to avoid float errors.
--   * Timestamps are TIMESTAMPTZ (stored in UTC).
--   * Locations are plain latitude/longitude columns; distance is computed with
--     the haversine function below, so no PostGIS extension is required.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'PROVIDER', 'EVENT_MANAGER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('ACTIVE', 'DRAFT', 'SOLD_OUT', 'ARCHIVED', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_purpose AS ENUM ('ORDER', 'BOOKING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('Walk', 'Meal', 'Play', 'Care', 'Sleep', 'Park', 'Event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Great-circle distance in kilometres between two lat/lng points.
CREATE OR REPLACE FUNCTION haversine_km(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
                                        lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
  ELSE 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )) END
$$;

-- Keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- Images (stored in the database as bytes, served by GET /api/images/:id)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID,                                   -- FK added after users exists
  mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size   INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 6291456),
  data        BYTEA NOT NULL,
  sha256      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Users, auth and authorisation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  role            user_role NOT NULL DEFAULT 'USER',
  phone           TEXT NOT NULL DEFAULT '',
  avatar_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  city            TEXT NOT NULL DEFAULT '',
  lat             DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng             DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  location_updated_at TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Bumped on password change / sign-out-everywhere / deactivation: every older JWT stops working.
  token_version   INTEGER NOT NULL DEFAULT 0,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);

DO $$ BEGIN
  ALTER TABLE images ADD CONSTRAINT images_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_id);

-- Shipping / visit addresses saved by a user.
CREATE TABLE IF NOT EXISTS addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pincode     TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- ---------------------------------------------------------------------
-- Pets
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  photo_image_id    UUID REFERENCES images(id) ON DELETE SET NULL,
  breed             TEXT NOT NULL,
  sex               TEXT NOT NULL CHECK (sex IN ('Female', 'Male')),
  birth_date        DATE NOT NULL,
  birth_date_approx BOOLEAN NOT NULL DEFAULT FALSE,
  weight_kg         NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0),
  neutered          BOOLEAN NOT NULL DEFAULT FALSE,
  vaccinations      TEXT[] NOT NULL DEFAULT '{}',
  allergies         TEXT NOT NULL DEFAULT '',
  conditions        TEXT NOT NULL DEFAULT '',
  vet_name          TEXT NOT NULL DEFAULT '',
  vet_phone         TEXT NOT NULL DEFAULT '',
  microchip_id      TEXT NOT NULL DEFAULT '',
  diet_type         TEXT NOT NULL,
  meals_per_day     SMALLINT NOT NULL CHECK (meals_per_day BETWEEN 1 AND 4),
  activity_level    TEXT NOT NULL,
  temperament       TEXT[] NOT NULL DEFAULT '{}',
  social            TEXT NOT NULL,
  bio               TEXT NOT NULL DEFAULT '',
  prompt            TEXT NOT NULL DEFAULT '',
  answer            TEXT NOT NULL DEFAULT '',
  -- Whether this dog appears in "Friends nearby" for other users.
  discoverable      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pets_user ON pets(user_id);

-- ---------------------------------------------------------------------
-- Marketplace: products are listed by any user (sellers) or by admins.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL CHECK (category IN ('Food', 'Toys', 'Care', 'Home', 'Accessories', 'Health')),
  condition     TEXT NOT NULL DEFAULT 'New' CHECK (condition IN ('New', 'Like new', 'Used')),
  price_paise   INTEGER NOT NULL CHECK (price_paise >= 100),
  stock         INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0),
  status        listing_status NOT NULL DEFAULT 'ACTIVE',
  image_ids     UUID[] NOT NULL DEFAULT '{}',
  image_url     TEXT,                       -- optional external image (used by seed data)
  city          TEXT NOT NULL DEFAULT '',
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_status_created ON products(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin (to_tsvector('simple', title || ' ' || description));

CREATE TABLE IF NOT EXISTS cart_items (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status          order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  subtotal_paise  INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  shipping_paise  INTEGER NOT NULL DEFAULT 0 CHECK (shipping_paise >= 0),
  total_paise     INTEGER NOT NULL CHECK (total_paise >= 0),
  shipping_address JSONB NOT NULL,
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  seller_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title         TEXT NOT NULL,              -- snapshot at purchase time
  unit_paise    INTEGER NOT NULL CHECK (unit_paise >= 0),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  -- Each seller ships their own line items.
  fulfilment    TEXT NOT NULL DEFAULT 'PENDING' CHECK (fulfilment IN ('PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);

-- ---------------------------------------------------------------------
-- Care services and bookings (offered by PROVIDER accounts)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  category      TEXT NOT NULL CHECK (category IN ('Walk', 'Groom', 'Vet', 'Train', 'Sit')),
  description   TEXT NOT NULL DEFAULT '',
  price_paise   INTEGER NOT NULL CHECK (price_paise >= 100),
  duration_min  INTEGER NOT NULL CHECK (duration_min BETWEEN 10 AND 1440),
  image_id      UUID REFERENCES images(id) ON DELETE SET NULL,
  image_url     TEXT,
  city          TEXT NOT NULL DEFAULT '',
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  service_radius_km NUMERIC(5,1) NOT NULL DEFAULT 10,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  rating_avg    NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_provider ON care_services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_active_cat ON care_services(is_active, category);

CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID NOT NULL REFERENCES care_services(id) ON DELETE RESTRICT,
  provider_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id        UUID REFERENCES pets(id) ON DELETE SET NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  price_paise   INTEGER NOT NULL CHECK (price_paise >= 0),
  status        booking_status NOT NULL DEFAULT 'REQUESTED',
  is_paid       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_service_time ON bookings(service_id, starts_at);

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  service_id  UUID NOT NULL REFERENCES care_services(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_service ON reviews(service_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Payments (Razorpay) — one row per Razorpay order, for orders and bookings.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose             payment_purpose NOT NULL,
  reference_id        UUID NOT NULL,           -- orders.id or bookings.id
  amount_paise        INTEGER NOT NULL CHECK (amount_paise >= 100),
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              payment_status NOT NULL DEFAULT 'CREATED',
  razorpay_order_id   TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature  TEXT,
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(purpose, reference_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  location     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  starts_at    TIMESTAMPTZ NOT NULL,
  capacity     INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  published    BOOLEAN NOT NULL DEFAULT FALSE,
  image_id     UUID REFERENCES images(id) ON DELETE SET NULL,
  image_url    TEXT,
  manager_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_published_start ON events(published, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_manager ON events(manager_id);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- ---------------------------------------------------------------------
-- Parks and live check-ins
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  hours        TEXT NOT NULL DEFAULT '',
  amenities    TEXT[] NOT NULL DEFAULT '{}',
  image_id     UUID REFERENCES images(id) ON DELETE SET NULL,
  image_url    TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS park_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id         UUID NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id          UUID REFERENCES pets(id) ON DELETE SET NULL,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at  TIMESTAMPTZ
);
-- A user can be checked in to at most one park at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_open_user ON park_checkins(user_id) WHERE checked_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checkins_open_park ON park_checkins(park_id) WHERE checked_out_at IS NULL;

-- ---------------------------------------------------------------------
-- Friends: dogs say hi to dogs; a mutual hi becomes a match with a chat.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pet_greetings (
  from_pet_id  UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  to_pet_id    UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  liked        BOOLEAN NOT NULL,             -- false = "not now" (hidden from discovery)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_pet_id, to_pet_id),
  CHECK (from_pet_id <> to_pet_id)
);
CREATE INDEX IF NOT EXISTS idx_greetings_to ON pet_greetings(to_pet_id);

CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_a_id    UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  pet_b_id    UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_a_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pet_a_id < pet_b_id),               -- one row per pair
  UNIQUE (pet_a_id, pet_b_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_user_a ON matches(user_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON matches(user_b_id);

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at);

-- ---------------------------------------------------------------------
-- Nutrition and activity
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id      UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  image_id    UUID REFERENCES images(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  kcal        INTEGER NOT NULL CHECK (kcal >= 0),
  protein_g   INTEGER NOT NULL CHECK (protein_g >= 0),
  fat_g       INTEGER NOT NULL CHECK (fat_g >= 0),
  verdict     TEXT NOT NULL CHECK (verdict IN ('Good', 'Okay', 'Skip')),
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'rules' CHECK (source IN ('ai', 'rules')),
  eaten_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meals_pet_time ON meals(pet_id, eaten_at DESC);

CREATE TABLE IF NOT EXISTS activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type          activity_type NOT NULL,
  title         TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  distance_km   NUMERIC(6,2),
  duration_min  INTEGER CHECK (duration_min >= 0),
  kcal          INTEGER,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_pet_time ON activities(pet_id, occurred_at DESC);

-- ---------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT '',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'pets', 'products', 'orders', 'care_services', 'bookings', 'payments', 'events', 'parks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;
