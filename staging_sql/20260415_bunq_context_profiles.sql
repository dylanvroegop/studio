alter table public.bunq_context
  add column if not exists profile text;

update public.bunq_context
set profile = coalesce(profile, 'personal')
where profile is null;

alter table public.bunq_context
  alter column profile set not null;

alter table public.bunq_context
  drop constraint if exists bunq_context_single_row;

create unique index if not exists idx_bunq_context_profile_unique
  on public.bunq_context(profile);
