# Proot

Proot is a multi-app dog neighborhood platform spanning catalog shopping, care services, park discovery, nutrition logging, event RSVPs, and admin operations.

## App layout

```
apps/backend   Central TypeScript API with SQLite persistence, auth, roles, admin checks, and audit logging
apps/webuser   Premium customer-facing Next.js app
apps/webadmin  Admin dashboard for operations and role management
apps/mobile    Expo client for the mobile experience
packages/shared Shared domain types, mock-data catalog, contracts, and design tokens
```

## Quick start

```bash
cp .env.example .env
npm install
npm run dev:backend   # API at http://localhost:4000
npm run dev:webuser   # user app at http://localhost:3000
npm run dev:webadmin  # admin app at http://localhost:3001
npm run dev:mobile   # Expo dev server for iOS/Android/Web
```

## Environment

Required variables:

```bash
PORT=4000
JWT_SECRET=change-me-in-production
API_BASE_URL=http://localhost:4000/api
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api
```

Keep the JWT secret out of source control. On physical devices, set `EXPO_PUBLIC_API_BASE_URL` to the machine's LAN IP instead of localhost.

## Backend notes

- SQLite is used for local development persistence at `apps/backend/data/proot.sqlite`.
- Public registration creates `USER` accounts only.
- `EVENT_MANAGER` and `ADMIN` roles are enforced server-side.
- Nutrition analysis remains simulated; it uses the existing mock bowl logic and labels the result explicitly.
- Set `DB_PATH` to point the backend at a different SQLite file (handy for tests). New `pets` columns are added in place on startup.

## Roles

| Role | Gets it by | Can |
|---|---|---|
| `USER` | Signing up | Manage their own dogs, RSVP to published events |
| `EVENT_MANAGER` | An admin assigns it | Also create, edit, publish, and delete **their own** events |
| `ADMIN` | Bootstrap or another admin | Everything: all events, users and roles, stats, audit log |

Create the first admin with either:

```bash
npm run create-admin -w backend -- --email you@example.com --password 'at-least-8-chars' --name 'You'
# or set ADMIN_EMAIL / ADMIN_PASSWORD in .env; applied on startup only while no admin exists
```

The script promotes an existing account without touching its password. Role changes apply on the user's next request.

- **webadmin** (`:3001`): sign in with an `ADMIN` or `EVENT_MANAGER` account. Admins get Overview, Users (role changes), Events, and Audit. Event managers only get Events, scoped to their own.
- **webuser**: the profile slide-over shows the role, with links to the console for managers and admins. `/events` lists live events with RSVP.
- **mobile**: the profile slide-over shows the role. Managers and admins get **Manage events** (`app/manage-events.tsx`, route-guarded by role), and the Around tab lists live events with RSVP.

## Pet onboarding

New users sign up (or sign in) and then set up their dog in six steps: basics, body, health (optional), routine, personality, review.

- Shared model, option lists, step validation, and the typed API client live in `packages/shared/src/onboarding.ts` and `src/api.ts`.
- Backend: `GET/POST /api/pets`, `GET/PATCH/DELETE /api/pets/:id` (owner or admin only); `GET /api/me` returns `onboarded`.
- webuser: `/onboarding` (draft saved in localStorage; `?edit=<petId>` to edit, `?new=1` to add another dog). The header avatar opens the profile slide-over on the right.
- mobile: `app/onboarding.tsx`; the tabs stay locked behind `Stack.Protected` until a pet exists. The header avatar opens the profile slide-over. Tokens are kept in `expo-secure-store`.

## Development

Use the root workspace scripts for the main apps:

```bash
npm run dev
npm run dev:web
npm run dev:webuser
npm run dev:webadmin
npm run dev:backend
npm run dev:mobile
npm run build:webuser
npm run build:webadmin
npm run build:backend
```

## Brand

The logo, palette, and type (Inter only) live in `packages/shared`:

- `src/brand.ts` — logo artwork as SVG, rendered by web (`<img>`) and mobile (`react-native-svg`)
- `src/theme.ts` + `styles/tokens.css` — the shared colour tokens (keep the two in sync)
- `brand/` — exported SVGs, including the original `proot_primary_transparent.svg`

After changing the artwork, run `npm run brand:export` to regenerate the favicons and the Expo icon/splash/Android assets.
