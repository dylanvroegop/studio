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

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

            <div className="space-y-3">
                {/* Materials */}
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Materialen (groot)</span>
                    <span className="text-foreground">{formatCurrency(totals.materialenGroot)}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Verbruiksartikelen</span>
                    <span className="text-foreground">{formatCurrency(totals.materialenVerbruik)}</span>
                </div>

                <div className="border-t border-border pt-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotaal materialen</span>
                    <span className="text-foreground">{formatCurrency(totals.materialenTotaal)}</span>
                </div>

                {/* Labor */}
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex flex-wrap items-center gap-1">
                        Arbeid (

                        {/* Hours Editing */}
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
                            <span className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors" onClick={startEditingHours}>
                                {totalUren} uur
                                <Pencil size={12} className="text-muted-foreground" />
                            </span>
                        )}

                        ×

                        {/* Rate Editing */}
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
                            <span className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors ml-1" onClick={startEditingRate}>
                                {formatCurrency(settings.uurTariefExclBtw)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-1">excl. btw</span>)
                    </span>
                    <span className="text-foreground">{formatCurrency(totals.arbeidTotaal)}</span>
                </div>

                {/* Transport */}
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Transport</span>
                    <span className="text-foreground">{formatCurrency(totals.transportTotaal)}</span>
                </div>

                {/* Subtotal */}
                <div className="border-t border-border pt-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotaal excl. BTW</span>
                    <span className="text-foreground">{formatCurrency(totals.subtotaalExclBtw)}</span>
                </div>

                {/* Margin */}
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                        {settings.extras.winstMarge.mode === 'percentage' ? (
                            <>
                                Winstmarge ({settings.extras.winstMarge.percentage}%)
                                {settings.extras.winstMarge.basis === 'materiaal' && <span className="text-xs text-muted-foreground ml-1">(over mat.)</span>}
                                {settings.extras.winstMarge.basis === 'arbeid' && <span className="text-xs text-muted-foreground ml-1">(over arb.)</span>}
                            </>
                        ) : (
                            <>Winstmarge (vast)</>
                        )}
                    </span>
                    <span className="text-foreground">{formatCurrency(totals.winstMarge)}</span>
                </div>

                {/* Total excl BTW */}
                <div className="border-t border-border pt-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Totaal excl. BTW</span>
                    <span className="text-foreground">{formatCurrency(totals.totaalExclBtw)}</span>
                </div>

                {/* BTW */}
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">BTW ({settings.btwTarief}%)</span>
                    <span className="text-foreground">{formatCurrency(totals.btw)}</span>
                </div>

                {/* Grand Total */}
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
