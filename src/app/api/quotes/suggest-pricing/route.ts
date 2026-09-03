import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    createQuotePricingId,
    findMatchingQuotePriceRule,
    normalizePricingTitle,
    normalizePricingUnit,
    parsePricingNumber,
    sanitizeQuotePriceRules,
    type QuotePriceLine,
    type QuotePriceRule,
    type QuotePricingSource,
    type QuotePricingUnit,
} from '@/lib/quote-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = process.env.OPENAI_PRICING_MODEL?.trim()
    || process.env.OPENAI_MODEL?.trim()
    || 'gpt-5.5';
const OPENAI_TIMEOUT_MS = 120_000;
const MAX_LINES = 40;
const MAX_RULES = 100;
const MAX_HISTORY = 12;

type RequestBody = {
    quoteId?: unknown;
    quoteTitle?: unknown;
    notes?: unknown;
};

type AiLine = {
    title?: unknown;
    unit?: unknown;
    quantity?: unknown;
    unitPriceExclBtw?: unknown;
    confidence?: unknown;
    explanation?: unknown;
};

function safeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function clampText(value: unknown, maxLength: number): string {
    const text = safeString(value).replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

function extractResponseText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const row = payload as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ text?: unknown }> }>;
    };

    if (typeof row.output_text === 'string' && row.output_text.trim()) {
        return row.output_text.trim();
    }

    if (Array.isArray(row.output)) {
        return row.output
            .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
            .map((content) => typeof content?.text === 'string' ? content.text : '')
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    return '';
}

function parseJsonOutput(value: string): unknown {
    const cleaned = value
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(cleaned.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

function normalizeHistoryText(value: unknown): string {
    return safeString(value)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 8)
        .join('\n');
}

function getQuoteText(data: Record<string, unknown>): string {
    const structuredParts: string[] = [];
    const collectStructured = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(collectStructured);
            return;
        }
        if (!value || typeof value !== 'object') return;
        const row = value as Record<string, unknown>;
        ['title', 'summary', 'context', 'work_scope', 'dimensions', 'description'].forEach((key) => {
            const item = row[key];
            if (Array.isArray(item)) item.forEach((part) => structuredParts.push(normalizeHistoryText(part)));
            else structuredParts.push(normalizeHistoryText(item));
        });
        ['jobs', 'werkbeschrijving_jobs', 'werkbeschrijving_structured'].forEach((key) => collectStructured(row[key]));
    };
    collectStructured(data.werkbeschrijving_jobs);
    collectStructured(data.werkbeschrijving_structured);

    return [
        data.titel,
        data.title,
        data.korteTitel,
        data.korteBeschrijving,
        data.werkomschrijving,
        data.notities,
        ...structuredParts,
    ].map(normalizeHistoryText).filter(Boolean).join('\n');
}

function parseDataJson(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') return parsed[0] as Record<string, unknown>;
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function getSearchWords(value: string): string[] {
    const stopWords = new Set([
        'met', 'voor', 'een', 'het', 'de', 'van', 'en', 'in', 'op', 'aan', 'per',
    ]);
    return Array.from(new Set(
        normalizePricingTitle(value)
            .split(' ')
            .filter((word) => word.length >= 4 && !stopWords.has(word)),
    )).slice(0, 12);
}

async function getHistoricalExamples(
    firestore: FirebaseFirestore.Firestore,
    uid: string,
    currentQuoteId: string,
    currentText: string,
): Promise<string[]> {
    try {
        const snapshot = await firestore
            .collection('quotes')
            .where('userId', '==', uid)
            .limit(150)
            .get();

        const quoteIds = snapshot.docs.map((doc) => doc.id);
        const calculationsByQuoteId = new Map<string, Record<string, unknown>>();
        for (let index = 0; index < quoteIds.length; index += 100) {
            const batch = quoteIds.slice(index, index + 100);
            const { data: calculationRows, error } = await supabaseAdmin
                .from('quotes_collection')
                .select('quoteid, data_json, created_at')
                .eq('gebruikerid', uid)
                .in('quoteid', batch)
                .order('created_at', { ascending: false });
            if (error) {
                console.warn('Historische calculaties konden niet worden geladen:', error.message);
                continue;
            }
            for (const row of calculationRows || []) {
                const quoteId = safeString(row?.quoteid);
                if (!quoteId || calculationsByQuoteId.has(quoteId)) continue;
                calculationsByQuoteId.set(quoteId, parseDataJson(row?.data_json));
            }
        }

        const searchWords = getSearchWords(currentText);
        return snapshot.docs
            .filter((doc) => doc.id !== currentQuoteId)
            .map((doc) => {
                const data = doc.data() as Record<string, unknown>;
                const calculation = calculationsByQuoteId.get(doc.id) || {};
                const text = getQuoteText({ ...calculation, ...data });
                const normalized = normalizePricingTitle(text);
                const score = searchWords.reduce((total, word) => total + (normalized.includes(word) ? 1 : 0), 0);
                const amount = parsePricingNumber(data.totaalbedrag ?? data.amount ?? calculation.totaalbedrag ?? calculation.amount ?? calculation.totaal_incl_btw);
                const number = safeString(data.offerteNummer) || String(data.offerteNummer ?? '').trim();
                const title = safeString(data.titel) || safeString(calculation.korteTitel) || safeString(data.werkomschrijving) || 'Zonder titel';

                return {
                    score,
                    text: [
                        number ? `Offerte #${number}` : 'Oude offerte',
                        `Titel: ${clampText(title, 100)}`,
                        amount > 0 ? `Totaal opgeslagen: €${amount.toFixed(2)} (alle scope samen)` : '',
                        `Context: ${clampText(text, 420)}`,
                    ].filter(Boolean).join(' | '),
                };
            })
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_HISTORY)
            .map((item) => item.text);
    } catch (error) {
        console.warn('Historische offertecontext kon niet worden geladen:', error);
        return [];
    }
}

function normalizeAiLine(raw: AiLine, rules: QuotePriceRule[]): QuotePriceLine | null {
    const title = safeString(raw.title);
    if (!title) return null;

    const unit = normalizePricingUnit(raw.unit);
    const quantity = Math.max(0, Math.min(100_000, parsePricingNumber(raw.quantity)));
    const aiPrice = Math.max(0, Math.min(100_000, parsePricingNumber(raw.unitPriceExclBtw)));
    const matchingRule = findMatchingQuotePriceRule(title, unit, rules);
    const confidenceNumber = parsePricingNumber(raw.confidence);
    const confidence = confidenceNumber > 1 ? Math.min(1, confidenceNumber / 100) : Math.max(0, Math.min(1, confidenceNumber));

    return {
        id: createQuotePricingId('ai'),
        title,
        unit,
        quantity,
        unitPriceExclBtw: matchingRule ? matchingRule.unitPriceExclBtw : aiPrice,
        source: (matchingRule ? 'regel' : 'ai') as QuotePricingSource,
        ruleId: matchingRule?.id,
        confidence: matchingRule ? 1 : confidence,
        explanation: matchingRule
            ? `Prijsregel gebruikt: ${matchingRule.title}.`
            : safeString(raw.explanation) || 'AI-voorstel; controleer deze prijs handmatig.',
    };
}

function parseDimension(value: string): number {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function heuristicLines(notes: string, quoteTitle: string, rules: QuotePriceRule[]): QuotePriceLine[] {
    const source = notes.trim() || quoteTitle.trim();
    const headingMatches = Array.from(source.matchAll(/^#{2,3}\s+(.+)$/gim));
    const sections = headingMatches.length > 0
        ? headingMatches.map((match, index) => ({
            title: String(match[1] || '').trim(),
            text: source.slice(match.index || 0, headingMatches[index + 1]?.index ?? source.length),
        }))
        : [{ title: quoteTitle.trim() || 'Werkzaamheden', text: source }];

    return sections.flatMap((section) => {
        const title = section.title.replace(/^#+\s*/, '').replace(/\s*[:;].*$/, '').trim();
        if (!title || /^maatwerk$/i.test(title)) return [];

        const titleLower = normalizePricingTitle(title);
        const isCeiling = titleLower.includes('plafond');
        const isAreaWork = isCeiling || titleLower.includes('wand') || titleLower.includes('muur') || titleLower.includes('isolat');
        const dimensions = Array.from(section.text.matchAll(/(\d[\d.,]*)\s*[x×]\s*(\d[\d.,]*)/g));
        const explicitPrice = section.text.match(/€?\s*([\d.,]+)\s*(?:euro\s*)?(?:per|\/)\s*(m2|m²|m1|m¹|stuk|st|uur)/i)
            || section.text.match(/(?:=|:)\s*€?\s*([\d.,]+)\s*(?:euro\s*)?(?:per|\/)?\s*(m2|m²|m1|m¹|stuk|st|uur)/i);
        const ruleUnit: QuotePricingUnit = isAreaWork ? 'm2' : 'vast';
        const matchingRule = findMatchingQuotePriceRule(title, ruleUnit, rules);
        let quantity = dimensions.reduce((total, match) => {
            const first = parseDimension(match[1]);
            const second = parseDimension(match[2]);
            if (first <= 0 || second <= 0) return total;
            if (isCeiling || titleLower.includes('wand') || titleLower.includes('muur')) {
                return total + ((first * second) / 1_000_000);
            }
            return total + 1;
        }, 0);

        if (!isAreaWork) quantity = 1;
        const price = matchingRule?.unitPriceExclBtw
            ?? (explicitPrice ? parsePricingNumber(explicitPrice[1]) : 0);

        return [{
            id: createQuotePricingId('suggestie'),
            title,
            unit: matchingRule?.unit || (explicitPrice ? normalizePricingUnit(explicitPrice[2]) : ruleUnit),
            quantity: Number(quantity.toFixed(3)),
            unitPriceExclBtw: price,
            source: (matchingRule ? 'regel' : 'ai') as QuotePricingSource,
            ruleId: matchingRule?.id,
            confidence: matchingRule ? 1 : (price > 0 && quantity > 0 ? 0.35 : 0.15),
            explanation: matchingRule
                ? `Prijsregel gebruikt: ${matchingRule.title}.`
                : price > 0
                    ? 'Prijs uit de notitie gehaald; controleer de regel.'
                    : 'Geen passende prijsregel gevonden. Voeg zelf een prijs toe.',
        }];
    }).slice(0, MAX_LINES);
}

async function callOpenAi(
    apiKey: string,
    quoteTitle: string,
    notes: string,
    rules: QuotePriceRule[],
    history: string[],
): Promise<unknown> {
    const prompt = [
        `Offertetitel: ${quoteTitle || 'Onbekend'}`,
        `Notities:\n${notes || '(geen notities)'}`,
        `Bestaande goedgekeurde prijsregels:\n${rules.length > 0
            ? rules.map((rule) => `- ${rule.title} | ${rule.unit} | €${rule.unitPriceExclBtw.toFixed(2)} | aliassen: ${rule.aliases.join(', ') || '-'}`).join('\n')
            : '(nog geen prijsregels)'}`,
        `Vergelijkbare oude offertes (alleen context; totaal kan meerdere werkzaamheden bevatten):\n${history.length > 0 ? history.map((item) => `- ${item}`).join('\n') : '(geen vergelijkbare voorbeelden)'}`,
    ].join('\n\n');

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            store: false,
            input: [
                {
                    role: 'system',
                    content: [{
                        type: 'input_text',
                        text: [
                            'Je bent een Nederlandse prijsraming-assistent voor een timmerbedrijf.',
                            'Maak een eerste controleerbaar voorstel voor verkoopregels.',
                            'Gebruik bestaande prijsregels exact als titel en prijs wanneer ze passen.',
                            'Gebruik m2 voor wanden en plafonds wanneer de maten dat toelaten.',
                            'Lengtes en hoogtes in millimeters: reken m2 deterministisch uit.',
                            'Een historisch offertetotaal kan meerdere werkzaamheden bevatten: gebruik dat alleen als ruwe context en doe geen stellige uitspraken.',
                            'Verzin geen materialen, maten of scope die niet in de input staan.',
                            'Geef uitsluitend JSON terug in de vorm {"lines":[{"title":"...","unit":"m2|m1|st|uur|vast","quantity":0,"unitPriceExclBtw":0,"confidence":0.0,"explanation":"..."}]}',
                        ].join('\n'),
                    }],
                },
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: prompt }],
                },
            ],
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'AI-prijsvoorstel mislukt.';
        throw new Error(message);
    }

    return parseJsonOutput(extractResponseText(payload));
}

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!tokenMatch) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { auth, firestore } = initFirebaseAdmin();
        let uid = '';
        try {
            const decoded = await auth.verifyIdToken(tokenMatch[1].trim());
            uid = decoded.uid;
            const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
            if (trialBlockedResponse) return trialBlockedResponse;
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({})) as RequestBody;
        const quoteId = safeString(body.quoteId);
        const quoteTitle = clampText(body.quoteTitle, 240);
        const notes = normalizeHistoryText(body.notes);
        if (!quoteId && !quoteTitle && !notes) {
            return NextResponse.json({ error: 'Offertetitel of notities zijn verplicht.' }, { status: 400 });
        }

        if (quoteId) {
            const quoteSnapshot = await firestore.collection('quotes').doc(quoteId).get();
            if (!quoteSnapshot.exists || quoteSnapshot.data()?.userId !== uid) {
                return NextResponse.json({ error: 'Geen toegang tot deze offerte.' }, { status: 403 });
            }
        }

        const userSnapshot = await firestore.collection('users').doc(uid).get();
        const rules = sanitizeQuotePriceRules(userSnapshot.data()?.prijsregels).slice(0, MAX_RULES);
        const history = await getHistoricalExamples(
            firestore,
            uid,
            quoteId,
            `${quoteTitle}\n${notes}`,
        );

        let parsed: unknown = null;
        let usedAi = false;
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (apiKey) {
            try {
                parsed = await callOpenAi(apiKey, quoteTitle, notes, rules, history);
                usedAi = true;
            } catch (error) {
                console.warn('AI-prijsvoorstel mislukt; heuristische fallback gebruikt:', error);
            }
        }

        const rawLines = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as { lines?: unknown }).lines
            : null;
        const lines = Array.isArray(rawLines)
            ? rawLines.flatMap((raw) => normalizeAiLine((raw || {}) as AiLine, rules) || []).slice(0, MAX_LINES)
            : heuristicLines(notes, quoteTitle, rules);

        return NextResponse.json({
            ok: true,
            lines,
            usedAi,
            historicalExamples: history,
            message: usedAi
                ? 'AI-voorstel gemaakt. Controleer de regels voordat je opslaat.'
                : 'Voorstel gemaakt met bestaande prijsregels en lokale extractie. Controleer de prijzen.',
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Prijsvoorstel mislukt.';
        console.error('suggest-pricing error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
