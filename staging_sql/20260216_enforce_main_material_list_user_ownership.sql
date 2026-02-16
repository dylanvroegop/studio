-- Enforce per-user ownership in main_material_list.
-- 1) Clone legacy NULL-owner rows into every existing owner account (by row_id).
-- 2) Remove NULL/blank-owner rows.
-- 3) Enforce gebruikerid NOT NULL and not blank.
-- 4) Prevent duplicate rows per user/material id.

DO $$
DECLARE
  owner_count integer;
  insert_cols text;
  select_cols text;
BEGIN
  SELECT count(DISTINCT gebruikerid)
  INTO owner_count
  FROM public.main_material_list
  WHERE gebruikerid IS NOT NULL
    AND btrim(gebruikerid) <> '';

  IF owner_count = 0 THEN
    RAISE EXCEPTION
      'Migration blocked: no existing user-owned rows found in public.main_material_list.';
  END IF;

  SELECT
    string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position),
    string_agg(
      CASE
        WHEN column_name = 'gebruikerid' THEN 'u.gebruikerid'
        ELSE format('n.%I', column_name)
      END,
      ', ' ORDER BY ordinal_position
    )
  INTO insert_cols, select_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'main_material_list';

  EXECUTE format($sql$
    INSERT INTO public.main_material_list (%s)
    SELECT %s
    FROM public.main_material_list AS n
    CROSS JOIN (
      SELECT DISTINCT gebruikerid
      FROM public.main_material_list
      WHERE gebruikerid IS NOT NULL
        AND btrim(gebruikerid) <> ''
    ) AS u
    WHERE n.gebruikerid IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.main_material_list AS e
        WHERE e.gebruikerid = u.gebruikerid
          AND e.row_id = n.row_id
      );
  $sql$, insert_cols, select_cols);
END
$$;

DELETE FROM public.main_material_list
WHERE gebruikerid IS NULL
   OR btrim(gebruikerid) = '';

ALTER TABLE public.main_material_list
ALTER COLUMN gebruikerid SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'main_material_list_gebruikerid_not_blank_chk'
      AND conrelid = 'public.main_material_list'::regclass
  ) THEN
    ALTER TABLE public.main_material_list
    ADD CONSTRAINT main_material_list_gebruikerid_not_blank_chk
    CHECK (btrim(gebruikerid) <> '');
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS main_material_list_gebruikerid_row_id_uidx
  ON public.main_material_list (gebruikerid, row_id);
