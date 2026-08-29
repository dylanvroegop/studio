ALTER TABLE public.project_costs
  DROP CONSTRAINT IF EXISTS project_costs_category_chk;

ALTER TABLE public.project_costs
  ADD CONSTRAINT project_costs_category_chk
  CHECK (category IN (
    'materiaal',
    'autokosten',
    'boetes',
    'schulden',
    'brandstof',
    'gereedschap',
    'eigen_verbruik',
    'hotel',
    'telefoon',
    'leadkosten',
    'overig'
  ));

UPDATE public.project_costs
SET
  category = 'schulden',
  line_items = COALESCE((
    SELECT jsonb_agg(jsonb_set(item, '{category}', '"schulden"'::jsonb, true))
    FROM jsonb_array_elements(project_costs.line_items) AS item
  ), '[]'::jsonb),
  updated_at = now()
WHERE category = 'overig'
  AND (
    lower(COALESCE(description, '')) ~ '(schuld|schuldaflossing|aflossing lening|leningaflossing|crediteur)'
    OR lower(COALESCE(line_items::text, '')) ~ '(schuld|schuldaflossing|aflossing lening|leningaflossing|crediteur)'
  );
