import path from 'node:path';
import Module from 'node:module';

const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function resolveFilename(request: string, parent: unknown, isMain: boolean, options: unknown) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.join(__dirname, '..', request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function run(): void {
  const { runInvoicePdfUnitTests } = require('../lib/generate-invoice-pdf.test') as typeof import('../lib/generate-invoice-pdf.test');
  runInvoicePdfUnitTests();
  // eslint-disable-next-line no-console
  console.log('Invoice PDF tests geslaagd.');
}

run();
