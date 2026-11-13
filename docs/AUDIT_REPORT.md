# THE TRAINERS (تدرّب) — Deep Audit Report & Implementation Plan

> **Status:** read-only audit. No application code was modified, no SQL was executed, no database structure was changed, nothing was deployed and nothing was merged into `main`.
> **Branch:** `appjet` · **Audited commit:** `21c2abf`
> **Audit date:** this session

---

## 0. Method and honesty statement

Every claim below comes from reading the actual source in this repository:

| Source | What was read |
|---|---|
| `src/App.tsx` (58 KB, 117 wrapped lines, 24 components) | All 24 component definitions, the router, auth gate, and every Supabase query (verified by extracting all `from('<table>')`, `storage.from(...)`, `rpc(...)`, `functions.invoke(...)` and realtime channel calls) |
| `supabase/THE_TRAINERS_SETUP.sql` (543 lines) | Tables, enums, RLS policies (lines 317–340 read in full), RPCs, triggers, storage buckets, realtime publication |
| `supabase/functions/invite-user/index.ts` | Full body, including role/institution authorization rules |
| `src/lib/supabase.ts`, `src/lib/i18n.ts`, `src/main.tsx`, `src/styles.css` | Full |
| `index.html`, `public/manifest.webmanifest`, `public/sw.js`, `public/_headers`, `.env.example`, `vite.config.ts`, `tsconfig*.json`, `wrangler.toml` | Full |
| `README.md`, `docs/*.md` (7 files), `cloudflare/DEPLOYMENT.md`, `scripts/verify-project.mjs` | Full |

**Coverage honesty:** all 24 components were inspected. For three of them — `OwnerConsole`, `InstitutionSettings`, `Audit` — the terminal output was partially truncated, so their behaviour is described at the level of *purpose, data access and RLS interaction* that I could verify, not every field and branch. This is called out again in §12.

**The "complete THE TRAINERS specification" has not been provided yet.** The comparison in §6 is therefore against the specification *as declared by this repository itself* (README, `docs/DATABASE.md`, `docs/STATUS.md`, `docs/ACCEPTANCE_TESTS.md`, `docs/ADMIN_GUIDE.md`, `docs/COACH_GUIDE.md`, `docs/STORAGE.md`, `docs/SECURITY_NOTES.md`) plus the capabilities the code obviously implies. When you paste the real specification I will diff it against this table row by row and mark anything the repo claims that your spec does not require, and vice versa.

---

## 1. Verified check results (actual, not assumed)

### 1.1 `npm run build` — ✅ PASSES

```
> the-trainers@1.0.0 build
> tsc --noEmit -p tsconfig.json && vite build

vite v6.4.6 building for production...
✓ 1624 modules transformed.
dist/index.html                   0.99 kB │ gzip:   0.50 kB
dist/assets/index-Ct6ie0Kz.css   13.56 kB │ gzip:   3.74 kB
dist/assets/index-DU2rOz37.js   448.71 kB │ gzip: 127.57 kB
✓ built in 4.00s
```

**There are no TypeScript or bundler errors.** The project compiles cleanly today.

### 1.2 `npm run verify` — ❌ FAILS

```
> the-trainers@1.0.0 verify
> node scripts/verify-project.mjs
Missing required files: .gitignore
```

This is the **only** failing check, and it is a real repository defect: `scripts/verify-project.mjs` lists `.gitignore` among 14 required files, and the repo has never had one. Consequences beyond the failing script: `npm install` output (`node_modules/`) is not excluded, and build artifacts are only excluded through a local `.git/info/exclude` — which is **not** committed, so any fresh clone loses that protection.

`verify-project.mjs` itself is a *static file-presence scan*, not a test suite. It prints: *"This is not a substitute for a real Supabase RLS integration test or device test."*

### 1.3 Dependency security scan — ✅ PASS (non-blocking findings)

134 packages checked, **2 moderate advisories**, 0 blocking:

| Package | Installed | Fixed in | Advisory |
|---|---|---|---|
| `react-router` | 6.30.6 | **7.18.0** | GHSA-337j-9hxr-rhxg — arbitrary constructor injection via `deserializeErrors()` in **SSR hydration** (CVSS 6.1) |
| `react-router` | 6.30.6 | **7.18.0** | GHSA-wrjc-x8rr-h8h6 — open redirect via backslash in `<Link>`/`useNavigate` (CVSS 5.1) |

Assessment: this app is a **client-only SPA with no SSR**, so the first advisory is not reachable. The second is a redirect-hardening issue with low practical impact here. The fix is `react-router` **7.x**, a **major** upgrade that changes imports and routing APIs — do **not** apply it silently. It belongs in a dedicated, tested migration step (§10, P3).

### 1.4 There are no automated tests and no linter

No `test` script, no `lint` script, no `vitest`/`jest`/`eslint` config. **Zero** regression protection exists. This is why every "verification" in this project today is manual.

---

## 2. Architecture

### 2.1 Stack (as actually used)

```
Browser (React 18 + TypeScript 5 + Vite 6 + react-router-dom 6)
   │
   ├── @supabase/supabase-js  →  Supabase Auth (JWT)
   │                          →  PostgREST  (all tables, RLS-enforced)
   │                          →  Realtime   (postgres_changes)
   │                          →  Storage    (trainer-avatars, trainer-media, trainer-medical)
   │                          →  Edge Fn    invite-user (service_role, server-side only)
   │
   └── PWA: manifest.webmanifest + sw.js (registered in production only)

Hosting: Cloudflare Pages (wrangler.toml + public/_headers)
Database: ONE idempotent SQL file — supabase/THE_TRAINERS_SETUP.sql (run once on an empty project)
```

### 2.2 Front-end shape

The entire UI lives in **one 58 KB file**: `src/App.tsx`. It contains:

- the router and auth gate (`App`)
- 24 function components: `localDate`, `parseStudentPaste`, `App`, `Login`, `Heading`, `Empty`, `Dashboard`, `Stat`, `ShiftCard`, `Students`, `Modal`, `Attendance`, `Reports`, `Notebook`, `Notices`, `Notifications`, `Messages`, `OwnerConsole`, `Team`, `Medical`, `InstitutionSettings`, `Audit`, `DictateButton`, `Denied`
- its own **ar/fr/en translation dictionary** (`words`) with 66 distinct `t('key')` lookups

`src/lib/i18n.ts` also exports a full `dict` for `ar/fr/en` — and **nothing imports it** (verified: the only `./lib` import in the whole `src/` tree is `./lib/supabase`). It is dead code that `verify-project.mjs` nonetheless *requires* to exist. See finding **F5**.

`src/lib/supabase.ts` is a clean, defensive singleton: accepts both `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`, exports `isConfigured`, and falls back to `https://placeholder.supabase.co` so the app boots instead of crashing when unconfigured.

### 2.3 Routes (13 + gate + fallback)

| Path | Component | Who can reach it (client-side guard) |
|---|---|---|
| — (no session) | `Login` | anonymous |
| — (session, profile missing or `account_status !== 'active'`) | pending/suspended screen | any non-active account |
| `/` | `Dashboard` | all active |
| `/owner` | `OwnerConsole` | `role === 'owner'` |
| `/students` | `Students` | admin/manager |
| `/attendance` | `Attendance` | coach + admin/manager |
| `/reports` | `Reports` | coach + admin/manager |
| `/notebook` | `Notebook` | coach |
| `/notices` | `Notices` | all |
| `/notifications` | `Notifications` | all |
| `/messages` | `Messages` | all |
| `/team` | `Team` | admin/manager |
| `/medical` | `Medical` | admin/manager |
| `/settings` | `InstitutionSettings` | admin/manager |
| `/audit` | `Audit` | admin/manager (owner sees `/audit` too) |
| `*` | `Denied` | — |

**Important architectural point (this is done correctly):** these client-side guards are *cosmetic only*. The real boundary is **Postgres RLS**, and I verified it is genuinely enforced (§7). Client guards improve UX; they are not the security model. That is the right design.

### 2.4 Role model

`app_role` enum = `owner | manager | admin | coach`.

- **owner** — platform-level, `institution_id IS NULL`, bootstrapped by email in the SQL (`handle_new_auth_user`). Creates institutions, invites managers. Because `current_institution_id()` returns `NULL` for owner, *every* institution-scoped RLS policy evaluates false for owner — so owner genuinely cannot read institution data. Correct isolation by construction.
- **manager / admin** — `is_institution_admin()`; review reports, manage students/medical/team/settings/audit.
- **coach** — own shift, own attendance, own reports, notebook, notices, chat.

### 2.5 Auth flow (verified)

```
supabase.auth.getSession()
   → loadProfile()  (profiles select by id)
   → onAuthStateChange subscription
   → gate:
       !session                       → <Login/>
       !profile || status!=='active'  → pending screen (message varies for 'suspended' only)
       else                           → routed shell
```

`Login` also refuses to submit when `isConfigured === false`, showing a configuration error instead of a network failure. Good.

### 2.6 Data-integration map (what the UI actually touches)

| Table | Call sites | Notes |
|---|---|---|
| `students` | 8 | list, search, insert, update, bulk insert, toggle `is_active` |
| `profiles` | 6 | profile load, team list, approve, role/institution updates |
| `daily_reports` | 5 | draft insert, finalize update, admin review |
| `institutions` | 4 | owner console, settings |
| `coach_shifts` | 4 | start/end shift, history |
| `attendance_records` | 3 | load by date, upsert save |
| `admin_notices` | 3 | feed, create |
| `student_notes` | 2 | notebook entries (`note_type: 'general'`) |
| `student_medical_records` | 2 | admin only |
| `notifications` | 2 | list, mark read |
| `messages` | 2 | list, send |
| `conversations` | 2 | list, create |
| `conversation_members` | 2 | membership |
| `coach_notebooks` | 2 | notebook |
| `audit_logs` | 1 | audit view |
| **storage** | | `trainer-avatars`, `trainer-media`, `trainer-medical` — all three used |
| **realtime** | 1 channel | `tt-notifications`, 2 `postgres_changes` subscriptions |
| **rpc** | 1 | `create_conversation` |
| **edge fn** | 1 | `invite-user` |

**15 of the 20 tables** in the schema are used by the UI. Unused by any UI code: `classes`, `message_reads`, `absence_followups`, plus the `unread_counts` view and the follow-up/streak RPCs. This matches `docs/STATUS.md`, which openly states these are database-only. See §6 and §8.

---

## 3. Feature-by-feature comparison table

Legend: ✅ working · 🟡 partial / needs work · 🔴 broken or misleading · 🟣 database-only (no UI) · ⚪ missing

### A. Authentication & onboarding

| # | Feature | Status | Evidence / gap |
|---|---|---|---|
| A1 | Invite-only accounts (no public sign-up) | ✅ | No sign-up UI; `invite-user` edge function uses `admin.auth.admin.inviteUserByEmail` |
| A2 | Email + password login | ✅ | `Login` |
| A3 | Session persistence + refresh | ✅ | `getSession` + `onAuthStateChange` |
| A4 | Pending-approval gate | ✅ | `account_status !== 'active'` blocks the shell |
| A5 | Distinct **rejected** state | ⚪ | `rejected` exists in the DB and in admin filters, but the gate shows the *pending* copy for it → a rejected user is told "awaiting approval" forever (**F4**) |
| A6 | Suspended-account messaging | 🟡 | Only `suspended` gets a distinct message; no appeal/contact path |
| A7 | Forgot password / reset | ⚪ | No `resetPasswordForEmail` call anywhere (**F7**) |
| A8 | Change password | ⚪ | None |
| A9 | Edit own profile (name, avatar, language) | 🟡 | `preferred_language` column + `trainer-avatars` upload exist; **there is no `/profile` route at all** (0 matches) |
| A10 | Sign out | ✅ | `signOut` |
| A11 | Role-based navigation | ✅ | Nav computed from `role` |
| A12 | MFA | ⚪ | Not implemented, not in the repo's declared spec |

### B. Platform owner

| # | Feature | Status | Evidence / gap |
|---|---|---|---|
| B1 | Create institution | ✅ | `OwnerConsole` → `institutions` insert |
| B2 | List / manage institutions | ✅ | `institutions` select; RLS allows owner |
| B3 | Invite + assign a manager | ✅ | `invite-user` with `institution_id`; owner-invited managers get `account_status='active'` immediately |
| B4 | Owner isolated from institution data | ✅ | `current_institution_id()` is `NULL` for owner → all scoped policies fail |
| B5 | Cross-institution audit | 🟡 | `audit_logs` RLS restricts owner to `table_name='institutions'` — deliberate, but the audit page therefore shows almost nothing to owner |

### C. Institution administration

| # | Feature | Status | Evidence / gap |
|---|---|---|---|
| C1 | Student list + search | ✅ | `Students` |
| C2 | Create / edit student | ✅ | insert/update with `student_code` unique per institution |
| C3 | Bulk student import | ✅ | `parseStudentPaste` accepts comma/tab/semicolon, header aliases in **ar/fr/en**, in-file and in-DB de-duplication by `student_code` |
| C4 | Activate / deactivate student | ✅ | `toggleActive` |
| C5 | Student notes | 🟡 | Only `note_type: 'general'` is ever written; the category system is DB-only |
| C6 | Classes / groups management | 🟣 | `classes` table + RLS exist; **no UI** |
| C7 | Assign a student to a class | ⚪ | `class_id` never set by any form |
| C8 | Medical records (admin-only) | ✅ | `Medical` + `trainer-medical` bucket; RLS admin-only |
| C9 | Team list + approve pending | ✅ | `Team`, `approve()` |
| C10 | Change a member's role | ⚪ | `profiles_admin_update` allows it server-side; **no UI** |
| C11 | Remove / disable a member | 🟡 | Status can change; no explicit remove/offboard flow |
| C12 | Institution settings | 🟡 | `InstitutionSettings` — name/contact/logo path + the "count excused as absent" rule; field-level review partial (§12) |
| C13 | Audit log view | ✅ | `Audit` reads `audit_logs` |
| C14 | Review submitted reports | 🟡 | `review()` exists and `reports_admin_review` allows it, but a **rejected** report has no distinct UI state (**F4**) |
| C15 | Attendance overview | 🟡 | Reads `attendance_records`; admin sees institution-wide aggregates while the UI reads as a single session (**F3**) |
| C16 | Absence follow-ups | 🟣 | `absence_followups` + `track_absence_followup` trigger + streak RPC exist; **no UI** |

### D. Coach workspace

| # | Feature | Status | Evidence / gap |
|---|---|---|---|
| D1 | Start shift | ✅ | `coach_shifts` insert; `one_open_shift_per_coach` unique partial index enforces one open shift |
| D2 | End shift | ✅ | `ended_at` set |
| D3 | Shift history | 🟡 | Read exists; no filtering/export |
| D4 | Daily attendance marking | ✅ | 6 statuses: `present, absent, late, excused, medical_exemption, permission` |
| D5 | Per-student reason/note | ✅ | `reason` column, restored on reload |
| D6 | Mark-all-present / bulk action | 🟡 | Per-student chips only; no verified bulk shortcut (slower on a 30-student class) |
| D7 | Submit daily report | ✅ | `is_finalized` + `lock_final_report` trigger makes submitted reports immutable |
| D8 | Report draft / autosave | 🟡 | Draft exists; no autosave — a refresh can lose typed notes |
| D9 | Coach notebook | ✅ | `coach_notebooks` |
| D10 | Voice dictation | 🟡 | `DictateButton` uses the browser Web Speech API only — **no real STT service**; unavailable in some browsers, Arabic accuracy varies, requires network in Chrome |
| D11 | Notices feed | ✅ | `admin_notices` |
| D12 | Notifications + realtime | ✅ | `tt-notifications` channel, 2 subscriptions |
| D13 | Direct + group chat | ✅ | `conversations` + `conversation_members` + `create_conversation` RPC |
| D14 | Chat media attachments | 🟡 | `trainer-media` upload works; **200-message cap, no pagination** → older history silently unreachable |
| D15 | Group member add/remove | 🟣 | DB + RLS exist; no UI |
| D16 | Unread counts / badges | 🟣 | `message_reads` + `unread_counts` view exist; no UI, no badge anywhere |
| D17 | Read receipts | 🟣 | Same |
| D18 | Chat search | ⚪ | None |
| D19 | Push notifications | ⚪ | In-app only; no service-worker push handler, no VAPID |

### E. Platform-wide

| # | Feature | Status | Evidence / gap |
|---|---|---|---|
| E1 | Arabic / French / English | 🟡 | 66 `t()` keys × 3 languages work, but many strings bypass `t()` (**F6**) |
| E2 | RTL | ✅ | `dir` set from language; CSS uses logical properties (`margin-inline`, `inset-inline`) |
| E3 | PWA installability | ✅ | Manifest + icons + SW (registered in `PROD` only) |
| E4 | Offline | 🟡 | App-shell cache only; **no offline data queue** — attendance taken offline is lost |
| E5 | Mobile responsiveness | ✅ | Breakpoints at 760/680/370 px, `100dvh`, chat workspace restacks, table overflow handling |
| E6 | Accessibility | 🟡 | Icon-only buttons have `title` but no `aria-label`; `Modal` has **no focus trap, no ESC close, no `role="dialog"`** |
| E7 | Error handling UX | 🟡 | `alert()` for failures; no inline validation, no toasts, no retry |
| E8 | Automated tests | ⚪ | None |
| E9 | Lint / format config | ⚪ | None committed |
| E10 | CSP | ⚪ | `_headers` sets `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` — **no `Content-Security-Policy`** (**F10**) |

---

## 4. Findings — broken

### F1 · `npm run verify` fails — missing `.gitignore` — **High (CI/blocking)**

Verified failure output in §1.2. The repo has never had a `.gitignore`; `scripts/verify-project.mjs` requires it. Also means `node_modules/` is unprotected on a fresh clone.

**Fix:** add a `.gitignore` (`node_modules`, `dist`, `.env`, `.env.local`, `.DS_Store`, `*.local`). Zero functional risk, one file, no feature touched. **This is the only change I would make before your approval**, because it fixes a real failing check without altering behaviour.

### F2 · Attendance is keyed by `(student_id, session_date)` only — **High (data correctness)**

```sql
create table public.attendance_records (
  ...
  coach_id uuid not null references public.profiles(id),
  session_date date not null default current_date,
  status text not null check(status in ('present','absent','late','excused','medical_exemption','permission')),
  ...
  unique(student_id, session_date)     -- ← no shift_id, no class_id
);
```

There is **no shift/session dimension** in the uniqueness rule, while `daily_reports` *does* carry `shift_id`. Consequences:

1. A student who trains twice in one day (two coaches, two sessions) **cannot have two attendance records**.
2. Worse, the second coach's `upsert(..., onConflict: 'student_id,session_date')` resolves to an `UPDATE` of a row owned by coach A. `attendance_update_own_admin` only permits `coach_id = auth.uid()` or an institution admin → **the write is rejected by RLS** and the coach sees a raw Postgres error.
3. `coach_id` on that row silently represents "whichever coach wrote first", so per-coach reporting is unreliable.

**Fix (requires your approval — it is a schema change, and I will not run it):** add `shift_id` to the unique key and to the client's `onConflict`. Until then, a UI guard can at least detect the conflict and explain it.

### F3 · Report attendance counts are aggregated, not session-scoped — **Medium (misleading UI)**

`Reports.openReport()` reads `attendance_records` filtered **only** by `session_date`. RLS then scopes rows to the caller (verified: `attendance_read_own_admin` = own **or** institution-admin). So:

- for a **coach**: counts are correctly their own → fine;
- for an **admin/manager**: counts silently include **every coach in the institution**, while the panel is presented as the session summary.

**This is not a data leak** — RLS holds. It is a **semantics/labelling bug**. Fix: add explicit `coach_id` (and `institution_id`) filters and label the aggregate as institution-wide.

> Correction to an earlier working note: I initially suspected a cross-coach privacy leak here. Reading the RLS policies (lines 338–340) disproved that. Recording it so the finding is not overstated.

### F4 · "Rejected" accounts are shown the pending message — **Medium**

`rejected` is a valid `account_status`, admins can filter by it, and `profiles_admin_update` can set it — but the gate treats every non-active, non-suspended status as "awaiting approval". A rejected user is stuck on a message that will never change.

### F5 · Duplicate translation dictionaries — **Medium (maintainability)**

`src/lib/i18n.ts` (4.6 KB, full `ar/fr/en` dict + `Lang` + `t()`) is **imported by nothing**. `App.tsx` carries its own `words` object and its own `t`. Two sources of truth for translations; the file is dead yet *required* by `verify-project.mjs`. Any new string added to one will drift from the other.

---

## 5. Findings — incomplete / duplicated / missing (summary)

| ID | Severity | Finding |
|---|---|---|
| F6 | Medium | Hardcoded Arabic bypasses `t()` — verified examples: attendance summary chips (حاضر/غائب/متأخر/مصاب/رخصة), `'محادثة خاصة'`, `'لم أجد صفوفاً صالحة…'`, plus Medical/Audit headers. A French or English user sees Arabic fragments. |
| F7 | Medium | No password reset / no change-password — a locked-out user has no self-service path. |
| F8 | Medium | No member role-change UI and no member-removal flow (server permits role change; UI absent). |
| F9 | Medium | Chat: 200-message hard cap, no pagination, no search, no unread badge, no read receipts, no optimistic send. |
| F10 | Medium | No `Content-Security-Policy` in `public/_headers`. |
| F11 | Low | `.env.example` commits the real project URL and a `sb_publishable_…` key. Publishable/anon keys are public by design and safe in a browser **only because RLS is correct** (it is), but the real project ref is still exposed and the key should be rotated if it was ever treated as secret. |
| F12 | Medium | 448.71 kB single JS chunk, no route-level code splitting → slow first paint on 3G, which matters for the stated Android/iPhone-first target. |
| F13 | Medium | `alert()`-based error handling; no offline queue for attendance (E4). |
| F14 | Medium | `Modal` lacks `role="dialog"`, focus trap and ESC handling; icon buttons lack `aria-label`. |
| F15 | Low | Google Fonts `@import` in `styles.css` — external request on every load, blocking render, and a privacy/availability dependency for a Morocco-first audience. Self-host instead. |
| F16 | Low | `react-router` 6.30.6 → 2 moderate advisories; fix requires the 7.x major. |
| F17 | Medium | No tests, no lint — `verify` is a file-presence scan. |
| F18 | Low | Unused imports in `App.tsx` (build tolerates them because `noUnusedLocals` is off). |
| F19 | Low | `toLocaleString()` called without an explicit locale → dates follow the *device* locale, not the chosen app language. |
| F20 | Low | Owner email hardcoded in the SQL bootstrap (documented and intentional; just note it for multi-tenant later). |

---

## 6. What is genuinely *missing* versus the repo's own declared spec

The repository's own `docs/STATUS.md` is candid about these, which is a good sign. Nothing below is invented; each is corroborated by absent code:

1. Rejected-status UI (F4)
2. Unread counts / badges / read receipts (`message_reads`, `unread_counts` unused)
3. Group member add/remove UI
4. Absence follow-up UI (`absence_followups` unused)
5. Student note categories (only `'general'` written)
6. Classes/groups management and student→class assignment
7. Member role change / removal
8. Password reset & profile page
9. Push notifications
10. Real speech-to-text (browser API only)
11. Report/note attachments (only chat and medical use Storage)
12. Offline attendance capture
13. Chat pagination/search
14. Any automated test suite

---

## 7. Security, authentication & authorization review

### 7.1 What is done well (verified, not assumed)

- **RLS on every table**, all policies `to authenticated` with explicit `using` + `with check`. Lines 317–340 read in full.
- **Institution isolation is structural:** every scoped policy goes through `current_institution_id()` / `is_active_member()` / `is_institution_admin()`, all `security definer` with `set search_path=public,pg_temp` (correct hardening).
- **Owner cannot read tenant data** — `current_institution_id()` is `NULL` for owner, so scoped policies fail closed. Excellent.
- **Medical records are admin-only** for read/insert/update/delete.
- **Reports are immutable once finalized** (`lock_final_report`), with a narrow admin review path (`reports_admin_review` requires `is_finalized`).
- **Privilege escalation is guarded** (`guard_profile_privileges`): self-update cannot change role/institution/status; admin `with check` forbids granting `owner`/`manager`.
- **`service_role` never reaches the browser.** The invite flow runs server-side, re-verifies the caller's JWT with the anon key, loads the actor's profile with the service client, then enforces role rules:
  - coach → coach only;
  - admin → coach only (and only if not a manager);
  - manager → coach/admin;
  - owner → manager/admin/coach, **must** pass `institution_id`;
  - non-owner → `institution_id` must equal the actor's own.
  That is a correct, defence-in-depth implementation.
- **No XSS sink:** zero `dangerouslySetInnerHTML` / `innerHTML` in `src/`.
- **Service worker is origin-scoped:** `sw.js` returns early for cross-origin requests and non-GET, so **Supabase API responses are never cached** — no cross-user data leakage from the cache. Correct.
- **`_headers`** sets `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and `Permissions-Policy` (microphone allowed for dictation, camera/geolocation denied).
- **Attendance insert** pins `coach_id = auth.uid()`, so a coach cannot forge another coach's record.

### 7.2 Security gaps to fix (none critical)

| ID | Gap | Severity | Note |
|---|---|---|---|
| S1 | No CSP header | Medium | Add a strict `Content-Security-Policy` (needs `connect-src` for Supabase + fonts) |
| S2 | No password-reset flow | Medium | Locked-out users have no recovery path |
| S3 | Client-side route guards are the only role gate for *navigation* | Low | RLS is the real control (verified), so this is UX only — do not "fix" by adding server checks that don't exist |
| S4 | Edge function `Access-Control-Allow-Origin: *` | Low | Acceptable: auth is a bearer JWT, no cookies, so CSRF is not applicable |
| S5 | No rate limiting on invites | Low | A coach could spam invite emails |
| S6 | Real project ref in `.env.example` (F11) | Low | Publishable key is safe by design; rotate if ever treated as secret |
| S7 | `conversations_admin_create` lets any member insert a conversation row directly | Low | Membership inserts are still constrained (`profile_id = auth.uid()` or admin), so impact is limited to orphan conversations |
| S8 | No MFA | Low | Not in the declared spec; mention only |

**Verdict on security: the authorization model is the strongest part of this codebase.** The gaps are hardening and recovery-flow issues, not broken access control. I found **no** evidence of a cross-tenant read/write path through the client.

---

## 8. Multilingual & RTL review

- `index.html` ships `lang="ar" dir="rtl"`; `App` updates both `document.documentElement.lang` and `.dir` from `preferred_language`. ✅
- `styles.css` uses **logical** properties (`margin-inline-start`, `inset-inline-end`, `padding-inline`) rather than left/right — RTL is structurally correct, not patched. ✅
- Font stack is `IBM Plex Sans Arabic` + `Inter` — appropriate for Arabic + Latin. Loaded via Google Fonts `@import` (F15).
- **66** `t()` keys across `ar/fr/en`, with a `words` dictionary in `App.tsx`.
- Gaps: hardcoded Arabic (F6); `src/lib/i18n.ts` unused duplicate (F5); `toLocaleString()` without locale (F19); Arabic-Indic digits not offered; no `hreflang`/per-language URL (SPA preference-based switching only — acceptable for a PWA).

---

## 9. Mobile responsiveness & PWA review

- Viewport meta includes `viewport-fit=cover`; `theme-color` set; Apple mobile web-app meta present. ✅
- `.app-shell { min-height: 100dvh }` — correct handling of mobile browser chrome. ✅
- Breakpoints: 760 px (nav collapses), 680 px (chat workspace restacks), 370 px (compact). Bottom/mobile navigation present. ✅
- Tables wrapped in overflow containers; `min-width: 320px` on body. ✅
- Tap targets: icon buttons are sized via CSS; several are visually small for thumbs — worth auditing at 390 px.
- PWA: manifest + 192/512 icons + apple-touch-icon + SW registered **only in production** (correct — avoids dev cache poisoning). SW is network-first with cache fallback to `/`, i.e. an **app-shell** strategy: installable and launchable offline, but **no offline data capture** (E4).
- Not verified in this audit: real-device rendering (no device available). Only static CSS analysis was possible.

---

## 10. Implementation plan

Constraints respected throughout: **no rebuild**, **no deletion of features or data**, **no SQL execution**, **no schema change without your explicit approval**, **no deploy**, **no merge into `main`**, work stays on `appjet`.

### Phase 0 — Make the repository checks green (no behaviour change)
| # | Task | Files | Acceptance |
|---|---|---|---|
| 0.1 | Add `.gitignore` | `.gitignore` (new) | `npm run verify` passes |
| 0.2 | Consolidate the two dictionaries: move the `words` object into `src/lib/i18n.ts` and import it in `App.tsx` | `src/lib/i18n.ts`, `src/App.tsx` | Identical strings, `npm run build` passes, no visual change |
| 0.3 | Remove unused imports | `src/App.tsx` | `tsc --noEmit` passes |

**Risk:** negligible. **Verification:** `npm run build && npm run verify`.

### Phase 1 — Correctness & UX defects (client-only, no DB change)
| # | Task | Acceptance |
|---|---|---|
| 1.1 | Distinct **rejected** state in the auth gate (F4) | Rejected account sees a rejected message, not "pending" |
| 1.2 | Scope report attendance counts by `coach_id` + label the admin aggregate (F3) | Coach sees own counts; admin sees an explicitly labelled institution total |
| 1.3 | Guard the attendance `(student_id, session_date)` conflict with a clear message instead of a raw RLS error (F2, interim until 4.1) | Second coach gets an explanatory error, no Postgres text |
| 1.4 | Password reset + change password (F7) | `resetPasswordForEmail` flow + a `/profile` page |
| 1.5 | Profile page: name, avatar (`trainer-avatars`), language (A9) | User can edit own profile; language persists |
| 1.6 | Member role change + remove/disable UI (F8, C10, C11) | Manager can change coach↔admin and deactivate, within RLS rules |
| 1.7 | Route all remaining strings through `t()` (F6) | Switching to `fr`/`en` shows no Arabic fragments |
| 1.8 | Replace `alert()` with inline/toast errors + retry (F13) | No `alert` remains in `src/` |
| 1.9 | Modal a11y: `role="dialog"`, focus trap, ESC, `aria-label` on icon buttons (F14) | Keyboard-only modal open/close works |
| 1.10 | Add CSP to `_headers` (F10) | App loads with CSP on; no console violations |
| 1.11 | Self-host fonts (F15) | No Google Fonts request |
| 1.12 | Bulk "mark all present" for attendance (D6) | One tap sets the class to present, still editable |

### Phase 2 — Complete DB-ready features (UI only, consumes existing tables)
| # | Task | Acceptance |
|---|---|---|
| 2.1 | Unread counts + badges using `message_reads` / `unread_counts` (D16) | Badge appears on `/messages` and in nav; clears on read |
| 2.2 | Read receipts (D17) | Sender sees read state |
| 2.3 | Group member add/remove (D15) | Admin/creator can manage members |
| 2.4 | Student note categories (C5) | Category selector persists `note_type` |
| 2.5 | Absence follow-ups UI (C16) | Follow-up list from `absence_followups`, acknowledge action |
| 2.6 | Chat pagination + search (F9) | Load older messages beyond 200; search within a conversation |
| 2.7 | Classes management + assign student to class (C6, C7) | Create class, assign students, filter by class |
| 2.8 | Offline attendance queue (E4) | Entries saved locally and flushed on reconnect |
| 2.9 | Push notifications (D19) | Opt-in, delivered when the app is closed |

### Phase 3 — Architecture, performance, quality gates
| # | Task | Acceptance |
|---|---|---|
| 3.1 | Split `App.tsx` into `pages/`, `components/`, `hooks/`, `lib/` | Each file < ~400 lines; behaviour identical |
| 3.2 | Route-level `React.lazy` code splitting (F12) | Initial JS chunk materially smaller than 448 kB |
| 3.3 | Vitest + React Testing Library: auth gate, `parseStudentPaste`, attendance upsert, role nav | `npm test` runs and fails on regressions |
| 3.4 | ESLint + Prettier committed, `npm run lint` (F17) | Lint passes |
| 3.5 | Plan the `react-router` 7.x upgrade separately (F16) | Dedicated PR, full manual regression pass |

### Phase 4 — Data-model changes (⚠️ requires your explicit written approval; I will not execute SQL)
| # | Task | Why |
|---|---|---|
| 4.1 | Add `shift_id` to `attendance_records` and to the unique key (F2) | Lets a student have two sessions/day; fixes the RLS-rejected second save |
| 4.2 | Consider `class_id` on attendance for class-level reporting | Reporting granularity |
| 4.3 | Verify `unread_counts` view matches the client's expected shape | Avoids a mismatch when Phase 2.1 lands |

Each Phase-4 item must ship as a **reviewed migration file**, applied by you, never by me in this session.

---

## 11. What I did NOT do (by your instruction)

- ❌ No application code changed (this report is the only added file)
- ❌ No SQL executed; `THE_TRAINERS_SETUP.sql` was read, never run
- ❌ No database or storage structure change
- ❌ No deployment
- ❌ No merge into `main` — work remains on `appjet`
- ❌ No feature deleted, no data touched
- ❌ No test result invented: §1 is the literal output of the commands

---

## 12. Limits of this audit

1. **The full specification is still missing.** §6 compares against the repo's self-declared spec. Send the document and I will produce the definitive gap matrix.
2. **`OwnerConsole`, `InstitutionSettings`, `Audit`** were verified at purpose/data-access/RLS level; terminal truncation means individual fields and branches were not exhaustively traced.
3. **No live Supabase project was queried** (you asked for no DB operations), so RLS behaviour is proven by reading policies, not by executing integration tests. A real RLS test suite is Phase 3.3 work.
4. **No device or browser rendering test** was run for this audit — mobile conclusions come from CSS/breakpoint analysis, not screenshots.
5. **Edge function not deployed/executed** — `invite-user` was reviewed as source only.

---

## 13. Recommended immediate next step

Phase 0 (0.1–0.3) is safe, tiny and reversible: it makes `npm run verify` pass, removes the duplicated dictionary, and touches no feature. I recommend approving Phase 0 plus Phase 1 items 1.1–1.3 (the three genuine correctness bugs) as the first implementation batch, and sending the specification document so §6 can be finalized before any feature work.
