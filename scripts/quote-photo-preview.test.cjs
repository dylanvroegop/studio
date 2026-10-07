const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadPreview(overrides = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../src/lib/quote-photo-preview.ts'), 'utf8');
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const revoked = [];
    const draws = [];
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (...args) => draws.push(args) }),
        toBlob: (resolve) => resolve(overrides.blob ?? { size: 80_000, type: 'image/webp' }),
    };
    class PhotoImage {
        naturalWidth = 4032;
        naturalHeight = 3024;
        set src(_url) {
            queueMicrotask(() => overrides.decodeError ? this.onerror() : this.onload());
        }
    }
    class ObjectUrl extends URL {
        static createObjectURL() { return 'blob:photo-preview'; }
        static revokeObjectURL(url) { revoked.push(url); }
    }
    vm.runInNewContext(code, {
        exports,
        window: {},
        document: { createElement: () => canvas },
        Image: PhotoImage,
        URL: ObjectUrl,
        queueMicrotask,
    });
    return { ...exports, canvas, revoked, draws };
}

test('voorbeelden passen binnen 640px met behoud van verhouding en worden niet vergroot', () => {
    const { getQuotePhotoPreviewDimensions: dimensions } = loadPreview();
    for (const [width, height, expected] of [
        [4032, 3024, [640, 480]],
        [3024, 4032, [480, 640]],
        [320, 240, [320, 240]],
    ]) {
        const result = dimensions(width, height);
        assert.deepEqual([result.width, result.height], expected);
    }
});

test('bestaande Firebase fotos kunnen verkleind worden zonder andere hosts of buckets toe te staan', () => {
    const { canOptimizeQuotePhoto } = loadPreview();
    const source = 'https://firebasestorage.googleapis.com/v0/b/studio-6011690104-60fbf.firebasestorage.app/o/users%2Fa%2Fquotes%2Fb%2Ffotos%2Fc.jpg?alt=media&token=secret';
    assert.equal(canOptimizeQuotePhoto(source, 'image/jpeg'), true);
    assert.equal(canOptimizeQuotePhoto(source.replace('studio-6011690104-60fbf', 'other-bucket'), 'image/jpeg'), false);
    assert.equal(canOptimizeQuotePhoto(source.replace('firebasestorage.googleapis.com', 'example.com'), 'image/jpeg'), false);
    assert.equal(canOptimizeQuotePhoto(source.replace('%2Fquotes%2Fb%2Ffotos', '%2Fprivate-documents'), 'image/jpeg'), false);
    assert.equal(canOptimizeQuotePhoto(source, 'image/heic'), false);
    assert.equal(canOptimizeQuotePhoto(source, undefined), false);
    assert.equal(canOptimizeQuotePhoto('blob:local-upload', 'image/jpeg'), false);
    const config = require('../next.config');
    const { hasRemoteMatch } = require('next/dist/shared/lib/match-remote-pattern');
    assert.equal(hasRemoteMatch([], config.images.remotePatterns, new URL(source)), true);
    assert.equal(hasRemoteMatch([], config.images.remotePatterns, new URL(source.replace('studio-6011690104-60fbf', 'other-bucket'))), false);
    assert.equal(hasRemoteMatch([], config.images.remotePatterns, new URL(source.replace('%2Fquotes%2Fb%2Ffotos', '%2Fprivate-documents'))), false);
});

test('groot origineel blijft intact en het tijdelijke voorbeeld wordt vrijgegeven', async () => {
    const { createQuotePhotoPreview, canvas, revoked, draws } = loadPreview();
    const original = Object.freeze({ size: 5_000_000, type: 'image/jpeg', name: 'foto.jpg' });
    const preview = await createQuotePhotoPreview(original);
    assert.equal(preview.size, 80_000);
    assert.equal(original.size, 5_000_000);
    assert.deepEqual([canvas.width, canvas.height], [640, 480]);
    assert.deepEqual(draws[0].slice(1), [0, 0, 640, 480]);
    assert.deepEqual(revoked, ['blob:photo-preview']);
});

test('niet ondersteunde afbeeldingen vallen terug op het origineel zonder de upload te blokkeren', async () => {
    const { createQuotePhotoPreview, revoked } = loadPreview({ decodeError: true });
    assert.equal(await createQuotePhotoPreview({ size: 5_000_000, type: 'image/heic' }), null);
    assert.deepEqual(revoked, ['blob:photo-preview']);
});

test('een groter voorbeeld wordt niet opgeslagen en animaties blijven origineel', async () => {
    const { createQuotePhotoPreview } = loadPreview({ blob: { size: 2000, type: 'image/png' } });
    assert.equal(await createQuotePhotoPreview({ size: 1000, type: 'image/png' }), null);
    assert.equal(await createQuotePhotoPreview({ size: 5_000_000, type: 'image/gif' }), null);
});

test('bestaande fotos worden ook in standalone productie werkelijk kleiner verstuurd', async () => {
    const sharp = require('sharp');
    const { optimizeImage } = require('next/dist/server/image-optimizer');
    const original = await sharp({
        create: { width: 4032, height: 3024, channels: 3, background: '#a47a57' },
    }).jpeg({ quality: 96 }).toBuffer();
    const preview = await optimizeImage({
        buffer: original,
        contentType: 'image/webp',
        quality: 75,
        width: 640,
        nextConfigOutput: 'standalone',
    });
    const metadata = await sharp(preview).metadata();
    assert.deepEqual([metadata.width, metadata.height, metadata.format], [640, 480, 'webp']);
    assert.ok(preview.length < original.length / 10);
});
