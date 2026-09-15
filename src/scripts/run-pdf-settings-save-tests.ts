import assert from 'node:assert/strict';
import { createOrderedSaveQueue } from '../lib/ordered-save-queue';
import { defaultQuotePdfTextSettings, sanitizeQuotePdfTextSettings } from '../lib/quote-pdf-text-settings';

async function run(): Promise<void> {
    // Een langzame oude autosave mag de later verwijderde regel niet terugzetten.
    const queue = createOrderedSaveQueue();
    const events: string[] = [];
    let stored = ['Regel behouden', 'Regel verwijderen'];
    let releaseOldSave!: () => void;
    const oldSavePending = new Promise<void>((resolve) => { releaseOldSave = resolve; });
    const oldSave = queue.enqueue(async () => {
        events.push('old-start');
        await oldSavePending;
        stored = ['Regel behouden', 'Regel verwijderen'];
        events.push('old-end');
    });
    const deletion = queue.enqueue(async () => {
        events.push('delete');
        stored = ['Regel behouden'];
    });
    const manualSave = queue.enqueue(async () => {
        events.push('manual');
        stored = [];
    });
    await Promise.resolve();
    assert.ok(!events.includes('delete'));
    releaseOldSave();
    await Promise.all([oldSave, deletion, manualSave]);
    assert.deepEqual(events, ['old-start', 'old-end', 'delete', 'manual']);
    assert.deepEqual(stored, []);

    // Een mislukte opslag blokkeert de volgende verwijdering of poging niet.
    const failure = queue.enqueue(async () => { throw new Error('offline'); });
    const recovery = queue.enqueue(async () => { stored = ['Nieuwste versie']; });
    await assert.rejects(failure, /offline/);
    await recovery;
    assert.deepEqual(stored, ['Nieuwste versie']);

    // Verwijderen van de laatste regel blijft na serialisatie en opnieuw laden leeg,
    // in zowel vaste prijs als onder voorbehoud; standaardregels zijn alleen voor ontbrekende velden.
    const empty = { ...defaultQuotePdfTextSettings,
        betalingsvoorwaardenVastePrijs: [], betalingsvoorwaardenOnderVoorbehoud: [],
        voorwaardenVastePrijs: [], voorwaardenOnderVoorbehoud: [],
        voorwaardenVastePrijsRodeRegels: [0], voorwaardenOnderVoorbehoudRodeRegels: [1],
    };
    const reloaded = sanitizeQuotePdfTextSettings(JSON.parse(JSON.stringify(empty)));
    assert.deepEqual(reloaded.betalingsvoorwaardenVastePrijs, []);
    assert.deepEqual(reloaded.betalingsvoorwaardenOnderVoorbehoud, []);
    assert.deepEqual(reloaded.voorwaardenVastePrijs, []);
    assert.deepEqual(reloaded.voorwaardenOnderVoorbehoud, []);
    assert.deepEqual(reloaded.voorwaardenVastePrijsRodeRegels, []);
    assert.deepEqual(reloaded.voorwaardenOnderVoorbehoudRodeRegels, []);
    assert.ok(sanitizeQuotePdfTextSettings(undefined).voorwaardenVastePrijs.length > 0);
    console.log('PDF settings tests passed: ordered saves, immediate deletion, failure recovery and empty lists after reload.');
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
