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

---

# Final readiness assessment — end of the implementation mission

## Verdict

**Ready to host behind a test Supabase project. Not yet production-ready.**

The client is in a materially better state than at the start of the mission: it
builds, type-checks, passes 53 unit tests and 28 structural assertions, no longer
depends on a third-party font CDN, ships four cacheable chunks instead of one
477 kB file, never blocks the UI with `alert()`, keeps report work in drafts, and
has tested helpers for account gating, attendance sessions, drafts, notifications
and language completeness.

It is **not** production-ready because five prerequisites remain and none of them
can be satisfied from inside this repository alone.

## Owner actions, in order

| # | Action | Why | Consequence if skipped |
| --- | --- | --- | --- |
| 1 | Run `supabase/migrations/0001_attendance_session_dimension.sql` | Adds the session dimension needed for two sessions on one day | Attendance still works in legacy single-session mode; a second daily session cannot be recorded |
| 2 | Run `supabase/migrations/0002_report_draft_submit_notify.sql` | Fires the administrator notification when a saved draft is submitted | Drafts work, but submitting one notifies nobody |
| 3 | Add the deployed origin to Supabase Auth → URL Configuration → Redirect URLs | Password reset links must return to the app | Reset e-mails fail to land on the application |
| 4 | Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting environment | The client reads configuration from the environment, never from source | The app shows its "not configured" state |
| 5 | Perform one authenticated pass as owner, administrator and coach | Verifies RLS, storage policies, Realtime and the account-state gates at runtime | Those protections are only proven by reading the schema today |

Never place a service-role key in the client or in any `VITE_*` variable.

## Deliberately not changed

- `react-router` stays on 6.30.6. Both advisories are moderate and their only fix
  is the 7.18.0 major upgrade, which would be an unrelated migration.
- The Supabase project, schema, buckets, policies and existing records are
  untouched. Both migrations are additive, re-runnable and reversible.
- No feature was removed to make a check pass, and no finding was suppressed.

## Honest verification boundary

No authenticated session, RLS policy, storage upload, Realtime subscription,
service-worker offline path, PWA installation or real mobile viewport was
exercised in this environment. Those remain unverified and are listed as such in
`FINAL_TEST_REPORT.md`.

**Explicit authorisation is still required before any deployment.**

---

## Round 14 update — review workflow (migration 0004)

Adds one more prerequisite before the review cycle can be used end to end:

| # | Prerequisite | Why |
| --- | --- | --- |
| 0 | Apply `0004_report_review_workflow.sql` | Without it, "request changes" violates the existing `status` CHECK, and notice audience/archive columns are missing |
| 1 | Apply `0001`, `0002`, `0003` | Attendance sessions, draft-submission notification, notice read tracking |
| 2 | One real account per role | Authenticated RLS/storage/Realtime verification is still outstanding |
| 3 | Deploy target + env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only; never a service-role key |

Code status after round 14: `npm test` 84/84 pass, `npm run build` pass, `npm run verify`
pass, dependency scan 0 blocking findings. The application is code-complete for the
requested scope; readiness is **conditional on the migrations and the authenticated
verification pass**, not on further UI work.
