-- AMGAA ERA — нийтлэг үзлэгийн бүртгэл. Supabase → SQL Editor-т нэг удаа ажиллуулна.
-- Бичлэг бүр (объект, шалгах хуудас, оноо, хэмжилт, AI дүгнэлт, төлөвлөгөө) rec баганад JSON-оор хадгалагдана.
create table if not exists public.inspections (
  id         text primary key,
  rec        jsonb not null,
  updated_at timestamptz not null default now()
);
-- Хөтчөөс шууд хандах эрхгүй: зөвхөн сервер (/api/records, service түлхүүр) уншиж, бичнэ.
alter table public.inspections enable row level security;
