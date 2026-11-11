# Database setup (PostgreSQL)

Proot stores everything in PostgreSQL 13 or newer: accounts and roles, dogs, photos, marketplace listings, carts, orders, payments, care bookings, events, parks, friends and chat, meals, activity and notifications. This guide takes you from an empty server to a running app.

The schema is in [`apps/backend/db/schema.sql`](apps/backend/db/schema.sql), and optional demo data is in [`apps/backend/db/seed.sql`](apps/backend/db/seed.sql).

---

## 1. Get a PostgreSQL server

Pick one of these.

| Option | Steps |
|---|---|
| **Local, macOS (Homebrew)** | `brew install postgresql@16 && brew services start postgresql@16` |
| **Local, Docker** | `docker run -d --name proot-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -v proot-pg:/var/lib/postgresql/data postgres:16` |
| **Supabase** | Create a project, then go to **Project Settings → Database → Connection string → URI**. Use the *Session pooler* URI (port 5432). |
| **Neon** | Create a project and copy the connection string from the dashboard (it ends in `?sslmode=require`). |
| **Railway / Render / RDS** | Create a PostgreSQL instance and copy its connection URL. |

On hosted services the database already exists. Skip to step 3, and set `DATABASE_SSL=true`.

## 2. Create the database and user (self-hosted only)

Connect as a superuser (`psql -U postgres`, or `docker exec -it proot-db psql -U postgres`) and run:

```sql
-- 1. A dedicated login for the app (change the password!)
CREATE ROLE proot WITH LOGIN PASSWORD 'choose-a-strong-password';

-- 2. The database, owned by that login
CREATE DATABASE proot OWNER proot ENCODING 'UTF8';

-- 3. Inside the new database, let the app create the extension and objects it needs
\c proot
GRANT ALL ON SCHEMA public TO proot;
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive emails (needs superuser once)
```

`gen_random_uuid()` is built into PostgreSQL 13 and newer, so no other extensions are needed. Distances use a plain SQL haversine function, so **PostGIS is not required**.

## 3. Put the connection link in `.env`

Open the `.env` file at the repository root. It already exists and is git-ignored. Replace the placeholder:

```bash
DATABASE_URL=postgresql://proot:choose-a-strong-password@localhost:5432/proot
DATABASE_SSL=false        # true for Supabase / Neon / RDS / Railway
```

The format is `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`. If the password contains special characters such as `@ : / # ?`, URL-encode them, for example `@` becomes `%40`.

While you're in `.env`, also set a real `JWT_SECRET` (`openssl rand -hex 32`). For payments, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. For AI meal analysis, set `ANTHROPIC_API_KEY`.

## 4. Create the tables

```bash
npm install
npm run db:migrate
# → Applied schema.sql — 23 tables ready.
```

Or with `psql` directly:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/backend/db/schema.sql
```

The schema uses `IF NOT EXISTS` and `CREATE OR REPLACE` throughout, so it is **safe to run again**. Re-run it after pulling changes.

## 5. (Optional) Load demo data

```bash
npm run db:seed
# or: psql "$DATABASE_URL" -f apps/backend/db/seed.sql
```

This adds sample sellers and listings, five care providers, four Bengaluru parks, three upcoming events and three nearby dogs. **Every demo account uses the password `proot-demo-123`**:

| Email | Role |
|---|---|
| store@proot.demo | Seller with marketplace listings |
| asha@proot.demo, leo@…, nair@…, priya@…, rohan@proot.demo | Care providers |
| events@proot.demo | Event manager |
| otto@proot.demo, kiki@proot.demo, bruno@proot.demo | Members with dogs (for Friends) |

Don't load the seed file into production.

## 6. Create your admin account

```bash
npm run create-admin -- --email you@example.com --password 'at-least-8-chars' --name 'Your Name'
```

Alternatively, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. The first admin is then created on startup, but only while no admin exists yet.

## 7. Start and check

```bash
npm run dev:backend                 # API on http://localhost:4000
curl http://localhost:4000/api/health
# {"ok":true,...,"payments":true,"ai":true}
```

If the database can't be reached, or the tables are missing, the server stops with a message that tells you what to fix.

To check the data:

```sql
\dt                                              -- list tables (23)
SELECT role, COUNT(*) FROM users GROUP BY role;  -- accounts by role
```

---

## How the data is organised

```
users ─┬─< pets ─┬─< meals            (photo → images)
       │         ├─< activities       (walks, play, sleep, care, park visits)
       │         ├─< pet_greetings >─ pets      (a "hi" from one dog to another)
       │         └─< park_checkins >─ parks     (live "dogs here now")
       │
       ├─< products ─< cart_items >─ users      (marketplace, any user can sell)
       ├─< orders ─< order_items >─ products    (snapshot of title/price, per-seller fulfilment)
       ├─< payments                              (one per Razorpay order; purpose ORDER or BOOKING)
       │
       ├─< care_services ─< bookings ─< reviews  (PROVIDER accounts offer services)
       ├─< events ─< event_rsvps >─ users        (EVENT_MANAGER / ADMIN create events)
       ├─< matches ─< messages                   (mutual hello → chat)
       ├─< addresses, notifications, audit_logs
       └── images   (photo bytes, served at GET /api/images/:id)
```

| Table | Purpose |
|---|---|
| `users` | Accounts. `role` is USER, PROVIDER, EVENT_MANAGER or ADMIN. `token_version` revokes sessions. `is_active` deactivates an account. `lat`/`lng` hold the location. |
| `images` | Uploaded photos stored as `BYTEA` (PNG, JPEG or WebP, up to 6 MB, file type checked from the bytes). |
| `addresses` | Saved delivery and visit addresses (6-digit PIN code). |
| `pets` | Dog profiles from onboarding. `discoverable` controls whether the dog appears in Friends. |
| `products` | Marketplace listings. Prices are integer **paise** (₹1 = 100). Status is ACTIVE, DRAFT, SOLD_OUT, ARCHIVED or REMOVED. |
| `cart_items` | One row per user and product. |
| `orders` / `order_items` | Checkout snapshots. Stock is reserved when the order is placed and released if it's cancelled or expires. |
| `payments` | Razorpay order and payment ids and their status. Statuses are CREATED, PAID, FAILED and REFUNDED. |
| `care_services` / `bookings` / `reviews` | Provider services, time-slot bookings with overlap protection, and a 1–5★ rating per completed booking. |
| `events` / `event_rsvps` | Events and RSVPs, with an optional capacity. |
| `parks` / `park_checkins` | Parks and live check-ins (a user can be checked in at one park at a time). |
| `pet_greetings` / `matches` / `messages` | "Say hi", mutual matches and chat. |
| `meals` / `activities` | The nutrition log (AI or rule-based) and the activity timeline. |
| `notifications` | In-app notifications (also pushed live over Socket.IO). |
| `audit_logs` | Security and admin actions. |

All money columns end in `_paise`. All timestamps are `TIMESTAMPTZ` stored in UTC.

---

## Handy SQL

```sql
-- Make someone an admin / provider / event manager
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
UPDATE users SET role = 'PROVIDER' WHERE email = 'walker@example.com';

-- Sign a user out everywhere (invalidates every token they hold)
UPDATE users SET token_version = token_version + 1 WHERE email = 'someone@example.com';

-- Deactivate an account
UPDATE users SET is_active = false, token_version = token_version + 1 WHERE email = 'someone@example.com';

-- Revenue by day (paid orders)
SELECT date_trunc('day', paid_at) AS day, SUM(total_paise) / 100.0 AS rupees
FROM orders WHERE status IN ('PAID', 'SHIPPED', 'DELIVERED') GROUP BY 1 ORDER BY 1 DESC;

-- Who is at each park right now
SELECT k.name, COUNT(c.*) AS dogs_now
FROM parks k LEFT JOIN park_checkins c ON c.park_id = k.id AND c.checked_out_at IS NULL
GROUP BY k.name ORDER BY dogs_now DESC;

-- Payments that failed in the last day
SELECT razorpay_order_id, amount_paise, failure_reason, created_at
FROM payments WHERE status = 'FAILED' AND created_at > now() - interval '1 day';

-- Storage used by photos
SELECT pg_size_pretty(SUM(byte_size)::bigint) FROM images;

-- Add a park
INSERT INTO parks (name, address, lat, lng, hours, amenities)
VALUES ('My local park', 'Main Road', 12.97, 77.59, '6:00–20:00', ARRAY['Water', 'Shade']);
```

## Backups and resets

```bash
# Backup and restore
pg_dump "$DATABASE_URL" -Fc -f proot-$(date +%F).dump
pg_restore -d "$DATABASE_URL" --clean --if-exists proot-2026-11-11.dump

# Wipe everything and start over (DESTROYS ALL DATA)
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm run db:migrate && npm run db:seed
```

## Running the end-to-end test

The API test suite creates users, orders and payments, so **point it at a throwaway database**, never your real one:

```bash
createdb proot_test
DATABASE_URL=postgresql://…/proot_test npm run db:migrate
DATABASE_URL=postgresql://…/proot_test npm run db:seed
DATABASE_URL=postgresql://…/proot_test PORT=4555 RAZORPAY_KEY_ID=rzp_test_x RAZORPAY_KEY_SECRET=testsecret \
  RAZORPAY_WEBHOOK_SECRET=whsecret RAZORPAY_OFFLINE_TEST=true AUTH_RATE_LIMIT=1000 ADMIN_EMAIL=admin@test.dev ADMIN_PASSWORD=admin-pass-123 \
  npm run start -w backend
# in another terminal
API_URL=http://localhost:4555/api RAZORPAY_KEY_SECRET=testsecret RAZORPAY_WEBHOOK_SECRET=whsecret npm run test:e2e
```

`RAZORPAY_OFFLINE_TEST=true` lets the checkout flow run without calling Razorpay. It makes local order ids, and signatures are still verified. It is ignored when `NODE_ENV=production`.

## Troubleshooting

| Message | Fix |
|---|---|
| `DATABASE_URL is not set` | Add it to the root `.env` (step 3). |
| `Could not connect to PostgreSQL: ECONNREFUSED` | The server isn't running, or the host or port is wrong. |
| `password authentication failed` | Wrong user or password, or the password needs URL-encoding. |
| `self-signed certificate` / `SSL required` | Set `DATABASE_SSL=true`. |
| `permission denied to create extension "citext"` | Run `CREATE EXTENSION citext;` once as a superuser (most hosted providers allow it from their SQL editor). |
| `The database is reachable but has no tables yet` | Run `npm run db:migrate`. |
| `Online payments are not set up yet` | Add the Razorpay keys to `.env` and restart the API. |
