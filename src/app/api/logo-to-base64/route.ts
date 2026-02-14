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
    try {
        const searchParams = request.nextUrl.searchParams;
        const logoUrl = searchParams.get('url');

        if (!logoUrl) {
            return NextResponse.json(
                { error: 'Missing logo URL parameter' },
                { status: 400 }
            );
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(logoUrl);
        } catch {
            return NextResponse.json({ error: 'Invalid logo URL' }, { status: 400 });
        }

        if (!isAllowedHost(parsedUrl.hostname)) {
            return NextResponse.json({ error: 'Host not allowed' }, { status: 400 });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        // Fetch the image from allowed storage host.
        const response = await fetch(parsedUrl.toString(), { signal: controller.signal })
            .finally(() => clearTimeout(timeout));

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch logo from storage' },
                { status: response.status }
            );
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return NextResponse.json({ error: 'URL does not point to an image' }, { status: 400 });
        }

        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
        if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
            return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }

        // Convert to buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length > MAX_BYTES) {
            return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }

        // Convert to base64
        const base64 = buffer.toString('base64');

        // Create data URL
        const dataUrl = `data:${contentType};base64,${base64}`;

        return NextResponse.json({ dataUrl });
    } catch (error) {
        console.error('Error converting logo to base64:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
