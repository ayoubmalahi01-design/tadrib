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
