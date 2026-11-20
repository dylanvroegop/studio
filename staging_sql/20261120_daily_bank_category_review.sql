create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'calvora_daily_bank_category_review') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'calvora_daily_bank_category_review',
      'Token voor de beveiligde dagelijkse Calvora-kostencategorisatie.'
    );
  end if;
end;
$$;

create or replace function public.authorize_daily_bank_category_review(provided_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    cross join generate_series(0, 2) as age(minutes)
    where name = 'calvora_daily_bank_category_review'
      and encode(extensions.hmac(
        'calvora-bank-review:' || (floor(extract(epoch from now()) / 60)::bigint - age.minutes)::text,
        decrypted_secret,
        'sha256'
      ), 'hex') = provided_token
  );
$$;

revoke all on function public.authorize_daily_bank_category_review(text) from public, anon, authenticated;
grant execute on function public.authorize_daily_bank_category_review(text) to service_role;

create or replace function public.queue_daily_bank_category_review()
returns bigint
language sql
set search_path = ''
as $$
  select net.http_post(
    url := 'https://app.calvora.nl/api/kosten/review-overig',
    -- De HTTP-wachtrij bevat alleen een handtekening die maximaal drie minuten geldig is.
    headers := jsonb_build_object('Authorization', 'Bearer ' || encode(extensions.hmac(
      'calvora-bank-review:' || floor(extract(epoch from now()) / 60)::bigint::text,
      decrypted_secret,
      'sha256'
    ), 'hex')),
    timeout_milliseconds := 120000
  )
  from vault.decrypted_secrets where name = 'calvora_daily_bank_category_review';
$$;

revoke all on function public.queue_daily_bank_category_review() from public, anon, authenticated, service_role;
grant execute on function public.queue_daily_bank_category_review() to postgres;
