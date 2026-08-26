ALTER TABLE public.project_costs
  DROP CONSTRAINT IF EXISTS project_costs_category_chk;

ALTER TABLE public.project_costs
  ADD CONSTRAINT project_costs_category_chk
  CHECK (category IN (
    'materiaal',
    'autokosten',
    'brandstof',
    'gereedschap',
    'eigen_verbruik',
    'hotel',
    'telefoon',
    'leadkosten',
    'overig'
  ));
