-- 0004 — report review workflow + notice audience/archive
-- ADDITIVE ONLY. Safe to re-run. Does not delete or rewrite any row.
-- Not executed against production: apply manually after review.

-- ---------------------------------------------------------------------------
-- 1. daily_reports: richer review states
-- ---------------------------------------------------------------------------
alter table public.daily_reports
  add column if not exists submitted_at timestamptz,
  add column if not exists changes_requested_at timestamptz,
  add column if not exists review_note text;

-- Backfill the submission timestamp from the existing lifecycle columns.
update public.daily_reports
   set submitted_at = coalesce(finalized_at, updated_at)
 where submitted_at is null
   and (is_finalized or status in ('submitted', 'reviewed'));

-- Widen the status domain. The old inline check is replaced, not the table.
do $$
begin
  alter table public.daily_reports drop constraint if exists daily_reports_status_check;
  alter table public.daily_reports
    add constraint daily_reports_status_check
    check (status in ('draft', 'submitted', 'under_review', 'reviewed', 'needs_changes'));
end $$;

create index if not exists reports_status_idx
  on public.daily_reports(institution_id, status, report_date desc);

-- A coach may edit their own report only while it is a draft or returned.
-- Administrators keep read access; they never edit the coach's content.
drop policy if exists reports_update_own_draft on public.daily_reports;
create policy reports_update_own_draft on public.daily_reports
  for update using (
    coach_id = auth.uid()
    and status in ('draft', 'needs_changes')
  )
  with check (
    coach_id = auth.uid()
    and status in ('draft', 'submitted')
  );

-- ---------------------------------------------------------------------------
-- 2. Notify the coach when a review changes the state of their report
-- ---------------------------------------------------------------------------
create or replace function public.notify_report_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body  text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status not in ('reviewed', 'needs_changes') then
    return new;
  end if;

  v_title := case new.status
    when 'reviewed' then 'تقريرك تمت مراجعته'
    else 'تقريرك يحتاج إلى تعديل'
  end;
  v_body := coalesce(nullif(new.review_note, ''), new.report_date::text);

  insert into public.notifications (institution_id, recipient_id, title, body, notification_type)
  values (new.institution_id, new.coach_id, v_title, v_body, 'report');

  return new;
end $$;

drop trigger if exists trg_notify_report_review on public.daily_reports;
create trigger trg_notify_report_review
  after update of status on public.daily_reports
  for each row execute function public.notify_report_review();

-- ---------------------------------------------------------------------------
-- 3. admin_notices: audience, archive and optional attachment
-- ---------------------------------------------------------------------------
alter table public.admin_notices
  add column if not exists audience text not null default 'all',
  add column if not exists archived_at timestamptz,
  add column if not exists attachment_path text;

do $$
begin
  alter table public.admin_notices drop constraint if exists admin_notices_audience_check;
  alter table public.admin_notices
    add constraint admin_notices_audience_check
    check (audience in ('all', 'coaches', 'admins'));
end $$;

create index if not exists notices_live_idx
  on public.admin_notices(institution_id, is_published, published_at desc);

-- ---------------------------------------------------------------------------
-- 4. Rollback (manual, only if this migration must be undone)
-- ---------------------------------------------------------------------------
-- drop trigger if exists trg_notify_report_review on public.daily_reports;
-- drop function if exists public.notify_report_review();
-- alter table public.daily_reports drop constraint if exists daily_reports_status_check;
-- alter table public.daily_reports add constraint daily_reports_status_check
--   check (status in ('draft', 'submitted', 'reviewed'));
-- alter table public.daily_reports
--   drop column if exists submitted_at,
--   drop column if exists changes_requested_at,
--   drop column if exists review_note;
-- alter table public.admin_notices
--   drop column if exists audience,
--   drop column if exists archived_at,
--   drop column if exists attachment_path;
-- (Rows are preserved: the rollback only removes the added columns and states.)
