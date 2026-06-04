/**
 * Keeps drawing snapshots unchanged for PDF output.
 *
 * Previous attempts to recolor raster snapshots caused incorrect and
 * inconsistent drawings across visualizer types. A professional PDF drawing
 * theme should be rendered from the drawing components/data, not inferred from
 * pixels after capture.
 */
export async function prepareDrawingImageForPdf(dataUrl: string): Promise<string> {
    return dataUrl;
}
