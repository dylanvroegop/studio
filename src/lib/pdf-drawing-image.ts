function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Tekening kon niet worden geladen.'));
        image.src = dataUrl;
    });
}

/** Converts legacy dark snapshots to the current print-like drawing theme. */
export async function prepareDrawingImageForLightTheme(dataUrl: string): Promise<string> {
    if (typeof document === 'undefined') return dataUrl;

    try {
        const image = await loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context || canvas.width === 0 || canvas.height === 0) return dataUrl;

        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        let darkSamples = 0;
        let sampleCount = 0;
        const sampleStep = Math.max(4, Math.floor(pixels.length / 16000 / 4) * 4);
        for (let offset = 0; offset < pixels.length; offset += sampleStep) {
            if (pixels[offset + 3] < 128) continue;
            const luminance = (pixels[offset] * 0.2126) + (pixels[offset + 1] * 0.7152) + (pixels[offset + 2] * 0.0722);
            if (luminance < 80) darkSamples += 1;
            sampleCount += 1;
        }

        const isLegacyDarkSnapshot = sampleCount > 0 && darkSamples / sampleCount >= 0.55;

        if (isLegacyDarkSnapshot) {
            for (let offset = 0; offset < pixels.length; offset += 4) {
                const alpha = pixels[offset + 3];
                if (alpha === 0) continue;

                const red = pixels[offset];
                const green = pixels[offset + 1];
                const blue = pixels[offset + 2];
                const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
                const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);

                let output = 255;
                if (colorSpread > 18 || luminance >= 48) {
                    output = 0;
                } else if (luminance >= 24) {
                    output = 165;
                }

                pixels[offset] = output;
                pixels[offset + 1] = output;
                pixels[offset + 2] = output;
                pixels[offset + 3] = 255;
            }
        }

        // Add a Freeform-style dot grid directly to white snapshot pixels.
        // This remains visible even though the raster image covers CSS layers.
        const gridSize = 16;
        const dotColor = 210;
        for (let y = gridSize / 2; y < canvas.height; y += gridSize) {
            for (let x = gridSize / 2; x < canvas.width; x += gridSize) {
                for (let dy = 0; dy <= 1; dy += 1) {
                    for (let dx = 0; dx <= 1; dx += 1) {
                        const pixelX = x + dx;
                        const pixelY = y + dy;
                        const offset = ((pixelY * canvas.width) + pixelX) * 4;
                        if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) continue;
                        pixels[offset] = dotColor;
                        pixels[offset + 1] = dotColor;
                        pixels[offset + 2] = dotColor;
                    }
                }
            }
        }

        context.putImageData(imageData, 0, 0);

        // Legacy snapshots were captured at a relatively low resolution.
        // Upscale the already-clean monochrome result without interpolation so
        // PDF viewers keep dimension text and construction lines crisp.
        const outputScale = isLegacyDarkSnapshot ? 2 : 1;
        if (outputScale === 1) return canvas.toDataURL('image/png');

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = canvas.width * outputScale;
        outputCanvas.height = canvas.height * outputScale;
        const outputContext = outputCanvas.getContext('2d');
        if (!outputContext) return canvas.toDataURL('image/png');

        outputContext.imageSmoothingEnabled = false;
        outputContext.drawImage(canvas, 0, 0, outputCanvas.width, outputCanvas.height);
        return outputCanvas.toDataURL('image/png');
    } catch (error) {
        console.error('Error converting drawing snapshot to light theme:', error);
        return dataUrl;
    }
}

export async function prepareDrawingImageForPdf(dataUrl: string): Promise<string> {
    return prepareDrawingImageForLightTheme(dataUrl);
}
