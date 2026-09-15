import assert from 'node:assert/strict';
import { collectQuotePdfTexts, generateQuotePDF, type PDFQuoteData } from './generate-quote-pdf';
import { sanitizeWorkDescriptionStructured } from './quote-calculations';
import { createMaterialPresentation } from './material-presentations';
import { createQuotePdfTranslator, validateQuotePdfTranslations } from './quote-pdf-translation';

export async function runQuotePdfTranslationTests(): Promise<void> {
    assert.throws(() => validateQuotePdfTranslations(['930 mm'], ['940 mm']), /getal/);
    assert.throws(() => validateQuotePdfTranslations(['50% bij akkoord', '50% bij oplevering'], ['50% on approval']), /onvolledig/);
    assert.throws(() => validateQuotePdfTranslations(['Schilderwerk niet inbegrepen'], ['']), /ongeldige/);
    assert.throws(() => validateQuotePdfTranslations(['€ 1.234,56'], ['€ 1,234.56']), /getal/);
    const valid = validateQuotePdfTranslations(['4 glaslatten van 930 mm', 'Geen schilderwerk'], ['4 glazing beads of 930 mm', 'No painting']);
    assert.equal(createQuotePdfTranslator('en', valid)('Geen schilderwerk'), 'No painting');
    assert.equal(createQuotePdfTranslator('nl', valid)('Geen schilderwerk'), 'Geen schilderwerk');
    assert.throws(() => createQuotePdfTranslator('en', valid)('Nieuwe tekst'), /gewijzigd/);

    const presentation = createMaterialPresentation('test', 0);
    Object.assign(presentation, {
        title: 'Hardhouten glaslat', application: 'Aan buitenzijde raam', clientDescription: 'Wit gegrond hardhout',
        whyChosen: 'Geschikt voor buiten', keyProperties: ['Duurzaam'], visibleSpecifications: [{ label: 'Breedte', value: '35 mm' }],
    });
    const data: PDFQuoteData = {
        offerteNummer: '260388', datum: '15 september 2026', geldigTot: '15 oktober 2026',
        bedrijf: { naam: 'Vroegop Timmerwerken', adres: 'Straat 1', postcode: '1000 AA', plaats: 'Amsterdam', telefoon: '0612345678', email: 'test@example.com', kvk: '12345678', btw: 'NL123456789B01', iban: 'NL94KNAB0800339878' },
        klant: { naam: 'Test Klant', adres: 'Laan 2', postcode: '2000 BB', plaats: 'Utrecht', telefoon: '0611111111', email: 'client@example.com' },
        projectLocatie: 'Laan 2, Utrecht', korteTitel: 'Twee klussen', werkbeschrijving: 'Glaslat en deur vervangen', werkbeschrijvingFull: [],
        werkbeschrijvingStructured: sanitizeWorkDescriptionStructured({
            included: ['Afval afvoeren inbegrepen'], excluded: ['Schilderwerk niet inbegrepen'],
            jobs: [
                { title: 'Glaslat vervangen', summary: '4 glaslatten van 930 mm vervangen.', work_scope: ['4 glaslatten van 930 mm vervangen.'], dimensions: ['Breedte 35 mm'], internal_notes: ['GEHEIME INTERNE NOTITIE'] },
                { title: 'Deur vervangen', summary: 'De bestaande deur demonteren en een nieuwe deur plaatsen.', work_scope: ['De bestaande deur demonteren en een nieuwe deur plaatsen.'] },
            ],
        }),
        grootmaterialen: [{ aantal: 4, product: 'Glaslat hardhout 18x35x2700 mm', prijsPerStuk: 20, totaal: 80 }],
        verbruiksartikelen: [{ aantal: 1, product: 'Montagekit', prijsPerStuk: 10, totaal: 10 }],
        urenSpecificatie: [{ taak: 'Glaslatten monteren', uren: 2 }],
        totals: { materialenGroot: 80, materialenVerbruik: 10, materialenTotaal: 90, arbeidTotaal: 110, transportTotaal: 20, subtotaalExclBtw: 220, winstMarge: 0, totaalExclBtw: 220, btw: 46.2, totaalInclBtw: 266.2, totaalUren: 2, uurTarief: 55, btwPercentage: 21, margePercentage: 0 },
        settings: { showGrootmaterialen: true, showVerbruiksartikelen: true, showUrenSpecificatie: true, showFullWerkbeschrijving: true, showPricesPerItem: true, showTekeningen: false, showSummaryMaterialen: true, showSummaryArbeid: true, showSummaryArbeidUren: true, showSummaryArbeidTariefPerUurExclBtw: true, showSummaryTransport: true, showSummaryExclBtw: true, showSummaryBtw: true, showSummaryInclBtw: true, showAlgemeneVoorwaarden: true },
        algemeneVoorwaardenTitel: 'Algemene voorwaarden', algemeneVoorwaardenTekst: 'Voorwaarden artikel 1.\n\nBetaling binnen 14 dagen.',
        materialPresentations: [presentation],
    };
    const original = JSON.stringify(data);
    const texts = await collectQuotePdfTexts(data);
    for (const expected of ['OFFERTE', 'BETALINGSVOORWAARDEN', 'VOORWAARDEN', 'Voor akkoord', 'Glaslat vervangen', 'Deur vervangen', 'Glaslat hardhout 18x35x2700 mm', 'Montagekit', 'Glaslatten monteren', 'Betaling binnen 14 dagen.', 'Hardhouten glaslat', 'Breedte', '35 mm']) {
        assert.ok(texts.includes(expected), `Missing translated field: ${expected}`);
    }
    assert.ok(!texts.some((text) => /GEHEIME|client@example|NL94KNAB|Laan 2/.test(text)), 'Private/internal metadata should not be translated');
    assert.equal(JSON.stringify(data), original, 'Collection must preserve the Dutch source');
    const translation = validateQuotePdfTranslations(texts, texts.map((text) => `EN ${text}`));
    const english = { ...data, language: 'en' as const, englishTranslation: translation };
    const pdf = await generateQuotePDF(english);
    assert.ok(pdf.size > 1000);
    assert.equal(JSON.stringify(data), original, 'Rendering must preserve the Dutch source');
    await assert.rejects(generateQuotePDF({ ...english, algemeneVoorwaardenTekst: 'Nieuwe voorwaarden' }), /gewijzigd/);
    const conditionalTexts = await collectQuotePdfTexts({ ...data, onderVoorbehoud: true });
    assert.ok(conditionalTexts.includes('RICHTPRIJS INCL. BTW'));
    assert.ok(conditionalTexts.includes('Richtprijs op nacalculatie'));
    console.log(`Quote PDF translation tests passed (${texts.length} text entries; both jobs, terms, materials and numeric checks).`);
}
