const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');

// NODE_PATH=/tmp/studio-split-sql-test/node_modules node --test scripts/quote-split-sql.test.cjs
// Install only the isolated test dependency with npm install --prefix /tmp/studio-split-sql-test @electric-sql/pglite.
test('echte status-trigger reproduceert de fout; update zonder status bewaart het volledige splitplan', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.quotes_collection (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), quoteid text, gebruikerid text, status text, data_json jsonb);`);
    await db.exec(fs.readFileSync('staging_sql/20261019_preserve_quote_input_during_calculation.sql', 'utf8'));
    const original = { totaal_uren:50, grootmaterialen:[{product:'Wand'},{product:'Plafond'}], verbruiksartikelen:[{product:'Naden schilderklaar',aantal:1,prijs_per_stuk:73.68}], werkbeschrijving:['Wand en plafond'], extras:{winstMarge:{mode:'percentage',percentage:10}} };
    const part = { ...original, totaal_uren:20, grootmaterialen:[original.grootmaterialen[0]], verbruiksartikelen:[], werkbeschrijving:['Alleen wand'], extras:{winstMarge:{mode:'fixed',fixedAmount:203.30}}, splitCostAllocation:{operationId:'split'} };
    await db.query("INSERT INTO public.quotes_collection(quoteid,gebruikerid,status,data_json) VALUES ('q','u','completed',$1)",[original]);
    await db.query("UPDATE public.quotes_collection SET status='completed',data_json=$1 WHERE quoteid='q'",[part]);
    let saved=(await db.query("SELECT data_json FROM public.quotes_collection WHERE quoteid='q'")).rows[0].data_json;
    assert.equal(saved.totaal_uren,50);
    assert.deepEqual(saved.werkbeschrijving,original.werkbeschrijving);
    assert.equal(saved.verbruiksartikelen[0].prijs_per_stuk,73.68);
    await db.query("UPDATE public.quotes_collection SET data_json=$1 WHERE quoteid='q'",[part]);
    saved=(await db.query("SELECT data_json FROM public.quotes_collection WHERE quoteid='q'")).rows[0].data_json;
    assert.deepEqual(saved,part);
  } finally { await db.close(); }
});

test('RPC bewaart grote calculaties, weigert andere eigenaar/verouderde bron en herstelt exact', async () => {
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE public.quotes_collection(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),gebruikerid text,status text,data_json jsonb);`);
  await db.exec(fs.readFileSync('staging_sql/20261104_compare_and_swap_quote_calculation.sql','utf8'));
  const source={description:'x'.repeat(50000),hours:50};const next={...source,hours:16};
  const id=(await db.query("INSERT INTO public.quotes_collection(gebruikerid,status,data_json) VALUES ('owner','completed',$1) RETURNING id",[source])).rows[0].id;
  const call=(owner,expected,replacement)=>db.query('SELECT * FROM public.compare_and_swap_quote_calculation($1,$2,$3,$4)',[id,owner,expected,replacement]);
  assert.equal((await call('other',source,next)).rows.length,0);
  assert.equal((await call('owner',{},next)).rows.length,0);
  assert.deepEqual((await call('owner',source,next)).rows[0].data_json,next);
  assert.equal((await call('owner',source,{hours:99})).rows.length,0);
  assert.deepEqual((await call('owner',next,source)).rows[0].data_json,source);
  assert.equal((await db.query('SELECT status FROM public.quotes_collection')).rows[0].status,'completed');
  const permissions=(await db.query("SELECT has_function_privilege('anon','public.compare_and_swap_quote_calculation(uuid,text,jsonb,jsonb)','EXECUTE') AS anon, has_function_privilege('authenticated','public.compare_and_swap_quote_calculation(uuid,text,jsonb,jsonb)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.compare_and_swap_quote_calculation(uuid,text,jsonb,jsonb)','EXECUTE') AS server")).rows[0];
  assert.deepEqual(permissions,{anon:false,authenticated:false,server:true});
 } finally {await db.close();}
});
