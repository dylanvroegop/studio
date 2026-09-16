import assert from 'node:assert/strict';
import { loadWhatsAppPreset, whatsappPresetKey } from '../lib/whatsapp-message-preset';
import { validateQuotePdfTranslations } from '../lib/quote-pdf-translation';

async function run(): Promise<void> {
    const key = 'whatsapp_message_preset_v1';
    const dutch = 'Beste {{voornaam}},\n\nHierbij de offerte.\nblob:https://app.calvora.nl/old-file';
    const values = new Map([[key, dutch]]);
    const storage = { getItem: (name: string) => values.get(name) ?? null };
    let calls = 0;
    const translate = async (source: string) => {
        calls += 1;
        assert.ok(!source.includes('blob:'));
        assert.ok(source.includes('{{voornaam}}'));
        return 'Dear {{voornaam}},\n\nPlease find attached the quotation.';
    };
    const english = await loadWhatsAppPreset(storage, key, 'en', translate);
    assert.match(english, /Dear \{\{voornaam\}\}/);
    assert.equal(values.get(key), dutch, 'Loading English must preserve Dutch');
    values.set(whatsappPresetKey(key, 'en'), english);
    assert.equal(await loadWhatsAppPreset(storage, key, 'en', translate), english);
    assert.equal(calls, 1, 'Saved English must be reused');
    assert.match(await loadWhatsAppPreset(storage, key, 'nl', translate), /Beste/);
    values.set(whatsappPresetKey(key, 'en'), '');
    assert.equal(await loadWhatsAppPreset(storage, key, 'en', translate), '', 'Deleted English must stay empty');
    values.delete(whatsappPresetKey(key, 'en'));
    await assert.rejects(loadWhatsAppPreset(storage, key, 'en', async () => { throw new Error('AI unavailable'); }), /AI unavailable/);
    assert.equal(values.get(key), dutch);
    assert.throws(() => validateQuotePdfTranslations(['Beste {{voornaam}}'], ['Dear {{first_name}}']), /invulveld/);
    assert.equal(validateQuotePdfTranslations(['Beste {{voornaam}}'], ['Dear {{voornaam}}']).entries[0].english, 'Dear {{voornaam}}');
    console.log('WhatsApp language tests passed: English translation/cache, Dutch preservation, empty preset, errors and name token.');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
