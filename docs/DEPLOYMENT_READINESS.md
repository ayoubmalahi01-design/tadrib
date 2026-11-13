# THE TRAINERS (تدرّب) — Deployment Readiness

Honest status: **the client is deployable; the application is not yet
production-ready.** Two categories of work remain — owner actions and open audit
items — and both are listed here.

Deployment was **not** performed. The mission explicitly requires explicit
authorisation before deploying, so this document describes readiness only.

---

## 1. Readiness matrix

| Area | State | Evidence |
| --- | --- | --- |
| TypeScript type check | ✅ Ready | `tsc --noEmit` clean |
| Production build | ✅ Ready | `vite build` succeeds, 462 kB JS / 131.78 kB gzip |
| Structural verification | ✅ Ready | `npm run verify` — 28/28 assertions |
| Unit tests | ✅ Ready | `npm test` — 15/15 |
| Dependency advisories | ⚠️ Acceptable, with follow-up | 0 high/critical; 2 moderate in `react-router` (fix = major v7) |
| Attendance correctness (F2) | ✅ Fixed in client, ⏳ needs migration | Migration 0001 written, not executed |
| Database migration | ⏳ **Owner action required** | See DATABASE_REQUIREMENTS.md |
| Live auth / RLS verification | ❌ Not performed | No Supabase credentials in sandbox |
| Storage policy verification | ❌ Not performed | Same |
| Realtime messaging verification | ❌ Not performed | Requires two live clients |
| Device / PWA installation test | ❌ Not performed | No device testing |
| Arabic RTL layout on real devices | ❌ Not verified | Requires device testing |
| Secrets hygiene | ✅ Ready | Only publishable/anon keys are client-side |

---

## 2. Environment variables

### Client (build time, public — safe to ship)

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Project URL, e.g. `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` **or** `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | The client accepts either name. This is the public anon/publishable key, protected by RLS |

`.env.example` documents both names. **A service-role key must never appear in
any `VITE_*` variable** — those values are bundled into public JavaScript.

### Server-side only (Edge Function `invite-user`)

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Injected by the Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Set with `supabase secrets set`, **never** in the repository or the client bundle |

The Edge Function must be deployed for team invitations to work:

```bash
supabase functions deploy invite-user
```

---

## 3. Owner actions still required

In order, before the application can be called production-ready:

1. **Run migration 0001** in the Supabase SQL Editor
   (`supabase/migrations/0001_attendance_session_dimension.sql`).
   Until then attendance works in legacy single-session mode.
2. **Verify the deployed schema matches** `supabase/THE_TRAINERS_SETUP.sql` —
   tables, RLS policies, the four buckets and the 20 functions listed in
   DATABASE_REQUIREMENTS.md.
3. **Deploy the `invite-user` Edge Function** with its service-role secret set.
4. **Set the client environment variables** in the hosting environment.
5. **Perform a live authentication pass**: login, logout, invalid credentials,
   pending account, rejected account, suspended account.
6. **Perform a live authorization pass** for the three roles plus
   cross-institution isolation, private notebook visibility and conversation
   membership.
7. **Test on a real phone** — attendance entry, RTL layout in Arabic, and PWA
   installation.

## 4. Known risks to accept or schedule

| Risk | Severity | Recommendation |
| --- | --- | --- |
| `react-router` 6.30.6 has 2 moderate advisories | Moderate | Plan a deliberate v6 → v7 upgrade with a full navigation regression pass. Not forced in a defect-fix round. The SSR-hydration advisory is not reachable in this client-side SPA. |
| No automated RLS test suite | High (process) | Add an integration test project that runs against a staging database with seeded users per role. This is the single biggest gap in confidence. |
| Attendance relies on `coach_shifts` being open | Low | Coaches must start a shift; otherwise `session_key = 'unspecified'` and two same-day sessions merge. Consider prompting the coach to start a shift before marking attendance. |
| Bundle size 462 kB (132 kB gzip) | Low | Acceptable for an institutional tool; code-splitting by route would improve first load on slow mobile networks. |

---

## 5. What can be deployed today, and what it would mean

Deploying now would give a working client against the existing Supabase project
with all previously working features intact and attendance fixed — including on a
database where migration 0001 has not yet run, thanks to the legacy fallback.

It would **not** be "production-ready" in the sense the mission defines, because
the migration, the live RLS/auth verification and the device tests are still
outstanding. Those are owner actions, not code changes.

**Explicit authorisation is required before any deployment is performed.**
