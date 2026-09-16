/* eslint-disable @typescript-eslint/no-explicit-any */
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { buildOfficialQuotePdfData, resolveQuotePdfWorkDescription, resolveQuoteCalculationSettings } from './quote-pdf-data';
import { calculateQuoteTotals, normalizeDataJson, type KlantInformatie } from './quote-calculations';
import { sanitizeQuotePdfTextSettings } from './quote-pdf-text-settings';
import { sanitizeMaterialPresentations } from './material-presentations';
import { prepareDrawingImageForPdf } from './pdf-drawing-image';
import { type PDFQuoteData } from './generate-quote-pdf';
import { type QuotePDFSettings } from '@/components/quote/QuoteSettings';
import { isMatchingDraft, type SendableQuote } from './quote-send-selection';

interface LoadQuotePdfOptions {
    firestore: Firestore;
    token: string;
    quoteId: string;
    currentQuote: SendableQuote;
    userProfile: any;
    businessData: any;
    userEmail?: string | null;
    pdfSettings: QuotePDFSettings;
}

/** Laadt elke bijlage met haar eigen calculatie, klant, teksten, taal en tekeningen. */
export async function loadQuotePdfData(options: LoadQuotePdfOptions): Promise<PDFQuoteData> {
    const { firestore, token, quoteId, currentQuote, userProfile, businessData, userEmail, pdfSettings } = options;
    const snapshot = await getDoc(doc(firestore, 'quotes', quoteId));
    if (!snapshot.exists()) throw new Error('Een geselecteerde offerte bestaat niet meer.');
    const quote = { ...snapshot.data(), id: snapshot.id } as SendableQuote;
    if (!isMatchingDraft(quote, currentQuote)) {
        throw new Error('Een geselecteerde offerte is geen concept meer of hoort bij een andere klant. Open het verstuurscherm opnieuw.');
    }
    const response = await fetch('/api/quotes/get-calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId, latestOnly: true, preferCompletedFallback: true }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.row?.data_json) {
        throw new Error(`Offerte ${quote.offerteNummer || ''}: calculatie kon niet worden geladen.`);
    }
    const normalizedData = normalizeDataJson(payload.row.data_json);
    const quoteSettings = resolveQuoteCalculationSettings(normalizedData, quote);
    const ki = (normalizedData.klantinformatie || quote.klantinformatie || {}) as any;
    const klantInfo: KlantInformatie = {
        klanttype: ki.klanttype || 'Particulier',
        voornaam: ki.voornaam || '', achternaam: ki.achternaam || '', bedrijfsnaam: ki.bedrijfsnaam || null,
        kvkNummer: ki.kvkNummer || '', btwNummer: ki.btwNummer || '',
        emailadres: ki.emailadres || ki['e-mailadres'] || '', telefoonnummer: ki.telefoonnummer || '',
        straat: ki.straat || ki.factuuradres?.straat || '', huisnummer: ki.huisnummer || ki.factuuradres?.huisnummer || '',
        postcode: ki.postcode || ki.factuuradres?.postcode || '', plaats: ki.plaats || ki.factuuradres?.plaats || '',
        afwijkendProjectadres: ki.afwijkendProjectadres || false, projectAdres: ki.projectAdres || ki.projectadres,
    };
    const materials = {
        groot: Array.isArray(normalizedData.grootmaterialen) ? normalizedData.grootmaterialen : [],
        verbruik: Array.isArray(normalizedData.verbruiksartikelen) ? normalizedData.verbruiksartikelen : [],
    };
    const totals = calculateQuoteTotals(normalizedData, quoteSettings, Number(userProfile?.settings?.planningSettings?.defaultWorkdayHours) || 8);
    const workDescriptionStructured = resolveQuotePdfWorkDescription(normalizedData, quote.titel);
    const raw = snapshot.data();
    const conditions = raw.algemeneVoorwaarden ?? userProfile?.defaultAlgemeneVoorwaarden;
    const jobs: any[] = raw.klussen && Object.keys(raw.klussen).length > 0
        ? Object.values(raw.klussen) : Array.isArray(raw.jobs) ? raw.jobs : [];
    const drawingUrls: string[] = jobs.flatMap((job) => {
        const urls = Array.isArray(job.visualisatieSnapshots)
            ? job.visualisatieSnapshots.map((entry: any) => typeof entry === 'string' ? entry : entry?.url ?? entry?.visualisatieUrl)
                .filter((url: unknown): url is string => typeof url === 'string' && Boolean(url.trim())) : [];
        return urls.length ? urls : typeof job.visualisatieUrl === 'string' && job.visualisatieUrl.trim() ? [job.visualisatieUrl] : [];
    });
    const capturedDrawings = await Promise.all(drawingUrls.map(async (url) => {
        const res = await fetch(`/api/visualisatie-to-base64?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`Tekening van offerte ${quote.offerteNummer || ''} kon niet worden geladen.`);
        const data = await res.json();
        if (!data.dataUrl) throw new Error('Tekening ontbreekt. Probeer opnieuw.');
        return prepareDrawingImageForPdf(data.dataUrl);
    }));
    return buildOfficialQuotePdfData({
        quote, quoteSettings, normalizedData, klantInfo, userProfile, businessData, userEmail,
        workDescriptionStructured, materials, totals, pdfSettings, capturedDrawings,
        materialPresentations: sanitizeMaterialPresentations(quote.materialPresentations, quote.id),
        onderVoorbehoud: Boolean(quote.facturatie?.onderVoorbehoud),
        pdfTextSettings: sanitizeQuotePdfTextSettings(quote.pdfTeksten ?? userProfile?.defaultPdfTeksten),
        algemeneVoorwaardenTekst: String(conditions?.tekst || ''),
        algemeneVoorwaardenTitel: String(conditions?.titel || 'ALGEMENE VOORWAARDEN'),
    });
}
