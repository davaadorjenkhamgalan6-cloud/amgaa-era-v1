-- =====================================================================
-- AMGAA ERA — Цахилгааны эрсдэлийн үзлэгийн систем
-- Supabase > SQL Editor дээр бүтнээр нь нэг удаа ажиллуулна.
-- Дахин ажиллуулахад аюулгүй (if not exists / or replace ашигласан).
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1. Хэрэглэгч ба үүрэг
--    manager    = Менежер (хүсэлт гаргана, эцсийн батална)
--    supervisor = Шууд удирдлага (хүсэлт, дүгнэлт хянана)
--    engineer   = Инженер (талбайн үзлэг хийнэ)
--    admin      = Систем хариуцагч
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'engineer'
             check (role in ('manager','supervisor','engineer','admin')),
  created_at timestamptz not null default now()
);

-- Шинэ хэрэглэгч бүртгүүлэхэд profile автоматаар үүснэ (анхдагч: engineer)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Одоогийн хэрэглэгчийн үүрэг
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 2. Үзлэг — диаграмын урсгалын төлөвүүд
--    requested → approved → planned → inspected → conclusion_draft
--    → under_review → conclusion_approved → sent
--    (буцаалт: returned)
-- ---------------------------------------------------------------------
create table if not exists public.inspections (
  id              uuid primary key default gen_random_uuid(),
  object_name     text not null,
  location        text,
  equipment       text,
  voltage_v       numeric,
  status          text not null default 'requested'
                  check (status in ('requested','returned','approved','planned',
                                    'inspected','conclusion_draft','under_review',
                                    'conclusion_approved','sent')),
  requested_by    uuid references public.profiles(id),
  approved_by     uuid references public.profiles(id),
  engineer_id     uuid references public.profiles(id),
  planned_date    date,
  inspection_date date,
  observations    text,          -- инженерийн ерөнхий тэмдэглэл
  extra           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Шалгах хуудасны мөр бүр
create table if not exists public.checklist_results (
  id            bigint generated always as identity primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  group_name    text not null,   -- жишээ: 'Цахилгааны самбар'
  item          text not null,   -- жишээ: 'Самбарын таг, хаалт бүрэн'
  status        text not null default 'not_checked'
                check (status in ('ok','violation','clarify','not_checked')),
  note          text
);

-- 15 жинлэсэн үзүүлэлтийн оноо (0–10)
create table if not exists public.indicator_scores (
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  indicator_no  int  not null check (indicator_no between 1 and 15),
  score         numeric not null check (score between 0 and 10),
  note          text,
  primary key (inspection_id, indicator_no)
);

-- Хэмжилт (газардуулгын эсэргүүцэл, тусгаарлагч, температур г.м.)
create table if not exists public.measurements (
  id            bigint generated always as identity primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  name          text not null,
  value         numeric,
  unit          text,
  limit_text    text,            -- нормын зөвшөөрөгдөх хязгаар (байвал)
  note          text
);

-- Зураг (файл нь Storage-ийн 'inspection-photos' bucket-д)
create table if not exists public.photos (
  id            bigint generated always as identity primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  storage_path  text not null,
  caption       text
);

-- ---------------------------------------------------------------------
-- 3. Норм, дүрмийн сан (хайлттай)
-- ---------------------------------------------------------------------
create table if not exists public.norm_documents (
  id         bigint generated always as identity primary key,
  code       text,               -- жишээ: 'БД 43-101-03'
  title      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.norm_chunks (
  id          bigint generated always as identity primary key,
  document_id bigint not null references public.norm_documents(id) on delete cascade,
  page        int,
  section     text,              -- заалтын дугаар
  content     text not null,
  tsv         tsvector generated always as (to_tsvector('simple', coalesce(section,'') || ' ' || content)) stored
);

create index if not exists norm_chunks_tsv_idx  on public.norm_chunks using gin (tsv);
create index if not exists norm_chunks_trgm_idx on public.norm_chunks using gin (content gin_trgm_ops);

-- Зөрчлийн текстээр нормын хэсэг хайх (агент дуудна)
create or replace function public.search_norms(q text, k int default 5)
returns table (id bigint, code text, title text, page int, section text, content text, rank real)
language sql stable as $$
  select c.id, d.code, d.title, c.page, c.section, c.content,
         greatest(ts_rank(c.tsv, websearch_to_tsquery('simple', q)),
                  similarity(c.content, q)) as rank
  from public.norm_chunks c
  join public.norm_documents d on d.id = c.document_id
  where c.tsv @@ websearch_to_tsquery('simple', q)
     or c.content % q
  order by rank desc
  limit k
$$;

-- ---------------------------------------------------------------------
-- 4. AI дүгнэлт — хувилбар бүрийг хадгална (засварын түүх)
-- ---------------------------------------------------------------------
create table if not exists public.conclusions (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  version       int  not null,
  engine        text not null,   -- 'manual' | 'anthropic' | 'openai' | 'human_edit'
  score_pct     numeric,         -- кодоор тооцсон
  grade         text,            -- кодоор тооцсон
  draft         jsonb not null,  -- агентын бүтэцтэй дүгнэлт
  check_report  jsonb not null default '{}'::jsonb,
  status        text not null default 'draft'
                check (status in ('draft','under_review','returned','approved')),
  created_by    uuid references public.profiles(id),
  reviewed_by   uuid references public.profiles(id),
  review_note   text,
  created_at    timestamptz not null default now(),
  unique (inspection_id, version)
);

-- Төлөв өөрчлөлтийн бүртгэл (хэн, хэзээ, юуг)
create table if not exists public.inspection_events (
  id            bigint generated always as identity primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  actor         uuid references public.profiles(id),
  from_status   text,
  to_status     text,
  note          text,
  at            timestamptz not null default now()
);

create or replace function public.log_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.inspection_events (inspection_id, actor, from_status, to_status)
    values (new.id, auth.uid(), old.status, new.status);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists inspections_status_log on public.inspections;
create trigger inspections_status_log
  before update on public.inspections
  for each row execute function public.log_status_change();

-- ---------------------------------------------------------------------
-- 5. Эрх (Row Level Security)
--    Нэвтэрсэн бүх ажилтан уншина. Бичих эрх үүргээс хамаарна.
--    Агент (Vercel функц) service_role-оор ажилладаг тул RLS-ийг тойрно.
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.inspections       enable row level security;
alter table public.checklist_results enable row level security;
alter table public.indicator_scores  enable row level security;
alter table public.measurements      enable row level security;
alter table public.photos            enable row level security;
alter table public.norm_documents    enable row level security;
alter table public.norm_chunks       enable row level security;
alter table public.conclusions       enable row level security;
alter table public.inspection_events enable row level security;

-- Унших: нэвтэрсэн хэрэглэгч бүр
do $$
declare t text;
begin
  foreach t in array array['profiles','inspections','checklist_results','indicator_scores',
                           'measurements','photos','norm_documents','norm_chunks',
                           'conclusions','inspection_events']
  loop
    execute format('drop policy if exists "read_all_%1$s" on public.%1$I', t);
    execute format('create policy "read_all_%1$s" on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Профайл: өөрийн нэрийг засна; үүргийг зөвхөн admin өөрчилнө
drop policy if exists "profile_self_update" on public.profiles;
create policy "profile_self_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.my_role() = 'admin')
  with check ((id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()))
              or public.my_role() = 'admin');

-- Үзлэгийн хүсэлт: менежер, admin үүсгэнэ
drop policy if exists "inspection_insert" on public.inspections;
create policy "inspection_insert" on public.inspections for insert to authenticated
  with check (public.my_role() in ('manager','admin') and requested_by = auth.uid());

-- Үзлэг засах: хүсэлт гаргагч менежер, шууд удирдлага, хариуцсан инженер, admin
drop policy if exists "inspection_update" on public.inspections;
create policy "inspection_update" on public.inspections for update to authenticated
  using (public.my_role() in ('supervisor','admin')
         or requested_by = auth.uid()
         or engineer_id  = auth.uid());

-- Талбайн өгөгдөл: хариуцсан инженер, шууд удирдлага, admin
do $$
declare t text;
begin
  foreach t in array array['checklist_results','indicator_scores','measurements','photos']
  loop
    execute format('drop policy if exists "field_write_%1$s" on public.%1$I', t);
    execute format($p$
      create policy "field_write_%1$s" on public.%1$I for all to authenticated
      using (exists (select 1 from public.inspections i where i.id = inspection_id
                     and (i.engineer_id = auth.uid() or public.my_role() in ('supervisor','admin'))))
      with check (exists (select 1 from public.inspections i where i.id = inspection_id
                     and (i.engineer_id = auth.uid() or public.my_role() in ('supervisor','admin'))))
    $p$, t);
  end loop;
end $$;

-- Нормын сан: шууд удирдлага, admin удирдана
drop policy if exists "norm_docs_write" on public.norm_documents;
create policy "norm_docs_write" on public.norm_documents for all to authenticated
  using (public.my_role() in ('supervisor','admin')) with check (public.my_role() in ('supervisor','admin'));
drop policy if exists "norm_chunks_write" on public.norm_chunks;
create policy "norm_chunks_write" on public.norm_chunks for all to authenticated
  using (public.my_role() in ('supervisor','admin')) with check (public.my_role() in ('supervisor','admin'));

-- Дүгнэлт: шууд удирдлага засварын хувилбар нэмж, төлөв өөрчилнө
drop policy if exists "conclusion_review_insert" on public.conclusions;
create policy "conclusion_review_insert" on public.conclusions for insert to authenticated
  with check (public.my_role() in ('supervisor','admin'));
drop policy if exists "conclusion_review_update" on public.conclusions;
create policy "conclusion_review_update" on public.conclusions for update to authenticated
  using (public.my_role() in ('supervisor','manager','admin'));

-- ---------------------------------------------------------------------
-- 6. Зургийн Storage bucket (хувийн)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_read" on storage.objects;
create policy "photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos');
drop policy if exists "photos_write" on storage.objects;
create policy "photos_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos');
