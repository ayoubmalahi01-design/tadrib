# THE TRAINERS (تدرّب) — Final Test Report

Branch `appjet`. Every result below is a command that was actually run in the
sandbox, with its real outcome. No test result in this document is estimated.

---

## 1. Summary

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | **PASS** — 15 / 15 assertions |
| Type check + production build | `npm run build` | **PASS** — `tsc --noEmit` clean, Vite bundle built |
| Structural verification | `npm run verify` | **PASS** — 14 required files, 28 assertions |
| Dependency security | security preset (OSV-Scanner 2.7.0) | **PASS** — 162 packages, 0 high/critical, 2 moderate |

Build output: `dist/index.html` 0.99 kB, `dist/assets/index-*.css` 13.56 kB,
`dist/assets/index-*.js` 462.09 kB (131.78 kB gzip), built in ~3.7 s.

---

## 2. Unit tests (`npm test`)

Runner: Node's built-in test runner with `tsx` for TypeScript
(`node --import tsx --test tests/*.test.ts`). 15 assertions, 0 failures.

### `tests/attendance-core.test.ts` — 9 assertions

| # | Assertion | Why it matters |
| --- | --- | --- |
| 1 | Detects `42703` and the "column … does not exist" / schema-cache messages | Prevents attendance breaking before migration 0001 runs |
| 2 | Unrelated errors are **not** treated as a missing column | A duplicate-key error that merely mentions `session_key` must not trigger the legacy fallback |
| 3 | Duplicate attendance returns an actionable message | The F2 symptom used to surface as raw Postgres text |
| 4 | Permission failures explained; unknown errors keep their message | Coaches see something they can act on |
| 5 | One row per selected student, unset students skipped | Core selection rule |
| 6 | Never emits the same student twice | Prevents the duplicate-row class of bug at the source |
| 7 | Blank reason → `null`, real reason trimmed | No `''` rows polluting reporting |
| 8 | All six statuses preserved, absence ≠ lateness | Requirement: lateness stays separate from absence |
| 9 | Session identity falls back to a stable constant | Deterministic behaviour with no open shift |

### `tests/i18n.test.ts` — 6 assertions

| # | Assertion |
| --- | --- |
| 1 | `ar`, `fr`, `en` are the registered languages |
| 2 | All three define exactly the same keys (177 / 178 / 178, parity enforced) |
| 3 | No visible label is empty or a placeholder |
| 4 | Arabic is RTL; French and English are LTR |
| 5 | `attendance`, `students`, `reports` resolve to real text, not the key |
| 6 | An unknown key degrades to the key instead of throwing |

Assertion 2 is the regression guard for audit finding F5: the duplicate
dictionaries that previously existed could silently diverge, and now cannot.

---

## 3. Structural verification (`npm run verify`)

`scripts/verify-project.mjs` checks 14 required files and 28 assertions covering
the features the audit flagged. All pass, including:

- absence follow-up flag and `absence_followups` table
- message read receipts (`mark_conversation_read`, `unread_counts`)
- rejected account status present in the schema
- `VITE_SUPABASE_ANON_KEY` documented in `.env.example`
- platform-owner role in the `app_role` enum
- coach-private notebook RLS (`coach_id = auth.uid()`)
- coach report privacy RLS; medical records admin-only; medical bucket private
- private notebook excluded from audit snapshots
- institution isolation via `current_institution_id()`
- owner email bootstrap; self-promotion guard; final-report immutability
- notice notifications; `inviteUserByEmail` Edge Function
- attendance workflow, private notebook UI, team invitation UI
- media upload and `MediaRecorder` audio capture
- bulk student import; direct and group conversation creation
- conversation-scoped message reads/writes; membership enforced in RLS
- private conversation media storage; automatic report counts; admin review
- coach inviting another pending coach

The script itself states, correctly, that this is **not** a substitute for a real
Supabase RLS integration test or a device test.

---

## 4. Dependency security

Scanner: OSV-Scanner 2.7.0, policy `workspace-dependencies-v1`, 162 npm packages
resolved from `package-lock.json`, 0 packages outside coverage.

- **High / critical: 0.** Nothing blocking.
- **Moderate: 2**, both in `react-router` 6.30.6:
  - `GHSA-337j-9hxr-rhxg` (CVE-2026-53666) — constructor injection via
    `deserializeErrors()` in SSR hydration, CVSS 6.1
  - `GHSA-wrjc-x8rr-h8h6` (CVE-2026-53669) — open redirect via backslash in
    `<Link>` / `useNavigate`, CVSS 5.1
- Both are fixed only in `react-router` **7.18.0**. That is a major upgrade
  (v6 → v7) touching every route and navigation call, which is outside the scope
  of a defect-fix round and would risk the existing working navigation. It was
  **not** forced, and no advisory was suppressed.

Assessment: this application is a client-side SPA; it does not perform SSR
hydration, so the first advisory is not reachable through the current
architecture. The second concerns redirect handling in link navigation. Both
should still be resolved by planning the v7 upgrade deliberately.

**This scan covers known advisories in resolved npm dependencies only.** It does
not prove source-code security, authorization correctness or runtime patching.

---

## 5. What was **not** tested, and why

These are genuine gaps, not passes:

| Not tested | Reason |
| --- | --- |
| Login, logout, invalid credentials, pending/rejected/suspended gates | No Supabase credentials or live project access in the sandbox |
| RLS policies for every role and cross-institution isolation | Requires an authenticated session against the real database |
| Storage policy enforcement on the four buckets | Same |
| Realtime message delivery, read receipts, unread counts | Requires two live clients |
| Voice recording and file upload end to end | Requires a live storage backend and a microphone |
| Migration 0001 execution | Owner action; deliberately not run against any database |
| Arabic RTL / French / English layout on real devices | No device or PWA installation test was performed |
| Service worker offline behaviour and cache-update strategy | Not exercised in this round |
| Automated browser interaction tests | Not added in this round; `npm run verify` covers presence, not behaviour |

For those items the source and schema were **read**, which is evidence of intent
and structure, not proof of runtime behaviour.

---

## 6. Reproduce these results

```bash
npm install
npm test          # 15 assertions
npm run build     # tsc --noEmit + vite build
npm run verify    # 14 files, 28 assertions
```

All three pass on branch `appjet` at the revision described in
IMPLEMENTATION_CHANGELOG.md.

## Round 3 addendum — i18n completion and CSP

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | PASS — 15/15 (attendance core, i18n parity, RTL direction, unknown-key fallback) |
| Typecheck + build | `npm run build` (`tsc --noEmit && vite build`) | PASS |
| Project verification | `npm run verify` | PASS — 14 required files, 28 assertions |

Not covered by these checks: live Supabase auth/RLS behaviour, device rendering, and the new Content-Security-Policy (honoured only by the production host, not by `vite preview`).

## Round 4 addendum — account gate messaging

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | PASS — 24/24 (9 new gate tests) |
| Typecheck + build | `npm run build` | PASS |
| Project verification | `npm run verify` | PASS — 28 assertions |

The gate tests are pure-logic tests: they prove the mapping from profile state to message, not that a real rejected user sees it, because no Supabase session exists in this environment.

## Round 6 addendum — password reset and modal accessibility

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | PASS — 24/24 |
| Typecheck + build | `npm run build` | PASS |
| Project verification | `npm run verify` | PASS — 28 assertions |

Password reset is implemented against the Supabase Auth API but was **not** executed end to end: no project credentials or redirect allow-list exist in this environment. The success and error paths are therefore unproven at runtime.
