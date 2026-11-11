# Proot

Proot is a neighbourhood platform for dogs and their people. It covers a peer-to-peer marketplace, care bookings with local providers, park check-ins, events, friends and chat, a photo-first nutrition log, an activity timeline, and an admin console.

Every feature is backed by PostgreSQL, enforces sign-in and roles on the server, and updates live over Socket.IO.

## App layout

```
apps/backend    Express API · PostgreSQL · Socket.IO · Razorpay · Claude (meal photos)
  db/schema.sql   all tables, enums, indexes, triggers (safe to re-run)
  db/seed.sql     optional demo data
  src/routes/     one file per feature (auth, pets, products, cart, orders, payments,
                  care, events, parks, friends, meals, activities, misc, admin)
  src/lib/        db helpers, images, payments, realtime, notifications, mappers, AI
  test/e2e.test.ts  end-to-end test of every feature over HTTP + WebSocket
apps/webuser    Customer web app (Next.js)
apps/webadmin   Admin console (Next.js), for admins and event managers
apps/mobile     Expo app (iOS / Android)
packages/shared Types, roles and permissions, the typed API client, the realtime client,
                formatting helpers, onboarding rules, and brand tokens
```

## Quick start

```bash
npm install
# 1. Put your PostgreSQL connection string in .env (DATABASE_URL); see DATABASE_SETUP.md
npm run db:migrate        # create the tables
npm run db:seed           # optional demo data (password for demo accounts: proot-demo-123)
npm run create-admin -- --email you@example.com --password 'at-least-8-chars' --name 'You'

npm run dev:backend       # API      http://localhost:4000/api
npm run dev:webuser       # web app  http://localhost:3000
npm run dev:webadmin      # console  http://localhost:3001
npm run dev:mobile        # Expo
```

**[DATABASE_SETUP.md](DATABASE_SETUP.md)** covers the whole database: creating the database and user, the connection link, migrations, seed data, a table-by-table guide, handy SQL, backups and troubleshooting.

## Environment

All configuration lives in the root `.env`, which is git-ignored. [`.env.example`](.env.example) documents every variable.

| Variable | Needed for |
|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | Everything (required) |
| `JWT_SECRET` | Sign-in tokens. Must be 32+ random characters in production. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Marketplace checkout and care bookings. Use Test Mode keys while developing. |
| `ANTHROPIC_API_KEY` | AI review of meal photos. Without it, the built-in estimate is used. |
| `CORS_ORIGINS` | Allowed browser origins in production |
| `NEXT_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_API_BASE_URL` | Where the clients find the API. On a phone, use your computer's LAN IP. |

`GET /api/health` reports whether payments and AI are switched on.

## Roles and permissions

Roles are read from the database on **every** request, so a role change, deactivation or "sign out everywhere" takes effect immediately.

| Role | Gets it by | Can |
|---|---|---|
| `USER` | Signing up | Manage their dogs and account; buy and sell in the marketplace; book care; RSVP; use parks, friends, nutrition and activity |
| `PROVIDER` | An admin assigns it | Also offer care services and accept, decline and complete bookings for **their own** services |
| `EVENT_MANAGER` | An admin assigns it | Also create, edit, publish and delete **their own** events |
| `ADMIN` | `create-admin`, or another admin | Everything: users and roles, deactivation, listing moderation, orders and refunds, bookings, services, parks, all events, stats and the audit log |

Security details:

- Passwords are hashed with bcrypt.
- Sign-in and password changes are rate-limited.
- Tokens carry a version number, so changing your password or signing out everywhere revokes all older tokens.
- Users can only read and change their own records. Other people's dogs, orders, bookings and chats return 404.

## Features

| Feature | How it works |
|---|---|
| **Marketplace** | Any user can list items with up to 6 photos. Search, filter by category, and sort by price or distance. Cart, checkout with saved addresses, and Razorpay payment. Stock is reserved at checkout and released if payment doesn't arrive within 30 minutes. Each seller ships their own items. Buyers can cancel before anything ships, and paid orders are refunded. |
| **Payments** | Razorpay orders are created on the server. The checkout signature is verified with HMAC, and the webhook confirms payments independently. Payment confirmation is idempotent, and refunds happen automatically on cancellation or decline. Mobile apps use a hosted checkout page served by the API. |
| **Care** | Providers list services. Customers pick a free time slot (the server prevents double booking), pay, and the provider confirms or declines (a decline refunds). Completed visits go on the dog's timeline and can be reviewed. |
| **Events** | Managers publish events with a capacity and a photo. RSVP counts update live, and attendees are notified if the event changes or is cancelled. |
| **Parks** | Parks are sorted by distance from you. Check in with your dog and others see the "dogs here now" count change live. Visits are logged on the timeline when you check out, or automatically after 3 hours. |
| **Friends** | Discover nearby discoverable dogs and say hi. A mutual hello becomes a match with live chat and unread counts. |
| **Nutrition** | Photograph a meal and Claude reviews it against your dog's weight, allergies and conditions, returning calories, protein, fat and a Good/Okay/Skip verdict. There's a rule-based fallback, and daily totals are compared with a target intake. |
| **Activity** | Log walks, play, sleep and care, merged with meals, park visits and completed bookings into one daily timeline with totals. |
| **Notifications** | Stored in the database and pushed live for orders, sales, bookings, RSVPs, matches, messages and role changes. |
| **Location** | Browsers and phones share their location, and every list (shop, care, parks, events, friends) can sort by distance. PostGIS isn't needed. |
| **Photos** | Stored in PostgreSQL. The file type is checked from the actual bytes, and images are served with long-lived caching at `/api/images/:id`. |

## Development

```bash
npm run typecheck -w backend
npm run build:webuser && npm run build:webadmin
npm run lint:mobile
npm run test:e2e          # end-to-end API test; see DATABASE_SETUP.md (needs a throwaway database)
```

## Brand

The logo, palette and type (Inter only) live in `packages/shared`:

- `src/brand.ts`: the logo artwork as SVG, rendered by web (`<img>`) and mobile (`react-native-svg`)
- `src/theme.ts` and `styles/tokens.css`: the shared colour tokens (keep the two in sync)
- `brand/`: exported SVGs, including the original `proot_primary_transparent.svg`

After changing the artwork, run `npm run brand:export` to regenerate the favicons and the Expo icon, splash and Android assets.
