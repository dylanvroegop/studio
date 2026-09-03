'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, ChevronDown, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
    calculateQuotePriceLineTotal,
    createQuotePricingId,
    formatPricingUnit,
    normalizePricingTitle,
    normalizePricingCategory,
    parsePricingNumber,
    sanitizeQuotePriceLines,
    sanitizeQuotePriceRules,
    sanitizeQuotePricing,
    type QuotePriceLine,
    type QuotePriceRule,
    type QuotePricingUnit,
} from '@/lib/quote-pricing';
import type { Quote } from '@/lib/types';

interface PricingTabProps {
    quoteId: string;
    quote: Quote | null;
    quoteTitle: string;
    notes: string;
}

interface PricingSuggestionResponse {
    ok?: boolean;
    error?: string;
    message?: string;
    lines?: QuotePriceLine[];
    usedAi?: boolean;
    historicalExamples?: string[];
}

const UNIT_OPTIONS: Array<{ value: QuotePricingUnit; label: string }> = [
    { value: 'm2', label: 'm²' },
    { value: 'm1', label: 'm¹' },
    { value: 'st', label: 'st' },
    { value: 'uur', label: 'uur' },
    { value: 'vast', label: 'vast' },
];

const MATERIAL_UNIT_OPTIONS = UNIT_OPTIONS.filter((option) => option.value !== 'uur');

function formatNumber(value: number, maximumFractionDigits = 3): string {
    return Number(value || 0).toLocaleString('nl-NL', {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    });
}

function formatMoney(value: number): string {
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
    }).format(Number(value || 0));
}

function inputNumber(value: number): string {
    return value === 0 ? '' : String(value).replace('.', ',');
}

function sourceLabel(line: QuotePriceLine): string {
    if (line.source === 'regel') return 'Prijsregel';
    if (line.source === 'ai') return 'AI-voorstel';
    return 'Handmatig';
}

export function PricingTab({
    quoteId,
    quote,
    quoteTitle,
    notes,
}: PricingTabProps) {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [materialLines, setMaterialLines] = useState<QuotePriceLine[]>([]);
    const [rules, setRules] = useState<QuotePriceRule[]>([]);
    const [suggestions, setSuggestions] = useState<QuotePriceLine[] | null>(null);
    const [suggestionMessage, setSuggestionMessage] = useState('');
    const [historicalExampleCount, setHistoricalExampleCount] = useState(0);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingRules, setIsSavingRules] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const storedPricingJson = JSON.stringify(
        (quote as (Quote & { prijsraming?: unknown }) | null)?.prijsraming ?? null,
    ) || 'null';

    useEffect(() => {
        const storedPricing = sanitizeQuotePricing(JSON.parse(storedPricingJson));
        const storedLines = sanitizeQuotePriceLines(storedPricing.lines);
        setMaterialLines(storedLines.filter((line) => normalizePricingCategory(line.category, line.title, line.unit) === 'materiaal'));
        setIsLoaded(true);
    }, [quote?.id, storedPricingJson]);

    useEffect(() => {
        if (!user || !firestore) return;

        let cancelled = false;
        const loadRules = async () => {
            try {
                const snapshot = await getDoc(doc(firestore, 'users', user.uid));
                const materialRules = sanitizeQuotePriceRules(snapshot.data()?.prijsregels)
                    .filter((rule) => normalizePricingCategory(undefined, rule.title, rule.unit) === 'materiaal');
                if (!cancelled) setRules(materialRules);
            } catch (error) {
                console.warn('Prijsregels konden niet worden geladen:', error);
            }
        };

        void loadRules();
        return () => {
            cancelled = true;
        };
    }, [firestore, user]);

    const materialTotalExclBtw = useMemo(
        () => materialLines.reduce((total, line) => total + calculateQuotePriceLineTotal(line), 0),
        [materialLines],
    );
    const suggestionMaterialTotalExclBtw = useMemo(
        () => (suggestions || []).reduce((total, line) => total + calculateQuotePriceLineTotal(line), 0),
        [suggestions],
    );
    const updateLine = (lineId: string, updates: Partial<QuotePriceLine>) => {
        setMaterialLines((current) => current.map((line) => (
            line.id === lineId ? { ...line, ...updates, source: 'handmatig' } : line
        )));
    };

    const addLine = () => {
        setMaterialLines((current) => [
            ...current,
            {
                id: createQuotePricingId('regel'),
                title: '',
                unit: 'm2',
                quantity: 0,
                unitPriceExclBtw: 0,
                category: 'materiaal',
                source: 'handmatig',
            },
        ]);
    };

    const removeLine = (lineId: string) => {
        setMaterialLines((current) => current.filter((line) => line.id !== lineId));
    };

    const handleSuggest = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Inloggen vereist', description: 'Log opnieuw in om een AI-voorstel te maken.' });
            return;
        }

        setIsSuggesting(true);
        setSuggestions(null);
        setSuggestionMessage('');
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/quotes/suggest-pricing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    quoteId,
                    quoteTitle,
                    notes,
                }),
            });
            const payload = await response.json().catch(() => ({})) as PricingSuggestionResponse;
            if (!response.ok || payload.ok !== true) {
                throw new Error(payload.error || 'AI-voorstel maken mislukt.');
            }

            const nextSuggestions = sanitizeQuotePriceLines(payload.lines);
            setSuggestions(nextSuggestions);
            setHistoricalExampleCount(Array.isArray(payload.historicalExamples) ? payload.historicalExamples.length : 0);
            setSuggestionMessage(payload.message || 'Controleer het voorstel voordat je het toepast.');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'AI-voorstel mislukt',
                description: error instanceof Error ? error.message : 'Onbekende fout.',
            });
        } finally {
            setIsSuggesting(false);
        }
    };

    const applySuggestions = () => {
        if (!suggestions || suggestions.length === 0) return;
        setMaterialLines(suggestions.map((line) => ({ ...line, id: createQuotePricingId('regel'), category: 'materiaal' })));
        setSuggestions(null);
        setSuggestionMessage('Voorstel toegepast. Controleer de hoeveelheden en prijzen en sla daarna op.');
    };

    const savePricing = async () => {
        if (!firestore || !user || !isLoaded) return;
        const cleanedMaterialLines = sanitizeQuotePriceLines(materialLines)
            .filter((line) => line.title.trim())
            .map((line) => ({ ...line, category: 'materiaal' as const }));
        setIsSaving(true);
        try {
            await updateDoc(doc(firestore, 'quotes', quoteId), {
                prijsraming: {
                    mode: 'unit_price',
                    lines: cleanedMaterialLines,
                    updatedAt: new Date().toISOString(),
                },
                updatedAt: serverTimestamp(),
            });
            setMaterialLines(cleanedMaterialLines);
            toast({ title: 'Materiaalprijzen opgeslagen', description: 'De materiaalregels zijn opgeslagen bij deze offerte.' });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Opslaan mislukt',
                description: error instanceof Error ? error.message : 'Kon de prijsraming niet opslaan.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const saveRules = async () => {
        if (!firestore || !user) return;
        const candidateLines = materialLines.filter((line) => line.title.trim() && line.unitPriceExclBtw > 0);
        if (candidateLines.length === 0) {
            toast({ variant: 'destructive', title: 'Geen prijsregels', description: 'Vul eerst een titel en prijs in.' });
            return;
        }

        setIsSavingRules(true);
        try {
            const nextRules = [...rules];
            candidateLines.forEach((line) => {
                const existingIndex = nextRules.findIndex((rule) => (
                    rule.unit === line.unit
                    && normalizePricingTitle(rule.title) === normalizePricingTitle(line.title)
                ));
                const existing = existingIndex >= 0 ? nextRules[existingIndex] : null;
                const nextRule: QuotePriceRule = {
                    id: existing?.id || createQuotePricingId('prijsregel'),
                    title: line.title.trim(),
                    unit: line.unit,
                    unitPriceExclBtw: line.unitPriceExclBtw,
                    aliases: existing?.aliases || [],
                    sourceQuoteIds: Array.from(new Set([...(existing?.sourceQuoteIds || []), quoteId])),
                    updatedAt: new Date().toISOString(),
                };
                if (existingIndex >= 0) nextRules[existingIndex] = nextRule;
                else nextRules.push(nextRule);
            });

            await setDoc(doc(firestore, 'users', user.uid), { prijsregels: nextRules }, { merge: true });
            setRules(nextRules);
            toast({ title: 'Prijsregels opgeslagen', description: `${candidateLines.length} regel(s) staan nu klaar voor volgende offertes.` });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Prijsregels opslaan mislukt',
                description: error instanceof Error ? error.message : 'Kon de prijsregels niet opslaan.',
            });
        } finally {
            setIsSavingRules(false);
        }
    };

    const removeRule = async (ruleId: string) => {
        if (!firestore || !user) return;
        const nextRules = rules.filter((rule) => rule.id !== ruleId);
        try {
            await setDoc(doc(firestore, 'users', user.uid), { prijsregels: nextRules }, { merge: true });
            setRules(nextRules);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Prijsregel verwijderen mislukt', description: error instanceof Error ? error.message : 'Probeer het opnieuw.' });
        }
    };

    return (
        <div className="space-y-5 pb-32">
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                            <Calculator className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-foreground">Prijsraming</h2>
                            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                                Snelle materiaalprijs op basis van m², m¹, stuks of een vast bedrag. De lange materiaalcalculatie blijft apart voor exacte aantallen.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="gap-2" onClick={() => void handleSuggest()} disabled={isSuggesting}>
                            {isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            {isSuggesting ? 'Voorstel maken…' : 'AI-voorstel uit notities'}
                        </Button>
                        <Button type="button" variant="success" className="gap-2" onClick={() => void savePricing()} disabled={isSaving || !isLoaded}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Opslaan
                        </Button>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span>Prijs excl. btw</span>
                    <span>Materialen: goedgekeurde regels + oude offertes als context</span>
                    {quoteTitle ? <span className="text-foreground/80">{quoteTitle}</span> : null}
                </div>
            </div>

            {suggestions && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2 font-medium text-amber-100">
                                <Sparkles className="h-4 w-4" />
                                AI-voorstel materiaal controleren
                            </div>
                            <p className="mt-1 text-sm text-amber-100/75">
                                {suggestionMessage || 'Controleer elke materiaalregel voordat je deze toepast.'}
                                {historicalExampleCount > 0 ? ` ${historicalExampleCount} oude offerte(s) zijn als context gebruikt.` : ''}
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setSuggestions(null)}>Negeren</Button>
                            <Button type="button" size="sm" variant="success" onClick={applySuggestions}>Voorstel toepassen</Button>
                        </div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-amber-500/20 bg-background/30">
                        <table className="w-full min-w-[680px] text-sm">
                            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2">Onderdeel</th>
                                    <th className="px-3 py-2">Eenheid</th>
                                    <th className="px-3 py-2 text-right">Aantal</th>
                                    <th className="px-3 py-2 text-right">Prijs</th>
                                    <th className="px-3 py-2">Toelichting</th>
                                </tr>
                            </thead>
                            <tbody>
                                {suggestions.map((line) => (
                                    <tr key={line.id} className="border-b border-border/40 last:border-0">
                                        <td className="px-3 py-2 font-medium">{line.title}</td>
                                        <td className="px-3 py-2">{formatPricingUnit(line.unit)}</td>
                                        <td className="px-3 py-2 text-right font-mono">{formatNumber(line.quantity)}</td>
                                        <td className="px-3 py-2 text-right font-mono">{formatMoney(line.unitPriceExclBtw)}</td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">{line.explanation || 'Controleer deze regel.'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-3 text-right text-sm text-amber-100">
                        Voorlopig totaal materialen excl. btw: <span className="font-mono font-semibold">{formatMoney(suggestionMaterialTotalExclBtw)}</span>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="font-medium text-foreground">Materialen voor deze offerte</h3>
                        <p className="text-xs text-muted-foreground">AI en prijsregels vullen alleen materialen in. De berekening is hoeveelheid × prijs.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="gap-2 self-start" onClick={addLine}>
                        <Plus className="h-4 w-4" /> Materiaalregel toevoegen
                    </Button>
                </div>

                {materialLines.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Nog geen materiaalregels. Gebruik een AI-voorstel of voeg zelf een regel toe.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] text-sm">
                            <thead className="border-b border-border bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-3">Materiaal</th>
                                    <th className="w-28 px-3 py-3">Eenheid</th>
                                    <th className="w-32 px-3 py-3 text-right">Aantal</th>
                                    <th className="w-36 px-3 py-3 text-right">Prijs p/e</th>
                                    <th className="w-32 px-3 py-3 text-right">Totaal</th>
                                    <th className="w-28 px-3 py-3">Bron</th>
                                    <th className="w-12 px-3 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {materialLines.map((line) => (
                                    <tr key={line.id} className="border-b border-border/50 last:border-0">
                                        <td className="px-3 py-2 align-top">
                                            <Input
                                                value={line.title}
                                                onChange={(event) => updateLine(line.id, { title: event.target.value })}
                                                placeholder="bijv. Gipswand met Acoustifit en OSB"
                                                className="h-9 min-w-64"
                                            />
                                            {line.explanation ? <p className="mt-1 text-[11px] text-muted-foreground">{line.explanation}</p> : null}
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <select
                                                value={line.unit}
                                                onChange={(event) => updateLine(line.id, { unit: event.target.value as QuotePricingUnit })}
                                                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-emerald-500"
                                            >
                                                {MATERIAL_UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <Input
                                                value={inputNumber(line.quantity)}
                                                onChange={(event) => updateLine(line.id, { quantity: parsePricingNumber(event.target.value) })}
                                                inputMode="decimal"
                                                className="h-9 text-right font-mono"
                                            />
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <Input
                                                value={inputNumber(line.unitPriceExclBtw)}
                                                onChange={(event) => updateLine(line.id, { unitPriceExclBtw: parsePricingNumber(event.target.value) })}
                                                inputMode="decimal"
                                                className="h-9 text-right font-mono"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right align-top font-mono font-medium text-emerald-300">
                                            {formatMoney(calculateQuotePriceLineTotal(line))}
                                        </td>
                                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">{sourceLabel(line)}</td>
                                        <td className="px-3 py-2 text-right align-top">
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)} aria-label="Verwijder materiaalregel" title="Verwijder materiaalregel">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-border bg-muted/20">
                                <tr>
                                    <td colSpan={4} className="px-3 py-3 text-right font-medium">Totaal materialen excl. btw</td>
                                    <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-300">{formatMoney(materialTotalExclBtw)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="font-medium text-foreground">Prijsregels opbouwen</h3>
                        <p className="text-sm text-muted-foreground">Sla gecontroleerde materiaalregels op voor volgende offertes. Arbeidsuren worden nooit als prijsregel opgeslagen.</p>
                    </div>
                    <Button type="button" variant="outline" className="gap-2" onClick={() => void saveRules()} disabled={isSavingRules}>
                        {isSavingRules ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {isSavingRules ? 'Opslaan…' : 'Geselecteerde regels bewaren'}
                    </Button>
                </div>
                {rules.length > 0 ? (
                    <div className="mt-4 divide-y divide-border/60 rounded-lg border border-border/60">
                        {rules.map((rule) => {
                            const matchingLine = materialLines.some((line) => (
                                line.unit === rule.unit
                                && normalizePricingTitle(line.title) === normalizePricingTitle(rule.title)
                            ));
                            return (
                                <div key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-foreground">{rule.title}</div>
                                        <div className="text-xs text-muted-foreground">{formatPricingUnit(rule.unit)} · {formatMoney(rule.unitPriceExclBtw)}{rule.scope ? ` · ${rule.scope}` : ''}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {matchingLine ? <span className="hidden text-xs text-emerald-400 sm:inline">In huidige raming</span> : null}
                                        <Button type="button" variant="ghost" size="icon" onClick={() => void removeRule(rule.id)} aria-label="Verwijder prijsregel" title="Verwijder prijsregel">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-muted-foreground">Nog geen goedgekeurde regels. Je kunt de eerste AI-regels hier bewaren.</p>
                )}
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-100/75">
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                <span>De AI doet alleen een eerste materiaalvoorstel. Controleer vooral de prijs, de oppervlakteformule en wat wel of niet in het materiaal zit voordat je deze als vaste prijsregel bewaart.</span>
            </div>
        </div>
    );
}
