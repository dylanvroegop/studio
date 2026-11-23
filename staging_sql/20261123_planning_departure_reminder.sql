create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'calvora_planning_departure_reminder') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'calvora_planning_departure_reminder',
      'Ondertekent geplande vertrekherinneringen voor Calvora.'
    );
  end if;
end;
$$;

create or replace function public.authorize_planning_departure_reminder(provided_token text)
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
    where name = 'calvora_planning_departure_reminder'
      and encode(extensions.hmac(
        'calvora-planning-departure:' || (floor(extract(epoch from now()) / 60)::bigint - age.minutes)::text,
        decrypted_secret,
        'sha256'
      ), 'hex') = provided_token
  );
$$;

revoke all on function public.authorize_planning_departure_reminder(text) from public, anon, authenticated;
grant execute on function public.authorize_planning_departure_reminder(text) to service_role;

create or replace function public.queue_planning_departure_reminder()
returns bigint
language sql
set search_path = ''
as $$
  select net.http_post(
    url := 'https://app.calvora.nl/api/planning/departure-reminder',
    headers := jsonb_build_object('Authorization', 'Bearer ' || encode(extensions.hmac(
      'calvora-planning-departure:' || floor(extract(epoch from now()) / 60)::bigint::text,
      decrypted_secret,
      'sha256'
    ), 'hex')),
    timeout_milliseconds := 120000
  )
  from vault.decrypted_secrets
  where name = 'calvora_planning_departure_reminder';
$$;

revoke all on function public.queue_planning_departure_reminder() from public, anon, authenticated, service_role;
grant execute on function public.queue_planning_departure_reminder() to postgres;

select cron.schedule(
  'calvora-planning-departure-reminder',
  '*/5 * * * *',
  $job$
    select public.queue_planning_departure_reminder()
    where (now() at time zone 'Europe/Amsterdam')::time >= time '10:00';
  $job$
);
