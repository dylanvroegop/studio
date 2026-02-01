import { jsPDF } from 'jspdf';
import { formatCurrency } from './quote-calculations';
import { QuotePDFSettings } from '@/components/quote/QuoteSettings';

export interface PDFQuoteData {
    offerteNummer: string;
    datum: string;
    geldigTot: string;
    bedrijf: {
        naam: string;
        adres: string;
        postcode: string;
        plaats: string;
        telefoon: string;
        email: string;
        kvk: string;
        btw: string;
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
    };
    settings: QuotePDFSettings;
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
    let y = margin;

    // Helper: draw horizontal line
    const drawLine = (yPos: number, color: number = 200) => {
        doc.setDrawColor(color, color, color);
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
    };

    // Helper: check for page break
    const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - 20) {
            doc.addPage();
            y = margin;
            return true;
        }
        return false;
    };

    // ═══════════════════════════════════════════════════════════════
    // PAGE 1: HEADER + SUMMARY
    // ═══════════════════════════════════════════════════════════════

    // Logo placeholder
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, 40, 18, 'F');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('LOGO', margin + 20, y + 10, { align: 'center' });

    // Title: OFFERTE
    doc.setFontSize(28);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('OFFERTE', pageWidth - margin, y + 6, { align: 'right' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`#${data.offerteNummer}`, pageWidth - margin, y + 14, { align: 'right' });

    y += 28;
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
    doc.text(data.bedrijf.naam, colLeft, y);
    doc.text(data.klant.naam, colRight, y);
    doc.setFont('helvetica', 'normal');
    y += 5;

    doc.text(data.bedrijf.adres, colLeft, y);
    doc.text(data.klant.adres, colRight, y);
    y += 5;

    doc.text(`${data.bedrijf.postcode} ${data.bedrijf.plaats}`, colLeft, y);
    doc.text(`${data.klant.postcode} ${data.klant.plaats}`, colRight, y);
    y += 5;

    doc.setTextColor(100, 100, 100);
    doc.text(`Tel: ${data.bedrijf.telefoon}`, colLeft, y);
    doc.text(`Tel: ${data.klant.telefoon}`, colRight, y);
    y += 5;

    doc.text(`Email: ${data.bedrijf.email}`, colLeft, y);
    doc.text(`Email: ${data.klant.email}`, colRight, y);
    y += 5;

    doc.text(`KVK: ${data.bedrijf.kvk}`, colLeft, y);
    y += 5;
    doc.text(`BTW: ${data.bedrijf.btw}`, colLeft, y);

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
    doc.text(data.projectLocatie, metaCol2, y);

    y += 12;
    drawLine(y);
    y += 10;

    // Project description
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(data.korteTitel?.toUpperCase() || 'PROJECTOMSCHRIJVING', margin, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    const descriptionContent = data.korteBeschrijving || data.werkbeschrijving;
    const descriptionLines = doc.splitTextToSize(descriptionContent, pageWidth - (margin * 2));
    doc.text(descriptionLines, margin, y);
    y += descriptionLines.length * 4.5 + 8;

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

    const summaryItems = [
        ['Materialen', formatCurrency(data.totals.materialenTotaal)],
        [`Arbeid (${data.totals.totaalUren} uur)`, formatCurrency(data.totals.arbeidTotaal)],
        ['Transport', formatCurrency(data.totals.transportTotaal)],
    ];

    doc.setTextColor(80, 80, 80);
    summaryItems.forEach(([label, value]) => {
        doc.text(label, margin, y);
        doc.setTextColor(30, 30, 30);
        doc.text(value, pageWidth - margin, y, { align: 'right' });
        doc.setTextColor(80, 80, 80);
        y += 6;
    });

    y += 2;
    doc.setDrawColor(150, 150, 150);
    doc.line(pageWidth - 70, y, pageWidth - margin, y);
    y += 6;

    doc.setTextColor(80, 80, 80);
    doc.text('Totaal excl. BTW', margin, y);
    doc.setTextColor(30, 30, 30);
    doc.text(formatCurrency(data.totals.totaalExclBtw), pageWidth - margin, y, { align: 'right' });
    y += 6;

    doc.setTextColor(80, 80, 80);
    doc.text(`BTW (${data.totals.btwPercentage}%)`, margin, y);
    doc.setTextColor(30, 30, 30);
    doc.text(formatCurrency(data.totals.btw), pageWidth - margin, y, { align: 'right' });
    y += 4;

    doc.setLineWidth(0.8);
    doc.setDrawColor(16, 185, 129); // Emerald
    doc.line(pageWidth - 70, y, pageWidth - margin, y);
    y += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text('TOTAAL INCL. BTW', margin, y);
    doc.setTextColor(16, 185, 129);
    doc.text(formatCurrency(data.totals.totaalInclBtw), pageWidth - margin, y, { align: 'right' });

    // ═══════════════════════════════════════════════════════════════
    // PAGE 2: FULL WERKBESCHRIJVING (if enabled)
    // ═══════════════════════════════════════════════════════════════

    if (data.settings.showFullWerkbeschrijving && data.werkbeschrijvingFull && data.werkbeschrijvingFull.length > 0) {
        doc.addPage();
        y = margin;

        // Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('WERKBESCHRIJVING', margin, y);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Offerte #${data.offerteNummer}`, pageWidth - margin, y, { align: 'right' });

        y += 8;
        drawLine(y);
        y += 10;

        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);

        // Introduction text
        doc.setFont('helvetica', 'normal');
        const introText = 'De werkzaamheden worden uitgevoerd volgens onderstaande stappen:';
        doc.text(introText, margin, y);
        y += 10;

        // Numbered list of all steps
        data.werkbeschrijvingFull.forEach((stap, index) => {
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

        y += 5;
        drawLine(y);
        y += 8;

        // Footer note
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'italic');
        const footerNote = 'Bovenstaande werkzaamheden worden vakkundig uitgevoerd volgens de geldende normen en richtlijnen.';
        doc.text(footerNote, margin, y);
    }

    // ═══════════════════════════════════════════════════════════════
    // PAGE 3: MATERIALS (if enabled)
    // ═══════════════════════════════════════════════════════════════

    if (data.settings.showGrootmaterialen || data.settings.showVerbruiksartikelen) {
        doc.addPage();
        y = margin;

        // Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('MATERIAALSPECIFICATIE', margin, y);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Offerte #${data.offerteNummer}`, pageWidth - margin, y, { align: 'right' });

        y += 8;
        drawLine(y);
        y += 10;

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

        // Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('URENSPECIFICATIE', margin, y);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Offerte #${data.offerteNummer}`, pageWidth - margin, y, { align: 'right' });

        y += 8;
        drawLine(y);
        y += 10;

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

    // VOORWAARDEN
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('VOORWAARDEN', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);

    const terms = [
        '• Deze offerte is 30 dagen geldig vanaf offertedatum',
        '• Prijzen zijn exclusief BTW tenzij anders vermeld',
        '• Meerwerk wordt in overleg uitgevoerd en separaat gefactureerd',
        '• Betaling: 50% bij opdracht, 50% bij oplevering',
        '• Op al onze werkzaamheden zijn onze algemene voorwaarden van toepassing',
    ];

    terms.forEach((term) => {
        doc.text(term, margin, y);
        y += 5;
    });

    y += 10;
    drawLine(y);
    y += 12;

    // Signature block
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Voor akkoord:', margin, y);
    y += 12;

    doc.setTextColor(30, 30, 30);
    doc.text('Datum: _______________________', margin, y);
    doc.text('Handtekening: _______________________', pageWidth / 2, y);

    y += 25;
    drawLine(y);
    y += 10;

    // Closing
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const closing = 'Wij vertrouwen erop u hiermee een passende aanbieding te hebben gedaan en zien uw reactie graag tegemoet.';
    doc.text(closing, margin, y);
    y += 10;

    doc.text('Met vriendelijke groet,', margin, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(data.bedrijf.naam, margin, y);

    // ═══════════════════════════════════════════════════════════════
    // OPTIONAL PAGE: TEKENINGEN (if enabled)
    // ═══════════════════════════════════════════════════════════════

    if (data.settings.showTekeningen) {
        doc.addPage();
        y = margin;

        // Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('TEKENINGEN', margin, y);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Offerte #${data.offerteNummer}`, pageWidth - margin, y, { align: 'right' });

        y += 8;
        drawLine(y);
        y += 10;

        // Placeholder content
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        doc.text('Zie bijlagen voor technische tekeningen en plattegronden.', margin, y);

        // Example box to indicate where drawings would go
        y += 20;
        doc.setDrawColor(230, 230, 230);
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(margin, y, pageWidth - (margin * 2), 150, 3, 3, 'FD');

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(14);
        doc.text('Ruimte voor tekeningen', pageWidth / 2, y + 75, { align: 'center' });
    }

    // Return as blob
    return doc.output('blob');
}
