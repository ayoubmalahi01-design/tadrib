-- 0003_admin_notice_reads.sql
-- إضافة إضافية فقط: تتبّع من اطّلع على التعاميم الإدارية.
-- لا تحذف ولا تعدّل أي جدول أو عمود أو صف موجود.
-- آمنة للتشغيل أكثر من مرة (if not exists / drop policy if exists).
--
-- التنفيذ يتطلب موافقة صاحب المشروع. بعد التنفيذ تُظهر صفحة التعاميم
-- زر "تم الاطلاع" للمدرب وعدد المطّلعين للمشرف. قبل التنفيذ تعمل الصفحة
-- بشكل طبيعي دون تتبّع (الكود يتعامل مع غياب الجدول).

create table if not exists public.admin_notice_reads (
  notice_id uuid not null references public.admin_notices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, profile_id)
);

alter table public.admin_notice_reads enable row level security;

-- أعضاء المؤسسة يقرؤون سجلات الاطلاع الخاصة بمؤسستهم فقط (لعدّاد المطّلعين).
drop policy if exists notice_reads_select on public.admin_notice_reads;
create policy notice_reads_select on public.admin_notice_reads
  for select to authenticated
  using (
    institution_id = (
      select p.institution_id from public.profiles p where p.id = auth.uid()
    )
  );

-- كل مستخدم يسجّل اطلاعه هو فقط، وضمن مؤسسته.
drop policy if exists notice_reads_insert_own on public.admin_notice_reads;
create policy notice_reads_insert_own on public.admin_notice_reads
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and institution_id = (
      select p.institution_id from public.profiles p where p.id = auth.uid()
    )
  );

-- لا سياسات تحديث أو حذف: سجل الاطلاع غير قابل للتعديل من التطبيق.

create index if not exists admin_notice_reads_notice_idx
  on public.admin_notice_reads (notice_id);
create index if not exists admin_notice_reads_profile_idx
  on public.admin_notice_reads (profile_id);
