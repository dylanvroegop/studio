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
    const rateInputRef = useRef<HTMLInputElement>(null);

    const [isEditingHours, setIsEditingHours] = useState(false);
    const [tempHours, setTempHours] = useState<string>('');
    const hoursInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditingRate && rateInputRef.current) {
            rateInputRef.current.focus();
        }
    }, [isEditingRate]);

    useEffect(() => {
        if (isEditingHours && hoursInputRef.current) {
            hoursInputRef.current.focus();
        }
    }, [isEditingHours]);

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
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
                <h3 className="font-semibold text-zinc-400 text-sm mb-4">KOSTENOVERZICHT</h3>
                <p className="text-zinc-500">Bezig met berekenen...</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <h3 className="font-semibold text-zinc-400 text-sm mb-4 flex items-center gap-2">
                <Euro size={14} />
                KOSTENOVERZICHT
            </h3>

            <div className="space-y-3">
                {/* Materials */}
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Materialen (groot)</span>
                    <span className="text-zinc-300">{formatCurrency(totals.materialenGroot)}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Verbruiksartikelen</span>
                    <span className="text-zinc-300">{formatCurrency(totals.materialenVerbruik)}</span>
                </div>

                <div className="border-t border-zinc-700 pt-3 flex justify-between text-sm">
                    <span className="text-zinc-400">Subtotaal materialen</span>
                    <span className="text-zinc-300">{formatCurrency(totals.materialenTotaal)}</span>
                </div>

                {/* Labor */}
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400 flex flex-wrap items-center gap-1">
                        Arbeid {settings.schattingUren ? '(schatting)' : ''} (

                        {/* Hours Editing */}
                        {isEditingHours ? (
                            <div className="flex items-center gap-1">
                                <Input
                                    ref={hoursInputRef}
                                    type="number"
                                    value={tempHours}
                                    onChange={(e) => setTempHours(e.target.value)}
                                    onBlur={saveHours}
                                    className="h-6 w-16 px-1 py-0 text-sm bg-zinc-800 border-zinc-700 text-center"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveHours();
                                        if (e.key === 'Escape') cancelEditingHours();
                                    }}
                                />
                            </div>
                        ) : (
                            <span className="flex items-center gap-1 cursor-pointer hover:text-zinc-200 transition-colors" onClick={startEditingHours}>
                                {totalUren} uur
                                <Pencil size={12} className="text-zinc-500" />
                            </span>
                        )}

                        ×

                        {/* Rate Editing */}
                        {isEditingRate ? (
                            <div className="flex items-center gap-1 ml-1">
                                <span className="text-zinc-500">€</span>
                                <Input
                                    ref={rateInputRef}
                                    type="number"
                                    value={tempRate}
                                    onChange={(e) => setTempRate(e.target.value)}
                                    onBlur={saveRate}
                                    className="h-6 w-20 px-1 py-0 text-sm bg-zinc-800 border-zinc-700"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveRate();
                                        if (e.key === 'Escape') cancelEditingRate();
                                    }}
                                />
                            </div>
                        ) : (
                            <span className="flex items-center gap-1 cursor-pointer hover:text-zinc-200 transition-colors ml-1" onClick={startEditingRate}>
                                {formatCurrency(settings.uurTariefExclBtw)}
                                <Pencil size={12} className="text-zinc-500" />
                            </span>
                        )}
                        <span className="text-xs text-zinc-500 ml-1">excl. btw</span>)
                    </span>
                    <span className="text-zinc-300">{formatCurrency(totals.arbeidTotaal)}</span>
                </div>

                {/* Transport */}
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Transport</span>
                    <span className="text-zinc-300">{formatCurrency(totals.transportTotaal)}</span>
                </div>

                {/* Subtotal */}
                <div className="border-t border-zinc-700 pt-3 flex justify-between text-sm">
                    <span className="text-zinc-400">Subtotaal excl. BTW</span>
                    <span className="text-zinc-300">{formatCurrency(totals.subtotaalExclBtw)}</span>
                </div>

                {/* Margin */}
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">
                        Winstmarge ({settings.extras.winstMarge.percentage}%)
                    </span>
                    <span className="text-zinc-300">{formatCurrency(totals.winstMarge)}</span>
                </div>

                {/* Total excl BTW */}
                <div className="border-t border-zinc-700 pt-3 flex justify-between text-sm">
                    <span className="text-zinc-400">Totaal excl. BTW</span>
                    <span className="text-zinc-300">{formatCurrency(totals.totaalExclBtw)}</span>
                </div>

                {/* BTW */}
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">BTW ({settings.btwTarief}%)</span>
                    <span className="text-zinc-300">{formatCurrency(totals.btw)}</span>
                </div>

                {/* Grand Total */}
                <div className="border-t-2 border-emerald-500/50 pt-3 flex justify-between">
                    <span className="font-semibold text-white">TOTAAL INCL. BTW</span>
                    <span className="font-bold text-lg text-emerald-400">
                        {formatCurrency(totals.totaalInclBtw)}
                    </span>
                </div>
            </div>
        </div>
    );
}
