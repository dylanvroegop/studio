const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRoute, calculations, delivery } = require('./work-description-test-harness.cjs');
process.env.OPENAI_API_KEY = 'test'; // Alle AI-aanroepen in deze tests zijn gestubd.

const wallText = 'Wand plaatsen: Plaatsen van een wand met een afmeting van 3650 x 2400 mm. In de wand wordt een opening gemaakt voor een deur, inclusief het plaatsen van een deur met kozijn passend bij de bestaande deuren.';
// Werkelijk AI-antwoord dat vóór de fix HTTP 200 met een lege summary opleverde.
const recordedOutput = `${wallText} Uitgangspunt is een schilderklare oplevering; schilderwerk is niet opgenomen. Elektrawerk, waaronder het verwijderen van de 2 stopcontacten, is niet opgenomen.`;
const controls = { afvalAfvoeren: true, sloopwerkInbegrepen: true, finishLevel: 'volledig_afgewerkt', electricalScope: { enabled: false } };
const note = { title: 'Wand plaatsen', notes: 'Wand = 3650x2400. Gat maken voor deur + deur plaatsen met kozijn zoals bestaande deuren. Electra verwijderen 2 stopcontacten.', dimensions: ['Lengte = 3650 mm | Hoogte = 2400 mm'] };

async function generate(outputs, body = {}) {
  const prompts = [];
  const route = createRoute(async (_url, init) => {
    prompts.push(JSON.parse(init.body).input[1].content[0].text);
    const text = outputs[Math.min(prompts.length - 1, outputs.length - 1)];
    return { ok: true, json: async () => ({ output_text: text }) };
  });
  const response = await route.POST(new Request('http://localhost/api/generate-work-description', {
    method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Actie: full', structuredInput: controls, noteJobs: [note], ...body }),
  }));
  return { status: response.status, payload: await response.json(), prompts };
}

test('wand en deur blijven behouden wanneer AI elektrawerk expliciet uitsluit', async () => {
  const result = await generate([recordedOutput]);
  assert.equal(result.status, 200);
  const job = result.payload.werkbeschrijvingStructured.jobs[0];
  assert.ok(job.summary.includes(wallText));
  assert.ok(!job.summary.includes('stopcontacten'));
  // Herhaal de normalisatie die de pagina en het opslaan uitvoeren.
  const roundtrip = calculations.toStructuredWorkDescription({ werkbeschrijving_structured: result.payload.werkbeschrijvingStructured });
  assert.equal(roundtrip.jobs[0].summary, job.summary);
  assert.ok(roundtrip.jobs[0].work_scope.join(' ').includes('kozijn'));
});

test('filter verwijdert alleen betreffende zinnen en behoudt maatvoering met decimalen', () => {
  for (const blocked of ['Afval afvoeren.', 'Stopcontacten verplaatsen.', 'Het hout schilderen.', 'Naden vullen.']) {
    const text = `Een wand van 3.65 meter plaatsen. ${blocked} Een deur plaatsen.`;
    const scope = delivery.sanitizeWorkDeliveryScope({ summary: text, work_scope: [text] });
    assert.equal(scope.summary, 'Een wand van 3.65 meter plaatsen. Een deur plaatsen.');
    assert.equal(scope.work_scope.join(' '), scope.summary);
    assert.equal(delivery.sanitizeWorkDeliveryScope(scope).summary, scope.summary);
  }
});

test('na volledig weggefilterde AI-tekst wordt alleen de ontbrekende klus hersteld', async () => {
  const result = await generate(['Stopcontacten verplaatsen.', wallText]);
  assert.equal(result.status, 200);
  assert.equal(result.prompts.length, 2);
  assert.ok(result.payload.werkbeschrijvingStructured.jobs[0].summary.includes('kozijn'));
});

test('blijvend lege klanttekst wordt nooit als geslaagd antwoord teruggegeven', async () => {
  const result = await generate(['Stopcontacten verplaatsen.']);
  assert.equal(result.status, 502);
  assert.match(result.payload.error, /Wand plaatsen/);
  assert.equal(result.prompts.length, 2);
});

test('meerdere klussen behouden eigen tekst en alleen de lege klus wordt opnieuw gegenereerd', async () => {
  const second = { title: 'Planken plaatsen', notes: 'Twee eiken planken plaatsen.', dimensions: [] };
  const result = await generate([wallText, 'Stopcontacten verplaatsen.', 'Twee eiken planken plaatsen.'], { noteJobs: [note, second] });
  assert.equal(result.status, 200);
  assert.equal(result.prompts.length, 3);
  const jobs = result.payload.werkbeschrijvingStructured.jobs;
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].summary, wallText);
  assert.equal(jobs[1].summary, 'Twee eiken planken plaatsen.');
  assert.ok(!result.prompts[0].includes('Twee eiken planken'));
  assert.ok(!result.prompts[2].includes(note.notes));
});

test('calculatieklussen gebruiken actuele schakelaars in plaats van oude klusinstellingen', async () => {
  const text = 'Een wand plaatsen. Afval afvoeren. De gipsschroef gaten stuccen.';
  const result = await generate([text], {
    noteJobs: [], structuredInput: {
      ...controls, finishLevel: 'constructief_gereed', schroefgatenPlamurenInbegrepen: true,
      jobs: [{ title: 'Wand plaatsen', afvalAfvoeren: false, schroefgatenPlamurenInbegrepen: false }],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.werkbeschrijvingStructured.jobs[0].summary, text);
  assert.equal(result.payload.werkbeschrijvingStructured.jobs[0].schroefgatenPlamurenInbegrepen, true);
});

test('ingeschakelde werkzaamheden blijven intact', () => {
  const summary = 'Een wand plaatsen. Stopcontacten verplaatsen. Afval afvoeren. Het hout schilderen. Naden vullen.';
  const scope = delivery.sanitizeWorkDeliveryScope({
    summary, work_scope: [summary], afvalAfvoeren: true, electricalScope: { enabled: true },
    schilderwerkInbegrepen: true, nadenVullenInbegrepen: true,
  });
  assert.equal(scope.summary, summary);
});

test('ook generatie zonder notitieklussen valideert de uiteindelijke tekst', async () => {
  const result = await generate(['Stopcontacten verplaatsen.', wallText], { noteJobs: [], structuredInput: {} });
  assert.equal(result.status, 200);
  assert.equal(result.prompts.length, 2);
  assert.equal(result.payload.werkbeschrijvingStructured.jobs[0].summary, wallText);
});

test('iPhone-instellingen behouden wand, deur, schroefgaten en schilderklare naden', async () => {
  const text = `${wallText} De gipsschroef gaten worden gestuct. De naden worden gevuld en schilderklaar afgewerkt. Elektrawerk is niet opgenomen.`;
  const result = await generate([text], { structuredInput: {
    ...controls, schroefgatenPlamurenInbegrepen: true,
    nadenVullenInbegrepen: true, nadenVullenAfwerkingsniveau: 'schilderklaar',
  } });
  assert.equal(result.status, 200);
  const roundtrip = calculations.toStructuredWorkDescription({ werkbeschrijving_structured: result.payload.werkbeschrijvingStructured });
  assert.ok(roundtrip.jobs[0].summary.includes(wallText));
  assert.match(roundtrip.jobs[0].summary, /gipsschroef gaten worden gestuct/);
  assert.match(roundtrip.jobs[0].summary, /naden worden gevuld en schilderklaar/);
  assert.equal(result.prompts.length, 1);
});
