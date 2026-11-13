# THE TRAINERS (تدرّب) — Implementation Changelog

## Round 7 — messaging: unread badges, read receipts, history paging (F9/D14/D16/D17)

- `src/App.tsx` (Messages): added `loadUnread()` using the existing `unread_counts()` RPC and `openConversation()`, which selects a conversation and calls `mark_conversation_read(p_conversation_id)`. Unread totals now appear as a badge (capped at `99+`) on each conversation row, refresh on load, on conversation open and on every realtime insert.
- Message history: `loadMessages` previously ordered ascending with `limit(200)`, which returned the **oldest** 200 messages and would hide new ones in a long conversation. It now orders descending with `limit(50)` and reverses for display. A `loadOlder()` action pages backwards with `.lt('created_at', oldest)` and prepends, so history is complete instead of silently truncated.
- Fixed an untranslated literal in Notifications: the acknowledge button said `Read` in every language; it now uses `t('markRead')`.
- `src/lib/i18n.ts`: `loadOlder` added in ar/fr/en; `markRead` already existed and was reused.
- `src/styles.css`: `.unread-badge` and `.load-older`.
- Build caught a real defect in my own first attempt — an unmatched parenthesis in the realtime cleanup (`return((()=>…`) — which `tsc` rejected; corrected before this round was accepted.
- Verified: `npm test` 24/24, `npm run build` OK, `npm run verify` 28 checks.
- Not verified: badges and read receipts were not exercised against a live database, so RLS behaviour of `message_reads` and the RPC grants is confirmed by reading the schema only.


## Round 6 — password recovery (F7/S2) and modal accessibility (F14)

- `src/App.tsx` (Login): added `resetPassword()` calling `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`, guarded by the existing `isConfigured` check so an unconfigured build explains itself instead of throwing. A secondary "forgot password" button sits under the sign-in button, is disabled while either request is in flight, and a success panel confirms the link was sent. Empty email produces a specific instruction rather than a silent no-op.
- `src/App.tsx` (Modal): the dialog now exposes `role="dialog"`, `aria-modal="true"` and `aria-label={title}`, takes focus on open, closes on `Escape`, and closes on backdrop click without closing when the click lands inside the panel.
- `src/lib/i18n.ts`: `forgotPassword`, `resetEmailFirst`, `resetSent`, `sendingReset` added in ar/fr/en.
- `src/styles.css`: `.notice-box` success panel and `.modal:focus` outline reset.
- Verified: `npm test` 24/24, `npm run build` OK, `npm run verify` 28 checks.
- Owner action required for the flow to actually deliver mail: add the deployed origin to the Supabase Auth redirect allow-list. Without it Supabase rejects the `redirectTo`. Not verifiable in this environment (no project credentials).
- Known gap: the modal close button's accessible name is the literal `Close` because `Modal` receives no translator; the dialog itself is labelled with its translated title.


## Round 5 — one-tap bulk attendance (D6)

- `src/App.tsx` (Attendance): added `markAllPresent()` and `clearAll()` plus a toolbar with two buttons. A coach can now fill an entire group as present in one tap, or reset the sheet, instead of setting every student individually; both buttons are disabled when no students are loaded, and clearing also drops the per-student reason text so no stale note is saved with a new status.
- `src/lib/i18n.ts`: `markAllPresent` and `clearAll` added in ar/fr/en.
- `src/styles.css`: `.attendance-bulk` wraps to two full-width touch targets (min 40px) on narrow phones.
- Verified: `npm test` 24/24, `npm run build` OK, `npm run verify` 28 checks.
- Not verified: the buttons were not exercised in a browser against a live Supabase session, so the save path is covered by the existing attendance-core unit tests rather than an end-to-end click.


## Round 4 — account gate messaging (audit: wrong message for rejected users)

- Added `src/lib/account-gate.ts`: a pure `accountGate(profile, loadError)` returning `active | pending | rejected | suspended | missing | error`, plus `gateTitleKey`, `gateBodyKey` and `gateAllowsRetry`.
- `src/App.tsx`: the pre-app gate no longer collapses three different situations into "pending approval". A failed profile read (`profiles` query error, e.g. an RLS denial) now shows a retry screen with the real error; an account with no profile row is told it is not linked to an institution yet; rejected and suspended keep their own wording. `loadProfile` now clears the stored error on success and never leaves a stale profile on failure.
- `src/lib/i18n.ts`: added `profileLoadFailedTitle`, `profileLoadFailedMsg`, `profileMissingTitle`, `profileMissingMsg` in ar/fr/en (`retry` already existed).
- Added `tests/account-gate.test.ts` (9 tests): status casing/whitespace, unknown status treated as pending and never active, load error vs missing profile, "rejected is never shown the pending message", retry only for errors, and every gate key present in all three dictionaries.
- Verified: `npm test` 24/24, `npm run build` OK, `npm run verify` 28 checks.


## Round 3 — untranslated strings (F6) and CSP (F10/S1)

- `src/App.tsx`: every remaining hard-coded Arabic UI string was replaced with a `t('key')` lookup — attendance status chips and reason field, the Excel import dialog, all messaging dialogs (invite coach, new conversation, participants), conversation type badges, empty states and button labels (47 literals). Excel header aliases on lines 19 and 22 stay literal on purpose: they match pasted spreadsheet data, not interface text. The language `<option value="ar">العربية</option>` keeps its endonym, which is standard practice.
- `src/lib/i18n.ts`: 40 new keys added to all three dictionaries; ar/fr/en parity is preserved and covered by `tests/i18n.test.ts`.
- `public/_headers`: added `Content-Security-Policy` restricting scripts to self, connections to Supabase REST/Realtime, images and media to Supabase storage plus blob (voice notes), styles to self plus Google Fonts, with `object-src 'none'` and `frame-ancestors 'none'`.
- Verified this round: `npm test` 15/15, `npm run build` OK, `npm run verify` 28 checks.
- Not verified: the CSP only takes effect behind a host that honours `_headers` (Cloudflare Pages / Netlify). `vite preview` ignores it, so no local browser assertion proves it does not break the live app; it should be re-checked on the first authorized deployment.


Branch: `appjet` · All work isolated to this branch. `main` was not touched.

---

## 2026-11-13 — Attendance correctness and verification baseline

### Added

- Pre-save shift guard: when a coach has no open shift, the attendance view now
  asks for confirmation before saving (`startShiftPrompt`, translated into
  Arabic, French and English). This closes the remaining F2 gap where a coach
  without a shift would silently save under the shared `unspecified` session
  key and could merge with another same-day session. `saveAttendance` accepts
  the already-resolved session key so `coach_shifts` is queried once, not twice.
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
