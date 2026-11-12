-- THE TRAINERS / TADARRAB — production-oriented fresh-project schema
-- Run ONLY in a NEW, dedicated Supabase project. Never run in Sport Performance.
-- Owner bootstrap email: ayoubmalleh772@gmail.com
begin;
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('owner','manager','admin','coach');
exception when duplicate_object then null; end $$;

create table if not exists public.institutions (
 id uuid primary key default gen_random_uuid(), name text not null,
 logo_path text, phone text, email text, address text,
 default_language text not null default 'ar' check(default_language in ('ar','fr','en')),
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 institution_id uuid references public.institutions(id) on delete restrict,
 full_name text not null default '', email text not null default '',
 role public.app_role not null default 'coach',
 account_status text not null default 'pending' check(account_status in ('pending','active','suspended')),
 preferred_language text not null default 'ar' check(preferred_language in ('ar','fr','en')),
 phone text, avatar_path text, created_by uuid references public.profiles(id),
 approved_by uuid references public.profiles(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((role='owner' and institution_id is null) or (role<>'owner' and institution_id is not null) or (account_status='pending' and institution_id is null))
);
create index if not exists profiles_institution_role on public.profiles(institution_id,role,account_status);

create table if not exists public.classes (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 name text not null, academic_year text, description text, created_at timestamptz not null default now(),
 unique(institution_id,name,academic_year)
);
create table if not exists public.students (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 class_id uuid references public.classes(id) on delete set null, student_code text not null, full_name text not null,
 date_of_birth date, gender text check(gender in ('female','male','other')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(institution_id,student_code)
);
create index if not exists students_name_search on public.students(institution_id,full_name);
create table if not exists public.student_medical_records (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 record_type text not null check(record_type in ('medical','injury','exemption','permission','other')),
 details text not null, start_date date, end_date date, attachment_path text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.coach_shifts (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 coach_id uuid not null references public.profiles(id) on delete restrict,
 started_at timestamptz not null default now(), ended_at timestamptz,
 notes text, created_at timestamptz not null default now(), check(ended_at is null or ended_at>=started_at)
);
create unique index if not exists one_open_shift_per_coach on public.coach_shifts(coach_id) where ended_at is null;
create table if not exists public.daily_reports (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 coach_id uuid not null references public.profiles(id) on delete restrict, shift_id uuid references public.coach_shifts(id) on delete set null,
 coach_name_snapshot text not null, report_date date not null default current_date,
 shift_start timestamptz, shift_end timestamptz,
 present_count int not null default 0 check(present_count>=0), absent_count int not null default 0 check(absent_count>=0),
 late_count int not null default 0 check(late_count>=0), injured_count int not null default 0 check(injured_count>=0),
 excused_count int not null default 0 check(excused_count>=0), notes text,
 status text not null default 'draft' check(status in ('draft','submitted','reviewed')),
 is_finalized boolean not null default false, finalized_at timestamptz, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists reports_coach_date on public.daily_reports(coach_id,report_date desc);
create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 coach_id uuid not null references public.profiles(id) on delete restrict,
 session_date date not null default current_date,
 status text not null check(status in ('present','absent','late','excused','medical_exemption','permission')),
 reason text, recorded_at timestamptz not null default now(),
 unique(student_id,session_date)
);
create index if not exists attendance_date_idx on public.attendance_records(institution_id,session_date desc);
create table if not exists public.student_notes (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 note_type text not null default 'general' check(note_type in ('general','behavior','discipline','progress','other')),
 body text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coach_notebooks (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 coach_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text not null default '', entry_date date not null default current_date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.admin_notices (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete restrict,
 title text not null, body text not null, is_published boolean not null default true,
 published_at timestamptz default now(), created_at timestamptz not null default now()
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 title text, conversation_type text not null default 'group' check(conversation_type in ('group','direct')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(conversation_id,profile_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id) on delete cascade,
 conversation_id uuid references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete restrict,
 body text, message_type text not null default 'text' check(message_type in ('text','image','audio','file')),
 media_path text, created_at timestamptz not null default now(),
 check((message_type='text' and nullif(trim(body),'') is not null) or (message_type<>'text' and media_path is not null))
);
create index if not exists messages_institution_created on public.messages(institution_id,created_at desc);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), institution_id uuid references public.institutions(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text not null, notification_type text not null default 'general',
 read_at timestamptz, created_at timestamptz not null default now()
);
create or replace function public.notify_new_notice() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$ begin
 insert into public.notifications(institution_id,recipient_id,title,body,notification_type)
 select new.institution_id,p.id,new.title,new.body,'notice'
 from public.profiles p where p.institution_id=new.institution_id and p.account_status='active' and p.id<>new.author_id;
 return new;
end $$;
drop trigger if exists admin_notice_notify on public.admin_notices;
create trigger admin_notice_notify after insert on public.admin_notices for each row when (new.is_published=true) execute function public.notify_new_notice();
create or replace function public.notify_submitted_report() returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
 insert into public.notifications(institution_id,recipient_id,title,body,notification_type)
 select new.institution_id,p.id,'Daily report submitted',new.coach_name_snapshot||' submitted a report for '||new.report_date::text,'report'
 from public.profiles p where p.institution_id=new.institution_id and p.account_status='active' and p.role in ('manager','admin');
 return new;
end $$;
drop trigger if exists daily_report_notify on public.daily_reports;
create trigger daily_report_notify after insert on public.daily_reports for each row when (new.is_finalized=true) execute function public.notify_submitted_report();

create table if not exists public.audit_logs (
 id bigint generated always as identity primary key, institution_id uuid references public.institutions(id) on delete set null,
 actor_id uuid references public.profiles(id) on delete set null, action text not null,
 table_name text not null, record_id text, old_data jsonb, new_data jsonb,
 created_at timestamptz not null default now()
);
create index if not exists audit_institution_created on public.audit_logs(institution_id,created_at desc);

-- Identity and authorization helpers. SECURITY DEFINER functions have fixed search_path.
create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path=public,pg_temp
as $$ select p from public.profiles p where p.id=auth.uid() and p.account_status='active' limit 1 $$;
create or replace function public.current_institution_id() returns uuid
language sql stable security definer set search_path=public,pg_temp
as $$ select institution_id from public.profiles where id=auth.uid() and account_status='active' $$;
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path=public,pg_temp
as $$ select role from public.profiles where id=auth.uid() and account_status='active' $$;
create or replace function public.is_platform_owner() returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='owner' and account_status='active') $$;
create or replace function public.is_institution_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select public.current_app_role() in ('manager','admin','owner') $$;
create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.profiles where id=auth.uid() and account_status='active') $$;
create or replace function public.is_conversation_member(cid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.conversation_members cm where cm.conversation_id=cid and cm.profile_id=auth.uid()) $$;

-- Any active institution member can start a direct or group chat; membership is created atomically.
create or replace function public.create_conversation(p_title text default null,p_member_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_institution uuid; v_id uuid; v_type text; v_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select institution_id into v_institution from public.profiles where id=auth.uid() and account_status='active';
 if v_institution is null then raise exception 'Active institution membership required'; end if;
 select count(distinct x) into v_count from unnest(coalesce(p_member_ids,'{}'::uuid[])) x where x<>auth.uid();
 if v_count<1 then raise exception 'Select at least one other member'; end if;
 if v_count>100 then raise exception 'A conversation can have at most 100 other members'; end if;
 if exists(select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) x left join public.profiles p on p.id=x and p.institution_id=v_institution and p.account_status='active' where x<>auth.uid() and p.id is null) then
  raise exception 'Every participant must be an active member of your institution';
 end if;
 v_type:=case when v_count=1 and nullif(trim(coalesce(p_title,'')),'') is null then 'direct' else 'group' end;
 insert into public.conversations(institution_id,title,conversation_type,created_by) values(v_institution,nullif(trim(coalesce(p_title,'')),''),v_type,auth.uid()) returning id into v_id;
 insert into public.conversation_members(conversation_id,profile_id) values(v_id,auth.uid()) on conflict do nothing;
 insert into public.conversation_members(conversation_id,profile_id) select v_id,x from unnest(coalesce(p_member_ids,'{}'::uuid[])) x on conflict do nothing;
 return v_id;
end $$;

-- Owner bootstrap: only the specified email receives the platform-owner role.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_role public.app_role; begin
 v_role := case when lower(new.email)='ayoubmalleh772@gmail.com' then 'owner'::public.app_role else 'coach'::public.app_role end;
 insert into public.profiles(id,email,full_name,role,institution_id,account_status)
 values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),v_role,null,
 case when v_role='owner' then 'active' else 'pending' end)
 on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Protect role, institution and activation fields from self-promotion.
create or replace function public.guard_profile_privileges() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$ declare actor_role public.app_role; begin
 if auth.uid() is null then return new; end if;
 if old.id=auth.uid() then
  if new.role is distinct from old.role or new.institution_id is distinct from old.institution_id or new.account_status is distinct from old.account_status or new.email is distinct from old.email or new.created_by is distinct from old.created_by or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
   raise exception 'You cannot change your own role, institution or account status';
  end if;
 elsif not public.is_platform_owner() then
  actor_role:=public.current_app_role();
  if actor_role not in ('manager','admin') or (old.institution_id is distinct from public.current_institution_id() and not (old.institution_id is null and old.account_status='pending')) then raise exception 'Insufficient permission'; end if;
  if actor_role='admin' and old.role<>'coach' then raise exception 'Admins can manage coach accounts only'; end if;
  if new.email is distinct from old.email or new.created_by is distinct from old.created_by then raise exception 'Protected profile fields'; end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) and not (old.account_status='pending' and new.account_status='active' and new.approved_by=auth.uid()) then raise exception 'Approval fields can only be set during approval'; end if;
  if new.institution_id is distinct from public.current_institution_id() then raise exception 'Cannot move account to another institution'; end if;
  if new.role in ('owner','manager') or (new.role='admin' and actor_role<>'manager') then raise exception 'Cannot assign this role'; end if;
  if old.account_status='pending' and new.account_status='active' and not (new.role='coach' or (new.role='admin' and actor_role='manager')) then raise exception 'Cannot approve this role'; end if;
  if old.role in ('owner','manager') then raise exception 'Protected account'; end if;
 end if;
 return new;
end $$;
drop trigger if exists profiles_privilege_guard on public.profiles;
create trigger profiles_privilege_guard before update on public.profiles for each row execute function public.guard_profile_privileges();

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public,pg_temp
as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['institutions','profiles','students','student_notes','coach_notebooks','daily_reports'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_set_updated_at',t);
 execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',t||'_set_updated_at',t);
end loop; end $$;

-- Audit selected business-table mutations, storing before/after snapshots.
create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_old jsonb; v_new jsonb; v_inst uuid; v_id text; begin
 if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
 -- Medical details are deliberately redacted from the platform-wide audit view.
 if tg_table_name='student_medical_records' then
  if v_old is not null then v_old:=jsonb_set(v_old,'{details}','"[REDACTED]"'::jsonb,true); end if;
  if v_new is not null then v_new:=jsonb_set(v_new,'{details}','"[REDACTED]"'::jsonb,true); end if;
 elsif tg_table_name='student_notes' then
  if v_old is not null then v_old:=jsonb_set(v_old,'{body}','"[REDACTED]"'::jsonb,true); end if;
  if v_new is not null then v_new:=jsonb_set(v_new,'{body}','"[REDACTED]"'::jsonb,true); end if;
 elsif tg_table_name='daily_reports' then
  if v_old is not null then v_old:=jsonb_set(v_old,'{notes}','"[REDACTED]"'::jsonb,true); end if;
  if v_new is not null then v_new:=jsonb_set(v_new,'{notes}','"[REDACTED]"'::jsonb,true); end if;
 elsif tg_table_name='students' then
  if v_old is not null then v_old:=v_old-'date_of_birth'; end if;
  if v_new is not null then v_new:=v_new-'date_of_birth'; end if;
 end if;
 if tg_table_name='institutions' then v_inst:=coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid); else v_inst:=coalesce((v_new->>'institution_id')::uuid,(v_old->>'institution_id')::uuid); end if;
 v_id:=coalesce(v_new->>'id',v_old->>'id');
 insert into public.audit_logs(institution_id,actor_id,action,table_name,record_id,old_data,new_data)
 values(v_inst,auth.uid(),tg_op,tg_table_name,v_id,v_old,v_new);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin foreach t in array array['institutions','students','coach_shifts','daily_reports','attendance_records','student_medical_records','student_notes','admin_notices','profiles'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_audit',t);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t||'_audit',t);
end loop; end $$;

-- Coaches cannot edit finalized reports; institution administrators may only mark them reviewed.
create or replace function public.lock_final_report() returns trigger language plpgsql set search_path=public,pg_temp
as $$ begin
 if old.is_finalized then
  if public.current_app_role() in ('manager','admin')
     and new.id is not distinct from old.id
     and new.institution_id is not distinct from old.institution_id
     and new.coach_id is not distinct from old.coach_id
     and new.shift_id is not distinct from old.shift_id
     and new.coach_name_snapshot is not distinct from old.coach_name_snapshot
     and new.report_date is not distinct from old.report_date
     and new.shift_start is not distinct from old.shift_start
     and new.shift_end is not distinct from old.shift_end
     and new.present_count is not distinct from old.present_count
     and new.absent_count is not distinct from old.absent_count
     and new.late_count is not distinct from old.late_count
     and new.injured_count is not distinct from old.injured_count
     and new.excused_count is not distinct from old.excused_count
     and new.notes is not distinct from old.notes
     and new.is_finalized is true and new.finalized_at is not distinct from old.finalized_at
     and new.status='reviewed' and new.reviewed_by=auth.uid() and new.reviewed_at is not null then
    return new;
  end if;
  raise exception 'Finalized reports are immutable';
 end if;
 if new.is_finalized and new.finalized_at is null then new.finalized_at=now(); end if;
 return new;
end $$;
drop trigger if exists daily_report_lock on public.daily_reports;
create trigger daily_report_lock before update on public.daily_reports for each row execute function public.lock_final_report();

-- Enable RLS on every tenant/private table.
do $$ declare t text; begin foreach t in array array['institutions','profiles','classes','students','student_medical_records','coach_shifts','daily_reports','attendance_records','student_notes','coach_notebooks','admin_notices','conversations','conversation_members','messages','notifications','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
end loop; end $$;

-- Platform owner can see/manage institutions. Members only see their own institution.
create policy institutions_select on public.institutions for select to authenticated using(id=public.current_institution_id() or public.is_platform_owner());
create policy institutions_owner_insert on public.institutions for insert to authenticated with check(public.is_platform_owner());
create policy institutions_owner_update on public.institutions for update to authenticated using(public.is_platform_owner()) with check(public.is_platform_owner());
create policy institutions_manager_update on public.institutions for update to authenticated using(id=public.current_institution_id() and public.current_app_role() in ('manager','admin')) with check(id=public.current_institution_id() and public.current_app_role() in ('manager','admin'));
create policy profiles_select on public.profiles for select to authenticated using(id=auth.uid() or public.is_platform_owner() or (institution_id=public.current_institution_id() and public.is_active_member()));
create policy profiles_update_self_safe on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy profiles_admin_update on public.profiles for update to authenticated using(public.is_platform_owner() or ((institution_id=public.current_institution_id() or (institution_id is null and account_status='pending')) and public.current_app_role() in ('manager','admin'))) with check(public.is_platform_owner() or (institution_id=public.current_institution_id() and role not in ('owner','manager')));
create policy profiles_owner_insert on public.profiles for insert to authenticated with check(public.is_platform_owner());

-- Common institution read policies.
create policy classes_read on public.classes for select to authenticated using(institution_id=public.current_institution_id());
create policy classes_admin_write on public.classes for all to authenticated using(institution_id=public.current_institution_id() and public.is_institution_admin()) with check(institution_id=public.current_institution_id() and public.is_institution_admin());
create policy students_read on public.students for select to authenticated using(institution_id=public.current_institution_id());
create policy students_admin_write on public.students for all to authenticated using(institution_id=public.current_institution_id() and public.is_institution_admin()) with check(institution_id=public.current_institution_id() and public.is_institution_admin());
create policy medical_admin_read on public.student_medical_records for select to authenticated using(institution_id=public.current_institution_id() and public.is_institution_admin());
create policy medical_admin_insert on public.student_medical_records for insert to authenticated with check(institution_id=public.current_institution_id() and public.is_institution_admin() and created_by=auth.uid());
create policy medical_admin_update on public.student_medical_records for update to authenticated using(institution_id=public.current_institution_id() and public.is_institution_admin()) with check(institution_id=public.current_institution_id() and public.is_institution_admin());
create policy medical_admin_delete on public.student_medical_records for delete to authenticated using(institution_id=public.current_institution_id() and public.is_institution_admin());
create policy shifts_read_own_admin on public.coach_shifts for select to authenticated using(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin()));
create policy shifts_insert_own on public.coach_shifts for insert to authenticated with check(institution_id=public.current_institution_id() and coach_id=auth.uid() and public.current_app_role()='coach');
create policy shifts_update_own_admin on public.coach_shifts for update to authenticated using(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin())) with check(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin()));
create policy reports_read_own_admin on public.daily_reports for select to authenticated using(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin()));
create policy reports_insert_own on public.daily_reports for insert to authenticated with check(institution_id=public.current_institution_id() and coach_id=auth.uid() and public.current_app_role()='coach');
create policy reports_update_own_draft on public.daily_reports for update to authenticated using(institution_id=public.current_institution_id() and coach_id=auth.uid() and not is_finalized) with check(institution_id=public.current_institution_id() and coach_id=auth.uid());
create policy reports_admin_review on public.daily_reports for update to authenticated using(institution_id=public.current_institution_id() and public.current_app_role() in ('manager','admin') and is_finalized) with check(institution_id=public.current_institution_id() and public.current_app_role() in ('manager','admin') and is_finalized);
create policy attendance_read_own_admin on public.attendance_records for select to authenticated using(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin()));
create policy attendance_insert_member on public.attendance_records for insert to authenticated with check(institution_id=public.current_institution_id() and coach_id=auth.uid());
create policy attendance_update_own_admin on public.attendance_records for update to authenticated using(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin())) with check(institution_id=public.current_institution_id() and (coach_id=auth.uid() or public.is_institution_admin()));
create policy student_notes_read_author_admin on public.student_notes for select to authenticated using(institution_id=public.current_institution_id() and (author_id=auth.uid() or public.is_institution_admin()));
create policy student_notes_insert_self on public.student_notes for insert to authenticated with check(institution_id=public.current_institution_id() and author_id=auth.uid());
create policy student_notes_update_self_admin on public.student_notes for update to authenticated using(institution_id=public.current_institution_id() and (author_id=auth.uid() or public.is_institution_admin())) with check(institution_id=public.current_institution_id() and (author_id=auth.uid() or public.is_institution_admin()));
create policy notebook_private_all on public.coach_notebooks for all to authenticated using(institution_id=public.current_institution_id() and coach_id=auth.uid()) with check(institution_id=public.current_institution_id() and coach_id=auth.uid());
create policy notices_read on public.admin_notices for select to authenticated using(institution_id=public.current_institution_id() and (is_published or public.is_institution_admin()));
create policy notices_admin_write on public.admin_notices for all to authenticated using(institution_id=public.current_institution_id() and public.is_institution_admin()) with check(institution_id=public.current_institution_id() and public.is_institution_admin() and author_id=auth.uid());
create policy conversations_read_member on public.conversations for select to authenticated using(institution_id=public.current_institution_id() and public.is_conversation_member(id));
create policy conversations_admin_create on public.conversations for insert to authenticated with check(institution_id=public.current_institution_id() and created_by=auth.uid());
create policy conversation_members_read on public.conversation_members for select to authenticated using(public.is_conversation_member(conversation_id) or public.is_institution_admin());
create policy conversation_members_admin_add on public.conversation_members for insert to authenticated with check(exists(select 1 from public.conversations c where c.id=conversation_id and c.institution_id=public.current_institution_id()) and exists(select 1 from public.profiles p where p.id=profile_id and p.institution_id=public.current_institution_id()) and (profile_id=auth.uid() or public.is_institution_admin()));
create policy messages_read_member on public.messages for select to authenticated using(institution_id=public.current_institution_id() and conversation_id is not null and public.is_conversation_member(conversation_id));
create policy messages_insert_member on public.messages for insert to authenticated with check(institution_id=public.current_institution_id() and sender_id=auth.uid() and conversation_id is not null and public.is_conversation_member(conversation_id));
create policy notifications_read_own on public.notifications for select to authenticated using(recipient_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create or replace function public.guard_notification_update() returns trigger language plpgsql set search_path=public,pg_temp
as $$ begin if new.recipient_id is distinct from old.recipient_id or new.institution_id is distinct from old.institution_id or new.title is distinct from old.title or new.body is distinct from old.body or new.notification_type is distinct from old.notification_type or new.created_at is distinct from old.created_at then raise exception 'Notification content is immutable'; end if; return new; end $$;
drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard before update on public.notifications for each row execute function public.guard_notification_update();
create policy audit_read_admin on public.audit_logs for select to authenticated using((public.is_platform_owner() and table_name='institutions') or (institution_id=public.current_institution_id() and public.is_institution_admin()));

-- Private object storage. Use institution UUID as first folder and user UUID as second.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('trainer-media','trainer-media',false,26214400,array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','application/pdf']),
 ('trainer-avatars','trainer-avatars',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('trainer-medical','trainer-medical',false,26214400,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;
create policy trainer_media_read on storage.objects for select to authenticated using((bucket_id='trainer-avatars' and (storage.foldername(name))[1]=public.current_institution_id()::text) or (bucket_id='trainer-media' and (storage.foldername(name))[1]=public.current_institution_id()::text and exists(select 1 from public.messages m where m.media_path=name and m.conversation_id is not null and public.is_conversation_member(m.conversation_id))));
create policy trainer_media_upload on storage.objects for insert to authenticated with check(bucket_id='trainer-media' and (storage.foldername(name))[1]=public.current_institution_id()::text and (storage.foldername(name))[3]=auth.uid()::text and exists(select 1 from public.conversations c where c.id::text=(storage.foldername(name))[2] and c.institution_id=public.current_institution_id() and public.is_conversation_member(c.id)));
create policy trainer_media_delete_own on storage.objects for delete to authenticated using(bucket_id='trainer-media' and (storage.foldername(name))[1]=public.current_institution_id()::text and (storage.foldername(name))[3]=auth.uid()::text and exists(select 1 from public.messages m where m.media_path=name and m.sender_id=auth.uid()));
create policy trainer_avatar_upload on storage.objects for insert to authenticated with check(bucket_id='trainer-avatars' and (storage.foldername(name))[1]=public.current_institution_id()::text and (storage.foldername(name))[2]=auth.uid()::text);
create policy trainer_avatar_update on storage.objects for update to authenticated using(bucket_id='trainer-avatars' and (storage.foldername(name))[1]=public.current_institution_id()::text and (storage.foldername(name))[2]=auth.uid()::text) with check(bucket_id='trainer-avatars' and (storage.foldername(name))[1]=public.current_institution_id()::text and (storage.foldername(name))[2]=auth.uid()::text);
create policy trainer_medical_admin_read on storage.objects for select to authenticated using(bucket_id='trainer-medical' and (storage.foldername(name))[1]=public.current_institution_id()::text and public.is_institution_admin());
create policy trainer_medical_admin_upload on storage.objects for insert to authenticated with check(bucket_id='trainer-medical' and (storage.foldername(name))[1]=public.current_institution_id()::text and (storage.foldername(name))[2]=auth.uid()::text and public.is_institution_admin());

-- Enable Supabase Realtime for institution messages and per-user notifications.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
 end if;
end $$;

-- Minimal grants; RLS remains the authorization boundary.
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on function public.create_conversation(text,uuid[]) from public,anon;
grant execute on function public.current_institution_id(),public.current_app_role(),public.is_platform_owner(),public.is_institution_admin(),public.is_active_member(),public.is_conversation_member(uuid),public.create_conversation(text,uuid[]) to authenticated;
commit;

-- FIRST DEPLOYMENT / OWNER:
-- 1) Create a Supabase project dedicated to The Trainers.
-- 2) Run this file once in SQL Editor.
-- 3) In Supabase Auth, invite ayoubmalleh772@gmail.com (or sign up with that email).
--    The auth trigger automatically creates the active platform-owner profile.
-- 4) Sign in to the app as owner; create the first institution and manager from the Owner console.
-- 5) Never expose the service_role key in frontend code.
