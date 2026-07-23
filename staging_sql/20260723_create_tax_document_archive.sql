-- Durable originals for receipts and supplier invoices.
-- The application writes these records with the Supabase service-role client;
-- RLS stays enabled so the archive is never readable directly from the client.

ALTER TABLE IF EXISTS public.project_costs
  ADD COLUMN IF NOT EXISTS receipt_files jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.project_costs
SET receipt_files = jsonb_build_array(
  jsonb_build_object(
    'url', receipt_url,
    'path', NULL,
    'filename', split_part(receipt_url, '/', array_length(string_to_array(receipt_url, '/'), 1)),
    'content_type', '',
    'size_bytes', 0,
    'uploaded_at', COALESCE(created_at, now())
  )
)
WHERE COALESCE(receipt_url, '') <> ''
  AND (receipt_files IS NULL OR jsonb_typeof(receipt_files) <> 'array' OR jsonb_array_length(receipt_files) = 0);

CREATE INDEX IF NOT EXISTS project_costs_receipt_files_gin
  ON public.project_costs USING gin (receipt_files);

CREATE TABLE IF NOT EXISTS public.cost_document_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  linked_cost_ids text[] NOT NULL DEFAULT '{}'::text[],
  pending_import_id text,
  bucket text NOT NULL DEFAULT 'tax-documents',
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source text NOT NULL DEFAULT 'manual_upload',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_document_archives_user_id_idx
  ON public.cost_document_archives (user_id);

CREATE INDEX IF NOT EXISTS cost_document_archives_linked_cost_ids_gin
  ON public.cost_document_archives USING gin (linked_cost_ids);

CREATE INDEX IF NOT EXISTS cost_document_archives_pending_import_id_idx
  ON public.cost_document_archives (pending_import_id);

CREATE INDEX IF NOT EXISTS cost_document_archives_user_hash_idx
  ON public.cost_document_archives (user_id, sha256, size_bytes);

DROP TRIGGER IF EXISTS trg_cost_document_archives_set_updated_at ON public.cost_document_archives;
CREATE OR REPLACE FUNCTION public.set_cost_document_archives_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cost_document_archives_set_updated_at
  BEFORE UPDATE ON public.cost_document_archives
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cost_document_archives_updated_at();

ALTER TABLE public.cost_document_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_document_archives FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_document_archives_service_role_all ON public.cost_document_archives;
CREATE POLICY cost_document_archives_service_role_all
  ON public.cost_document_archives
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
