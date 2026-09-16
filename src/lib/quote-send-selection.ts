import type { Quote } from './types';

export interface SendableQuote extends Quote {
    archived?: boolean;
    totaalbedrag?: number;
}

export function quoteClientKey(quote: Pick<Quote, 'klantinformatie'>): string {
    const info = quote.klantinformatie;
    if (!info) return '';
    const company = (info.bedrijfsnaam || '').trim();
    const name = company || `${info.voornaam || ''} ${info.achternaam || ''}`;
    const normalized = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl-NL');
    return normalized ? `${company ? 'bedrijf' : 'persoon'}:${normalized}` : '';
}

export function isMatchingDraft(candidate: SendableQuote, current: SendableQuote): boolean {
    const key = quoteClientKey(current);
    return Boolean(key) && candidate.userId === current.userId && candidate.id !== current.id
        && candidate.status === 'concept' && !candidate.archived && quoteClientKey(candidate) === key;
}

export function quoteSendPrice(quote: SendableQuote): number | null {
    const raw = quote.financieel?.afgesprokenPrijsInclBtw ?? quote.totaalbedrag ?? quote.amount;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}
