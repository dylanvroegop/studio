import path from 'node:path';
import Module from 'node:module';

const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function resolveFilename(request: string, parent: unknown, isMain: boolean, options: unknown) {
    return originalResolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, parent, isMain, options);
};

require('../lib/quote-pdf-translation.test').runQuotePdfTranslationTests().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
