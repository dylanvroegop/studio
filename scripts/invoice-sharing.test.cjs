const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function load(filename, dependencies = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const preset = load('src/lib/whatsapp-message-preset.ts');
const sharing = load('src/lib/invoice-sharing.ts', { './whatsapp-message-preset': preset });
const context = { clientName: 'Jansen Bouw B.V.', invoiceType: 'eind', invoiceNumber: '2026-123', amount: 2500, dueDate: '20 oktober 2026', companyName: 'Vroegop Timmerwerken' };

test('PDF bestandsnaam heeft factuurnummer en klant, zonder paden of domeinprefix', () => {
  assert.equal(sharing.invoiceShareFilename('2026/123', 'Jánsen & Zonen B.V.'), 'Factuur-2026-123-Jansen-Zonen-B-V.pdf');
  assert.equal(sharing.invoiceShareFilename('../123\r\n', 'a\\b\u0000:c<>?*|'), 'Factuur-123-a-b-c.pdf');
  assert.equal(sharing.invoiceShareFilename('', ''), 'Factuur-zonder-nummer-klant.pdf');
  assert.ok(sharing.invoiceShareFilename('9'.repeat(500), 'a'.repeat(500)).length < 160);
});

test('accounttekst gaat vóór oude browsertekst, ook als account bewust leeg is', () => {
  assert.deepEqual(sharing.initialInvoiceMessageTemplate('Account', 'Browser'), { template: 'Account', source: 'account' });
  assert.deepEqual(sharing.initialInvoiceMessageTemplate('', 'Browser'), { template: '', source: 'account' });
  assert.equal(sharing.initialInvoiceMessageTemplate(undefined, '').template, sharing.DEFAULT_INVOICE_MESSAGE);
  assert.equal(sharing.initialInvoiceMessageTemplate(undefined, '  \n ').template, sharing.DEFAULT_INVOICE_MESSAGE);
  assert.equal(sharing.initialInvoiceMessageTemplate(undefined, null).template, sharing.DEFAULT_INVOICE_MESSAGE);
});

test('oude links verdwijnen bij import en tekst gebruikt volledige bedrijfsnaam en echte factuurwaarden', () => {
  const initial = sharing.initialInvoiceMessageTemplate(undefined, 'Beste {{voornaam}},\nFactuur link: {{factuur_link}}\nblob:https://app.calvora.nl/abc\nhttps://app.calvora.nl/view/abc');
  assert.deepEqual(initial, { template: 'Beste {{voornaam}},', source: 'browser' });
  assert.equal(sharing.resolveInvoiceMessage(initial.template, context), 'Beste Jansen Bouw B.V.,');
  const message = sharing.resolveInvoiceMessage(sharing.DEFAULT_INVOICE_MESSAGE, context);
  assert.match(message, /eindfactuur 2026-123/);
  assert.match(message, /2\.500,00/);
  assert.match(message, /20 oktober 2026/);
  assert.match(message, /Vroegop Timmerwerken/);
  assert.doesNotMatch(message, /\{\{|calvora|blob:/i);
});

test('deelverzoek gebruikt vooraf klaargezet benoemd PDF en start synchronisch binnen gebruikerstik', async () => {
  const file = new File(['pdf'], 'Factuur-2026-123-Jansen.pdf', { type: 'application/pdf' });
  let call;
  const pending = sharing.sharePreparedInvoice({
    canShare: (data) => data.files[0] === file,
    share: (data) => { call = data; return Promise.resolve(); },
  }, file, 'Bericht\nblob:https://app.calvora.nl/123');
  assert.deepEqual(call, { files: [file], text: 'Bericht' }, 'geen title/url dat bestandsnaam of bericht kan vervuilen');
  assert.equal(await pending, 'shared');
});

test('annulering deelt, downloadt of verstuurt niets opnieuw en is geen succesvolle verzending', async () => {
  const file = new File(['pdf'], 'Factuur.pdf', { type: 'application/pdf' });
  let calls = 0;
  assert.equal(await sharing.sharePreparedInvoice({ canShare: () => true, share: () => { calls++; return Promise.reject(new DOMException('Cancelled', 'AbortError')); } }, file, ''), 'cancelled');
  assert.equal(calls, 1);
  assert.equal(await sharing.sharePreparedInvoice({ canShare: () => true, share: () => { throw new DOMException('Cancelled', 'AbortError'); } }, file, ''), 'cancelled');
  assert.equal(await sharing.sharePreparedInvoice({}, file, 'Bericht'), 'unsupported');
  assert.equal(await sharing.sharePreparedInvoice({ canShare: () => false, share: () => { throw new Error('must not run'); } }, file, ''), 'unsupported');
  assert.equal(sharing.canShareInvoiceFile({ canShare: () => { throw new Error('unsupported'); }, share: async () => {} }, file), false);
  await assert.rejects(sharing.sharePreparedInvoice({ canShare: () => true, share: async () => { throw new Error('share failed'); } }, file, ''), /share failed/);
});

test('WhatsApp fallback normaliseert Nederlands nummer en stuurt geen documentlinks', () => {
  assert.equal(sharing.invoiceWhatsAppUrl('06 1234 5678', 'Hoi'), 'https://wa.me/31612345678?text=Hoi');
  assert.equal(sharing.invoiceWhatsAppUrl('0031 6 12345678', 'Hoi'), 'https://wa.me/31612345678?text=Hoi');
  assert.equal(sharing.invoiceWhatsAppUrl('+31 6 12345678', 'Hoi {{factuur_link}}'), 'https://wa.me/31612345678?text=Hoi');
  assert.equal(sharing.invoiceWhatsAppUrl('123', 'Hoi'), null);
});
