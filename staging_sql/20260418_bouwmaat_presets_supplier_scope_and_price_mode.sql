alter table if exists public.bouwmaat_link_presets
  add column if not exists supplier_key text;

alter table if exists public.bouwmaat_link_presets
  add column if not exists price_mode text;

update public.bouwmaat_link_presets
set supplier_key = coalesce(nullif(supplier_key, ''), 'bouwmaat')
where supplier_key is null or supplier_key = '';

update public.bouwmaat_link_presets
set price_mode = coalesce(nullif(price_mode, ''), 'excl')
where price_mode is null or price_mode = '';

alter table if exists public.bouwmaat_link_presets
  alter column supplier_key set default 'bouwmaat';

alter table if exists public.bouwmaat_link_presets
  alter column price_mode set default 'excl';

alter table if exists public.bouwmaat_link_presets
  alter column supplier_key set not null;

alter table if exists public.bouwmaat_link_presets
  alter column price_mode set not null;

drop index if exists idx_bouwmaat_link_presets_user_name;

create unique index if not exists idx_bouwmaat_link_presets_user_supplier_name
  on public.bouwmaat_link_presets (gebruikerid, supplier_key, name);
