import { zip } from 'fflate';

export interface QuotePdfFile {
    fileName: string;
    blob: Blob;
}

/** Eén download voorkomt dat de browser extra offertebijlagen blokkeert. */
export async function prepareQuotePdfDownload(files: QuotePdfFile[], bundleName: string): Promise<QuotePdfFile> {
    if (files.length === 0) throw new Error('Selecteer minimaal één offerte.');
    if (files.length === 1) return files[0];
    const entries: Record<string, Uint8Array> = {};
    for (const file of files) {
        if (entries[file.fileName]) throw new Error('Twee geselecteerde offertes hebben dezelfde bestandsnaam.');
        entries[file.fileName] = new Uint8Array(await file.blob.arrayBuffer());
    }
    const data = await new Promise<Uint8Array>((resolve, reject) => {
        zip(entries, { level: 0 }, (error, result) => error ? reject(error) : resolve(result));
    });
    return { fileName: bundleName, blob: new Blob([Uint8Array.from(data).buffer], { type: 'application/zip' }) };
}
