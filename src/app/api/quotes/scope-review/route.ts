import { getStorage } from 'firebase-admin/storage';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { initFirebaseAdmin } from '@/firebase/admin';
import { firebaseConfig } from '@/firebase/config';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { analyzeScopeReview } from '@/lib/quote-scope-review-ai';
import { MAX_REVIEW_PHOTOS, sourceSchema } from '@/lib/quote-scope-review';
import type { QuotePhotoAttachment } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 240;

const inputSchema = z.object({
    quoteId: z.string().min(1).max(200).regex(/^[^/]+$/),
    sources: z.array(sourceSchema).max(200),
    photoIds: z.array(z.string().min(1).max(200)).max(MAX_REVIEW_PHOTOS),
});

async function loadPhoto(photo: QuotePhotoAttachment, prefix: string): Promise<string> {
    const bucket = getStorage().bucket(firebaseConfig.storageBucket);
    for (const path of [photo.storagePath, photo.thumbnailStoragePath]) {
        if (!path?.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
        try {
            const file = bucket.file(path);
            const [metadata] = await file.getMetadata();
            if (Number(metadata.size) > 15 * 1024 * 1024 || !metadata.contentType?.startsWith('image/')) continue;
            const [bytes] = await file.download({ validation: false, end: 15 * 1024 * 1024 });
            const jpeg = await sharp(bytes, { limitInputPixels: 80000000 }).rotate()
                .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
            return 'data:image/jpeg;base64,' + jpeg.toString('base64');
        } catch {
            // Gebruik het opgeslagen voorbeeld als het origineel niet kan worden gelezen.
        }
    }
    throw new Error('Foto “' + photo.originalName + '” kon niet worden gelezen. Kies een andere foto of upload een JPG.');
}

export async function POST(request: Request): Promise<Response> {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: 'Log in om de offerte te controleren.' }, { status: 401 });
    const { auth, firestore } = initFirebaseAdmin();
    const user = await auth.verifyIdToken(token).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Log opnieuw in.' }, { status: 401 });
    try {
        const blocked = await ensureDemoTrialActiveByUid(user.uid);
        if (blocked) return blocked;
        const parsed = inputSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'De invoer is ongeldig of te groot.' }, { status: 400 });
        const { quoteId, sources, photoIds } = parsed.data;
        if ((!sources.length && !photoIds.length) || JSON.stringify(sources).length > 180000) {
            return NextResponse.json({ error: 'Controleer de omvang van de invoer en voeg minimaal één bron toe.' }, { status: 400 });
        }
        const quote = (await firestore.collection('quotes').doc(quoteId).get()).data();
        if (!quote || quote.userId !== user.uid) return NextResponse.json({ error: 'Offerte niet toegankelijk.' }, { status: 403 });
        const photos: QuotePhotoAttachment[] = Array.isArray(quote.fotos) ? quote.fotos : [];
        const images = [];
        for (const id of new Set(photoIds)) {
            const index = photos.findIndex(photo => photo.id === id);
            if (index < 0) return NextResponse.json({ error: 'Een geselecteerde foto is verwijderd. Open de offerte opnieuw.' }, { status: 409 });
            const dataUrl = await loadPhoto(photos[index], 'users/' + user.uid + '/quotes/' + quoteId + '/fotos/');
            images.push({ label: 'Foto ' + (index + 1) + ' · ' + String(photos[index].originalName || 'Projectfoto').slice(0, 120), dataUrl });
        }
        const report = await analyzeScopeReview(sources, images);
        return NextResponse.json(report);
    } catch (error) {
        const message = error instanceof Error && error.name === 'TimeoutError'
            ? 'De analyse duurde te lang. Probeer opnieuw met minder foto’s.'
            : error instanceof Error ? error.message : 'De controle is mislukt.';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
