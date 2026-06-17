import { jsPDF } from 'jspdf';
import {
    formatCurrency,
    sanitizeWorkDescriptionStructured,
    type WorkDescriptionStructured,
} from './quote-calculations';
import { QuotePDFSettings } from '@/components/quote/QuoteSettings';
import {
    defaultQuotePdfTextSettings,
    sanitizeQuotePdfTextSettings,
    type QuotePdfTextSettings,
} from './quote-pdf-text-settings';
import type { MaterialPresentation } from './types';
import { sanitizeMaterialPresentations } from './material-presentations';

export interface PDFQuoteData {
    offerteNummer: string;
    datum: string;
    geldigTot: string;
    logoUrl?: string;
    signatureUrl?: string;
    logoScale?: number;
    bedrijf: {
        naam: string;
        adres: string;
        postcode: string;
        plaats: string;
        telefoon: string;
        email: string;
        kvk: string;
        btw: string;
        iban?: string;
    };
    klant: {
        naam: string;
        adres: string;
        postcode: string;
        plaats: string;
        telefoon: string;
        email: string;
    };
    projectLocatie: string;
    korteTitel?: string;
    korteBeschrijving?: string;
    werkbeschrijving: string;
    werkbeschrijvingFull: string[];
    werkbeschrijvingStructured?: WorkDescriptionStructured;
    grootmaterialen: Array<{
        aantal: number;
        product: string;
        prijsPerStuk: number;
        totaal: number;
    }>;
    verbruiksartikelen: Array<{
        aantal: number;
        product: string;
        prijsPerStuk: number;
        totaal: number;
    }>;
    urenSpecificatie: Array<{
        taak: string;
        uren: number;
    }>;
    totals: {
        materialenGroot: number;
        materialenVerbruik: number;
        materialenTotaal: number;
        arbeidTotaal: number;
        transportTotaal: number;
        subtotaalExclBtw: number;
        winstMarge: number;
        totaalExclBtw: number;
        btw: number;
        totaalInclBtw: number;
        totaalUren: number;
        uurTarief: number;
        btwPercentage: number;
        margePercentage: number;
        margeBasis?: 'totaal' | 'arbeid' | 'materiaal';
    };
    settings: QuotePDFSettings;
    drawingImages?: string[];
    materialPresentations?: MaterialPresentation[];
    onderVoorbehoud?: boolean;
    tekstInstellingen?: QuotePdfTextSettings;
    algemeneVoorwaardenTekst?: string;
    algemeneVoorwaardenTitel?: string;
}

/**
 * Converts an image URL to base64 data URL for jsPDF
 * Uses server-side API route to bypass CORS issues with Firebase Storage
 */
async function urlToBase64(url: string): Promise<string> {
    try {
        // Use API route to fetch and convert the image server-side (no CORS issues)
        const response = await fetch(`/api/logo-to-base64?url=${encodeURIComponent(url)}`);

        if (!response.ok) {
            throw new Error('Failed to fetch logo from API');
        }

        const data = await response.json();

        if (!data.dataUrl) {
            throw new Error('No data URL returned from API');
        }

        return data.dataUrl;
    } catch (error) {
        console.error('Failed to convert logo to base64:', error);
        throw error;
    }
}

function getImageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
    const subtype = match?.[1]?.toLowerCase() || 'png';

    if (subtype === 'jpeg' || subtype === 'jpg') return 'JPEG';
    if (subtype === 'webp') return 'WEBP';
    return 'PNG';
}

function roundMoney(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function capitalizeWordPart(part: string): string {
    if (!part) return part;
    if (/^\d+$/.test(part)) return part;
    if (/^[A-Z0-9.&]+$/.test(part) && part.length <= 4) return part;
    const lower = part.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function toDutchTitleCase(value: string): string {
    const smallWords = new Set(['de', 'den', 'der', 'het', 'of', 'op', 'te', 'ter', 'ten', 'van', 'von', "'t"]);
    const normalized = normalizeWhitespace(value);
    if (!normalized) return '';

    return normalized
        .split(' ')
        .map((token, tokenIndex) => {
            const hyphenParts = token.split('-');
            const transformed = hyphenParts.map((hyphenPart, hyphenIndex) => {
                const apostropheParts = hyphenPart.split("'");
                const rebuilt = apostropheParts.map((apostrophePart, apostropheIndex) => {
                    const lower = apostrophePart.toLowerCase();
                    const isFirst = tokenIndex === 0 && hyphenIndex === 0 && apostropheIndex === 0;
                    if (!isFirst && smallWords.has(lower)) return lower;
                    return capitalizeWordPart(apostrophePart);
                });
                return rebuilt.join("'");
            });
            return transformed.join('-');
        })
        .join(' ');
}

function normalizeDutchPostcode(value: string): string {
    return normalizeWhitespace(value).toUpperCase();
}

function normalizeCommonWording(value: string): string {
    return value.replace(/\bofferte\s+acceptatie\b/gi, (match) =>
        match.charAt(0) === match.charAt(0).toUpperCase() ? 'Offerteacceptatie' : 'offerteacceptatie'
    );
}

function fitImageWithinBox(
    sourceWidth: number,
    sourceHeight: number,
    maxWidth: number,
    maxHeight: number,
): { width: number; height: number } {
    if (sourceWidth <= 0 || sourceHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
        return { width: 0, height: 0 };
    }

    let width = maxWidth;
    let height = (sourceHeight * maxWidth) / sourceWidth;

    if (height > maxHeight) {
        height = maxHeight;
        width = (sourceWidth * maxHeight) / sourceHeight;
    }

    return { width, height };
}

function buildSummaryLineTotalsWithHiddenMargin(totals: PDFQuoteData['totals']): {
    materialen: number;
    arbeid: number;
    transport: number;
} {
    const materialenBase = Math.max(0, Number(totals.materialenTotaal) || 0);
    const arbeidBase = Math.max(0, Number(totals.arbeidTotaal) || 0);
    const transportBase = Math.max(0, Number(totals.transportTotaal) || 0);
    const baseSum = materialenBase + arbeidBase + transportBase;
    const totalExcl = Math.max(0, Number(totals.totaalExclBtw) || 0);
    const hiddenMargin = Math.max(0, Number(totals.winstMarge) || 0);

    if (hiddenMargin <= 0) {
        return {
            materialen: roundMoney(materialenBase),
            arbeid: roundMoney(arbeidBase),
            transport: roundMoney(transportBase),
        };
    }

    let materialenRaw = materialenBase;
    let arbeidRaw = arbeidBase;
    let transportRaw = transportBase;

    if (totals.margeBasis === 'materiaal') {
        materialenRaw += hiddenMargin;
    } else if (totals.margeBasis === 'arbeid') {
        arbeidRaw += hiddenMargin;
    } else if (baseSum > 0) {
        materialenRaw += hiddenMargin * (materialenBase / baseSum);
        arbeidRaw += hiddenMargin * (arbeidBase / baseSum);
        transportRaw += hiddenMargin * (transportBase / baseSum);
    } else {
        materialenRaw += hiddenMargin;
    }

    const materialen = roundMoney(materialenRaw);
    const arbeid = roundMoney(arbeidRaw);
    const transport = roundMoney(totalExcl - materialen - arbeid);

    return {
        materialen,
        arbeid,
        transport: transport >= 0 ? transport : roundMoney(transportRaw),
    };
}

function resolveSummaryHourlyRate(
    baseHourlyRate: number,
    totalHours: number,
    summaryLaborTotal: number,
): number {
    const safeBaseRate = Number.isFinite(baseHourlyRate) ? baseHourlyRate : 0;
    const safeHours = Number.isFinite(totalHours) ? totalHours : 0;
    const safeLaborTotal = Number.isFinite(summaryLaborTotal) ? summaryLaborTotal : 0;

    if (safeHours <= 0) return safeBaseRate;
    const derivedRate = safeLaborTotal / safeHours;
    if (!Number.isFinite(derivedRate) || derivedRate <= 0) return safeBaseRate;

    // Keep current behavior when there is no meaningful difference.
    return Math.abs(derivedRate - safeBaseRate) < 0.005 ? safeBaseRate : roundMoney(derivedRate);
}

export async function generateQuotePDF(data: PDFQuoteData): Promise<Blob> {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const bottomMargin = 20;
    let y = margin;
    let headerBlockHeight = 28;
    const isOnderVoorbehoud = Boolean(data.onderVoorbehoud);
    const prijsAfspraakLabel = isOnderVoorbehoud ? 'Richtprijs op nacalculatie' : 'Vaste aanneemsom';
    const tekstInstellingen = sanitizeQuotePdfTextSettings(data.tekstInstellingen);
    const offerNumberLabel = `Offerte #${data.offerteNummer}`;
    const displayBedrijf = {
        ...data.bedrijf,
        naam: toDutchTitleCase(String(data.bedrijf.naam || '')),
        adres: toDutchTitleCase(String(data.bedrijf.adres || '')),
        postcode: normalizeDutchPostcode(String(data.bedrijf.postcode || '')),
        plaats: toDutchTitleCase(String(data.bedrijf.plaats || '')),
    };
    const displayKlant = {
        ...data.klant,
        naam: toDutchTitleCase(String(data.klant.naam || '')),
        adres: toDutchTitleCase(String(data.klant.adres || '')),
        postcode: normalizeDutchPostcode(String(data.klant.postcode || '')),
        plaats: toDutchTitleCase(String(data.klant.plaats || '')),
    };

    // Helper: draw horizontal line
    const drawLine = (yPos: number, color: number = 200) => {
        doc.setDrawColor(color, color, color);
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
    };

    // Helper: check for page break
    const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - bottomMargin) {
            doc.addPage();
            y = margin;
            return true;
        }
        return false;
    };

    const drawSectionPageHeader = (title: string) => {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(title, margin, y);
        y += 8;
        drawLine(y);
        y += 10;
    };

    let signatureAsset: {
        base64: string;
        format: 'PNG' | 'JPEG' | 'WEBP';
        width: number;
        height: number;
    } | null = null;

    if (data.signatureUrl) {
        try {
            const signatureBase64 = await urlToBase64(data.signatureUrl);
            const signatureFormat = getImageFormatFromDataUrl(signatureBase64);
            const signatureImg = doc.getImageProperties(signatureBase64);

            signatureAsset = {
                base64: signatureBase64,
                format: signatureFormat,
                width: signatureImg.width,
                height: signatureImg.height,
            };
        } catch (error) {
            console.error('Error loading signature for PDF:', error);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PAGE 1: HEADER + SUMMARY
    // ═══════════════════════════════════════════════════════════════

    // Logo (if available)
    if (data.logoUrl) {
        try {
            const logoBase64 = await urlToBase64(data.logoUrl);
            const logoFormat = getImageFormatFromDataUrl(logoBase64);
            const logoImg = doc.getImageProperties(logoBase64);

            // Base logo box at 100%
            const baseBoxWidth = 40;
            const baseBoxHeight = 18;

            // Fit intrinsic image in base box
            let fittedWidth = baseBoxWidth;
            let fittedHeight = (logoImg.height * baseBoxWidth) / logoImg.width;
            if (fittedHeight > baseBoxHeight) {
                fittedHeight = baseBoxHeight;
                fittedWidth = (logoImg.width * baseBoxHeight) / logoImg.height;
            }

            // Apply user-defined scale factor (default 1.0 = 100%), clamped
            const scale = Math.min(2, Math.max(0.5, data.logoScale || 1.0));
            const logoWidth = fittedWidth * scale;
            const logoHeight = fittedHeight * scale;

            // Scale around the same center point so sizing feels stable
            const centerX = margin + (baseBoxWidth / 2);
            const centerY = y + (baseBoxHeight / 2);
            const xPos = centerX - (logoWidth / 2);
            const yPos = centerY - (logoHeight / 2);

            doc.addImage(logoBase64, logoFormat, xPos, yPos, logoWidth, logoHeight);

            // Increase header spacing when logo is larger
            headerBlockHeight = Math.max(28, Math.ceil(logoHeight + 10));
        } catch (error) {
            console.error('Error adding logo to PDF:', error);
            // Fall back to placeholder if logo fails to load
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, y, 40, 18, 'F');
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('LOGO', margin + 20, y + 10, { align: 'center' });
        }
    } else {
        // Show placeholder if no logo uploaded
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y, 40, 18, 'F');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('LOGO', margin + 20, y + 10, { align: 'center' });
    }

    // Title: OFFERTE
    doc.setFontSize(28);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('OFFERTE', pageWidth - margin, y + 6, { align: 'right' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(offerNumberLabel, pageWidth - margin, y + 14, { align: 'right' });

    if (isOnderVoorbehoud) {
        const badgeWidth = 62;
        const badgeHeight = 6;
        const badgeX = pageWidth - margin - badgeWidth;
        const badgeY = y + 17;
        doc.setFillColor(255, 247, 237);
        doc.setDrawColor(180, 83, 9);
        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1.5, 1.5, 'FD');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 83, 9);
        doc.text('ONDER VOORBEHOUD', badgeX + (badgeWidth / 2), badgeY + 4.2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        headerBlockHeight = Math.max(headerBlockHeight, 34);
    }

    y += headerBlockHeight;
    drawLine(y);
    y += 12;

    // Two columns: Bedrijfsgegevens | Klantgegevens
    const colLeft = margin;
    const colRight = pageWidth / 2 + 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('BEDRIJFSGEGEVENS', colLeft, y);
    doc.text('KLANTGEGEVENS', colRight, y);

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(9);

    // Left column - Bedrijf
    doc.setFont('helvetica', 'bold');
    doc.text(displayBedrijf.naam, colLeft, y);
    doc.text(displayKlant.naam, colRight, y);
    doc.setFont('helvetica', 'normal');
    y += 5;

    doc.text(displayBedrijf.adres, colLeft, y);
    doc.text(displayKlant.adres, colRight, y);
    y += 5;

    doc.text(`${displayBedrijf.postcode} ${displayBedrijf.plaats}`.trim(), colLeft, y);
    doc.text(`${displayKlant.postcode} ${displayKlant.plaats}`.trim(), colRight, y);
    y += 5;

    doc.setTextColor(100, 100, 100);
    doc.text(`Tel: ${displayBedrijf.telefoon}`, colLeft, y);
    doc.text(`Tel: ${displayKlant.telefoon}`, colRight, y);
    y += 5;

    doc.text(`Email: ${displayBedrijf.email}`, colLeft, y);
    doc.text(`Email: ${displayKlant.email}`, colRight, y);
    y += 5;

    doc.text(`KVK: ${displayBedrijf.kvk}`, colLeft, y);
    y += 5;
    doc.text(`BTW: ${displayBedrijf.btw}`, colLeft, y);
    y += 5;
    if (displayBedrijf.iban) {
        doc.text(`IBAN: ${displayBedrijf.iban}`, colLeft, y);
    }

    y += 12;
    drawLine(y);
    y += 10;

    // Quote meta info
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);

    const metaCol1 = margin;
    const metaCol2 = margin + 35;

    doc.text('Offertedatum:', metaCol1, y);
    doc.setTextColor(30, 30, 30);
    doc.text(data.datum, metaCol2, y);
    y += 5;

    doc.setTextColor(80, 80, 80);
    doc.text('Geldig tot:', metaCol1, y);
    doc.setTextColor(30, 30, 30);
    doc.text(data.geldigTot, metaCol2, y);
    y += 5;

    doc.setTextColor(80, 80, 80);
    doc.text('Projectlocatie:', metaCol1, y);
    doc.setTextColor(30, 30, 30);
    const projectLocatie = String(data.projectLocatie || '').trim();
    const projectLocatieLines = doc.splitTextToSize(projectLocatie || '-', pageWidth - metaCol2 - margin);
    doc.text(projectLocatieLines, metaCol2, y);
    y += Math.max(projectLocatieLines.length * 4.2, 5);

    doc.setTextColor(80, 80, 80);
    doc.text('Prijsafspraak:', metaCol1, y);
    doc.setFont('helvetica', 'bold');
    if (isOnderVoorbehoud) {
        doc.setTextColor(180, 83, 9);
    } else {
        doc.setTextColor(30, 30, 30);
    }
    doc.text(prijsAfspraakLabel, metaCol2, y);
    doc.setFont('helvetica', 'normal');

    y += 12;
    drawLine(y);
    y += 10;

    // Project description
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('PROJECTOMSCHRIJVING', margin, y);
    y += 6;

    const structuredProjectTitles = (data.werkbeschrijvingStructured?.jobs || [])
        .map((job) => String(job?.title || '').trim())
        .filter(Boolean);
    const uniqueStructuredProjectTitles = Array.from(new Set(structuredProjectTitles));
    const fallbackProjectTitle = String(data.korteTitel || '').trim();
    const projectTitleLines = uniqueStructuredProjectTitles.length > 0
        ? uniqueStructuredProjectTitles
        : (fallbackProjectTitle ? [fallbackProjectTitle] : []);

    if (projectTitleLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        const subtitleLines = projectTitleLines.flatMap((title) =>
            doc.splitTextToSize(title, pageWidth - (margin * 2))
        );
        doc.text(subtitleLines, margin, y);
        y += subtitleLines.length * 3.8 + 2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    const shouldShowDescriptionOnSummaryPage = !(
        data.settings.showFullWerkbeschrijving &&
        Array.isArray(data.werkbeschrijvingFull) &&
        data.werkbeschrijvingFull.length > 0
    );
    if (shouldShowDescriptionOnSummaryPage) {
        const descriptionContent = data.korteBeschrijving || data.werkbeschrijving;
        if (descriptionContent && descriptionContent.trim().length > 0) {
            const descriptionLines = doc.splitTextToSize(descriptionContent, pageWidth - (margin * 2));
            doc.text(descriptionLines, margin, y);
            y += descriptionLines.length * 4.5 + 8;
        } else {
            y += 4;
        }
    } else {
        y += 4;
    }

    drawLine(y);
    y += 10;

    // SUMMARY BOX
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('SAMENVATTING', margin, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const summaryLineTotals = buildSummaryLineTotalsWithHiddenMargin(data.totals);
    const summaryHourlyRate = resolveSummaryHourlyRate(
        data.totals.uurTarief,
        data.totals.totaalUren,
        summaryLineTotals.arbeid,
    );
    const summaryItems: Array<[string, string]> = [];

    if (data.settings.showSummaryMaterialen) {
        summaryItems.push(['Materialen', formatCurrency(summaryLineTotals.materialen)]);
    }

    if (data.settings.showSummaryArbeid) {
        const arbeidLabelParts: string[] = [];
        if (data.settings.showSummaryArbeidUren) {
            arbeidLabelParts.push(`${data.totals.totaalUren} uur`);
        }
        if (data.settings.showSummaryArbeidTariefPerUurExclBtw) {
            arbeidLabelParts.push(`${formatCurrency(summaryHourlyRate)}/uur ex. btw`);
        }
        const arbeidLabel = arbeidLabelParts.length > 0
            ? `Arbeid (${arbeidLabelParts.join(' · ')})`
            : 'Arbeid';
        summaryItems.push([arbeidLabel, formatCurrency(summaryLineTotals.arbeid)]);
    }

    if (data.settings.showSummaryTransport && summaryLineTotals.transport !== 0) {
        summaryItems.push(['Transport', formatCurrency(summaryLineTotals.transport)]);
    }

    doc.setTextColor(80, 80, 80);
    summaryItems.forEach(([label, value]) => {
        doc.text(label, margin, y);
        doc.setTextColor(30, 30, 30);
        doc.text(value, pageWidth - margin, y, { align: 'right' });
        doc.setTextColor(80, 80, 80);
        y += 6;
    });

    const hasInterimTotals = data.settings.showSummaryExclBtw || data.settings.showSummaryBtw;

    if (summaryItems.length > 0 && (hasInterimTotals || data.settings.showSummaryInclBtw)) {
        y += 2;
        doc.setDrawColor(150, 150, 150);
        doc.line(pageWidth - 70, y, pageWidth - margin, y);
        y += 6;
    }

    if (data.settings.showSummaryExclBtw) {
        doc.setTextColor(80, 80, 80);
        doc.text('Totaal excl. BTW', margin, y);
        doc.setTextColor(30, 30, 30);
        doc.text(formatCurrency(data.totals.totaalExclBtw), pageWidth - margin, y, { align: 'right' });
        y += 6;
    }

    if (data.settings.showSummaryBtw) {
        doc.setTextColor(80, 80, 80);
        doc.text(`BTW (${data.totals.btwPercentage}%)`, margin, y);
        doc.setTextColor(30, 30, 30);
        doc.text(formatCurrency(data.totals.btw), pageWidth - margin, y, { align: 'right' });
        y += 4;
    }

    if (data.settings.showSummaryInclBtw) {
        if (hasInterimTotals) {
            doc.setLineWidth(0.8);
            doc.setDrawColor(16, 185, 129); // Emerald
            doc.line(pageWidth - 70, y, pageWidth - margin, y);
            y += 7;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.text(isOnderVoorbehoud ? 'RICHTPRIJS INCL. BTW' : 'TOTAAL INCL. BTW', margin, y);
        doc.setTextColor(16, 185, 129);
        doc.text(formatCurrency(data.totals.totaalInclBtw), pageWidth - margin, y, { align: 'right' });
    }
    if (isOnderVoorbehoud) {
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        const reserveNote = doc.splitTextToSize(
            'Onder voorbehoud van prijs- en typewijzigingen. Definitieve factuur volgt op basis van werkelijk uitgevoerde werkzaamheden.',
            pageWidth - (margin * 2),
        );
        doc.text(reserveNote, margin, y);
        y += reserveNote.length * 3.8;
    }

    // ═══════════════════════════════════════════════════════════════
    // PAGE 2: FULL WERK & LEVERING (if enabled)
    // ═══════════════════════════════════════════════════════════════

    const structuredWorkDescription = sanitizeWorkDescriptionStructured(data.werkbeschrijvingStructured);
    const structuredJobs = structuredWorkDescription.jobs.length > 0
        ? structuredWorkDescription.jobs
        : [{
            title: structuredWorkDescription.title,
            context: structuredWorkDescription.context,
            summary: structuredWorkDescription.summary,
            work_scope: structuredWorkDescription.work_scope,
            materials: structuredWorkDescription.materials,
            dimensions: structuredWorkDescription.dimensions,
            included: structuredWorkDescription.included,
            excluded: structuredWorkDescription.excluded,
            internal_notes: structuredWorkDescription.internal_notes,
            afvalAfvoeren: structuredWorkDescription.afvalAfvoeren,
            electricalScope: structuredWorkDescription.electricalScope,
            finishLevel: structuredWorkDescription.finishLevel,
            sections: structuredWorkDescription.sections,
            legacyNotes: structuredWorkDescription.legacyNotes || [],
        }];
    const hasStructuredWorkDescription = structuredJobs.some((job) =>
        job.work_scope.length > 0
        || job.dimensions.length > 0
        || job.included.length > 0
        || job.excluded.length > 0
    );

    if (data.settings.showFullWerkbeschrijving && data.werkbeschrijvingFull && data.werkbeschrijvingFull.length > 0) {
        const drawStepList = (rows: string[]) => {
            rows.forEach((stap, index) => {
                checkPageBreak(15);
                const stepNumber = `${index + 1}.`;
                const stepText = doc.splitTextToSize(stap, pageWidth - margin - 30);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(80, 80, 80);
                doc.text(stepNumber, margin, y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(50, 50, 50);
                doc.text(stepText, margin + 10, y);
                y += Math.max(stepText.length * 4.5, 6) + 2;
            });
        };

        const drawScopeSection = (label: string, rows: string[]) => {
            const cleanRows = rows.map((line) => String(line || '').trim()).filter(Boolean);
            if (cleanRows.length === 0) return;
            checkPageBreak(18);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(45, 45, 45);
            doc.text(label, margin, y);
            y += 6;
            doc.setFontSize(9);
            drawStepList(cleanRows);
            y += 3;
        };

        const drawJobScope = (job: typeof structuredJobs[number]) => {
            drawScopeSection('WERKZAAMHEDEN', job.work_scope);
            drawScopeSection('MAATVOERING', job.dimensions);
            drawScopeSection('INBEGREPEN', job.included);
            drawScopeSection('NIET INBEGREPEN', job.excluded);
        };

        if (hasStructuredWorkDescription && structuredJobs.length > 1) {
            structuredJobs.forEach((job, jobIndex) => {
                doc.addPage();
                y = margin;

                drawSectionPageHeader('WERK & LEVERING');

                const jobTitle = String(job.title || '').trim() || `Werkzaamheden ${jobIndex + 1}`;
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(35, 35, 35);
                const titleLines = doc.splitTextToSize(jobTitle, pageWidth - (margin * 2));
                doc.text(titleLines, margin, y);
                y += titleLines.length * 5.3 + 3;

                const jobContext = String(job.summary || job.context || '').trim();
                if (jobContext) {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'italic');
                    doc.setTextColor(90, 90, 90);
                    const contextLines = doc.splitTextToSize(jobContext, pageWidth - (margin * 2));
                    doc.text(contextLines, margin, y);
                    y += contextLines.length * 4.3 + 4;
                }

                drawLine(y);
                y += 8;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(50, 50, 50);
                drawJobScope(job);
            });
        } else {
            doc.addPage();
            y = margin;

            drawSectionPageHeader('WERK & LEVERING');

            const singleJob = structuredJobs[0];
            const resolvedTitle = String(singleJob?.title || data.korteTitel || '').trim();
            if (resolvedTitle) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(40, 40, 40);
                const titleLines = doc.splitTextToSize(resolvedTitle, pageWidth - (margin * 2));
                doc.text(titleLines, margin, y);
                y += titleLines.length * 5 + 4;
            }

            const resolvedContext = String(singleJob?.summary || singleJob?.context || data.korteBeschrijving || '').trim();
            if (resolvedContext) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(90, 90, 90);
                const contextLines = doc.splitTextToSize(resolvedContext, pageWidth - (margin * 2));
                doc.text(contextLines, margin, y);
                y += contextLines.length * 4.3 + 4;
            }

            doc.setFontSize(9);
            doc.setTextColor(50, 50, 50);
            doc.setFont('helvetica', 'normal');
            if (hasStructuredWorkDescription) {
                drawJobScope(singleJob);
            }

            y += 5;
            drawLine(y);
            y += 8;

            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.setFont('helvetica', 'italic');
            const footerNote = 'Werkzaamheden en leveringen zijn uitsluitend inbegrepen voor zover hierboven expliciet omschreven.';
            doc.text(footerNote, margin, y);
        }
    }

    const materialPresentations = sanitizeMaterialPresentations(data.materialPresentations, '')
        .filter((item) => item.showInQuote)
        .filter((item) =>
            item.title
            || item.application
            || item.clientDescription
            || item.whyChosen
            || item.keyProperties.length > 0
            || item.visibleSpecifications.length > 0
            || (item.showProductImage && item.productImageUrl)
        );

    if (materialPresentations.length > 0) {
        doc.addPage();
        y = margin;

        drawSectionPageHeader('KWALITEITSGARANTIE & TOEGEPASTE MATERIALEN');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(70, 70, 70);
        const introLines = doc.splitTextToSize(
            'In deze offerte zijn de belangrijkste zichtbare en kwaliteitsbepalende materialen opgenomen. Dit geeft inzicht in de gekozen materiaalrichting, afwerking en kwaliteit, zonder onnodige technische of leveranciersspecifieke details.',
            pageWidth - (margin * 2),
        );
        doc.text(introLines, margin, y);
        y += introLines.length * 4.5 + 8;

        const imageCache = new Map<string, string | null>();
        const getPresentationImage = async (url: string): Promise<string | null> => {
            if (!url) return null;
            if (imageCache.has(url)) return imageCache.get(url) || null;
            try {
                const base64 = await urlToBase64(url);
                imageCache.set(url, base64);
                return base64;
            } catch (error) {
                console.error('Error loading material presentation image:', error);
                imageCache.set(url, null);
                return null;
            }
        };

        for (const item of materialPresentations) {
            const imageData = item.showProductImage && item.productImageUrl
                ? await getPresentationImage(item.productImageUrl)
                : null;
            const hasSpecs = item.showTechnicalDetails && item.visibleSpecifications.length > 0;
            const hasProperties = item.keyProperties.length > 0;
            const cardTop = y;
            const cardWidth = pageWidth - (margin * 2);
            const imageWidth = imageData ? 42 : 0;
            const textWidth = cardWidth - 10 - (imageData ? imageWidth + 8 : 0);

            const titleLines = doc.splitTextToSize(item.title || 'Toegepast materiaal', textWidth);
            const applicationLines = item.application ? doc.splitTextToSize(item.application, textWidth) : [];
            const descriptionLines = item.clientDescription ? doc.splitTextToSize(item.clientDescription, textWidth) : [];
            const whyLines = item.whyChosen ? doc.splitTextToSize(item.whyChosen, textWidth) : [];
            const specHeight = hasSpecs ? 7 + (item.visibleSpecifications.length * 6) : 0;
            const propertiesHeight = hasProperties ? 6 + (item.keyProperties.length * 4.6) : 0;
            const alternativeHeight = item.allowEquivalentAlternative ? 10 : 0;
            const textHeight =
                8
                + titleLines.length * 5.2
                + (applicationLines.length ? applicationLines.length * 4.2 + 3 : 0)
                + (descriptionLines.length ? descriptionLines.length * 4.4 + 5 : 0)
                + (whyLines.length ? whyLines.length * 4.4 + 7 : 0)
                + propertiesHeight
                + specHeight
                + alternativeHeight
                + 7;
            const cardHeight = Math.max(textHeight, imageData ? 44 : 0);

            checkPageBreak(cardHeight + 8);
            const actualCardTop = y;
            doc.setDrawColor(220, 225, 230);
            doc.setFillColor(250, 250, 249);
            doc.roundedRect(margin, actualCardTop, cardWidth, cardHeight, 2.5, 2.5, 'FD');

            let textY = actualCardTop + 7;
            const textX = margin + 5;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 30, 30);
            doc.text(titleLines, textX, textY);
            textY += titleLines.length * 5.2;

            if (applicationLines.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(90, 90, 90);
                doc.text(applicationLines, textX, textY);
                textY += applicationLines.length * 4.2 + 3;
            }

            if (imageData) {
                try {
                    doc.addImage(
                        imageData,
                        getImageFormatFromDataUrl(imageData),
                        margin + cardWidth - imageWidth - 5,
                        actualCardTop + 6,
                        imageWidth,
                        32,
                    );
                } catch (error) {
                    console.error('Error adding material presentation image:', error);
                }
            }

            if (descriptionLines.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.8);
                doc.setTextColor(55, 55, 55);
                doc.text(descriptionLines, textX, textY);
                textY += descriptionLines.length * 4.4 + 5;
            }

            if (whyLines.length > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.8);
                doc.setTextColor(45, 45, 45);
                doc.text('Waarom gekozen?', textX, textY);
                textY += 4.7;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(55, 55, 55);
                doc.text(whyLines, textX, textY);
                textY += whyLines.length * 4.4 + 4;
            }

            if (hasProperties) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.8);
                doc.setTextColor(45, 45, 45);
                doc.text('Belangrijke eigenschappen', textX, textY);
                textY += 5;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(60, 60, 60);
                item.keyProperties.forEach((property) => {
                    doc.text('•', textX, textY);
                    doc.text(doc.splitTextToSize(property, textWidth - 5), textX + 4, textY);
                    textY += 4.6;
                });
                textY += 2;
            }

            if (hasSpecs) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.8);
                doc.setTextColor(45, 45, 45);
                doc.text('Zichtbare specificaties', textX, textY);
                textY += 5;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                item.visibleSpecifications.forEach((spec, specIndex) => {
                    const rowY = textY - 3;
                    doc.setFillColor(specIndex % 2 === 0 ? 244 : 250, specIndex % 2 === 0 ? 246 : 250, specIndex % 2 === 0 ? 248 : 250);
                    doc.rect(textX, rowY, textWidth, 5.4, 'F');
                    doc.setTextColor(85, 85, 85);
                    doc.text(spec.label, textX + 2, textY + 0.8);
                    doc.setTextColor(45, 45, 45);
                    doc.text(doc.splitTextToSize(spec.value, textWidth * 0.48), textX + (textWidth * 0.45), textY + 0.8);
                    textY += 6;
                });
                textY += 2;
            }

            if (item.allowEquivalentAlternative) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.8);
                doc.setTextColor(100, 100, 100);
                const noteLines = doc.splitTextToSize(
                    'Indien een materiaal tijdelijk niet leverbaar is, wordt uitsluitend een gelijkwaardig of beter alternatief toegepast na overleg met opdrachtgever.',
                    textWidth,
                );
                doc.text(noteLines, textX, textY);
            }

            y = actualCardTop + cardHeight + 6;
            if (cardTop !== actualCardTop) {
                y = actualCardTop + cardHeight + 6;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PAGE 3: MATERIALS (if enabled)
    // ═══════════════════════════════════════════════════════════════

    if (data.settings.showGrootmaterialen || data.settings.showVerbruiksartikelen) {
        doc.addPage();
        y = margin;

        drawSectionPageHeader('MATERIAALSPECIFICATIE');

        // GROOTMATERIALEN
        if (data.settings.showGrootmaterialen && data.grootmaterialen.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            doc.text('GROOTMATERIALEN', margin, y);
            y += 8;

            // Table header
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('Aantal', margin, y);
            doc.text('Omschrijving', margin + 18, y);
            if (data.settings.showPricesPerItem) {
                doc.text('Per stuk', pageWidth - 50, y, { align: 'right' });
                doc.text('Totaal', pageWidth - margin, y, { align: 'right' });
            }
            y += 3;
            drawLine(y);
            y += 5;

            // Table rows
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);

            data.grootmaterialen.forEach((item) => {
                checkPageBreak(12);

                const productLines = doc.splitTextToSize(item.product, data.settings.showPricesPerItem ? 75 : 120);
                doc.text(String(item.aantal), margin, y);
                doc.text(productLines, margin + 18, y);

                if (data.settings.showPricesPerItem) {
                    doc.text(formatCurrency(item.prijsPerStuk), pageWidth - 50, y, { align: 'right' });
                    doc.text(formatCurrency(item.totaal), pageWidth - margin, y, { align: 'right' });
                }

                y += Math.max(productLines.length * 4, 5) + 2;
            });

            y += 3;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(80, 80, 80);
            doc.text(`Subtotaal grootmaterialen:`, pageWidth - 70, y, { align: 'right' });
            doc.setTextColor(30, 30, 30);
            doc.text(formatCurrency(data.totals.materialenGroot), pageWidth - margin, y, { align: 'right' });

            y += 15;
        }

        // VERBRUIKSARTIKELEN
        if (data.settings.showVerbruiksartikelen && data.verbruiksartikelen.length > 0) {
            checkPageBreak(30);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            doc.text('VERBRUIKSARTIKELEN', margin, y);
            y += 8;

            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('Aantal', margin, y);
            doc.text('Omschrijving', margin + 18, y);
            if (data.settings.showPricesPerItem) {
                doc.text('Per stuk', pageWidth - 50, y, { align: 'right' });
                doc.text('Totaal', pageWidth - margin, y, { align: 'right' });
            }
            y += 3;
            drawLine(y);
            y += 5;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);

            data.verbruiksartikelen.forEach((item) => {
                checkPageBreak(12);

                const productLines = doc.splitTextToSize(item.product, data.settings.showPricesPerItem ? 75 : 120);
                doc.text(String(item.aantal), margin, y);
                doc.text(productLines, margin + 18, y);

                if (data.settings.showPricesPerItem) {
                    doc.text(formatCurrency(item.prijsPerStuk), pageWidth - 50, y, { align: 'right' });
                    doc.text(formatCurrency(item.totaal), pageWidth - margin, y, { align: 'right' });
                }

                y += Math.max(productLines.length * 4, 5) + 2;
            });

            y += 3;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(80, 80, 80);
            doc.text(`Subtotaal verbruiksartikelen:`, pageWidth - 70, y, { align: 'right' });
            doc.setTextColor(30, 30, 30);
            doc.text(formatCurrency(data.totals.materialenVerbruik), pageWidth - margin, y, { align: 'right' });
        }

        // Total materials
        y += 10;
        doc.setLineWidth(0.5);
        doc.setDrawColor(100, 100, 100);
        doc.line(pageWidth - 80, y, pageWidth - margin, y);
        y += 6;

        doc.setFontSize(10);
        doc.text('TOTAAL MATERIALEN:', pageWidth - 80, y, { align: 'right' });
        doc.setTextColor(16, 185, 129);
        doc.text(formatCurrency(data.totals.materialenTotaal), pageWidth - margin, y, { align: 'right' });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAGE 4: LABOR SPECIFICATION (if enabled)
    // ═══════════════════════════════════════════════════════════════

    if (data.settings.showUrenSpecificatie && data.urenSpecificatie.length > 0) {
        doc.addPage();
        y = margin;

        drawSectionPageHeader('URENSPECIFICATIE');

        // Table header
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('Uren', margin, y);
        doc.text('Werkzaamheden', margin + 15, y);
        doc.text('Bedrag', pageWidth - margin, y, { align: 'right' });
        y += 3;
        drawLine(y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);

        data.urenSpecificatie.forEach((item) => {
            checkPageBreak(12);

            const taakLines = doc.splitTextToSize(item.taak, pageWidth - margin - 55);
            doc.text(item.uren.toFixed(1), margin, y);
            doc.text(taakLines, margin + 15, y);
            doc.text(formatCurrency(item.uren * data.totals.uurTarief), pageWidth - margin, y, { align: 'right' });

            y += Math.max(taakLines.length * 4, 5) + 2;
        });

        y += 5;
        drawLine(y);
        y += 6;

        // Labor totals
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Totaal uren:`, pageWidth - 80, y, { align: 'right' });
        doc.setTextColor(30, 30, 30);
        doc.text(`${data.totals.totaalUren} uur`, pageWidth - margin, y, { align: 'right' });
        y += 5;

        doc.setTextColor(80, 80, 80);
        doc.text(`Uurtarief:`, pageWidth - 80, y, { align: 'right' });
        doc.setTextColor(30, 30, 30);
        doc.text(formatCurrency(data.totals.uurTarief), pageWidth - margin, y, { align: 'right' });
        y += 6;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text('TOTAAL ARBEID:', pageWidth - 80, y, { align: 'right' });
        doc.setTextColor(16, 185, 129);
        doc.text(formatCurrency(data.totals.arbeidTotaal), pageWidth - margin, y, { align: 'right' });
    }

    // ═══════════════════════════════════════════════════════════════
    // FINAL PAGE: TERMS + SIGNATURE (always shown)
    // ═══════════════════════════════════════════════════════════════

    doc.addPage();
    y = margin;

    // --- BETALINGSVOORWAARDEN ---

    const betalingsTerms = isOnderVoorbehoud
        ? tekstInstellingen.betalingsvoorwaardenOnderVoorbehoud
        : tekstInstellingen.betalingsvoorwaardenVastePrijs;

    drawSectionPageHeader('BETALINGSVOORWAARDEN');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);

    const bulletIndent = 4;

    betalingsTerms.forEach((term) => {
        const clean = (term || '').trim();
        if (!clean) return;
        const termText = normalizeCommonWording(clean.replace(/^[•\-]\s*/, ''));
        if (!termText) return;

        const wrapped = doc.splitTextToSize(termText, pageWidth - (margin * 2) - bulletIndent);
        doc.text('•', margin, y);
        doc.text(wrapped, margin + bulletIndent, y);
        y += wrapped.length * 4.4;
    });

    y += 10;

    // --- VOORWAARDEN ---

    const algemeenHeader = 'VOORWAARDEN';
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(algemeenHeader, margin, y);
    y += 8;
    drawLine(y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);

    const terms = isOnderVoorbehoud
        ? tekstInstellingen.voorwaardenOnderVoorbehoud
        : tekstInstellingen.voorwaardenVastePrijs;
    const redTerms = new Set(
        isOnderVoorbehoud
            ? tekstInstellingen.voorwaardenOnderVoorbehoudRodeRegels || []
            : tekstInstellingen.voorwaardenVastePrijsRodeRegels || [],
    );

    terms.forEach((term, index) => {
        const clean = (term || '').trim();
        if (!clean) return;

        const termText = normalizeCommonWording(clean.replace(/^[•\-]\s*/, ''));
        if (!termText) return;

        const shouldBeRed = redTerms.has(index);
        doc.setTextColor(shouldBeRed ? 185 : 60, shouldBeRed ? 28 : 60, shouldBeRed ? 28 : 60);
        const wrapped = doc.splitTextToSize(termText, pageWidth - (margin * 2) - bulletIndent);
        if (y + (wrapped.length * 4.4) > pageHeight - 55) {
            doc.addPage();
            y = margin;
            drawSectionPageHeader(algemeenHeader);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
        }
        doc.text('•', margin, y);
        doc.text(wrapped, margin + bulletIndent, y);
        y += wrapped.length * 4.4;
    });

    // Fixed system line for legal agreement near signing block (non-editable)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 75, 75);
    const akkoordUitleg = doc.splitTextToSize(
        'Door ondertekening gaat opdrachtgever akkoord met deze offerte en bijbehorende voorwaarden.',
        pageWidth - (margin * 2),
    );
    if (y + (akkoordUitleg.length * 4.1) + 36 > pageHeight - margin) {
        doc.addPage();
        y = margin;
        drawSectionPageHeader(algemeenHeader);
    } else {
        y += 8;
        drawLine(y);
        y += 8;
    }
    doc.text(akkoordUitleg, margin, y);
    y += akkoordUitleg.length * 4.1 + 5;

    // Signature block
    if (y + 26 > pageHeight - margin) {
        doc.addPage();
        y = margin;
    }
    doc.setDrawColor(205, 205, 205);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Voor akkoord', margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text('Datum:', margin + 4, y + 15);
    doc.line(margin + 20, y + 15, margin + 78, y + 15);

    const handtekeningX = pageWidth / 2 + 2;
    doc.text('Handtekening:', handtekeningX, y + 15);
    doc.line(handtekeningX + 24, y + 15, pageWidth - margin - 4, y + 15);
    y += 31;

    drawLine(y);
    y += 10;

    // Closing
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const closingText = (tekstInstellingen.afsluitingTekst || '').trim() || defaultQuotePdfTextSettings.afsluitingTekst;
    const closingLines = doc.splitTextToSize(closingText, pageWidth - (margin * 2));
    doc.text(closingLines, margin, y);
    y += (closingLines.length * 4.2) + 4;

    const groetTekst = (tekstInstellingen.groetTekst || '').trim() || defaultQuotePdfTextSettings.groetTekst;
    doc.text(groetTekst, margin, y);
    y += 6;

    if (y + 30 > pageHeight - margin) {
        doc.addPage();
        y = margin;
    }

    const ondertekeningNaam = toDutchTitleCase(tekstInstellingen.ondertekeningNaam || displayBedrijf.naam);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(ondertekeningNaam, margin, y);
    y += 5;

    // Signature image is rendered in the footer; avoid drawing a second signature on this page.

    // ═══════════════════════════════════════════════════════════════
    // OPTIONAL PAGE: ALGEMENE VOORWAARDEN
    // ═══════════════════════════════════════════════════════════════

    const algemeneVoorwaardenTekst = String(data.algemeneVoorwaardenTekst || '').trim();
    if (data.settings.showAlgemeneVoorwaarden && algemeneVoorwaardenTekst.length > 0) {
        doc.addPage();
        y = margin;

        drawSectionPageHeader(String(data.algemeneVoorwaardenTitel || 'ALGEMENE VOORWAARDEN').trim() || 'ALGEMENE VOORWAARDEN');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);

        const blocks = algemeneVoorwaardenTekst
            .split(/\n\s*\n/g)
            .map((part) => part.trim())
            .filter(Boolean);

        const algemeneVoorwaardenTitel =
            String(data.algemeneVoorwaardenTitel || 'ALGEMENE VOORWAARDEN').trim() || 'ALGEMENE VOORWAARDEN';

        const ensureSpace = (needed: number) => {
            if (y + needed <= pageHeight - margin) return;
            doc.addPage();
            y = margin;
            drawSectionPageHeader(algemeneVoorwaardenTitel);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(50, 50, 50);
        };

        if (blocks.length === 0) {
            const fallback = doc.splitTextToSize(algemeneVoorwaardenTekst, pageWidth - (margin * 2));
            fallback.forEach((line: string) => {
                ensureSpace(5);
                doc.text(line, margin, y);
                y += 4.5;
            });
        } else {
            blocks.forEach((block) => {
                const lines = doc.splitTextToSize(block, pageWidth - (margin * 2));
                ensureSpace((lines.length * 4.5) + 4);
                doc.text(lines, margin, y);
                y += (lines.length * 4.5) + 4;
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // OPTIONAL PAGE: TEKENINGEN (only when enabled and actual drawings exist)
    // ═══════════════════════════════════════════════════════════════

    const drawingImages = Array.isArray(data.drawingImages) ? data.drawingImages : [];
    if (data.settings.showTekeningen && drawingImages.length > 0) {
        drawingImages.forEach((imgData, index) => {
            doc.addPage();
            y = margin;

            // Header
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 30, 30);
            doc.text(`TEKENINGEN (${index + 1}/${drawingImages.length})`, margin, y);

            y += 8;
            drawLine(y);
            y += 10;

            try {
                // Calculate aspect ratio to fit page
                const imgProps = doc.getImageProperties(imgData);
                const availableWidth = pageWidth - (margin * 2);
                const availableHeight = pageHeight - y - margin;

                let imgWidth = availableWidth;
                let imgHeight = (imgProps.height * availableWidth) / imgProps.width;

                if (imgHeight > availableHeight) {
                    imgHeight = availableHeight;
                    imgWidth = (imgProps.width * availableHeight) / imgProps.height;
                }

                doc.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight, undefined, 'NONE');
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.25);
                doc.rect(margin, y, imgWidth, imgHeight);
            } catch (err) {
                console.error("Error adding image to PDF:", err);
                doc.setFontSize(10);
                doc.setTextColor(255, 0, 0);
                doc.text("Fout bij laden van tekening.", margin, y + 10);
            }
        });
    }

    // Return as blob
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);

        if (page > 1) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(120, 120, 120);
            doc.text(`Offerte #${data.offerteNummer}`, pageWidth - margin, 8, { align: 'right' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        doc.text(`${page}/${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });

        if (signatureAsset) {
            const footerMaxWidth = 40;
            const footerMaxHeight = 10;
            const footerAreaTop = pageHeight - 19;
            const { width: footerSignatureWidth, height: footerSignatureHeight } = fitImageWithinBox(
                signatureAsset.width,
                signatureAsset.height,
                footerMaxWidth,
                footerMaxHeight,
            );

            if (footerSignatureWidth > 0 && footerSignatureHeight > 0) {
                const signatureY = footerAreaTop + ((footerMaxHeight - footerSignatureHeight) / 2);
                doc.addImage(
                    signatureAsset.base64,
                    signatureAsset.format,
                    margin,
                    signatureY,
                    footerSignatureWidth,
                    footerSignatureHeight,
                );
            }
        }
    }

    return doc.output('blob');
}
