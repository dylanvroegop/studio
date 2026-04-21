alter table if exists public.scraped_materials
  add column if not exists imported_to_main boolean not null default false;

alter table if exists public.scraped_materials
  add column if not exists imported_at timestamptz;

create index if not exists idx_scraped_materials_import_pending
  on public.scraped_materials (user_id, import_job_id, imported_to_main);

