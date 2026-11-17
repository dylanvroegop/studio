-- Grote calculaties horen in de POST-body, niet in een PostgREST URL-filter.
-- Vergelijk en schrijf atomair; een tussentijdse wijziging mag niet verdwijnen.
CREATE OR REPLACE FUNCTION public.compare_and_swap_quote_calculation(
  p_id uuid,
  p_user_id text,
  p_expected jsonb,
  p_replacement jsonb
)
RETURNS TABLE (id uuid, data_json jsonb)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.quotes_collection AS q
  SET data_json = p_replacement
  WHERE q.id = p_id
    AND q.gebruikerid = p_user_id
    AND q.data_json IS NOT DISTINCT FROM p_expected
  RETURNING q.id, q.data_json;
$$;

-- Alleen de server mag de door Firebase gecontroleerde eigenaar doorgeven.
REVOKE ALL ON FUNCTION public.compare_and_swap_quote_calculation(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compare_and_swap_quote_calculation(uuid, text, jsonb, jsonb) TO service_role;
