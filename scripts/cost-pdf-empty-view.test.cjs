const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });

function renderCosts(costs) {
  const element = tag => props => React.createElement(tag, props, props.children);
  const deps = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': Object.fromEntries(['CalendarDays', 'FileText', 'Image', 'Link2', 'Loader2', 'Receipt', 'Search'].map(name => [name, element('span')])),
    '@/components/ui/badge': { Badge: element('span') }, '@/components/ui/button': { Button: element('button') },
    '@/components/ui/input': { Input: element('input') }, '@/firebase': { useUser: () => ({ user: null }) },
    '@/lib/project-costs': { PROJECT_COST_CATEGORY_LABELS: {} },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '@/lib/cost-archive-visibility': require('../src/lib/cost-archive-visibility'),
    '@/lib/cost-document-display': require('../src/lib/cost-document-display'),
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/kosten/KostenPdfTab.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in deps, `Onverwachte afhankelijkheid: ${name}`); return deps[name];
  }, mod, mod.exports);
  return renderToStaticMarkup(React.createElement(mod.exports.KostenPdfTab, { costs, quoteById: new Map(), onOpenCost: () => {} }));
}

test('lege kostenweergave houdt beide documentknoppen bereikbaar', () => {
  const html = renderCosts([]);
  assert.match(html, /<button[^>]*>Bij kosten<\/button>/);
  assert.match(html, /<button[^>]*>Ongekoppelde bronnen<\/button>/);
  assert.match(html, /Geen documenten bij kosten/);
});


function sourceCost(type) {
  return { id: 'cost-1', supplier_name: 'Wear2work', supplier_invoice_number: '26755790', date: '2026-07-01',
    category: 'overig', offerte_id: null, line_items: [], amount_incl_btw: 361.71,
    receipt_files: [{ url: 'https://example.invalid/order.pdf', filename: 'order.pdf', content_type: 'application/pdf', document_type: type }] };
}

test('bestelbevestiging krijgt bronlabel in lijst en detail zonder het bedrag te veranderen', () => {
  const cost = sourceCost('order_confirmation');
  const before = structuredClone(cost);
  const html = renderCosts([cost]);
  assert.equal((html.match(/Bestelbevestiging · geen factuur/g) || []).length, 2);
  assert.match(html, /Totaal document/);
  assert.doesNotMatch(html, /Totaal factuur/);
  assert.match(html, /361,71/);
  assert.deepEqual(cost, before);
});

test('echte factuur behoudt gewone weergave en bedrag', () => {
  const html = renderCosts([sourceCost('invoice')]);
  assert.match(html, /Totaal factuur/);
  assert.doesNotMatch(html, /geen factuur/);
  assert.match(html, /361,71/);
});
