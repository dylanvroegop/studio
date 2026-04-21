-- Async supplier import job tracking + scraped preview rows
-- Note: user_id is text because the app authenticates with Firebase UID today.

create extension if not exists pgcrypto;

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  supplier text not null,
  status text not null default 'pending',
  total_products int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_jobs_status_check'
      and conrelid = 'public.import_jobs'::regclass
  ) then
    alter table public.import_jobs
      add constraint import_jobs_status_check
      check (status in ('pending', 'scraping', 'completed', 'failed', 'imported'));
  end if;
end $$;

create table if not exists public.scraped_materials (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  user_id text not null,
  supplier text not null,
  sku text,
  name text not null,
  price_excl_btw numeric,
  price_per_unit numeric,
  unit text,
  stock_count int,
  product_url text,
  hoofdcategorie text,
  subcategorie text,
  selected boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_link_presets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  supplier text not null,
  name text not null,
  urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.import_jobs enable row level security;
alter table public.scraped_materials enable row level security;
alter table public.supplier_link_presets enable row level security;

drop policy if exists "Users see own jobs" on public.import_jobs;
create policy "Users see own jobs"
  on public.import_jobs
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "Users see own scraped materials" on public.scraped_materials;
create policy "Users see own scraped materials"
  on public.scraped_materials
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "Users see own supplier presets" on public.supplier_link_presets;
create policy "Users see own supplier presets"
  on public.supplier_link_presets
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create index if not exists idx_import_jobs_user_status
  on public.import_jobs (user_id, status, created_at desc);

create index if not exists idx_scraped_materials_import_job
  on public.scraped_materials (import_job_id);

create index if not exists idx_scraped_materials_user_supplier
  on public.scraped_materials (user_id, supplier);

create unique index if not exists idx_supplier_link_presets_user_supplier_name
  on public.supplier_link_presets (user_id, supplier, name);

