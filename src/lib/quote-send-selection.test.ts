import assert from 'node:assert/strict';
import Module from 'node:module';
import { unzipSync } from 'fflate';
import { prepareQuotePdfDownload } from './quote-pdf-download';
import { isMatchingDraft, quoteClientKey, quoteSendPrice, type SendableQuote } from './quote-send-selection';
import { generateQuotePDF, collectQuotePdfTexts } from './generate-quote-pdf';

export async function runQuoteSendSelectionTests(): Promise<void> {
    const current = {
        id: 'one', userId: 'owner', status: 'concept', offerteNummer: 260001, titel: 'Deur vervangen',
        klantinformatie: { voornaam: 'Test', achternaam: 'Klant', bedrijfsnaam: '' },
    } as SendableQuote;
    const second = { ...current, id: 'two', offerteNummer: 260002, titel: 'Kozijn vervangen', totaalbedrag: 193.6 };
    assert.ok(isMatchingDraft(second, current));
    assert.ok(isMatchingDraft({ ...second, klantinformatie: { ...second.klantinformatie, voornaam: ' TEST ', achternaam: ' klant ' } }, current));
    assert.ok(!isMatchingDraft(current, current));
    for (const status of ['verzonden', 'geaccepteerd', 'afgewezen', 'werkbespreking', 'in_behandeling'] as const) {
        assert.ok(!isMatchingDraft({ ...second, status }, current));
    }
    assert.ok(!isMatchingDraft({ ...second, archived: true }, current));
    assert.ok(!isMatchingDraft({ ...second, userId: 'other' }, current));
    assert.ok(!isMatchingDraft({ ...second, klantinformatie: { ...second.klantinformatie, achternaam: 'Anders' } }, current));
    assert.notEqual(quoteClientKey(current), quoteClientKey({ klantinformatie: { ...current.klantinformatie, bedrijfsnaam: 'Test Klant' } }));
    const nameless = { ...current, klantinformatie: { ...current.klantinformatie, voornaam: '', achternaam: '' } };
    assert.ok(!isMatchingDraft({ ...nameless, id: 'two' }, nameless));
    assert.equal(quoteSendPrice({ ...second, totaalbedrag: 0, amount: 99 }), 0);
    assert.equal(quoteSendPrice({ ...second, financieel: { afgesprokenPrijsInclBtw: 123 } }), 123);
    assert.equal(quoteSendPrice(current), null);

    // Isoleer de lees-API: deze tests raken geen echte offertes of klantberichten.
    const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
    const originalLoad = nodeModule._load;
    let savedQuote: Record<string, unknown> = {
        ...second,
        instellingen: { uurTariefExclBtw: 50, btwTarief: 21 },
        extras: { winstMarge: { mode: 'none', percentage: 0 }, transport: { mode: 'none' } },
        pdfTeksten: { betalingsvoorwaarden: ['Betaal in 2 delen.'] },
        algemeneVoorwaarden: { titel: 'Eigen voorwaarden', tekst: 'Voorwaarden van offerte twee.' },
    };
    let committedWrites: Array<{ id: string; update: Record<string, unknown> }> = [];
    const storedQuotes: Record<string, SendableQuote> = { one: current, two: second };
    interface TestTransaction {
        get: (ref: { id: string }) => Promise<unknown>;
        update: (ref: { id: string }, update: Record<string, unknown>) => void;
    }
    nodeModule._load = function (name, ...args) {
        if (name === 'firebase/firestore') return {
            doc: (...segments: unknown[]) => ({ id: segments.at(-1) }),
            getDoc: async () => ({ exists: () => true, id: 'two', data: () => savedQuote }),
            serverTimestamp: () => 'test-timestamp',
            runTransaction: async (_db: unknown, callback: (transaction: TestTransaction) => Promise<void>) => {
                const writes: typeof committedWrites = [];
                await callback({
                    get: async (ref) => ({ id: ref.id, ref, exists: () => Boolean(storedQuotes[ref.id]), data: () => storedQuotes[ref.id] }),
                    update: (ref, update) => { writes.push({ id: ref.id, update }); },
                });
                committedWrites = writes;
            },
        };
        return originalLoad.call(this, name, ...args);
    };
    const { loadQuotePdfData } = require('./load-quote-pdf-data') as typeof import('./load-quote-pdf-data');
    const { markQuoteSelectionAsSent } = require('./quote-send-status') as typeof import('./quote-send-status');
    nodeModule._load = originalLoad;
    const originalFetch = globalThis.fetch;
    let calculationOk = true;
    globalThis.fetch = async () => new Response(JSON.stringify({
        ok: calculationOk,
        row: calculationOk ? { data_json: {
            korteTitel: 'Eigen titel twee', korteBeschrijving: 'Kozijn vervangen.',
            grootmaterialen: [{ aantal: 3, product: 'Eigen materiaal twee', prijs_per_stuk: 20 }],
            verbruiksartikelen: [], totaal_uren: 2,
            uren_specificatie: [{ taak: 'Kozijn monteren', uren: 2 }],
            instellingen: { uurTariefExclBtw: 999 },
        } } : null,
    }), { status: 200 });
    try {
        const options = {
            firestore: {} as import('firebase/firestore').Firestore, token: 'test', quoteId: 'two', currentQuote: current,
            userProfile: { settings: { bedrijfsnaam: 'Testbedrijf' } }, businessData: {},
            pdfSettings: { showGrootmaterialen: true, showVerbruiksartikelen: true, showUrenSpecificatie: true, showFullWerkbeschrijving: true, showPricesPerItem: true, showTekeningen: false, showSummaryMaterialen: true, showSummaryArbeid: true, showSummaryArbeidUren: true, showSummaryArbeidTariefPerUurExclBtw: true, showSummaryTransport: true, showSummaryExclBtw: true, showSummaryBtw: true, showSummaryInclBtw: true, showAlgemeneVoorwaarden: true },
        };
        const statusOptions = { firestore: options.firestore, userId: 'owner', currentQuote: current, currentTotal: 500, selectedIds: ['two'] };
        await markQuoteSelectionAsSent(statusOptions);
        assert.deepEqual(committedWrites.map((write) => write.id), ['two'], 'Een uitgevinkte huidige offerte niet wijzigen');
        assert.equal(committedWrites[0].update.status, 'verzonden');
        assert.equal(committedWrites[0].update['financieel.oorspronkelijkePrijsInclBtw'], 193.6);
        storedQuotes.two = { ...second, financieel: { oorspronkelijkePrijsInclBtw: 180, afgesprokenPrijsInclBtw: 193.6 } };
        await markQuoteSelectionAsSent({ ...statusOptions, selectedIds: ['one', 'two', 'two'] });
        assert.deepEqual(committedWrites.map((write) => write.id), ['one', 'two']);
        assert.ok(!('financieel.oorspronkelijkePrijsInclBtw' in committedWrites[1].update), 'Bestaande oorspronkelijke prijs bewaren');
        committedWrites = [];
        storedQuotes.two = { ...second, status: 'verzonden' };
        await assert.rejects(markQuoteSelectionAsSent({ ...statusOptions, selectedIds: ['one', 'two'] }), /selectie is gewijzigd/);
        assert.deepEqual(committedWrites, [], 'Een gewijzigde selectie mag geen gedeeltelijke statuswijziging opslaan');
        await assert.rejects(markQuoteSelectionAsSent({ ...statusOptions, selectedIds: [] }), /minimaal/);
        storedQuotes.one = { ...current, status: 'geaccepteerd' };
        await markQuoteSelectionAsSent({ ...statusOptions, selectedIds: ['one'] });
        assert.deepEqual(committedWrites, [], 'Een geaccepteerde offerte niet terugzetten naar verzonden');
        const data = await loadQuotePdfData(options);
        assert.equal(data.offerteNummer, '260002');
        assert.equal(data.klant.naam, 'Test Klant');
        assert.equal(data.korteTitel, 'Eigen titel twee');
        assert.equal(data.grootmaterialen[0].product, 'Eigen materiaal twee');
        assert.equal(data.totals.uurTarief, 50, 'Offerte-instellingen gaan voor de oude calculatie-instellingen');
        assert.equal(data.totals.totaalInclBtw, 193.6);
        assert.equal(data.algemeneVoorwaardenTekst, 'Voorwaarden van offerte twee.');
        assert.equal(data.algemeneVoorwaardenTitel, 'Eigen voorwaarden');
        assert.equal(data.language, 'nl');
        const pdf = await generateQuotePDF(data);
        assert.ok(pdf.size > 1000);
        const firstPdf = await generateQuotePDF({ ...data, offerteNummer: '260001', korteTitel: 'Eerste offerte' });
        const files = [{ fileName: 'Offerte-260001.pdf', blob: firstPdf }, { fileName: 'Offerte-260002.pdf', blob: pdf }];
        const single = await prepareQuotePdfDownload([files[0]], 'unused.zip');
        assert.equal(single, files[0]);
        const bundle = await prepareQuotePdfDownload(files, 'Offertes-Test.zip');
        assert.equal(bundle.blob.type, 'application/zip');
        const unpacked = unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
        assert.deepEqual(Object.keys(unpacked), files.map((file) => file.fileName));
        for (const file of files) assert.deepEqual(unpacked[file.fileName], new Uint8Array(await file.blob.arrayBuffer()));
        await assert.rejects(prepareQuotePdfDownload([], 'empty.zip'), /minimaal/);
        await assert.rejects(prepareQuotePdfDownload([files[0], files[0]], 'duplicate.zip'), /dezelfde bestandsnaam/);
        const texts = await collectQuotePdfTexts(data);
        assert.ok(texts.includes('Eigen materiaal twee'));
        assert.ok(!texts.includes(current.titel), 'Geen titel van de eerste offerte overnemen');
        savedQuote = { ...savedQuote, pdfLanguage: 'en', pdfEnglishTranslation: { entries: [] } };
        const english = await loadQuotePdfData(options);
        assert.equal(english.language, 'en');
        await assert.rejects(generateQuotePDF(english), /vertaling|gewijzigd|Engelse/);
        savedQuote = { ...savedQuote, status: 'verzonden' };
        await assert.rejects(loadQuotePdfData(options), /geen concept/);
        savedQuote = { ...savedQuote, status: 'concept', userId: 'other' };
        await assert.rejects(loadQuotePdfData(options), /andere klant/);
        savedQuote = { ...savedQuote, userId: 'owner' };
        calculationOk = false;
        await assert.rejects(loadQuotePdfData(options), /calculatie kon niet/);
    } finally {
        globalThis.fetch = originalFetch;
    }
    console.log('Quote send selection tests passed: client/status filtering, prices, independent PDF data/rendering, language and failure handling.');
}
