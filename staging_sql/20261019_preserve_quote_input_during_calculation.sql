-- n8n schrijft status + data_json; de editor schrijft uitsluitend data_json.
-- Bewaar invoer per calculatieregel en vervang bij afronding alleen materiaal.
CREATE OR REPLACE FUNCTION public.quote_calculation_root(value jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'array' THEN COALESCE(value->0, '{}'::jsonb)
    WHEN 'object' THEN CASE WHEN value ? '0' AND (SELECT count(*) FROM jsonb_object_keys(value)) = 1 THEN value->'0' ELSE value END
    ELSE '{}'::jsonb END;
$$;

-- Deze kosten staan historisch als materiaalregels opgeslagen, maar zijn geen calculatiemateriaal.
CREATE OR REPLACE FUNCTION public.quote_scope_cost_item(item jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(trim(COALESCE(item->>'product', item->>'materiaal', item->>'materiaalnaam', '')))
    IN ('afvalkosten', 'steigerkosten', 'naden schilderklaar', 'stucwerk kosten', 'stucwerkkosten');
$$;

CREATE OR REPLACE FUNCTION public.merge_calculated_material_items(incoming jsonb, previous jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(incoming) item
      WHERE NOT public.quote_scope_cost_item(item)), '[]'::jsonb)
    || COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(previous) = 'array' THEN previous ELSE '[]'::jsonb END) item
      WHERE public.quote_scope_cost_item(item)), '[]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.preserve_quote_calculation_input()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  incoming jsonb;
  previous jsonb;
  large_materials jsonb;
  small_materials jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- De lege n8n-rij krijgt de meest recente invoer, zodat je kunt blijven werken.
    IF NEW.data_json IS NULL OR NEW.data_json = 'null'::jsonb THEN
      SELECT q.data_json INTO previous FROM public.quotes_collection q
      WHERE q.quoteid = NEW.quoteid AND q.gebruikerid = NEW.gebruikerid
        AND q.data_json IS NOT NULL AND q.data_json <> 'null'::jsonb
      ORDER BY q.created_at DESC, q.id DESC LIMIT 1;
      NEW.data_json := previous;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.data_json IS NOT DISTINCT FROM OLD.data_json OR NEW.data_json IS NULL THEN
    NEW.data_json := OLD.data_json;
    RETURN NEW;
  END IF;
  incoming := public.quote_calculation_root(NEW.data_json);
  previous := public.quote_calculation_root(OLD.data_json);
  large_materials := COALESCE(incoming->'grootmaterialen', incoming->'materialen');
  small_materials := COALESCE(incoming->'verbruiksartikelen', incoming->'data');
  IF jsonb_typeof(small_materials->0->'verbruiksartikelen') = 'array' THEN
    small_materials := small_materials->0->'verbruiksartikelen';
  END IF;
  -- De oude n8n-vorm verstopt klantgegevens en transport in klein materiaal.
  IF jsonb_typeof(small_materials) = 'array' THEN
    SELECT COALESCE(jsonb_agg(item - 'body' - 'data' - 'quote_metadata'), '[]'::jsonb)
      INTO small_materials FROM jsonb_array_elements(small_materials) item;
    previous := previous || jsonb_build_object('verbruiksartikelen', public.merge_calculated_material_items(small_materials, COALESCE(previous->'verbruiksartikelen', previous->'data')));
  END IF;
  IF jsonb_typeof(large_materials) = 'array' THEN
    previous := previous || jsonb_build_object('grootmaterialen', public.merge_calculated_material_items(large_materials, COALESCE(previous->'grootmaterialen', previous->'materialen')));
  END IF;
  NEW.data_json := previous;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preserve_quote_input_on_insert
BEFORE INSERT ON public.quotes_collection
FOR EACH ROW EXECUTE FUNCTION public.preserve_quote_calculation_input();
CREATE TRIGGER preserve_quote_input_on_calculation
BEFORE UPDATE OF status ON public.quotes_collection
FOR EACH ROW EXECUTE FUNCTION public.preserve_quote_calculation_input();

-- Patch alle runs atomair: een late editor-save naar een oude run mag niet verdwijnen.
-- Geen status-update, dus expliciete handmatige edits blijven toegestaan.
CREATE OR REPLACE FUNCTION public.patch_quote_calculation_input(
  calculation_id uuid, owner_uid text, patch jsonb
) RETURNS SETOF public.quotes_collection LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_quote text;
BEGIN
  IF jsonb_typeof(patch) <> 'object' THEN RAISE EXCEPTION 'Patch must be an object'; END IF;
  SELECT q.quoteid INTO target_quote FROM public.quotes_collection q
    WHERE q.id = calculation_id AND q.gebruikerid = owner_uid;
  IF target_quote IS NULL THEN RETURN; END IF;
  UPDATE public.quotes_collection q
    SET data_json = public.quote_calculation_root(q.data_json) || patch
    WHERE q.quoteid = target_quote AND q.gebruikerid = owner_uid;
  RETURN QUERY SELECT q.* FROM public.quotes_collection q
    WHERE q.quoteid = target_quote AND q.gebruikerid = owner_uid
    ORDER BY q.created_at DESC, q.id DESC LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.patch_quote_calculation_input(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patch_quote_calculation_input(uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.quote_calculation_root(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_calculation_root(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.preserve_quote_calculation_input() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.quote_scope_cost_item(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_scope_cost_item(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.merge_calculated_material_items(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_calculated_material_items(jsonb, jsonb) TO service_role;
