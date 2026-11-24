-- Serverplanning voor aanvraagherinneringen, onafhankelijk van n8n en lokale workers.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists automation_private;
revoke all on schema automation_private from public, anon, authenticated;
grant usage on schema automation_private to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'calvora_client_intake_reminder') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'calvora_client_intake_reminder', 'Ondertekent uitsluitend aanvraagherinneringen voor Calvora.');
  end if;
end;
$$;

-- Privéfunctie: alleen de serverrol mag een kort geldig, doelgebonden token controleren.
create or replace function automation_private.authorize_client_intake_reminder(provided_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    cross join generate_series(0, 2) as age(minutes)
    where name = 'calvora_client_intake_reminder'
      and encode(extensions.hmac(
        'calvora-client-intake:' || (floor(extract(epoch from now()) / 60)::bigint - age.minutes)::text,
        decrypted_secret, 'sha256'), 'hex') = provided_token
  );
$$;
revoke all on function automation_private.authorize_client_intake_reminder(text) from public, anon, authenticated;
grant execute on function automation_private.authorize_client_intake_reminder(text) to service_role;

create or replace function public.authorize_client_intake_reminder(provided_token text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select automation_private.authorize_client_intake_reminder(provided_token);
$$;
revoke all on function public.authorize_client_intake_reminder(text) from public, anon, authenticated;
grant execute on function public.authorize_client_intake_reminder(text) to service_role;

-- Alleen request-ID en tijdstip; geen headers, tokens of klantgegevens opslaan.
create table if not exists automation_private.client_intake_dispatches (
  request_id bigint primary key,
  queued_at timestamptz not null default now()
);
alter table automation_private.client_intake_dispatches enable row level security;
revoke all on automation_private.client_intake_dispatches from public, anon, authenticated, service_role;

create or replace function public.queue_client_intake_reminder()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare request_id bigint;
begin
  select net.http_post(
    url := 'https://app.calvora.nl/api/client-intake/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || encode(extensions.hmac(
      'calvora-client-intake:' || floor(extract(epoch from now()) / 60)::bigint::text,
      decrypted_secret, 'sha256'), 'hex')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id from vault.decrypted_secrets where name = 'calvora_client_intake_reminder';
  if request_id is null then raise exception 'Scheduler configuration missing'; end if;
  insert into automation_private.client_intake_dispatches(request_id) values (request_id);
  delete from automation_private.client_intake_dispatches where queued_at < now() - interval '7 days';
  return request_id;
end;
$$;
revoke all on function public.queue_client_intake_reminder() from public, anon, authenticated, service_role;
grant execute on function public.queue_client_intake_reminder() to postgres;

select cron.schedule('calvora-client-intake-reminder', '* * * * *', 'select public.queue_client_intake_reminder();');
