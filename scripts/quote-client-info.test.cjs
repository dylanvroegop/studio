const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (filename in overrides) return overrides[filename];
    if (!filename.startsWith('@/')) return require(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(path.join(__dirname, '..', filename.replace('@/', 'src/') + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', code)(load, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const { resolveQuoteClientInfo } = load('@/lib/quote-client-info');
const { buildKlantSnapshot, buildProjectAdresSnapshot } = load('@/lib/invoice-document');
const { syncInvoiceDraftClients } = load('@/lib/invoice-draft-client-sync');
const current = {
  klanttype: 'Zakelijk', bedrijfsnaam: 'Gooische tuin service', voornaam: 'Rutger',
  straat: 'Noorderweg', huisnummer: '7', postcode: '1401 TV', plaats: 'Bussum',
  emailadres: '', afwijkendProjectadres: true,
  projectStraat: 'Cannenburgerweg', projectHuisnummer: '5', projectPostcode: '1244 RE', projectPlaats: 'Ankeveen',
};
test('actuele klant en factuuradres winnen van oude calculatie; leeg blijft leeg', () => {
  const result = resolveQuoteClientInfo(current, { bedrijfsnaam: 'Oud', emailadres: 'oud@example.nl', straat: 'Oude straat' });
  assert.equal(result.bedrijfsnaam, 'Gooische tuin service');
  assert.equal(result.straat, 'Noorderweg');
  assert.equal(result.emailadres, '');
  assert.equal(result.projectAdres.straat, 'Cannenburgerweg');
  assert.equal(resolveQuoteClientInfo({}, { voornaam: 'Oud' }).voornaam, '');
});
test('legacy geneste adressen en calculatiefallback blijven bruikbaar', () => {
  const result = resolveQuoteClientInfo(null, { voornaam: 'Jan', factuuradres: { straat: 'Straat', huisnummer: '3', toevoeging: 'a' } });
  assert.equal(result.voornaam, 'Jan');
  assert.equal(result.huisnummer, '3 a');
  assert.equal(result.straat, 'Straat');
});
test('factuursnapshot gebruikt bedrijf en factuuradres, met apart projectadres', () => {
  const quote = { klantinformatie: { ...current, factuuradres: { straat: 'Verouderd', huisnummer: '1' } } };
  const customer = buildKlantSnapshot(quote);
  assert.equal(customer.naam, current.bedrijfsnaam);
  assert.equal(customer.adres, 'Noorderweg 7');
  assert.equal(customer.plaats, 'Bussum');
  assert.equal(buildProjectAdresSnapshot(quote).adres, 'Cannenburgerweg 5');
  assert.equal(buildProjectAdresSnapshot({ klantinformatie: { ...current, afwijkendProjectadres: false } }), null);
});
test('opslaan wijzigt alleen eigen concepten, zonder bedragen of factuurnummers te veranderen', async () => {
  const writes = [];
  const rows = ['concept', 'verzonden', 'betaald', 'geannuleerd'].map(status => ({
    ref: status, data: () => ({ userId: 'owner', status }),
  }));
  rows.push({ ref: 'other-owner', data: () => ({ userId: 'other', status: 'concept' }) });
  const firestore = {
    doc: () => 'quote', collection: () => ({ where: () => 'invoices' }),
    runTransaction: fn => fn({
      get: async target => target === 'quote' ? { data: () => ({ userId: 'owner', klantinformatie: current }) } : { docs: rows },
      update: (ref, data) => writes.push({ ref, data }),
    }),
  };
  await syncInvoiceDraftClients(firestore, 'quote', 'owner');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref, 'concept');
  assert.deepEqual(Object.keys(writes[0].data), ['sourceQuote.klantSnapshot', 'sourceQuote.projectAdresSnapshot']);
  assert.equal(writes[0].data['sourceQuote.klantSnapshot'].naam, current.bedrijfsnaam);
});
