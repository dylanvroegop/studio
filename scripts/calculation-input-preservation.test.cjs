const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/quote-data-patch.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports);

test('editor stuurt alleen gewijzigde velden, inclusief nul, false en lege beschrijving', () => {
  const old = { grootmaterialen: [{ aantal: 4 }], totaal_uren: 8, werkbeschrijving: ['Werk'], enabled: true };
  const next = { ...old, totaal_uren: 0, werkbeschrijving: [], enabled: false };
  assert.deepEqual(mod.exports.createQuoteDataPatch([old], next), { totaal_uren: 0, werkbeschrijving: [], enabled: false });
});

test('echte PostgreSQL triggers bewaren invoer tijdens en na n8n en bij herberekenen', async () => {
  // npm install --prefix /tmp/calvora-calculation-sql-test --no-package-lock @electric-sql/pglite
  // NODE_PATH=/tmp/calvora-calculation-sql-test/node_modules node --test scripts/calculation-input-preservation.test.cjs
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.quotes_collection (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), quoteid text, gebruikerid text, status text, data_json jsonb);`);
    await db.exec(fs.readFileSync('staging_sql/20261019_preserve_quote_input_during_calculation.sql', 'utf8'));
    await db.exec(fs.readFileSync('staging_sql/20261019_patch_quote_scope_costs.sql', 'utf8'));
    const saved = {
      grootmaterialen: [{ product: 'oud', aantal: 1, prijs_per_stuk: 1 }],
      verbruiksartikelen: [{ product: 'Afvalkosten', aantal: 1, prijs_per_stuk: 30 }, { product: 'Steigerkosten', aantal: 1, prijs_per_stuk: 150 }, { product: 'Naden schilderklaar', aantal: 1, prijs_per_stuk: 300 }], totaal_uren: 17, uren_specificatie: [{ taak: 'Werk', uren: 17 }],
      instellingen: { uurTariefExclBtw: 55 }, extras: { transport: { mode: 'fixed', vasteTransportkosten: 99 } },
      transport_berekening: { distanceKm: 42 }, scope_costs: { afval: 25, steiger: 150, stucwerk: 300 },
      werkbeschrijving: ['Handmatig'], werkbeschrijving_structured: { steigerInbegrepen: true, stucwerkInbegrepen: false },
    };
    const { rows: [original] } = await db.query("INSERT INTO public.quotes_collection(quoteid,gebruikerid,status,data_json,created_at) VALUES ('q','u','completed',$1,'2026-10-01') RETURNING *", [saved]);
    const { rows: [pending] } = await db.query("INSERT INTO public.quotes_collection(quoteid,gebruikerid,created_at) VALUES ('q','u','2026-10-02') RETURNING *");
    assert.deepEqual(pending.data_json, saved);
    const edit = { totaal_uren: 0, werkbeschrijving: [], scope_costs: { afval: 0, steiger: 275, stucwerk: 410 }, werkbeschrijving_structured: { steigerInbegrepen: false, stucwerkInbegrepen: true } };
    await db.query('SELECT * FROM public.patch_quote_calculation_input($1,$2,$3)', [original.id, 'u', edit]);
    const incoming = [{ materialen: [{ materiaal: 'Nieuw', aantal: 25, prijs_per_stuk: 5 }], data: [{ materiaalnaam: 'Klein materiaal (schatting)', prijs_excl_btw: 125, body: { quote: { instellingen: { uurTariefExclBtw: 1 } } }, data: [{ distanceKm: 999 }] }], totaal_uren: 999, werkbeschrijving: ['AI'], transport_berekening: { distanceKm: 999 } }];
    await db.query("UPDATE public.quotes_collection SET status='completed',data_json=$1 WHERE quoteid='q'", [incoming]);
    let { rows } = await db.query("SELECT * FROM public.quotes_collection WHERE quoteid='q'");
    const expected = { ...saved, ...edit, grootmaterialen: incoming[0].materialen, verbruiksartikelen: [{ materiaalnaam: 'Klein materiaal (schatting)', prijs_excl_btw: 125 }, ...saved.verbruiksartikelen] };
    for (const row of rows) assert.deepEqual(row.data_json, expected);
    // Een late save naar de oude run mag de nieuwe materiaaluitkomst niet vervangen.
    await db.query('SELECT * FROM public.patch_quote_calculation_input($1,$2,$3)', [original.id, 'u', { totaal_uren: 23 }]);
    ({ rows } = await db.query("SELECT * FROM public.quotes_collection WHERE quoteid='q'"));
    for (const row of rows) assert.deepEqual(row.data_json, { ...expected, totaal_uren: 23 });
    await db.query('SELECT * FROM public.patch_quote_calculation_input($1,$2,$3)', [original.id, 'u', { _scope_cost_updates: { afval: 70 } }]);
    ({ rows } = await db.query("SELECT * FROM public.quotes_collection WHERE quoteid='q'"));
    for (const row of rows) {
      assert.deepEqual(row.data_json.grootmaterialen, expected.grootmaterialen);
      assert.equal(row.data_json.verbruiksartikelen.find(x => x.product === 'Afvalkosten').prijs_per_stuk, 70);
      assert.equal(row.data_json._scope_cost_updates, undefined);
    }
    await db.query('SELECT * FROM public.patch_quote_calculation_input($1,$2,$3)', [original.id, 'u', { _scope_cost_updates: { afval: 30 } }]);
    assert.equal((await db.query('SELECT * FROM public.patch_quote_calculation_input($1,$2,$3)', [original.id, 'other', { totaal_uren: 99 }])).rows.length, 0);
    await db.query("INSERT INTO public.quotes_collection(quoteid,gebruikerid,created_at) VALUES ('q','u','2026-10-03')");
    await db.query("UPDATE public.quotes_collection SET status='completed',data_json=$1 WHERE quoteid='q'", [{ grootmaterialen: [], verbruiksartikelen: [] }]);
    ({ rows } = await db.query("SELECT * FROM public.quotes_collection WHERE quoteid='q'"));
    for (const row of rows) assert.deepEqual(row.data_json, { ...expected, totaal_uren: 23, grootmaterialen: [], verbruiksartikelen: [...saved.verbruiksartikelen.slice(1), { ...saved.verbruiksartikelen[0], eenheid: 'stuk' }] });
  } finally { await db.close(); }
});
