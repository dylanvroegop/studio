process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node', jsx: 'react-jsx' });
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JOB_REGISTRY } = require('../src/lib/job-registry');
const { getJobConfig } = require('../src/config/jobTypes');
const { SystemCeilingDrawing } = require('../src/components/visualizers/SystemCeilingDrawing');

const job = JOB_REGISTRY.plafonds.items.find(item => item.slug === 'systeemplafond');
const defaults = Object.fromEntries(job.measurements.map(field => [field.key, field.defaultValue ?? '']));
test('systeemplafond heeft materiaalonderdelen, rasterinvoer en sparingen', () => {
  assert.equal(job.title, 'Systeemplafonds');
  assert.equal(defaults.plaat_lengte, 600);
  assert.equal(defaults.plaat_breedte, 600);
  assert.equal(new Set(job.materialSections.map(section => section.key)).size, 9);
  assert.ok(job.materialSections.every(section => job.categoryConfig[section.category]));
  assert.deepEqual(getJobConfig(job.slug).sections, ['openingen']);
});
test('tekening rendert recht, L en U met verschillende rastermaten zonder ongeldige coordinaten', () => {
  for (const shape of ['rectangle', 'l-shape', 'u-shape']) {
    for (const tileLength of [600, 1200]) {
      const item = { ...defaults, lengte: 5000, breedte: 4000, shape, plaat_lengte: tileLength,
        lengte1: 2000, lengte2: 1000, lengte3: 2000, hoogte1: 4000, hoogte2: 2000, hoogte3: 4000,
        openings: [{ id: 'sparing', width: 600, height: 600, fromLeft: 1200, fromBottom: 600 }] };
      const html = renderToStaticMarkup(React.createElement(SystemCeilingDrawing, { item }));
      assert.match(html, /<svg/);
      assert.match(html, /<pattern/);
      assert.match(html, new RegExp(`raster ${tileLength} × 600 mm`));
      assert.match(html, /stroke-dasharray="5 3"/);
      assert.doesNotMatch(html, /NaN|Infinity/);
    }
  }
});
test('ontbrekende maten geven een invulmelding in plaats van een fictief plafond', () => {
  const html = renderToStaticMarkup(React.createElement(SystemCeilingDrawing, { item: defaults }));
  assert.match(html, /Vul de plafondafmetingen/);
  assert.doesNotMatch(html, /<svg/);
});
