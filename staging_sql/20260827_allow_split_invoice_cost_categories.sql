-- A single supplier invoice can legitimately create one project_costs row per
-- category. Keep duplicate protection, but include the category in its key.
alter table public.project_costs
  drop constraint if exists project_costs_offerte_id_supplier_order_number_key;

create unique index if not exists project_costs_offerte_supplier_order_category_uidx
  on public.project_costs (offerte_id, supplier_order_number, category)
  where offerte_id is not null
    and supplier_order_number is not null;
