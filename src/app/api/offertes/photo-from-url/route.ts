import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

function safeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isBlockedHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    if (
        normalized === 'localhost'
        || normalized.endsWith('.localhost')
        || normalized.endsWith('.local')
        || normalized.endsWith('.internal')
        || normalized === 'metadata.google.internal'
    ) return true;

    const ipVersion = isIP(normalized);
    if (ipVersion === 4) {
        const parts = normalized.split('.').map(Number);
        const [first, second] = parts;
        return first === 0
            || first === 10
            || first === 127
            || (first === 169 && second === 254)
            || (first === 172 && second >= 16 && second <= 31)
            || (first === 192 && second === 168)
            || (first === 198 && (second === 18 || second === 19));
    }
    if (ipVersion === 6) {
        return normalized === '::1'
            || normalized.startsWith('fc')
            || normalized.startsWith('fd')
            || normalized.startsWith('fe80:');
    }
    return false;
}

function validateRemoteUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Alleen http- en https-afbeeldingen zijn toegestaan.');
    }
    if (isBlockedHostname(url.hostname)) {
        throw new Error('Deze afbeeldingslocatie is niet toegestaan.');
    }
    return url.href;
}

async function fetchRemoteImage(startUrl: string): Promise<{ response: Response; url: string }> {
    let currentUrl = validateRemoteUrl(startUrl);
    for (let redirect = 0; redirect <= 3; redirect += 1) {
        const response = await fetch(currentUrl, {
            redirect: 'manual',
            headers: {
                Accept: 'image/*',
                'User-Agent': 'Calvora image importer',
            },
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) throw new Error('De afbeelding verwijst door naar een ongeldige locatie.');
            currentUrl = validateRemoteUrl(new URL(location, currentUrl).href);
            continue;
        }
        return { response, url: currentUrl };
    }
    throw new Error('Te veel doorverwijzingen bij het ophalen van de afbeelding.');
}

async function readBodyWithLimit(response: Response): Promise<Buffer> {
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_PHOTO_BYTES) throw new Error('De internetafbeelding is groter dan 15 MB.');

    if (!response.body) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('De internetafbeelding is groter dan 15 MB.');
        return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAX_PHOTO_BYTES) {
            await reader.cancel();
            throw new Error('De internetafbeelding is groter dan 15 MB.');
        }
        chunks.push(Buffer.from(next.value));
    }
    return Buffer.concat(chunks, total);
}

function extensionForMimeType(contentType: string): string {
    return ({
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'image/heic': '.heic',
        'image/heif': '.heif',
        'image/svg+xml': '.svg',
    } as Record<string, string>)[contentType] || '.jpg';
}

function buildFilename(url: string, contentType: string): string {
    const rawName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
    if (rawName && /\.[a-z0-9]{2,8}$/i.test(rawName)) return rawName;
    return `${rawName || 'internet-foto'}${extensionForMimeType(contentType)}`;
}

export async function POST(request: Request): Promise<Response> {
    try {
        const authorization = request.headers.get('authorization') || '';
        const authToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
        if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { auth, firestore } = initFirebaseAdmin();
        const decoded = await auth.verifyIdToken(authToken).catch(() => null);
        if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await request.json().catch(() => null) as { quoteId?: unknown; url?: unknown } | null;
        const quoteId = safeString(payload?.quoteId);
        const sourceUrl = safeString(payload?.url);
        if (!quoteId || !sourceUrl) return NextResponse.json({ error: 'Offerte en afbeeldingslocatie zijn verplicht.' }, { status: 400 });

        const quote = await firestore.collection('quotes').doc(quoteId).get();
        if (!quote.exists || safeString(quote.data()?.userId) !== decoded.uid) {
            return NextResponse.json({ error: 'Geen toegang tot deze offerte.' }, { status: 403 });
        }

        const { response, url } = await fetchRemoteImage(sourceUrl);
        if (!response.ok) return NextResponse.json({ error: `De afbeelding kon niet worden opgehaald (${response.status}).` }, { status: 422 });
        const contentType = safeString(response.headers.get('content-type')).split(';')[0].toLowerCase();
        if (!contentType.startsWith('image/')) return NextResponse.json({ error: 'De gesleepte internetlink bevat geen afbeelding.' }, { status: 422 });

        const bytes = await readBodyWithLimit(response);
        if (bytes.byteLength === 0) return NextResponse.json({ error: 'De internetafbeelding is leeg.' }, { status: 422 });

        const filename = buildFilename(url, contentType);
        return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(bytes.byteLength),
                'Cache-Control': 'no-store',
                'X-Photo-Filename': encodeURIComponent(filename),
            },
        });
    } catch (error) {
        console.error('Error fetching internetfoto:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Kon de internetafbeelding niet ophalen.',
        }, { status: 422 });
    }
}
