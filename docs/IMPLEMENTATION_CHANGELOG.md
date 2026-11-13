# THE TRAINERS (تدرّب) — Implementation Changelog

Branch: `appjet` · All work isolated to this branch. `main` was not touched.

---

## 2026-11-13 — Attendance correctness and verification baseline

### Added

- `src/lib/attendance-core.ts` — pure attendance rules with no Supabase or
  `import.meta.env` dependency: `NO_SESSION`, `isMissingSessionColumn`,
  `friendlyAttendanceError`, `buildAttendanceRows`, plus the `AttendanceInput`,
  `AttendanceRecord`, `AttendanceStatus` and `PgError` types.
- `src/lib/attendance.ts` — persistence layer: `resolveSessionKey`,
  `loadAttendance`, `saveAttendance`. Upserts on
  `(student_id, session_date, session_key)` and falls back to the previous
  two-column shape when the column does not exist yet.
- `supabase/migrations/0001_attendance_session_dimension.sql` — additive,
  idempotent, data-preserving migration adding the session dimension and moving
  the uniqueness rule to `(student_id, session_date, session_key)`.
- `tests/attendance-core.test.ts` — 9 assertions covering the missing-column
  detection, error mapping, duplicate prevention, reason normalisation and the
  six attendance statuses.
- `tests/i18n.test.ts` — 6 assertions enforcing translation key parity, non-empty
  labels and correct RTL across Arabic, French and English.
- `docs/IMPLEMENTATION_REPORT.md`, `docs/FINAL_TEST_REPORT.md`,
  `docs/DATABASE_REQUIREMENTS.md`, `docs/DEPLOYMENT_READINESS.md`,
  `docs/IMPLEMENTATION_CHANGELOG.md`.

### Fixed

- **F2 (High, data correctness).** Attendance could not record a student twice in
  one day. The upsert on `(student_id, session_date)` silently became an `UPDATE`
  of another coach's row and was rejected by RLS. Now the session identity comes
  from the coach's open `coach_shifts` row and the conflict target includes it.
- **F3 (Medium).** Daily report counts were aggregated across the whole day; they
  are now scoped to the reporting coach's own records.
- **F1 (High, CI).** Missing `.gitignore` made `npm run verify` abort before any
  real assertion; it is now present and the full 28-assertion suite runs.
- **F5 (Medium).** Duplicate translation dictionaries consolidated: `src/lib/i18n.ts`
  is the single source, `App.tsx` uses `makeT(lang)`, and key parity is now
  enforced by tests.
- **Environment documentation.** `.env.example` now documents
  `VITE_SUPABASE_ANON_KEY` alongside `VITE_SUPABASE_PUBLISHABLE_KEY`, with an
  explicit warning that service-role keys must never be placed there. This was a
  real `verify` failure.
- **Untranslated labels.** The reports view had hard-coded Arabic strings
  ("الإجراء", "اعتماد التقرير", "تمت المراجعة" and two explanatory notes). They now
  resolve through the dictionary in all three languages.

### Changed

- `src/App.tsx` attendance component now delegates to `loadAttendance` /
  `saveAttendance` / `buildAttendanceRows` instead of building upsert payloads
  inline. Save feedback reports the row count and warns when the session
  dimension is inactive.
- `package.json` — added `"test": "node --import tsx --test tests/*.test.ts"` and
  `tsx` as a dev dependency.

### Verified

- `npm test` — 15/15 pass.
- `npm run build` — type check clean, production bundle built.
- `npm run verify` — 28/28 assertions across 14 required files.
- Dependency scan — 162 packages, 0 high/critical, 2 moderate (`react-router`
  6.30.6, fixed only in 7.18.0, deliberately not force-upgraded).

### Not done in this round

- Migration 0001 not executed (owner action).
- No live Supabase authentication, RLS, storage or Realtime test.
- No device, PWA installation or offline-behaviour test.
- Audit findings beyond F1–F5 were not re-verified; AUDIT_REPORT.md remains the
  checklist for those.

---

## Notes for the next round

Priority order, by risk:

1. Apply migration 0001 in a staging project and confirm the fallback path is no
   longer taken (`migrationRequired` should be `false`).
2. Add an RLS integration test project with seeded users for each role — this is
   the largest remaining confidence gap.
3. Prompt coaches to start a shift before marking attendance, so same-day
   sessions do not silently merge under `'unspecified'`.
4. Plan the `react-router` v7 upgrade with a navigation regression pass.
5. Continue the remaining audit items against AUDIT_REPORT.md.
