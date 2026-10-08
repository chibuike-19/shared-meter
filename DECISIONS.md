# Decisions & assumptions

Per spec §0.13: where something was unspecified, the simplest option was chosen
and recorded here. Decisions in spec §3 were not re-opened.

## Phase 1 (Foundations)

- **Stack versions.** `create-next-app` produced Next.js 16 (App Router) +
  React 19 + Tailwind v4. shadcn/ui is used with the **radix** primitive base
  (the CLI's newer `@base-ui` default lacked the `asChild` pattern the spec's
  UI relies on). `cn` uses `clsx` + `tailwind-merge`.
- **Next 16 config.** `cacheComponents` and `partialPrefetching` (both enabled
  by the scaffold) are turned **off**. Every page is auth-gated and reads the
  Supabase auth cookie, so pages render dynamically; `cacheComponents` fought
  that model. Auth-gated pages use `export const dynamic = "force-dynamic"`.
- **`middleware.ts` → `proxy.ts`.** Next 16 renamed the convention; the session
  refresh / route guard lives in `src/proxy.ts` exporting `proxy()`.
- **Resident identity is linked at creation, not first login.** `createResident`
  calls `auth.admin.inviteUserByEmail`, which creates the Supabase auth user and
  emails a magic link; `residents.auth_user_id` is set immediately. This is
  simpler and more robust than linking lazily on first sign-in.
- **Service layer takes an injected Supabase client** (dependency injection)
  rather than constructing its own. Keeps `/lib/services` free of Next/React
  imports (spec §8, §10) and unit-testable; privileged calls receive the
  service-role admin client after the caller's permission is checked in the
  route/action layer.
- **Views use `security_invoker = true`** so a signed-in resident's RLS on the
  underlying `readings`/`recharges` tables governs what the transparency views
  return. Table SELECT policies expose accepted readings and approved recharges
  to every active resident, which is exactly the transparency the spec wants.
- **RLS helper functions** (`current_resident_id`, `is_admin`,
  `is_active_resident`) are `security definer` to avoid recursive RLS when a
  policy on `residents` needs to look at `residents`.
- **Storage layout.** `proofs` bucket is private; files live under a top-level
  folder equal to the uploader's auth uid (e.g. `<uid>/readings/<id>.jpg`), and
  policies scope read/write to that folder (admins read all).
- **Hand-written DB types** (`src/lib/supabase/types.ts`) instead of generated
  ones, so the repo type-checks without a live project. Row shapes are `type`
  aliases (not `interface`) because supabase-js requires Row/Insert/Update to
  satisfy `Record<string, unknown>`, which interfaces don't. Regenerate with
  `supabase gen types typescript` once the CLI is connected.
- **Placeholder dashboard** already shows the real derived balance (from the
  `resident_balances` view) rather than a pure stub, since the view exists in
  Phase 1. The number is read straight from SQL — the TypeScript calculation
  core and its tests are still Phase 2.
- **Seed admin** via `scripts/seed-admin.mjs` (reads `.env.local`, uses the
  service role to invite the admin, insert the admin resident row + opening
  reading, and optionally seed an initial price).
- **WhatsApp webhook stub** (`/app/api/webhooks/whatsapp/route.ts`) returns 501
  now, as spec §10 asks, even though it is listed under Phase 6. `/api/webhooks`
  is in the proxy's public-paths list so external callers reach it without a
  Supabase session.
- **WebSocket polyfill.** supabase-js 2.117 eagerly constructs a realtime client
  that needs a global `WebSocket`. Node 22+ has it natively; this machine runs
  Node 20, which does not, so every Supabase client would throw on construction.
  `src/lib/supabase/ws-polyfill.ts` (server-only, imported by the server/admin
  helpers) sets `globalThis.WebSocket = ws` when missing. The seed script does
  the same inline. The Edge runtime (proxy.ts) already has WebSocket, so the
  polyfill is kept out of that bundle. Upgrading to Node 22+ makes it a no-op.
