-- ============================================================================
-- THE TRAINERS (تدرّب) — additive migration 0001
-- Fixes audit finding F2: a student cannot be recorded twice in one day.
--
-- PROBLEM
--   attendance_records had  unique(student_id, session_date)  with no session
--   dimension, while daily_reports carries shift_id. A student attending two
--   sessions on the same day therefore had only ONE legal row. The second
--   coach's insert hit the unique constraint; because the client used upsert,
--   it silently became an UPDATE of the FIRST coach's row, which RLS rejects
--   (the row's coach_id belongs to someone else). The coach saw a raw
--   Postgres error and the student's attendance could not be recorded.
--
-- FIX
--   Add a non-null session dimension and make the uniqueness rule
--   (student, date, session) instead of (student, date).
--
-- SAFETY
--   * Additive: one new column with a DEFAULT, so every existing row is valid
--     immediately. No existing row is updated, rewritten or deleted.
--   * The old constraint is located by definition, not by a guessed name, so
--     this works on any environment where it was created.
--   * Historical rows keep session_key = 'unspecified', which means "recorded
--     before sessions were distinguished". Their history is preserved exactly.
--   * No table, column, policy or record is dropped.
--
-- EXECUTION (owner action — not run by the application)
--   Supabase dashboard -> SQL Editor -> paste -> Run.
--   Or: supabase db push   (if this folder is linked to the project)
--   Preview the affected rows first:
--     select student_id, session_date, count(*)
--     from public.attendance_records
--     group by 1,2 having count(*) > 1;
--   (Expected: no rows, because the old constraint prevented duplicates.)
-- ============================================================================

begin;

-- 1. Session dimension. Non-null with a default so existing rows stay valid.
alter table public.attendance_records
  add column if not exists session_key text not null default 'unspecified';

comment on column public.attendance_records.session_key is
  'Session/shift identity for this attendance record. The client sets it to the '
  'open coach_shift id, or ''unspecified'' when no session is running. Allows a '
  'student to be recorded in more than one session on the same date.';

-- 2. Drop any unique constraint that only covers (student_id, session_date).
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.attendance_records'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%(student_id, session_date)%'
  loop
    execute format('alter table public.attendance_records drop constraint %I', c.conname);
    raise notice 'dropped old attendance uniqueness constraint: %', c.conname;
  end loop;
end $$;

-- 3. Same uniqueness guarantee, now per session.
create unique index if not exists attendance_records_session_unique
  on public.attendance_records (student_id, session_date, session_key);

-- 4. Reporting path: institution-wide attendance for a date range.
create index if not exists attendance_records_report_idx
  on public.attendance_records (institution_id, session_date);

commit;

-- ============================================================================
-- VERIFY AFTER RUNNING
--   -- column exists and is not null
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'attendance_records' and column_name = 'session_key';
--
--   -- the new uniqueness rule is in place
--   select indexname, indexdef from pg_indexes
--   where tablename = 'attendance_records';
--
--   -- no historical row was lost
--   select count(*) from public.attendance_records;
--
-- ROLLBACK (only if required; preserves data)
--   drop index if exists public.attendance_records_session_unique;
--   alter table public.attendance_records drop column if exists session_key;
--   -- then recreate the previous rule:
--   alter table public.attendance_records
--     add constraint attendance_records_student_id_session_date_key
--     unique (student_id, session_date);
--   NOTE: the rollback will fail if a student already has two sessions on the
--   same date. That is expected — it proves the fix is needed.
-- ============================================================================
