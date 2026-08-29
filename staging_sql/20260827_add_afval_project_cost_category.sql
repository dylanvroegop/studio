ALTER TABLE public.project_costs
  DROP CONSTRAINT IF EXISTS project_costs_category_chk;

ALTER TABLE public.project_costs
  ADD CONSTRAINT project_costs_category_chk
  CHECK (category IN (
    'materiaal',
    'autokosten',
    'boetes',
    'schulden',
    'afval',
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
  category = 'afval',
  line_items = COALESCE((
    SELECT jsonb_agg(jsonb_set(item, '{category}', '"afval"'::jsonb, true))
    FROM jsonb_array_elements(project_costs.line_items) AS item
  ), '[]'::jsonb),
  updated_at = now()
WHERE category IN ('overig', 'materiaal')
  AND (
    lower(COALESCE(description, '')) ~ '(afvoerbon|afvalstort|afvalstroom|afvalverwerking|bouw- en sloopafval|afval/afvoer|stortkosten|containerafvoer|puinafvoer)'
    OR lower(COALESCE(line_items::text, '')) ~ '(afvoerbon|afvalstort|afvalstroom|afvalverwerking|bouw- en sloopafval|afval/afvoer|stortkosten|containerafvoer|puinafvoer)'
  );
