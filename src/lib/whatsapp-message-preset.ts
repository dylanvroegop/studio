export const DEFAULT_ENGLISH_QUOTE_MESSAGE = 'Hi {{voornaam}},\n\nThank you for the pleasant conversation.\n\nPlease find attached the quotation for the work we discussed. If anything is unclear or you would like to adjust any part of it, please let me know.\n\nKind regards,';

export function whatsappPresetKey(key: string, language: 'nl' | 'en'): string {
    return language === 'en' ? `${key}_en` : key;
}

export function stripDocumentLinksFromMessage(value: string): string {
    return value
        .replace(/\bblob:\S+/gi, '')
        .replace(/\bhttps?:\/\/(?:app\.)?calvora\.nl\/\S+/gi, '')
        .replace(/\{\{(?:offerte|factuur|meerwerkbon)_link\}\}/gi, '')
        .replace(/^\s*(?:offerte|factuur|meerwerkbon)(?:\s+pdf)?\s+(?:link|url)\s*:?\s*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export async function loadWhatsAppPreset(
    storage: Pick<Storage, 'getItem'>,
    key: string,
    language: 'nl' | 'en',
    translate?: (source: string) => Promise<string>,
): Promise<string> {
    const saved = storage.getItem(whatsappPresetKey(key, language));
    // Een bewust leeg gemaakte Engelse tekst blijft leeg.
    if (saved !== null) return stripDocumentLinksFromMessage(saved);
    if (language === 'nl') return '';
    const source = stripDocumentLinksFromMessage(storage.getItem(key) || '');
    if (!source) return DEFAULT_ENGLISH_QUOTE_MESSAGE;
    if (!translate) throw new Error('De Engelse berichtvertaling is niet beschikbaar.');
    return stripDocumentLinksFromMessage(await translate(source));
}
