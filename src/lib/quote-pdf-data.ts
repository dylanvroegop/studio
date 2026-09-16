/* eslint-disable @typescript-eslint/no-explicit-any */
import { type PDFQuoteData } from './generate-quote-pdf';
import { type Quote, type MaterialPresentation } from './types';
import { type QuoteSettings as QuoteCalculationSettings, type DataJson, type KlantInformatie, type MaterialItem, type QuoteTotals, type WorkDescriptionStructured, generateWorkSummary, flattenStructuredWorkDescription, toStructuredWorkDescription, completeStructuredWorkDescription } from './quote-calculations';
import { type QuotePDFSettings } from '@/components/quote/QuoteSettings';
import { type QuotePdfTextSettings } from './quote-pdf-text-settings';
import { deduplicateMeasurementRows } from './work-description-note-coverage';
import { formatOfferteNummerLabel } from './quote-number';

interface QuotePdfContext {
    quote: Quote | null;
    quoteSettings: QuoteCalculationSettings | null;
    normalizedData: DataJson | null;
    klantInfo: KlantInformatie | null;
    userProfile: any;
    businessData: any;
    userEmail?: string | null;
    workDescriptionStructured: WorkDescriptionStructured;
    materials: { groot: MaterialItem[]; verbruik: MaterialItem[] };
    totals: QuoteTotals | null;
    pdfSettings: QuotePDFSettings;
    capturedDrawings: string[];
    materialPresentations: MaterialPresentation[];
    onderVoorbehoud: boolean;
    pdfTextSettings: QuotePdfTextSettings;
    algemeneVoorwaardenTekst: string;
    algemeneVoorwaardenTitel: string;
}

export function forceSummaryIntoWorkScope(value: WorkDescriptionStructured): WorkDescriptionStructured {
    const activeIndex = Math.max(
        0,
        Math.min(value.activeJobIndex || 0, Math.max(0, value.jobs.length - 1)),
    );
    const rootWorkScope = Array.isArray(value.work_scope) ? value.work_scope : [];
    const activeJobWorkScope = Array.isArray(value.jobs[activeIndex]?.work_scope)
        ? value.jobs[activeIndex].work_scope
        : [];
    const rootSummary = String(value.summary || value.context || '').trim();
    const activeJobSummary = String(
        value.jobs[activeIndex]?.summary || value.jobs[activeIndex]?.context || '',
    ).trim();
    const workScope = rootWorkScope.length > 0
        ? rootWorkScope
        : activeJobWorkScope.length > 0
            ? activeJobWorkScope
            : rootSummary || activeJobSummary
                ? [rootSummary || activeJobSummary]
                : [];
    const summary = rootSummary || activeJobSummary || workScope.join('\n\n');
    const jobs = value.jobs.length > 0
        ? value.jobs.map((job, index) => {
        const jobWorkScope = Array.isArray(job.work_scope) && job.work_scope.length > 0
            ? job.work_scope
            : job.summary || job.context
                ? [String(job.summary || job.context)]
                : index === activeIndex
                    ? workScope
                    : [];
        const jobText = String(job.summary || job.context || jobWorkScope.join('\n\n')).trim();
        return {
            ...job,
            context: jobText || job.context,
            summary: jobText || job.summary,
            work_scope: jobWorkScope,
        };
        })
        : workScope.length > 0
            ? [{
                title: value.title,
                context: summary,
                summary,
                work_scope: workScope,
                materials: [...value.materials],
                dimensions: [...value.dimensions],
                included: [...value.included],
                excluded: [...value.excluded],
                internal_notes: [...value.internal_notes],
                afvalAfvoeren: value.afvalAfvoeren,
                schilderwerkInbegrepen: value.schilderwerkInbegrepen,
                stucwerkInbegrepen: value.stucwerkInbegrepen,
                plamuurwerkInbegrepen: value.plamuurwerkInbegrepen,
                kitwerkInbegrepen: value.kitwerkInbegrepen,
                steigerInbegrepen: value.steigerInbegrepen,
                sloopwerkInbegrepen: value.sloopwerkInbegrepen,
                nadenVullenInbegrepen: value.nadenVullenInbegrepen,
                nadenVullenAfwerkingsniveau: value.nadenVullenAfwerkingsniveau,
                schroefgatenPlamurenInbegrepen: value.schroefgatenPlamurenInbegrepen,
                electricalScope: value.electricalScope,
                finishLevel: value.finishLevel,
                customFinishDescription: value.customFinishDescription,
                sections: value.sections,
                legacyNotes: value.legacyNotes || [],
            }]
            : [];

    return {
        ...value,
        context: summary,
        summary,
        work_scope: workScope,
        jobs,
    };
}


export function buildOfficialQuotePdfData({ quote, quoteSettings, normalizedData, klantInfo, userProfile, businessData, userEmail, workDescriptionStructured, materials, totals, pdfSettings, capturedDrawings, materialPresentations, onderVoorbehoud, pdfTextSettings, algemeneVoorwaardenTekst, algemeneVoorwaardenTitel }: QuotePdfContext): PDFQuoteData {
    const pdfBtwPercentage = quoteSettings?.btwTarief ?? 21;
    const pdfHourlyRate = quoteSettings?.uurTariefExclBtw ?? 0;
    const pdfMarginPercentage = quoteSettings?.extras?.winstMarge?.percentage ?? 0;
    const pdfMarginBasis = quoteSettings?.extras?.winstMarge?.basis ?? 'totaal';
    const pdfWorkDescription = forceSummaryIntoWorkScope(workDescriptionStructured);

    return {
        language: quote?.pdfLanguage || 'nl',
        englishTranslation: quote?.pdfEnglishTranslation,
        offerteNummer: formatOfferteNummerLabel((quote as any)?.offerteNummer, (quote as any)?.offerteVersie),
        datum: new Date().toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        geldigTot: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        logoUrl: userProfile?.settings?.logoUrl || undefined,
        signatureUrl: userProfile?.settings?.signatureUrl || userProfile?.signatureUrl || undefined,
        logoScale: userProfile?.settings?.logoScale || 1.0,
        bedrijf: {
            naam: (
                userProfile?.settings?.bedrijfsnaam ||
                businessData?.bedrijfsnaam ||
                userProfile?.bedrijfsnaam ||
                userProfile?.companyName ||
                'Uw Bedrijfsnaam'
            ),
            adres:
                `${userProfile?.settings?.adres || ''} ${userProfile?.settings?.huisnummer || ''}`.trim() ||
                userProfile?.settings?.adres ||
                businessData?.adres ||
                userProfile?.adres ||
                userProfile?.address ||
                'Straatnaam 123',
            postcode: userProfile?.settings?.postcode || businessData?.postcode || userProfile?.postcode || userProfile?.zipcode || '1234 AB',
            plaats: userProfile?.settings?.plaats || businessData?.plaats || userProfile?.plaats || userProfile?.city || 'Plaats',
            telefoon: userProfile?.settings?.telefoon || businessData?.telefoon || userProfile?.telefoon || userProfile?.phone || '06-12345678',
            email: userProfile?.settings?.email || businessData?.email || userProfile?.email || userEmail || 'email@voorbeeld.nl',
            kvk: userProfile?.settings?.kvkNummer || businessData?.kvkNummer || businessData?.kvk || userProfile?.kvkNummer || userProfile?.kvk || '12345678',
            btw: userProfile?.settings?.btwNummer || businessData?.btwNummer || businessData?.btw || userProfile?.btwNummer || userProfile?.btw || 'NL123456789B01',
            iban: userProfile?.settings?.iban || businessData?.iban || userProfile?.iban || '',
        },
        klant: {
            klanttype: klantInfo?.klanttype || null,
            naam: klantInfo ? `${klantInfo.voornaam || ''} ${klantInfo.achternaam || ''}`.trim() : 'Klant nog niet ingevuld',
            adres: klantInfo ? `${klantInfo.straat || ''} ${klantInfo.huisnummer || ''}`.trim() : '',
            postcode: klantInfo?.postcode || '',
            plaats: klantInfo?.plaats || '',
            telefoon: klantInfo?.telefoonnummer || '',
            email: klantInfo?.emailadres || '',
            kvk: klantInfo?.kvkNummer || '',
            btw: klantInfo?.btwNummer || '',
        },
        projectLocatie: klantInfo?.afwijkendProjectadres && klantInfo.projectAdres
            ? `${klantInfo.projectAdres.straat} ${klantInfo.projectAdres.huisnummer}, ${klantInfo.projectAdres.plaats}`
            : klantInfo
                ? `${klantInfo.straat || ''} ${klantInfo.huisnummer || ''}, ${klantInfo.plaats || ''}`.trim().replace(/^,|,$/g, '')
                : '',
        korteTitel: pdfWorkDescription.title || normalizedData?.korteTitel,
        korteBeschrijving: pdfWorkDescription.summary || normalizedData?.korteBeschrijving,
        werkbeschrijving: pdfWorkDescription.summary || generateWorkSummary(normalizedData?.werkbeschrijving, 800),
        werkbeschrijvingFull: flattenStructuredWorkDescription(pdfWorkDescription),
        werkbeschrijvingStructured: pdfWorkDescription,
        grootmaterialen: materials.groot.map(m => ({
            aantal: m.aantal,
            product: m.product,
            prijsPerStuk: m.prijs_per_stuk || 0,
            totaal: (m.prijs_per_stuk || 0) * m.aantal,
        })),
        verbruiksartikelen: materials.verbruik.map(m => ({
            aantal: m.aantal,
            product: m.product,
            prijsPerStuk: m.prijs_per_stuk || 0,
            totaal: (m.prijs_per_stuk || 0) * m.aantal,
        })),
        urenSpecificatie: normalizedData?.uren_specificatie || [],
        totals: {
            materialenGroot: totals?.materialenGroot ?? 0,
            materialenVerbruik: totals?.materialenVerbruik ?? 0,
            materialenTotaal: totals?.materialenTotaal ?? 0,
            arbeidTotaal: totals?.arbeidTotaal ?? 0,
            arbeidHoogBtwUren: totals?.arbeidHoogBtwUren ?? 0,
            arbeidLaagBtwUren: totals?.arbeidLaagBtwUren ?? 0,
            arbeidHoogBtwTotaal: totals?.arbeidHoogBtwTotaal ?? 0,
            arbeidLaagBtwTotaal: totals?.arbeidLaagBtwTotaal ?? 0,
            arbeidHoogBtwTarief: totals?.arbeidHoogBtwTarief ?? pdfBtwPercentage,
            arbeidLaagBtwTarief: totals?.arbeidLaagBtwTarief ?? 9,
            transportTotaal: totals?.transportTotaal ?? 0,
            subtotaalExclBtw: totals?.subtotaalExclBtw ?? 0,
            winstMarge: totals?.winstMarge ?? 0,
            totaalExclBtw: totals?.totaalExclBtw ?? 0,
            btw: totals?.btw ?? 0,
            btwHoog: totals?.btwHoog ?? totals?.btw ?? 0,
            btwLaag: totals?.btwLaag ?? 0,
            totaalInclBtw: totals?.totaalInclBtw ?? 0,
            totaalUren: normalizedData?.totaal_uren || 0,
            uurTarief: pdfHourlyRate,
            btwPercentage: pdfBtwPercentage,
            margePercentage: pdfMarginPercentage,
            margeBasis: pdfMarginBasis,
        },
        settings: pdfSettings,
        drawingImages: capturedDrawings, // Include captured drawings for preview
        materialPresentations,
        onderVoorbehoud,
        tekstInstellingen: pdfTextSettings,
        algemeneVoorwaardenTekst,
        algemeneVoorwaardenTitel,
    };
}

export function resolveQuoteCalculationSettings(normalized: any, quote: any): QuoteCalculationSettings {
    const rawInst = normalized.instellingen;
    const rawExtras = normalized.extras;
    const quoteInst = (quote?.instellingen ?? {});
    const quoteExtras = (quote?.extras ?? {});

    return {
        btwTarief: quoteInst?.btwTarief ?? rawInst?.btwTarief ?? 21,
        btwMode: quoteInst?.btwMode ?? rawInst?.btwMode ?? 'normaal',
        arbeidBtwLaagUren: quoteInst?.arbeidBtwLaagUren ?? rawInst?.arbeidBtwLaagUren ?? 0,
        arbeidBtwLaagTarief: quoteInst?.arbeidBtwLaagTarief ?? rawInst?.arbeidBtwLaagTarief ?? 9,
        uurTariefExclBtw: quoteInst?.uurTariefExclBtw ?? quoteInst?.uurTarief ?? rawInst?.uurTariefExclBtw ?? rawInst?.uurTarief ?? 50,
        schattingUren: quoteInst?.schattingUren ?? rawInst?.schattingUren ?? false,
        extras: {
            transport: {
                prijsPerKm:
                    quoteExtras?.transport?.prijsPerKm
                    ?? quoteInst?.extras?.transport?.prijsPerKm
                    ?? quoteInst?.reiskosten_prijs_per_km
                    ?? rawExtras?.transport?.prijsPerKm
                    ?? rawInst?.extras?.transport?.prijsPerKm
                    ?? rawInst?.transportPrijsPerKm,
                vasteTransportkosten:
                    quoteExtras?.transport?.vasteTransportkosten
                    ?? quoteInst?.extras?.transport?.vasteTransportkosten
                    ?? rawExtras?.transport?.vasteTransportkosten
                    ?? rawInst?.extras?.transport?.vasteTransportkosten,
                tunnelkosten:
                    quoteExtras?.transport?.tunnelkosten
                    ?? quoteInst?.extras?.transport?.tunnelkosten
                    ?? rawExtras?.transport?.tunnelkosten
                    ?? rawInst?.extras?.transport?.tunnelkosten,
                mode:
                    quoteExtras?.transport?.mode
                    ?? (quoteInst?.reiskosten_type === 'vast'
                        ? 'vast'
                        : quoteInst?.reiskosten_type === 'perKm'
                            ? 'perKm'
                            : quoteInst?.extras?.transport?.mode)
                    ?? rawExtras?.transport?.mode
                    ?? rawInst?.extras?.transport?.mode,
            },
            winstMarge: {
                percentage:
                    quoteExtras?.winstMarge?.percentage
                    ?? quoteInst?.extras?.winstMarge?.percentage
                    ?? rawExtras?.winstMarge?.percentage
                    ?? rawInst?.extras?.winstMarge?.percentage
                    ?? 10,
                fixedAmount:
                    quoteExtras?.winstMarge?.fixedAmount
                    ?? quoteInst?.extras?.winstMarge?.fixedAmount
                    ?? rawExtras?.winstMarge?.fixedAmount
                    ?? rawInst?.extras?.winstMarge?.fixedAmount
                    ?? 0,
                mode:
                    quoteExtras?.winstMarge?.mode
                    ?? quoteInst?.extras?.winstMarge?.mode
                    ?? rawExtras?.winstMarge?.mode
                    ?? rawInst?.extras?.winstMarge?.mode
                    ?? 'percentage',
                basis:
                    quoteExtras?.winstMarge?.basis
                    ?? quoteInst?.extras?.winstMarge?.basis
                    ?? rawExtras?.winstMarge?.basis
                    ?? rawInst?.extras?.winstMarge?.basis
                    ?? 'totaal',
            }
        }
    };

}

/** Gedeelde omzetting voor de PDF-preview en extra offertebijlagen. */
export function resolveQuotePdfWorkDescription(data: DataJson | null, title?: string): WorkDescriptionStructured {
    const structured = toStructuredWorkDescription({
        werkbeschrijving: data?.werkbeschrijving,
        werkbeschrijving_jobs: data?.werkbeschrijving_jobs,
        werkbeschrijving_structured: data?.werkbeschrijving_structured,
        korteTitel: data?.korteTitel,
        korteBeschrijving: data?.korteBeschrijving,
    });
    const completed = completeStructuredWorkDescription(structured, title);
    const jobs = completed.jobs.map((job) => ({ ...job, dimensions: deduplicateMeasurementRows(job.dimensions) }));
    const activeIndex = Math.max(0, Math.min(completed.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
    return forceSummaryIntoWorkScope({
        ...completed, jobs,
        dimensions: jobs[activeIndex] ? [...jobs[activeIndex].dimensions] : deduplicateMeasurementRows(completed.dimensions),
    });
}
