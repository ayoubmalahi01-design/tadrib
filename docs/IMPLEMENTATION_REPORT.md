# THE TRAINERS (تدرّب) — Implementation Report

Branch: `appjet` · Repository: `ayoubmalahi01-design/tadrib`
Companion documents: [FINAL_TEST_REPORT.md](./FINAL_TEST_REPORT.md) ·
[DATABASE_REQUIREMENTS.md](./DATABASE_REQUIREMENTS.md) ·
[DEPLOYMENT_READINESS.md](./DEPLOYMENT_READINESS.md) ·
[IMPLEMENTATION_CHANGELOG.md](./IMPLEMENTATION_CHANGELOG.md) ·
[AUDIT_REPORT.md](./AUDIT_REPORT.md)

This report separates three things that are easy to confuse:

1. what was **changed in this implementation round** and verified by a command,
2. what **already existed** in the repository and was preserved,
3. what is **still open** and needs an owner action or further work.

Nothing in this document claims that Row Level Security, authentication flows or
device behaviour were executed against a live Supabase project. See
*Limitations* at the end.

---

## 1. Scope of this round

The application was **not** rebuilt. The existing Vite + React + TypeScript
client, its single-page route structure, and the existing Supabase schema in
`supabase/THE_TRAINERS_SETUP.sql` were kept in place. Work was limited to
defects identified in the audit plus the structural safety nets needed to keep
them from returning.

| Area | Change | Verified by |
| --- | --- | --- |
| Attendance correctness (F2) | Session dimension + correct conflict target | `npm test`, `npm run build` |
| Report counts (F3) | Counts scoped to the coach's own records | `npm run build`, `npm run verify` |
| Repository hygiene (F1) | `.gitignore` present | `npm run verify` |
| Translation dictionaries (F5) | One dictionary, key parity enforced | `npm test` |
| Environment documentation | `.env.example` documents both key names | `npm run verify` |
| Regression safety | 15 automated assertions | `npm test` |

---

## 2. F2 — a student could not be recorded in two sessions on one day

**This was the most serious defect in the audit.**

`attendance_records` was unique on `(student_id, session_date)`. A student who
attended, for example, a morning and an evening session had only one legal row
for that date. Because the client used `upsert`, the second coach's write did not
fail loudly — it became an `UPDATE` of the **first** coach's row. RLS then
rejected that update (the row belongs to another coach), so the coach received a
raw Postgres error and the attendance was lost.

### The fix, in two halves

**Database (additive, not executed — see DATABASE_REQUIREMENTS.md).**
`supabase/migrations/0001_attendance_session_dimension.sql`:

- adds `session_key text not null default 'unspecified'` — a default means every
  existing row is valid immediately and **no historical row is rewritten**;
- locates and drops the old `(student_id, session_date)` uniqueness rule by
  definition rather than by a guessed constraint name;
- creates `attendance_records_session_unique` on
  `(student_id, session_date, session_key)`;
- adds `attendance_records_report_idx` on `(institution_id, session_date)` for
  institution-wide reporting.

**Client.** Attendance persistence moved into `src/lib/attendance.ts`:

- the session identity is the coach's open `coach_shifts` row
  (`resolveSessionKey`), or the constant `'unspecified'` when no shift is open;
- writes upsert on `student_id,session_date,session_key`;
- reads are scoped to the same session, so one session's marks are never
  displayed as if they belonged to another;
- `buildAttendanceRows` guarantees a student is never emitted twice and that a
  blank reason is stored as `null` rather than `''`;
- Postgres errors are translated into actionable text — a duplicate no longer
  surfaces as `duplicate key value violates unique constraint ...`.

### Why the fallback matters

The migration is an owner action. If the application were deployed before the
migration ran, writing `session_key` would fail with `42703` and attendance would
break completely. `saveAttendance` therefore detects that specific error
(`isMissingSessionColumn`) and retries the previous two-column shape, returning
`migrationRequired: true` so the UI can say so. **Attendance keeps working on an
un-migrated database**; the session dimension simply activates once the migration
is applied.

`src/lib/attendance-core.ts` holds the pure rules with no Supabase or
`import.meta.env` dependency, which is what makes them testable in plain Node.

---

## 3. F3 — report counts were not scoped to the reporting coach

`openReport()` pre-filled a daily report from `attendance_records` filtered by
`session_date` alone. The counts now also filter on `coach_id`, so a report is
pre-filled from the reporting coach's own records rather than whatever the day
contains. The pre-fill is still presented as an editable suggestion, and the
report itself remains coach-authored.

---

## 4. F1 / F5 / environment — stabilisation

- **F1** `.gitignore` was missing, which made `npm run verify` exit immediately
  and blocked every later assertion. It is now present.
- **F5** The duplicate dictionaries are gone. `src/lib/i18n.ts` is the single
  source, `App.tsx` consumes it through `makeT(lang)`, and Arabic, French and
  English hold 177 / 178 / 178 keys. `tests/i18n.test.ts` fails if the three
  languages ever drift apart or if a label is empty.
- **Environment** `.env.example` documented only `VITE_SUPABASE_PUBLISHABLE_KEY`
  while the client also accepts `VITE_SUPABASE_ANON_KEY`. Both names are now
  documented, with an explicit warning that a service-role key must never be
  placed there.

## 5. F4 — rejected accounts

The status gate was re-read during this round and already renders the correct
message for `rejected`, `suspended` and pending accounts through translated keys.
No change was required; this is recorded so the finding is not left ambiguous.

---

## 6. Existing functionality that was preserved

The audit's 60-row feature comparison and the repository's own `verify` script
confirm these paths are still present and connected:

- attendance workflow with the six statuses, lateness kept separate from absence;
- coach-private notebook (`coach_notebooks`, author-scoped RLS);
- daily reports with draft → submit → admin review, and finalized reports locked;
- direct and group conversations, conversation-scoped message reads and writes,
  membership enforced in RLS for both reads and inserts;
- media upload and in-browser audio capture to `trainer-media`;
- bulk student import via paste/CSV parsing;
- team invitation through the `invite-user` Edge Function, including a coach
  inviting a pending coach;
- announcements with generated notifications, and read receipts / unread counts;
- institution isolation through `current_institution_id()`, platform-owner
  bootstrap, and the `guard_profile_privileges` self-promotion guard;
- medical records restricted to institution administrators with a private bucket;
- audit logging through `write_audit_log`, with the private notebook excluded
  from audit snapshots.

---

## 7. Schema and storage actually used

18 tables and 4 storage buckets are referenced by the application. The complete
list, with purpose and policy expectations, is in
[DATABASE_REQUIREMENTS.md](./DATABASE_REQUIREMENTS.md). Summary:

- **Tables:** `institutions`, `profiles`, `students`, `classes`,
  `attendance_records`, `coach_shifts`, `coach_notebooks`, `student_notes`,
  `student_medical_records`, `absence_followups`, `daily_reports`,
  `conversations`, `conversation_members`, `messages`, `message_reads`,
  `notifications`, `admin_notices`, `audit_logs`.
- **Buckets:** `institutions` (logos), `trainer-avatars`, `trainer-media`
  (message attachments and voice notes), `trainer-medical` (private).

No table, column or bucket was dropped or renamed by this round.

---

## 8. Limitations — stated plainly

1. **No live Supabase integration test was executed.** The sandbox has no
   Supabase credentials or authenticated session, so authentication, RLS,
   storage policies and Realtime were verified by reading the schema and the
   client calls, not by running them. `verify` itself prints this caveat.
2. **Migration 0001 has not been applied** to any database. Until it is,
   attendance runs in legacy mode.
3. **No device or PWA installation test was executed.** Responsive layout and
   service-worker behaviour were not exercised on real hardware.
4. **Two moderate advisories remain** in `react-router` 6.30.6; the published
   fixes are only in 7.18.0, a major upgrade that was deliberately not forced
   into this round. See FINAL_TEST_REPORT.md.
5. Findings in the audit beyond F1–F5 were not all re-verified in this round.
   The feature comparison table in AUDIT_REPORT.md remains the authoritative
   checklist for the rest.

---

## 9. Readiness statement

The client **builds, passes its structural verification, and passes its unit
tests** on branch `appjet`. Attendance is now correct by construction and safe
to deploy before or after the migration.

The application is **not** declared production-ready: the database migration is
pending owner execution, no live RLS/auth run has been performed, and the
remaining audit items are still open. The exact remaining steps are listed in
[DEPLOYMENT_READINESS.md](./DEPLOYMENT_READINESS.md).

---

# Final status — end of the implementation mission

This section supersedes the interim status above and records the state of branch
`appjet` after thirteen implementation rounds. Every earlier feature described in
this report is still present; nothing was rebuilt from scratch, no table, column,
policy, bucket or record was dropped, and no SQL was executed against any
database.

## What was implemented after the attendance work

| Round | Change | Audit item |
| --- | --- | --- |
| 6 | Rejected/pending/suspended accounts explained correctly on the gate screen | account messaging defect |
| 6 | Bulk attendance: mark all present / clear all | D6 |
| 7 | Password reset by e-mail, modal ESC + `role="dialog"` + focus handling | F7, S2, F14 |
| 8 | Chat unread badges, read receipts, older-history paging | F9, D14, D16, D17 |
| 8 | Group membership management | F8, D15 |
| 9 | Locale-aware date/time formatting (`Intl`, ar/fr/en) | F19 |
| 10 | Non-blocking toast channel replacing all 50 `alert()` calls | F13 |
| 10 | Dead imports and unused code removed | F18 |
| 11 | Vendor chunk splitting: entry bundle 477 kB → 83.9 kB | F12 |
| 11 | Google Fonts dependency removed, CSP tightened | F15 |
| 12 | Report drafts: autosave, save, resume, submit; admin notification on submit | D8 |
| 12 | Browser notifications gated by permission and tab visibility | D19 |
| 12 | Translated accessible name for the modal close button | F14 |
| 13 | Language-parity guard over ar/fr/en | F6 follow-up |

## Preserved functionality

Login and account gating, institution branding and settings, student and group
management with institutional numbering, attendance and lateness, private trainer
notes, daily reports with review, individual and group messaging with file and
voice attachments, announcements, notifications, audit logging and the PWA shell
all remain in place. The single-session attendance fallback still keeps the
application working on a database where migration 0001 has not run.

## Real check results at the end of the mission

| Check | Command | Result |
| --- | --- | --- |
| Unit and regression tests | `npm test` | PASS — 53/53 |
| Typecheck and production build | `npm run build` | PASS — 4 chunks, entry 88.82 kB (25.17 kB gzip) |
| Structural verification | `npm run verify` | PASS — 28 assertions over 14 required files |
| Dependency advisories | security scan | 162 packages, 0 blocking, 2 moderate (`react-router` 6.30.6; fixed only in 7.18.0) |

## What remains outside the code

1. `supabase/migrations/0001_attendance_session_dimension.sql` — required for
true multi-session attendance; attendance currently degrades gracefully without it.
2. `supabase/migrations/0002_report_draft_submit_notify.sql` — required so that
submitting a saved draft notifies administrators.
3. A live authenticated verification of RLS, storage policies, Realtime and the
account-state gates, which needs project credentials that do not exist here.
4. Device and PWA testing: Arabic RTL layout, phone-width overflow, offline
behaviour and installation were not exercised on real hardware.
5. `A12` (MFA) remains unimplemented; the audit itself classifies it as outside
the repository's declared specification.

No deployment was performed and none is authorised. All work is committed to
branch `appjet` only.

## Round 13 addendum

Implemented: coach private notebook (search, date range, edit, delete, per-coach
local draft), announcement read tracking with migration 0003 (additive, not
executed), messaging search and failed-send retry, report filters (coach name,
status, date range), notification deep links and mark-all-as-read, seven new
translation keys, and removal of the bulk student importer at the owner's request.

Verified: `npm test` 67/67 pass and `npm run build` pass (TypeScript + Vite, 1634
modules). Not verified: authenticated end-to-end flows, RLS isolation, storage
uploads, Realtime delivery, PWA installation and device testing — no credentials or
hardware are available here. Full detail: `docs/ROUND13_REPORT.md`.
