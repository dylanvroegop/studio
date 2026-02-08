import { NextRequest, NextResponse } from 'next/server';

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

        // Fetch the image from Firebase Storage (server-side, no CORS issues)
        const response = await fetch(logoUrl);

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch logo from storage' },
                { status: response.status }
            );
        }

        // Convert to buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Convert to base64
        const base64 = buffer.toString('base64');

        // Determine content type from response headers or URL
        const contentType = response.headers.get('content-type') || 'image/png';

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
