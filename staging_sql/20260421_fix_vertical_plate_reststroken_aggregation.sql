-- Fix vertical plate calculation for wall finishing boards:
-- aggregate remainder strips across columns instead of counting one full extra plate per column.

do $$
declare
  r record;
  k text;
  keys text[] := array['afwerkplaat','afwerkplaat_1','afwerkplaat_2','beplating_1','beplating_2'];
  v_method text := 'kolommen = ceil(wandlengte/plaatbreedte); volle rijen = floor(wandhoogte/plaathoogte); resthoogte over alle kolommen aggregeren, niet per kolom 1 extra plaat';
  v_formula text := 'plaatbreedte_mm = material.breedte_mm; plaathoogte_mm = material.lengte_mm; kolommen = ceil(wandlengte_mm / plaatbreedte_mm); volle_rijen = floor(wandhoogte_mm / plaathoogte_mm); resthoogte_mm = max(0, wandhoogte_mm - (volle_rijen * plaathoogte_mm)); volle_platen = kolommen * volle_rijen; rest_platen = if resthoogte_mm > 0 then ceil((kolommen * resthoogte_mm) / plaathoogte_mm) else 0; aantal = volle_platen + rest_platen';
  v_policy text := 'reststroken uit meerdere kolommen samenvoegen en pas daarna afronden';
  v_forbidden jsonb := '["extra_plate_per_column_for_remainder"]'::jsonb;
begin
  for r in
    select id, klus_regels
    from klus_regels
    where klus_type in ('hsb-voorzetwand','hsb-tussenwand','metalstud-voorzetwand','metalstud-tussenwand')
  loop
    foreach k in array keys loop
      if (r.klus_regels #> array['calculation_rules','beplating',k]) is not null then
        r.klus_regels := jsonb_set(r.klus_regels, array['calculation_rules','beplating',k,'logic'], to_jsonb('vertical_position_based'::text), true);
        r.klus_regels := jsonb_set(r.klus_regels, array['calculation_rules','beplating',k,'method'], to_jsonb(v_method), true);
        r.klus_regels := jsonb_set(r.klus_regels, array['calculation_rules','beplating',k,'formula'], to_jsonb(v_formula), true);
        r.klus_regels := jsonb_set(r.klus_regels, array['calculation_rules','beplating',k,'cutting_policy'], to_jsonb(v_policy), true);
        r.klus_regels := jsonb_set(r.klus_regels, array['calculation_rules','beplating',k,'forbidden_methods'], v_forbidden, true);
      end if;
    end loop;

    update klus_regels
    set klus_regels = r.klus_regels,
        pending_updates = 'patched_reststroken_aggregatie_' || to_char(now(), 'YYYYMMDD_HH24MISS')
    where id = r.id;
  end loop;
end $$;
