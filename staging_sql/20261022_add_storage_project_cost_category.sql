ALTER TABLE public.project_costs DROP CONSTRAINT project_costs_category_chk;
ALTER TABLE public.project_costs ADD CONSTRAINT project_costs_category_chk CHECK (category IN ('materiaal','autokosten','boetes','schulden','afval','brandstof','gereedschap','eigen_verbruik','hotel','telefoon','leadkosten','storage','overig'));
ALTER TABLE public.bank_transaction_category_overrides DROP CONSTRAINT bank_transaction_category_overrides_category_check;
ALTER TABLE public.bank_transaction_category_overrides ADD CONSTRAINT bank_transaction_category_overrides_category_check CHECK (category IN ('materiaal','autokosten','boetes','schulden','afval','brandstof','gereedschap','eigen_verbruik','hotel','telefoon','leadkosten','storage','overig'));
