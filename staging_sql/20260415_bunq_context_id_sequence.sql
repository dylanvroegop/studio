do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'bunq_context_id_seq' and relkind = 'S'
  ) then
    create sequence public.bunq_context_id_seq;
  end if;

  alter sequence public.bunq_context_id_seq owned by public.bunq_context.id;

  alter table public.bunq_context
    alter column id drop default;

  perform setval(
    'public.bunq_context_id_seq',
    coalesce((select max(id) from public.bunq_context), 0) + 1,
    false
  );

  alter table public.bunq_context
    alter column id set default nextval('public.bunq_context_id_seq');
end $$;
