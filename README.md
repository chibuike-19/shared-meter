# Shared Prepaid Meter Tracker

Mobile-first web app for households sharing one prepaid electricity meter.
Every resident has a running **kWh balance** = (kWh paid for by recharging) −
(kWh consumed from their sub-meter). Balances are always **derived, never
stored**. Built from `shared-meter-app-spec.md`.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
Supabase (Postgres, Auth, Storage, RLS) · Zod · Recharts · Vitest.

## Build status

- ✅ **Phase 1 — Foundations**: project setup, schema + migrations, RLS,
  email+password auth, seeded admin, residents CRUD with opening readings and
  opening balances, placeholder dashboard.
- ✅ **Phase 2 — Calculation core**: pure, framework-independent helpers
  (`src/lib/services/calc.ts`) for balance/credit/suggestion/price lookup, fully
  unit-tested (worked example → A +140, B −50, C −55, D −35; price-change →
  B +50 with A's 200 unchanged), plus DB-backed services (`getBalance`,
  `getGroupSummary`, `suggestNextRecharger`, `getCurrentPrice`).
- ✅ **Phase 3 — Resident flows**: submit reading (pure `decideReading` rules —
  lower→rejected, duplicate→ignored, implausible jump→flagged, back-date >48h→
  rejected; required photo; two-step confirm showing "you used X kWh"), log
  recharge (price locked at `recharged_at`, status pending), dashboard action
  buttons + stale-reading-after-recharge banner, group activity feed. Verified
  live: lower rejected, huge jump flagged & excluded, pending recharge doesn't
  move balances.
- ✅ **Phase 4 — Transparency pages**: group breakdown table (highlight me,
  totals row, up-to-date/stale badges), paired-bar chart (paid-for vs consumed),
  group pool card, next-recharge suggestion + full ranking, pending recharges,
  and a per-resident timeline (`/group/[id]`) of intervals + recharges +
  adjustments with running balance. Verified live: the worked example yields
  A +140, B −50, C −55, D −35, pool 0, next recharger C ₦11,000.
- ✅ **Phase 5 — Admin**: approvals queue (approve/reject pending recharges with
  receipt photo + accept/reject flagged readings with meter photo), price
  management (current + history + add with effective date), corrections (add
  adjustment, reject reading), resident edit + meter replacement, audit log with
  filters, settings (stale days / jump threshold / rounding). Every admin action
  writes `audit_log`. Verified live: approving a recharge updates the balance,
  and a price change affects only future recharges (A's locked credit unchanged).
- ⬜ Phase 6: polish (mobile pass, empty/error states, stale badges/banners,
  README deploy, WhatsApp webhook stub). See spec §12.

### Tests

```bash
pnpm test                      # unit tests (Node 20)
# live read-only integration check against your Supabase project (Node 22+):
RUN_DB_IT=1 /opt/homebrew/opt/node@23/bin/node node_modules/vitest/vitest.mjs run tests/db.integration.test.ts
```

## Project layout

```
src/app              Next routes/pages (dashboard, admin, login, auth, api)
src/components        UI components (shadcn/ui) + app header
src/lib/services      business logic (framework-independent, injected DB client)
src/lib/supabase      browser/server/admin clients + hand-written DB types
src/lib/validation    Zod schemas
src/proxy.ts          session refresh + route guard (Next 16 "proxy" convention)
supabase/migrations   SQL (schema, views, RLS, storage)
scripts/seed-admin.mjs seed the first admin
```

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Create a Supabase project

At [supabase.com](https://supabase.com), create a project. Then copy
`.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...        # Project Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # Project Settings → API → anon public key
SUPABASE_SERVICE_ROLE_KEY=...       # Project Settings → API → service_role (secret)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback`
(and your production URL) to the allowed redirect URLs.

### 3. Run the migrations

Apply the SQL in `supabase/migrations` in order. Either with the Supabase CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

…or paste each file (0001 → 0004) into the Supabase SQL editor and run it.

### 4. Seed the first admin

```bash
node scripts/seed-admin.mjs admin@example.com "StrongPass123" "Admin Name" "House A" 1000 200
#                            ^email           ^password        ^full name   ^house  ^opening ^price/kWh
```

This creates the admin's email + password login (email auto-confirmed, no email
sent), inserts their resident row + opening reading, and seeds an initial price
of ₦200/kWh. Sign in with that email and password.

### 5. Run

```bash
pnpm dev          # http://localhost:3000
pnpm test         # Vitest (calculation core lands in Phase 2)
pnpm build        # production build
pnpm lint
```

## Verifying Phase 1

1. Sign in at `/login` with the seeded admin email + password → you land on the
   dashboard as admin.
2. Go to **Residents → Add resident** and create 4 residents with opening
   readings and an initial password. Share each email + password with the
   resident (no emails are sent).
3. Each resident signs in and sees their placeholder dashboard with a balance
   derived from their opening values. Residents can change their password via
   **Forgot password** (the only flow that sends an email).

## Deploy

Deploy to Vercel (or any Node host). Set the four environment variables above in
the host's project settings, set `NEXT_PUBLIC_SITE_URL` to the deployed URL, and
add `<url>/auth/callback` to Supabase's allowed redirect URLs. Never expose
`SUPABASE_SERVICE_ROLE_KEY` to the browser — it is used server-side only.

See `DECISIONS.md` for assumptions made during the build.
