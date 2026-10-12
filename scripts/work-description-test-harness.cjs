const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, require: name => mocks[name] || require(name),
    console, process, AbortSignal, ...globals,
  }, { filename: file });
  return module.exports;
}

const delivery = load('src/lib/work-delivery.ts');
const calculations = load('src/lib/quote-calculations.ts', { '@/lib/work-delivery': delivery });
const coverage = load('src/lib/work-description-note-coverage.ts');

function createRoute(fetch) {
  return load('src/app/api/generate-work-description/route.ts', {
    '@/firebase/admin': { initFirebaseAdmin: () => ({ auth: { verifyIdToken: async () => ({ uid: 'test' }) }, firestore: {} }) },
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
    '@/lib/work-delivery': delivery,
    '@/lib/quote-calculations': calculations,
    '@/lib/work-description-note-coverage': coverage,
  }, { fetch });
}

module.exports = { createRoute, calculations, delivery };
