'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
    createQuotePricingId,
    formatPricingUnit,
    normalizePricingCategory,
    normalizePricingTitle,
    parsePricingNumber,
    sanitizeQuotePriceRules,
    type QuotePriceRule,
    type QuotePricingUnit,
} from '@/lib/quote-pricing';

type PriceBookFilter = 'all' | QuotePricingUnit;

const PRICE_BOOK_UNITS: Array<{ value: Exclude<QuotePricingUnit, 'uur'>; label: string }> = [
    { value: 'm2', label: 'm²' },
    { value: 'm1', label: 'm¹' },
    { value: 'st', label: 'st' },
    { value: 'vast', label: 'vast' },
];

function isPriceBookRule(rule: QuotePriceRule): boolean {
    return normalizePricingCategory(undefined, rule.title, rule.unit) === 'materiaal';
}

function createEmptyRule(): QuotePriceRule {
    return {
        id: createQuotePricingId('prijsregel'),
        title: '',
        unit: 'm2',
        unitPriceExclBtw: 0,
        aliases: [],
    };
}

function formatMoney(value: number): string {
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
    }).format(Number(value || 0));
}

function inputPrice(value: number): string {
    return value === 0 ? '' : String(value).replace('.', ',');
}

export function PriceBookTab() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [rules, setRules] = useState<QuotePriceRule[]>([]);
    const [preservedRules, setPreservedRules] = useState<QuotePriceRule[]>([]);
    const [search, setSearch] = useState('');
    const [unitFilter, setUnitFilter] = useState<PriceBookFilter>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (!user || !firestore) return;

        let cancelled = false;
        setIsLoading(true);

        const loadRules = async () => {
            try {
                const snapshot = await getDoc(doc(firestore, 'users', user.uid));
                const loadedRules = sanitizeQuotePriceRules(snapshot.data()?.prijsregels);
                if (cancelled) return;

                setRules(loadedRules.filter(isPriceBookRule));
                setPreservedRules(loadedRules.filter((rule) => !isPriceBookRule(rule)));
                setIsDirty(false);
            } catch (error) {
                if (!cancelled) {
                    toast({
                        variant: 'destructive',
                        title: 'Prijsboek laden mislukt',
                        description: error instanceof Error ? error.message : 'Kon de prijzen niet laden.',
                    });
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void loadRules();
        return () => {
            cancelled = true;
        };
    }, [firestore, toast, user]);

    const filteredRules = useMemo(() => {
        const normalizedSearch = normalizePricingTitle(search);

        return rules
            .filter((rule) => {
                if (unitFilter !== 'all' && rule.unit !== unitFilter) return false;
                if (!normalizedSearch) return true;

                const searchableText = normalizePricingTitle([rule.title, ...rule.aliases].join(' '));
                return searchableText.includes(normalizedSearch);
            })
            .sort((left, right) => left.title.localeCompare(right.title, 'nl', { sensitivity: 'base' }));
    }, [rules, search, unitFilter]);

    const updateRule = (ruleId: string, updates: Partial<QuotePriceRule>) => {
        setRules((current) => current.map((rule) => (
            rule.id === ruleId ? { ...rule, ...updates } : rule
        )));
        setIsDirty(true);
    };

    const addRule = () => {
        setRules((current) => [createEmptyRule(), ...current]);
        setSearch('');
        setUnitFilter('all');
        setIsDirty(true);
    };

    const removeRule = (ruleId: string) => {
        setRules((current) => current.filter((rule) => rule.id !== ruleId));
        setIsDirty(true);
    };

    const saveRules = async () => {
        if (!firestore || !user || isLoading) return;

        const cleanedRules = sanitizeQuotePriceRules(rules)
            .filter(isPriceBookRule)
            .map((rule) => ({
                ...rule,
                title: rule.title.trim(),
                updatedAt: new Date().toISOString(),
            }));

        setIsSaving(true);
        try {
            await setDoc(doc(firestore, 'users', user.uid), {
                prijsregels: [...preservedRules, ...cleanedRules],
            }, { merge: true });
            setRules(cleanedRules);
            setIsDirty(false);
            toast({ title: 'Prijsboek opgeslagen', description: `${cleanedRules.length} prijsregel(s) opgeslagen.` });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Opslaan mislukt',
                description: error instanceof Error ? error.message : 'Kon het prijsboek niet opslaan.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isUserLoading || !user) {
        return (
            <div className="flex min-h-[30vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-32">
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                            <BookOpen className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-foreground">Vaste prijzen</h2>
                            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                                Handmatig overzicht van prijzen per m², m¹, stuk of vast bedrag. Zoek hier snel een prijs op.
                            </p>
                        </div>
                    </div>
                    <Button type="button" variant="success" className="gap-2 self-start" onClick={() => void saveRules()} disabled={isSaving || isLoading || !isDirty}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? 'Opslaan…' : 'Opslaan'}
                    </Button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span>{rules.length} prijsregels</span>
                    <span>Prijs excl. btw</span>
                    <span className={isDirty ? 'text-amber-300' : 'text-emerald-400'}>{isDirty ? 'Niet opgeslagen wijzigingen' : 'Opgeslagen'}</span>
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Zoek bijvoorbeeld gipsplaatwand tussen"
                            className="pl-9"
                            aria-label="Zoek in prijsboek"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap gap-1" aria-label="Filter op eenheid">
                            <Button type="button" size="sm" variant={unitFilter === 'all' ? 'secondary' : 'outline'} onClick={() => setUnitFilter('all')}>Alle</Button>
                            {PRICE_BOOK_UNITS.map((unit) => (
                                <Button
                                    key={unit.value}
                                    type="button"
                                    size="sm"
                                    variant={unitFilter === unit.value ? 'secondary' : 'outline'}
                                    onClick={() => setUnitFilter(unit.value)}
                                >
                                    {unit.label}
                                </Button>
                            ))}
                        </div>
                        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={addRule}>
                            <Plus className="h-4 w-4" /> Regel toevoegen
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Prijsboek laden…
                    </div>
                ) : rules.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-muted-foreground">
                        <p>Nog geen prijzen ingevoerd.</p>
                        <Button type="button" variant="outline" className="gap-2" onClick={addRule}>
                            <Plus className="h-4 w-4" /> Eerste regel toevoegen
                        </Button>
                    </div>
                ) : filteredRules.length === 0 ? (
                    <div className="px-4 py-14 text-center text-sm text-muted-foreground">Geen prijsregels gevonden.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="border-b border-border bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Omschrijving</th>
                                    <th className="w-36 px-4 py-3">Eenheid</th>
                                    <th className="w-64 px-4 py-3 text-right">Prijs per eenheid</th>
                                    <th className="w-16 px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRules.map((rule) => (
                                    <tr key={rule.id} className="border-b border-border/60 last:border-0">
                                        <td className="px-4 py-2.5">
                                            <Input
                                                value={rule.title}
                                                onChange={(event) => updateRule(rule.id, { title: event.target.value })}
                                                placeholder="bijv. Gipsplaatwand tussen"
                                                aria-label="Omschrijving prijsregel"
                                                className="h-9 min-w-[280px]"
                                            />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <select
                                                value={rule.unit}
                                                onChange={(event) => updateRule(rule.id, { unit: event.target.value as Exclude<QuotePricingUnit, 'uur'> })}
                                                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-emerald-500"
                                                aria-label="Eenheid prijsregel"
                                            >
                                                {PRICE_BOOK_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">€</span>
                                                <Input
                                                    value={inputPrice(rule.unitPriceExclBtw)}
                                                    onChange={(event) => updateRule(rule.id, { unitPriceExclBtw: parsePricingNumber(event.target.value) })}
                                                    inputMode="decimal"
                                                    placeholder="0,00"
                                                    aria-label="Prijs per eenheid"
                                                    className="h-9 text-right font-mono"
                                                />
                                                <span className="w-10 shrink-0 text-xs text-muted-foreground">/{formatPricingUnit(rule.unit)}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeRule(rule.id)} aria-label={`Verwijder ${rule.title || 'prijsregel'}`} title="Verwijder prijsregel">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!isLoading && rules.length > 0 && (
                    <div className="border-t border-border bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                        {filteredRules.length} van {rules.length} prijsregels zichtbaar
                        <span className="ml-2">· Voorbeeld: {formatMoney(25)} / m²</span>
                    </div>
                )}
            </section>
        </div>
    );
}
