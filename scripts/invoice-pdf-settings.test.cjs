const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/invoice-pdf-settings.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', compiled)(loaded.exports);
const { buildInvoicePdfDefaultSettings, resolveInvoiceCostBreakdownSettings } = loaded.exports;
const hidden = { showMaterialLaborBreakdown: false, showTransportBreakdown: false, showHourlyRateOnInvoice: false };
const detailed = { showMaterialLaborBreakdown: true, showTransportBreakdown: true, showHourlyRateOnInvoice: true };

test('kosten zijn standaard verborgen en blijven na heropenen een keuze per factuur', () => {
  assert.deepEqual(resolveInvoiceCostBreakdownSettings(), hidden);
  const stored = JSON.parse(JSON.stringify(detailed));
  assert.deepEqual(resolveInvoiceCostBreakdownSettings(stored), detailed);
  assert.deepEqual(resolveInvoiceCostBreakdownSettings(), hidden, 'een andere factuur neemt niets over');
  assert.deepEqual(resolveInvoiceCostBreakdownSettings(JSON.parse(JSON.stringify(hidden))), hidden);
});

test('opslaan van een uitgesplitste factuur maakt geen globale kostenspecificatie', () => {
  const defaults = buildInvoicePdfDefaultSettings({
    ...detailed, issueDateISO: '2026-11-09', invoiceDescription: 'Klantgebonden omschrijving',
    paymentTermDays: 14, showLogo: true, showQuoteReference: true, showSpecification: true,
    showTotalsBreakdown: true, showBankDetails: true, customPaymentText: 'Betalen binnen 14 dagen.',
  });
  assert.equal(defaults.paymentTermDays, 14);
  assert.equal(defaults.customPaymentText, 'Betalen binnen 14 dagen.');
  for (const field of [...Object.keys(detailed), 'issueDateISO', 'invoiceDescription']) {
    assert.equal(field in defaults, false, `${field} is alleen van deze factuur`);
  }
});

test('bestaande individuele keuzes en oude ureninstelling blijven behouden', () => {
  assert.deepEqual(resolveInvoiceCostBreakdownSettings({ showTransportBreakdown: true }), { ...hidden, showTransportBreakdown: true });
  assert.deepEqual(resolveInvoiceCostBreakdownSettings({ showHoursBreakdown: true }), { ...hidden, showHourlyRateOnInvoice: true });
  assert.deepEqual(resolveInvoiceCostBreakdownSettings({ showHourlyRateOnInvoice: false, showHoursBreakdown: true }), hidden);
});
