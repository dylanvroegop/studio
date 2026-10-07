'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { QuotePhotoAttachment } from '@/lib/types';
import { canOptimizeQuotePhoto } from '@/lib/quote-photo-preview';

interface QuotePhotoImageProps {
    photo: QuotePhotoAttachment;
    eager?: boolean;
}

/** Nieuwe foto's hebben een klein voorbeeld; oude foto's worden op aanvraag verkleind en gecachet. */
export function QuotePhotoImage({ photo, eager = false }: QuotePhotoImageProps): JSX.Element {
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const previewSource = photo.thumbnailDownloadUrl || photo.downloadUrl;
    const source = failedSource === previewSource ? photo.downloadUrl : previewSource;
    const unoptimized = !!photo.thumbnailDownloadUrl
        || failedSource === previewSource
        || !canOptimizeQuotePhoto(source, photo.mimeType);

    return (
        <span className="relative block h-44 w-full bg-muted/40">
            <Image
                src={source}
                alt={photo.originalName || 'Projectfoto'}
                fill
                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                quality={75}
                className="object-cover"
                loading={eager ? 'eager' : 'lazy'}
                unoptimized={unoptimized}
                onError={() => setFailedSource(previewSource)}
            />
        </span>
    );
}
