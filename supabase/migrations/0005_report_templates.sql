-- 0005_report_templates.sql
-- ---------------------------------------------------------------------------
-- Report template builder + Word templates + Word export.
--
-- ADDITIVE ONLY. Nothing existing is dropped, renamed or rewritten; every
-- statement is `create ... if not exists` or `add column if not exists`, so it
-- is safe to run on a database that already holds live reports and students.
--
-- Run order: after 0001 → 0004. This migration is NOT executed automatically
-- and must be reviewed and run manually by the project owner.
-- ---------------------------------------------------------------------------

-- 1. Template (one row per template, current content) ------------------------
create table if not exists public.report_templates (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references public.institutions(id) on delete cascade,
  title              text not null,
  description        text,
  schema             jsonb not null default '{"sections":[]}'::jsonb,
  current_version    integer not null default 1,
  status             text not null default 'draft',
  docx_path          text,
  docx_placeholders  jsonb not null default '[]'::jsonb,
  mapping            jsonb not null default '{}'::jsonb,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'report_templates_status_check'
  ) then
    alter table public.report_templates
      add constraint report_templates_status_check
      check (status in ('draft', 'published', 'archived'));
  end if;
end $$;

create index if not exists report_templates_institution_idx
  on public.report_templates(institution_id, status, created_at desc);

-- 2. Immutable version snapshots --------------------------------------------
create table if not exists public.report_template_versions (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references public.report_templates(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  version        integer not null,
  title          text not null,
  description    text,
  schema         jsonb not null,
  docx_path      text,
  mapping        jsonb not null default '{}'::jsonb,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (template_id, version)
);

create index if not exists report_template_versions_template_idx
  on public.report_template_versions(template_id, version desc);

-- 3. Reports keep the template + answers they were filled with ---------------
alter table public.daily_reports
  add column if not exists template_id uuid references public.report_templates(id),
  add column if not exists template_version integer,
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists docx_path text;

create index if not exists daily_reports_template_idx
  on public.daily_reports(template_id, report_date desc);

-- 4. Authorization helpers ---------------------------------------------------
-- SECURITY DEFINER + fixed search_path so the policies cannot be bypassed by
-- shadowing public.profiles from another schema.
create or replace function public.report_tpl_is_member(target_institution uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.institution_id = target_institution
  );
$$;

create or replace function public.report_tpl_is_admin(target_institution uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.institution_id = target_institution
      and p.role in ('owner', 'manager', 'admin')
  );
$$;

revoke all on function public.report_tpl_is_member(uuid) from public;
revoke all on function public.report_tpl_is_admin(uuid) from public;
grant execute on function public.report_tpl_is_member(uuid) to authenticated;
grant execute on function public.report_tpl_is_admin(uuid) to authenticated;

-- 5. RLS ---------------------------------------------------------------------
alter table public.report_templates enable row level security;
alter table public.report_template_versions enable row level security;

-- Read: any member of the institution (coaches need the published form).
drop policy if exists report_templates_select_members on public.report_templates;
create policy report_templates_select_members on public.report_templates
  for select to authenticated
  using (public.report_tpl_is_member(institution_id));

-- Write: institution administrators only, and never for another institution.
drop policy if exists report_templates_insert_admins on public.report_templates;
create policy report_templates_insert_admins on public.report_templates
  for insert to authenticated
  with check (
    public.report_tpl_is_admin(institution_id)
    and created_by = auth.uid()
  );

drop policy if exists report_templates_update_admins on public.report_templates;
create policy report_templates_update_admins on public.report_templates
  for update to authenticated
  using (public.report_tpl_is_admin(institution_id))
  with check (public.report_tpl_is_admin(institution_id));

-- No DELETE policy on purpose: templates are archived, never destroyed, so a
-- report can always resolve the template version it was filled with.

drop policy if exists report_template_versions_select_members
  on public.report_template_versions;
create policy report_template_versions_select_members
  on public.report_template_versions
  for select to authenticated
  using (public.report_tpl_is_member(institution_id));

drop policy if exists report_template_versions_insert_admins
  on public.report_template_versions;
create policy report_template_versions_insert_admins
  on public.report_template_versions
  for insert to authenticated
  with check (
    public.report_tpl_is_admin(institution_id)
    and created_by = auth.uid()
  );

-- 6. Storage: DOCX templates live in the existing private trainer-media bucket
--    under <institution_id>/templates/. No public URL is ever produced.
drop policy if exists report_templates_storage_read on storage.objects;
create policy report_templates_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trainer-media'
    and (storage.foldername(name))[2] = 'templates'
    and public.report_tpl_is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists report_templates_storage_write on storage.objects;
create policy report_templates_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trainer-media'
    and (storage.foldername(name))[2] = 'templates'
    and public.report_tpl_is_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists report_templates_storage_update on storage.objects;
create policy report_templates_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'trainer-media'
    and (storage.foldername(name))[2] = 'templates'
    and public.report_tpl_is_admin(((storage.foldername(name))[1])::uuid)
  );

-- 7. Verification queries (run manually after applying) ----------------------
-- select count(*) from public.report_templates;
-- select column_name from information_schema.columns
--   where table_name = 'daily_reports' and column_name in
--   ('template_id','template_version','answers','docx_path');
-- select polname, polcmd from pg_policy
--   where polrelid in ('public.report_templates'::regclass,
--                      'public.report_template_versions'::regclass);

-- 8. Rollback (manual, only if this migration must be undone) ---------------
-- drop policy if exists report_templates_storage_update on storage.objects;
-- drop policy if exists report_templates_storage_write on storage.objects;
-- drop policy if exists report_templates_storage_read on storage.objects;
-- drop table if exists public.report_template_versions;
-- alter table public.daily_reports
--   drop column if exists template_id,
--   drop column if exists template_version,
--   drop column if exists answers,
--   drop column if exists docx_path;
-- drop table if exists public.report_templates;
-- drop function if exists public.report_tpl_is_member(uuid);
-- drop function if exists public.report_tpl_is_admin(uuid);
