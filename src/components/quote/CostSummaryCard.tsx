'use client';

import { CalculationResult, QuoteSettings, formatCurrency } from '@/lib/quote-calculations';
import { Euro } from 'lucide-react';

interface CostSummaryCardProps {
    totals: CalculationResult | null;
    settings: QuoteSettings | null;
    totalUren: number;
    onUpdateHourlyRate?: (rate: number) => void;
    onUpdateTotalHours?: (hours: number) => void;
}

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';

export function CostSummaryCard({ totals, settings, totalUren, onUpdateHourlyRate, onUpdateTotalHours }: CostSummaryCardProps) {
    const [isEditingRate, setIsEditingRate] = useState(false);
    const [tempRate, setTempRate] = useState<string>('');

    const [isEditingHours, setIsEditingHours] = useState(false);
    const [tempHours, setTempHours] = useState<string>('');

    const startEditingRate = () => {
        if (!settings) return;
        setTempRate(settings.uurTariefExclBtw.toString());
        setIsEditingRate(true);
    };

    const saveRate = () => {
        const newRate = parseFloat(tempRate);
        if (!isNaN(newRate) && onUpdateHourlyRate) {
            onUpdateHourlyRate(newRate);
        }
        setIsEditingRate(false);
    };

    const cancelEditingRate = () => {
        setIsEditingRate(false);
    };

    const startEditingHours = () => {
        setTempHours(totalUren.toString());
        setIsEditingHours(true);
    };

    const saveHours = () => {
        const newHours = parseFloat(tempHours);
        if (!isNaN(newHours) && onUpdateTotalHours) {
            onUpdateTotalHours(newHours);
        }
        setIsEditingHours(false);
    };

    const cancelEditingHours = () => {
        setIsEditingHours(false);
    };

    const totalTravelMinutesPerKlus = totals ? totals.transportDurationPerDagMinutes * totals.transportAantalDagen : 0;
    const totalTravelHoursPerKlus = totalTravelMinutesPerKlus / 60;
    const btwFactor = settings ? settings.btwTarief / 100 : 0;
    const totaalExclZonderMarge = totals ? totals.subtotaalExclBtw : 0;
    const btwZonderMarge = totaalExclZonderMarge * btwFactor;
    const winstMargeInclBtw = totals ? totals.winstMarge * (1 + btwFactor) : 0;

    if (!totals || !settings) {
        return (
            <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="font-semibold text-muted-foreground text-sm mb-4">KOSTENOVERZICHT</h3>
                <p className="text-muted-foreground">Bezig met berekenen...</p>
            </div>
        );
    }

    return (
        <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="font-semibold text-muted-foreground text-sm mb-4 flex items-center gap-2">
                <Euro size={14} />
                KOSTENOVERZICHT
            </h3>

            <div className="space-y-4">
                <div className="rounded-lg border border-border p-3 space-y-2 bg-background/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Materialen (groot)</span>
                        <span className="text-foreground">{formatCurrency(totals.materialenGroot)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Verbruiksartikelen</span>
                        <span className="text-foreground">{formatCurrency(totals.materialenVerbruik)}</span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotaal materialen</span>
                        <span className="text-foreground">{formatCurrency(totals.materialenTotaal)}</span>
                    </div>
                </div>

                <div className="h-px bg-border/70" />

                <div className="rounded-lg border border-border p-3 bg-background/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground flex flex-wrap items-center gap-1">
                            Arbeid (
                            {isEditingHours ? (
                                <div className="flex items-center gap-1">
                                    <Input
                                        autoFocus
                                        type="number"
                                        value={tempHours}
                                        onChange={(e) => setTempHours(e.target.value)}
                                        onBlur={saveHours}
                                        className="h-6 w-16 px-1 py-0 text-sm bg-muted border-border text-center"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveHours();
                                            if (e.key === 'Escape') cancelEditingHours();
                                        }}
                                    />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="p-0 border-0 bg-transparent flex items-center gap-1 hover:text-foreground transition-colors"
                                    onClick={startEditingHours}
                                >
                                    {totalUren} uur
                                    <Pencil size={12} className="text-muted-foreground" />
                                </button>
                            )}
                            ×
                            {isEditingRate ? (
                                <div className="flex items-center gap-1 ml-1">
                                    <span className="text-muted-foreground">€</span>
                                    <Input
                                        autoFocus
                                        type="number"
                                        value={tempRate}
                                        onChange={(e) => setTempRate(e.target.value)}
                                        onBlur={saveRate}
                                        className="h-6 w-20 px-1 py-0 text-sm bg-muted border-border"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveRate();
                                            if (e.key === 'Escape') cancelEditingRate();
                                        }}
                                    />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="p-0 border-0 bg-transparent flex items-center gap-1 hover:text-foreground transition-colors ml-1"
                                    onClick={startEditingRate}
                                >
                                    {formatCurrency(settings.uurTariefExclBtw)}
                                    <Pencil size={12} className="text-muted-foreground" />
                                </button>
                            )}
                            <span className="text-xs text-muted-foreground ml-1">excl. btw</span>)
                        </span>
                        <span className="text-foreground">{formatCurrency(totals.arbeidTotaal)}</span>
                    </div>
                </div>

                <div className="h-px bg-border/70" />

                <div className="rounded-lg border border-border p-3 bg-background/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                            <span className="block">
                                Transport ({totals.transportRatePerKm.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} x {totals.transportDistanceKmOneWay.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}km = {formatCurrency(totals.transportOneWayCost)} x 2 = {formatCurrency(totals.transportRoundTripCost)} x {totals.transportAantalDagen} dagen)
                            </span>
                            <span className="block text-xs">
                                totaal reistijd per dag; {totals.transportDurationPerDagMinutes} {totals.transportDurationPerDagMinutes === 1 ? 'minuut' : 'minuten'}
                            </span>
                            <span className="block text-xs">
                                totaal reistijd per klus; {totalTravelHoursPerKlus.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} uur
                            </span>
                        </span>
                        <span className="text-foreground">{formatCurrency(totals.transportTotaal)}</span>
                    </div>
                </div>

                <div className="h-px bg-border/70" />

                <div className="rounded-lg border border-border p-3 space-y-2 bg-background/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Totaal excl. BTW</span>
                        <span className="text-foreground">{formatCurrency(totaalExclZonderMarge)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">BTW ({settings.btwTarief}%)</span>
                        <span className="text-foreground">{formatCurrency(btwZonderMarge)}</span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between text-sm">
                        <span className="text-muted-foreground">
                            {settings.extras.winstMarge.mode === 'percentage' ? (
                                <>
                                    Winstmarge ({settings.extras.winstMarge.percentage}% over totaal)
                                    {settings.extras.winstMarge.basis === 'materiaal' && <span className="text-xs text-muted-foreground ml-1">(over mat.)</span>}
                                    {settings.extras.winstMarge.basis === 'arbeid' && <span className="text-xs text-muted-foreground ml-1">(over arb.)</span>}
                                </>
                            ) : (
                                <>Winstmarge (vast)</>
                            )}
                        </span>
                        <span className="text-foreground">{formatCurrency(winstMargeInclBtw)}</span>
                    </div>
                </div>

                <div className="border-t-2 border-primary/50 pt-3 flex justify-between">
                    <span className="font-semibold text-foreground">TOTAAL INCL. BTW</span>
                    <span className="font-bold text-lg text-primary">
                        {formatCurrency(totals.totaalInclBtw)}
                    </span>
                </div>
            </div>
        </div>
    );
}
