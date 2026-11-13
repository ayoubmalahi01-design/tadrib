# THE TRAINERS (تدرّب) — Database Requirements

Existing Supabase project only. **No new Supabase project, no schema rewrite, no
destructive statement.** This document lists what the application uses today and
the single pending additive migration.

---

## 1. Pending migration — must be executed by the owner

`supabase/migrations/0001_attendance_session_dimension.sql`

**Status: written, reviewed, NOT executed against any database.**

What it does:

1. `alter table public.attendance_records add column if not exists session_key text not null default 'unspecified';`
2. Drops any unique constraint whose definition is exactly `(student_id, session_date)`,
   found by inspecting `pg_constraint` rather than by guessing its name.
3. Creates `attendance_records_session_unique` on `(student_id, session_date, session_key)`.
4. Creates `attendance_records_report_idx` on `(institution_id, session_date)`.
5. Runs inside a single `begin; … commit;`.

Safety properties:

- **Additive only.** One new column with a default; every existing row is valid
  the moment the statement completes.
- **No row is updated, rewritten or deleted.** Historical attendance keeps
  `session_key = 'unspecified'`, meaning "recorded before sessions were
  distinguished".
- **No table, column, policy or bucket is dropped.**
- The migration is idempotent (`if not exists` / `if exists` guards).

How to execute (choose one):

- Supabase Dashboard → SQL Editor → paste the file → Run.
- `supabase db push` if this folder is linked to the project.

Recommended pre-check (expected: no rows, because the old constraint prevented
duplicates):

```sql
select student_id, session_date, count(*)
from public.attendance_records
group by 1,2 having count(*) > 1;
```

Post-check:

```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_name = 'attendance_records' and column_name = 'session_key';

select indexname, indexdef from pg_indexes where tablename = 'attendance_records';

select count(*) from public.attendance_records;   -- no history lost
```

Rollback (data-preserving, but will fail if a student already has two sessions on
one date — which is itself proof the fix was needed):

```sql
drop index if exists public.attendance_records_session_unique;
alter table public.attendance_records drop column if exists session_key;
alter table public.attendance_records
  add constraint attendance_records_student_id_session_date_key
  unique (student_id, session_date);
```

**Until this migration runs**, the client detects the missing column and writes
attendance in the previous two-column shape, reporting
`migrationRequired: true`. The application is therefore deployable before or
after the migration; only multi-session-per-day becomes possible after it.

---

## 2. Tables used by the application (18)

| Table | Purpose | Access expectation |
| --- | --- | --- |
| `institutions` | Tenant record, name, logo reference, settings | Members read own institution; admins update; platform owner manages all |
| `profiles` | User record, role, `account_status`, institution link | Self read; admins read institution; `guard_profile_privileges` blocks self-promotion |
| `students` | Student register, unique student number, class | Institution-scoped; admin manages; coach reads assigned |
| `classes` | Groups / classes | Institution-scoped |
| `attendance_records` | One row per student per session | Coach writes own; admins read institution; **uniqueness pending migration 0001** |
| `coach_shifts` | Open/closed shifts; provides `session_key` | Coach owns own shifts |
| `coach_notebooks` | **Private** trainer notes | Author-only (`coach_id = auth.uid()`); excluded from audit snapshots |
| `student_notes` | Student follow-up notes | Author + authorized admins |
| `student_medical_records` | Medical information | **Institution administrators only** |
| `absence_followups` | Follow-up tracking for absences | `track_absence_followup`, `mark_followup_handled` |
| `daily_reports` | Daily trainer reports, draft → submitted → reviewed | Author writes; admins review; `lock_final_report` makes finalized reports immutable |
| `conversations` | Direct and group conversations | `create_conversation`; membership required |
| `conversation_members` | Membership and access control | `is_conversation_member`, `is_active_member` |
| `messages` | Text, image, file and voice messages | Read/insert both require membership |
| `message_reads` | Read receipts | `mark_conversation_read`, `unread_counts` |
| `notifications` | In-app notifications | `guard_notification_update` limits updates |
| `admin_notices` | Institutional announcements | Admins publish; `notify_new_notice` generates notifications |
| `audit_logs` | Accountability trail | `write_audit_log`; protected from unauthorized modification |

## 3. Storage buckets (4)

| Bucket | Contents | Access expectation |
| --- | --- | --- |
| `institutions` | Institution logos | Public read for branding, admin write |
| `trainer-avatars` | Profile pictures | Owner write |
| `trainer-media` | Message attachments, images, voice notes | Read requires conversation membership (`is_conversation_member`) |
| `trainer-medical` | Medical attachments | Private; institution administrators only |

## 4. Database functions the client depends on

`create_conversation`, `current_app_role`, `current_institution_id`,
`guard_notification_update`, `guard_profile_privileges`, `handle_new_auth_user`,
`is_active_member`, `is_conversation_member`, `is_institution_admin`,
`is_platform_owner`, `lock_final_report`, `mark_conversation_read`,
`mark_followup_handled`, `my_profile`, `notify_new_notice`,
`notify_submitted_report`, `set_updated_at`, `track_absence_followup`,
`unread_counts`, `write_audit_log`.

These are the server-side enforcement points. The client hides buttons, but
**authorization lives here** — the UI is not the security boundary.

## 5. Known schema gaps / follow-ups

- **Multi-session attendance** — closed by migration 0001 (pending execution).
- **Session dimension in reports** — `daily_reports` already carries `shift_id`;
  aligning it with `attendance_records.session_key` is a reasonable follow-up but
  is **not** required for correctness today and was not changed.
- No other additive migration was identified as necessary for the defects fixed
  in this round.

## 6. Rules that were respected

- No SQL was executed against any database.
- No table, column, policy, bucket or record was dropped or renamed.
- No duplicate table or duplicate feature was introduced.
- The existing Supabase project was not replaced.
