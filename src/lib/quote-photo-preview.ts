export const QUOTE_PHOTO_PREVIEW_MAX_DIMENSION = 640;

export function getQuotePhotoPreviewDimensions(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(1, QUOTE_PHOTO_PREVIEW_MAX_DIMENSION / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

export function canOptimizeQuotePhoto(url: string, mimeType: string): boolean {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(String(mimeType || '').toLowerCase())) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:'
            && parsed.hostname === 'firebasestorage.googleapis.com'
            && /^\/v0\/b\/studio-6011690104-60fbf\.firebasestorage\.app\/o\/users%2F[^/]+%2Fquotes%2F[^/]+%2Ffotos%2F[^/]+$/.test(parsed.pathname);
    } catch {
        return false;
    }
}

/** Een klein voorbeeld naast het origineel; het originele bestand blijft intact. */
export async function createQuotePhotoPreview(file: File): Promise<Blob | null> {
    if (typeof window === 'undefined' || file.type === 'image/gif' || file.type === 'image/svg+xml') return null;

    const objectUrl = URL.createObjectURL(file);
    try {
        const source = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Foto kan niet worden verkleind.'));
            image.src = objectUrl;
        });
        const { width, height } = getQuotePhotoPreviewDimensions(source.naturalWidth, source.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(source, 0, 0, width, height);

        const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
        return preview && preview.size < file.size ? preview : null;
    } catch {
        // Ook bestanden die deze browser niet kan decoderen worden origineel opgeslagen.
        return null;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
