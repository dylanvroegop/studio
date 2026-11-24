alter table public.project_costs
  drop constraint project_costs_category_chk,
  add constraint project_costs_category_chk check (category in (
    'materiaal', 'autokosten', 'boetes', 'schulden', 'afval', 'brandstof', 'gereedschap',
    'eigen_verbruik', 'hotel', 'telefoon', 'leadkosten', 'storage', 'huur', 'boekhoudkosten', 'overig'
  ));

alter table public.bank_transaction_category_overrides
  drop constraint bank_transaction_category_overrides_category_check,
  add constraint bank_transaction_category_overrides_category_check check (category in (
    'materiaal', 'autokosten', 'boetes', 'schulden', 'afval', 'brandstof', 'gereedschap',
    'eigen_verbruik', 'hotel', 'telefoon', 'leadkosten', 'storage', 'huur', 'boekhoudkosten', 'overig', 'profit'
  ));
