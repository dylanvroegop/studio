-- Een kosten-edit mag geen tijdens n8n vernieuwde materiaalregels terugschrijven.
CREATE OR REPLACE FUNCTION public.apply_quote_editor_patch(current_data jsonb, patch jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  result jsonb := public.quote_calculation_root(current_data) || (patch - '_scope_cost_updates');
  cost_key text;
  cost_value jsonb;
  label text;
  amount numeric;
  field_name text;
  items jsonb;
BEGIN
  IF jsonb_typeof(patch->'_scope_cost_updates') = 'object' THEN
    FOR cost_key, cost_value IN SELECT * FROM jsonb_each(patch->'_scope_cost_updates') LOOP
      label := CASE cost_key WHEN 'afval' THEN 'Afvalkosten' WHEN 'steiger' THEN 'Steigerkosten' WHEN 'naden' THEN 'Naden schilderklaar' ELSE NULL END;
      IF label IS NULL THEN CONTINUE; END IF;
      amount := GREATEST(0, round((cost_value #>> '{}')::numeric, 2));
      FOREACH field_name IN ARRAY ARRAY['grootmaterialen', 'verbruiksartikelen'] LOOP
        items := COALESCE(result->field_name, result->(CASE field_name WHEN 'grootmaterialen' THEN 'materialen' ELSE 'data' END));
        IF jsonb_typeof(items) <> 'array' OR items IS NULL THEN items := '[]'::jsonb; END IF;
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO items FROM jsonb_array_elements(items) item
          WHERE lower(trim(COALESCE(item->>'product', item->>'materiaal', item->>'materiaalnaam', ''))) <> lower(label);
        IF field_name = 'verbruiksartikelen' AND amount > 0 THEN
          items := items || jsonb_build_array(jsonb_build_object('product', label, 'aantal', 1, 'eenheid', 'stuk', 'prijs_per_stuk', amount));
        END IF;
        result := result || jsonb_build_object(field_name, items);
      END LOOP;
    END LOOP;
  END IF;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.patch_quote_calculation_input(calculation_id uuid, owner_uid text, patch jsonb)
RETURNS SETOF public.quotes_collection LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_quote text;
BEGIN
  IF jsonb_typeof(patch) <> 'object' THEN RAISE EXCEPTION 'Patch must be an object'; END IF;
  SELECT q.quoteid INTO target_quote FROM public.quotes_collection q
    WHERE q.id = calculation_id AND q.gebruikerid = owner_uid;
  IF target_quote IS NULL THEN RETURN; END IF;
  UPDATE public.quotes_collection q
    SET data_json = public.apply_quote_editor_patch(q.data_json, patch)
    WHERE q.quoteid = target_quote AND q.gebruikerid = owner_uid;
  RETURN QUERY SELECT q.* FROM public.quotes_collection q
    WHERE q.quoteid = target_quote AND q.gebruikerid = owner_uid
    ORDER BY q.created_at DESC, q.id DESC LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_quote_editor_patch(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quote_editor_patch(jsonb, jsonb) TO service_role;
