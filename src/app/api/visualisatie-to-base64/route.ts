import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
]);

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

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 400 });
    }

    try {
        const res = await fetch(parsed.toString());
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
        }
        const contentType = res.headers.get('content-type') || 'image/png';
        const buffer = Buffer.from(await res.arrayBuffer());
        const base64 = buffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        return NextResponse.json({ dataUrl });
    } catch (err) {
        console.error('visualisatie-to-base64 error:', err);
        return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
    }
}
