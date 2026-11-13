-- THE TRAINERS (تدرّب) — additive migration 0002
-- Purpose: notify institution administrators when a *saved draft* report is
--          submitted, i.e. finalized through an UPDATE rather than an INSERT.
--
-- Context
-- -------
-- `THE_TRAINERS_SETUP.sql` installs:
--
--   create trigger daily_report_notify after insert on public.daily_reports
--     for each row when (new.is_finalized = true)
--     execute function public.notify_submitted_report();
--
-- That trigger only fires on INSERT. Since the D8 draft workflow lets a coach
-- save a draft (status 'draft', is_finalized = false) and submit it later, the
-- final submission is an UPDATE and therefore produced no administrator
-- notification at all.
--
-- What this migration does
-- ------------------------
-- Adds ONE extra trigger that reuses the existing `notify_submitted_report()`
-- function, firing only on the false -> true transition of `is_finalized`. It
-- creates no table, column, policy or function of its own and touches no data,
-- so it is safe to apply on a live database and safe to re-run.
--
-- How to run
-- ----------
-- Supabase Dashboard -> SQL Editor -> paste this file -> Run, or:
--   psql "$DATABASE_URL" -f supabase/migrations/0002_report_draft_submit_notify.sql
--
-- Rollback
-- --------
--   drop trigger if exists daily_report_notify_update on public.daily_reports;
--
-- Verification after running
-- --------------------------
--   select tgname from pg_trigger
--    where tgrelid = 'public.daily_reports'::regclass and not tgisinternal;
--   -- expect: daily_report_lock, daily_report_notify, daily_report_notify_update
--
-- Then: as a coach, save a draft report and submit it; the institution's
-- administrators should receive one `notifications` row (not two).

begin;

drop trigger if exists daily_report_notify_update on public.daily_reports;

create trigger daily_report_notify_update
  after update on public.daily_reports
  for each row
  when (new.is_finalized = true and old.is_finalized = false)
  execute function public.notify_submitted_report();

commit;
