const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function fixture() {
  const text = [];
  let page = 1;
  class PDF {
    internal = { pageSize: { getWidth: () => 210 } };
    setProperties() {} setFont() {} setFontSize() {} setTextColor() {}
    setDrawColor() {} setFillColor() {} line() {} roundedRect() {}
    addPage() { page += 1; }
    text(value, x, y) { text.push({ value, x, y, page }); }
    splitTextToSize(value, width) {
      return value.match(new RegExp(`.{1,${Math.floor(width / 2)}}(?:\\s|$)|.{1,${Math.floor(width / 2)}}`, 'g')) || [''];
    }
    output() { return new Blob(); }
  }
  const dependencies = {
    jspdf: { jsPDF: PDF },
    './quote-calculations': {},
    './pdf-image-cache': {},
    './invoice-sharing': { invoiceShareFilename: () => 'test.pdf' },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/generate-invoice-pdf.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, module, module.exports);
  return { render: module.exports.generateInvoicePDF, text };
}

const invoice = {
  invoiceType: 'eind', invoiceNumberLabel: 'TEST-001', issueDate: '8 november 2026', dueDate: '11 november 2026',
  bedrijf: { naam: 'Testbedrijf', adres: '', postcode: '', plaats: '', telefoon: '', email: '', kvk: '', btw: '', iban: 'TEST' },
  klant: { naam: 'Testklant', adres: '', postcode: '', plaats: '', telefoon: '', email: '' },
  totals: { totaalInclBtw: 1613.06 },
  financialAdjustments: { originalTotalInclBtw: 2954.53, voorschotAftrekInclBtw: 1477.27, voorschotFactuurPaidAmount: 1477.27, extraWorkInclBtw: 135.80 },
  extraWork: [{ description: 'Rooster plaatsen, lat boven deur plaatsen + rooster kosten.', amountInclBtw: 135.80, amountExclBtw: 112.23, vatAmount: 23.57, vatRate: 21 }],
};
const money = (value) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);

test('klant ziet eerst de resterende 50%, eenmaal het meerwerk en één totaal te betalen', async () => {
  const pdf = fixture(); await pdf.render(invoice);
  const lines = pdf.text.map((row) => row.value);
  assert.equal(lines.filter((line) => line === money(135.80)).length, 1);
  assert.equal(lines.filter((line) => line === money(1613.06)).length, 1);
  assert.ok(lines.includes(money(1477.26)));
  assert.ok(lines.indexOf('Resterende eindtermijn (50%)') < lines.indexOf('Meerwerk (incl. BTW)'));
  assert.ok(lines.indexOf('Meerwerk (incl. BTW)') < lines.indexOf('Totaal te betalen (incl. BTW)'));
  assert.equal(lines.some((line) => line.includes('Reeds betaald op voorschot')), false);
});

test('deelbetaling op de eindfactuur verlaagt alleen het nog te betalen bedrag', async () => {
  const pdf = fixture(); await pdf.render({ ...invoice, paidAmount: 500 });
  const lines = pdf.text.map((row) => row.value);
  assert.ok(lines.includes('Ontvangen op deze factuur'));
  assert.ok(lines.includes(money(-500)));
  assert.ok(lines.includes('Nog te betalen (incl. BTW)'));
  assert.ok(lines.includes(money(1113.06)));
  assert.ok(lines.includes(money(1477.26)));
});

test('verborgen offerte-specificatie houdt basisbedrag plus meerwerk uitlegbaar', async () => {
  const pdf = fixture(); await pdf.render({ ...invoice, financialAdjustments: undefined });
  const lines = pdf.text.map((row) => row.value);
  assert.ok(lines.includes('Factuurbedrag zonder meerwerk'));
  assert.ok(lines.includes(money(1477.26)));
  assert.equal(lines.filter((line) => line === money(135.80)).length, 1);
});

test('voorschot zonder meerwerk krijgt geen eindtermijn en heeft één betaalbedrag', async () => {
  const pdf = fixture(); await pdf.render({ ...invoice, invoiceType: 'voorschot', extraWork: [], totals: { totaalInclBtw: 1477.27 } });
  const lines = pdf.text.map((row) => row.value);
  assert.equal(lines.some((line) => line.includes('Resterende eindtermijn')), false);
  assert.equal(lines.filter((line) => line === money(1477.27)).length, 1);
});

test('lange meerwerkomschrijvingen behouden bedrag en totaal binnen paginamarges', async () => {
  const pdf = fixture();
  await pdf.render({ ...invoice, extraWork: [{ ...invoice.extraWork[0], description: 'Extra werkzaamheden en materiaal. '.repeat(60) }] });
  assert.ok(pdf.text.at(-1).page > 1);
  assert.ok(pdf.text.every((row) => row.y >= 20 && row.y <= 277));
  assert.equal(pdf.text.filter((row) => row.value === money(135.80)).length, 1);
  assert.equal(pdf.text.filter((row) => row.value === money(1613.06)).length, 1);
});
