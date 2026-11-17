import { prepareDrawingImageForPdf } from './pdf-drawing-image';
const record = (v:unknown):Record<string,unknown> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
function quoteJobs(quote:unknown):unknown[] {
    const root=record(quote),map=record(root.klussen);
    return Object.keys(map).length?Object.values(map):Array.isArray(root.jobs)?root.jobs:[];
}
export function quoteDrawingUrls(quote:unknown):string[] {
    return quoteJobs(quote).flatMap(raw=>{
        const job=record(raw);
        const urls=(Array.isArray(job.visualisatieSnapshots)?job.visualisatieSnapshots:[]).map(value=>typeof value==='string'?value:record(value).url??record(value).visualisatieUrl).filter((url):url is string=>typeof url==='string'&&Boolean(url.trim()));
        return urls.length?urls:typeof job.visualisatieUrl==='string'&&job.visualisatieUrl.trim()?[job.visualisatieUrl]:[];
    });
}
export async function loadQuoteDrawingImages(quote:unknown):Promise<string[]> {
    const statuses=quoteJobs(quote).map(job=>String(record(job).visualisatieStatus||'').toLowerCase());
    if(statuses.some(status=>status==='pending'||status==='processing'))throw Error('Een calculatietekening wordt nog gemaakt. Wacht voordat je de PDF verstuurt.');
    if(statuses.includes('error'))throw Error('Een calculatietekening is mislukt. Maak deze opnieuw voordat je de PDF verstuurt.');
    // Geen stil weggelaten tekening: alle bijbehorende afbeeldingen moeten laden.
    return Promise.all(quoteDrawingUrls(quote).map(async url=>{
        const response=await fetch(`/api/visualisatie-to-base64?url=${encodeURIComponent(url)}`);
        if(!response.ok)throw Error('Een calculatietekening kon niet worden geladen. Probeer opnieuw voordat je verstuurt.');
        const data=await response.json();
        if(!data.dataUrl)throw Error('Een calculatietekening ontbreekt. Probeer opnieuw.');
        return prepareDrawingImageForPdf(data.dataUrl);
    }));
}
