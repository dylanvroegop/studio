import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set([
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 8000;

function isAllowedHost(hostname: string): boolean {
    return ALLOWED_HOSTS.has(hostname) || hostname.endsWith('.firebasestorage.app');
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }

    if (!isAllowedHost(parsed.hostname)) {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 400 });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(parsed.toString(), { signal: controller.signal })
            .finally(() => clearTimeout(timeout));

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return NextResponse.json({ error: 'URL does not point to an image' }, { status: 400 });
        }

        const contentLengthHeader = res.headers.get('content-length');
        const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
        if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
            return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_BYTES) {
            return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }

        const base64 = buffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        return NextResponse.json({ dataUrl });
    } catch (err) {
        console.error('visualisatie-to-base64 error:', err);
        return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
    }
}
