BEGIN;

ALTER TABLE public.quotes_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes_collection FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.quotes_collection;
DROP POLICY IF EXISTS quotes_collection_public_read ON public.quotes_collection;
DROP POLICY IF EXISTS quotes_collection_anon_read ON public.quotes_collection;

-- Intentionally keep this table without anon/authenticated policies.
-- Access should happen via service_role from verified server routes only.

COMMIT;
