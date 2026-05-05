-- Add structured receipt attachments for Kosten gallery.
alter table if exists public.project_costs
add column if not exists receipt_files jsonb not null default '[]'::jsonb;

-- Backfill legacy single URL into structured list.
update public.project_costs
set receipt_files = jsonb_build_array(
  jsonb_build_object(
    'url', receipt_url,
    'path', null,
    'filename', split_part(receipt_url, '/', array_length(string_to_array(receipt_url, '/'), 1)),
    'content_type', '',
    'size_bytes', 0,
    'uploaded_at', to_char(coalesce(created_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
)
where coalesce(receipt_url, '') <> ''
  and (receipt_files is null or jsonb_typeof(receipt_files) <> 'array' or jsonb_array_length(receipt_files) = 0);

create index if not exists project_costs_receipt_files_gin
on public.project_costs using gin (receipt_files);
