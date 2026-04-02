'use client';

import { CalculationResult, QuoteSettings, formatCurrency } from '@/lib/quote-calculations';
import { Euro } from 'lucide-react';

interface CostSummaryCardProps {
    totals: CalculationResult | null;
    settings: QuoteSettings | null;
    totalUren: number;
    onUpdateHourlyRate?: (rate: number) => void;
    onUpdateTotalHours?: (hours: number) => void;
    onUpdateMaterialenGrootTotal?: (value: number) => void;
    onUpdateMaterialenVerbruikTotal?: (value: number) => void;
    onUpdateMaterialenSubtotal?: (value: number) => void;
    onUpdateTransportTotal?: (value: number) => void;
    onUpdateWinstMargePercentage?: (value: number) => void;
    onUpdateWinstMargeAmountExcl?: (value: number) => void;
}

import { useState, type FocusEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';

export function CostSummaryCard({
    totals,
    settings,
    totalUren,
    onUpdateHourlyRate,
    onUpdateTotalHours,
    onUpdateMaterialenGrootTotal,
    onUpdateMaterialenVerbruikTotal,
    onUpdateMaterialenSubtotal,
    onUpdateTransportTotal,
    onUpdateWinstMargePercentage,
    onUpdateWinstMargeAmountExcl,
}: CostSummaryCardProps) {
    const [isEditingRate, setIsEditingRate] = useState(false);
    const [tempRate, setTempRate] = useState<string>('');

    const [isEditingHours, setIsEditingHours] = useState(false);
    const [tempHours, setTempHours] = useState<string>('');
    const [editingField, setEditingField] = useState<null | 'groot' | 'verbruik' | 'subtotaal' | 'transport' | 'margePct' | 'margeAmount'>(null);
    const [tempFieldValue, setTempFieldValue] = useState<string>('');

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

    const parseLocalizedNumber = (value: string): number => {
        const parsed = parseFloat(value.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : NaN;
    };

    const selectAllOnFocus = (e: FocusEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        requestAnimationFrame(() => {
            if (typeof input.select === 'function') {
                input.select();
            }
        });
    };

    const startEditingAmount = (
        field: 'groot' | 'verbruik' | 'subtotaal' | 'transport' | 'margePct' | 'margeAmount',
        initialValue: number,
    ) => {
        setTempFieldValue(initialValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setEditingField(field);
    };

    const cancelEditingAmount = () => {
        setEditingField(null);
        setTempFieldValue('');
    };

    const saveEditingAmount = () => {
        if (!editingField) return;
        const parsed = parseLocalizedNumber(tempFieldValue);
        if (Number.isNaN(parsed)) {
            cancelEditingAmount();
            return;
        }

        if (editingField === 'groot' && onUpdateMaterialenGrootTotal) {
            onUpdateMaterialenGrootTotal(parsed);
        } else if (editingField === 'verbruik' && onUpdateMaterialenVerbruikTotal) {
            onUpdateMaterialenVerbruikTotal(parsed);
        } else if (editingField === 'subtotaal' && onUpdateMaterialenSubtotal) {
            onUpdateMaterialenSubtotal(parsed);
        } else if (editingField === 'transport' && onUpdateTransportTotal) {
            onUpdateTransportTotal(parsed);
        } else if (editingField === 'margePct' && onUpdateWinstMargePercentage) {
            onUpdateWinstMargePercentage(parsed);
        } else if (editingField === 'margeAmount' && onUpdateWinstMargeAmountExcl) {
            onUpdateWinstMargeAmountExcl(parsed);
        }

        cancelEditingAmount();
    };

    const totalTravelMinutesPerKlus = totals ? totals.transportDurationPerDagMinutes * totals.transportAantalDagen : 0;
    const totalTravelHoursPerKlus = totalTravelMinutesPerKlus / 60;
    const totaalExclZonderMarge = totals ? totals.subtotaalExclBtw : 0;
    const winstMargeExclBtw = totals ? totals.winstMarge : 0;
    const btwMetMarge = totals ? totals.btw : 0;

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
                        {editingField === 'groot' ? (
                            <Input
                                autoFocus
                                type="text"
                                value={tempFieldValue}
                                onChange={(e) => setTempFieldValue(e.target.value)}
                                onBlur={saveEditingAmount}
                                onFocus={selectAllOnFocus}
                                className="h-6 w-28 px-1 py-0 text-sm bg-muted border-border text-right"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditingAmount();
                                    if (e.key === 'Escape') cancelEditingAmount();
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => startEditingAmount('groot', totals.materialenGroot)}
                            >
                                {formatCurrency(totals.materialenGroot)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Verbruiksartikelen</span>
                        {editingField === 'verbruik' ? (
                            <Input
                                autoFocus
                                type="text"
                                value={tempFieldValue}
                                onChange={(e) => setTempFieldValue(e.target.value)}
                                onBlur={saveEditingAmount}
                                onFocus={selectAllOnFocus}
                                className="h-6 w-28 px-1 py-0 text-sm bg-muted border-border text-right"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditingAmount();
                                    if (e.key === 'Escape') cancelEditingAmount();
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => startEditingAmount('verbruik', totals.materialenVerbruik)}
                            >
                                {formatCurrency(totals.materialenVerbruik)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotaal materialen</span>
                        {editingField === 'subtotaal' ? (
                            <Input
                                autoFocus
                                type="text"
                                value={tempFieldValue}
                                onChange={(e) => setTempFieldValue(e.target.value)}
                                onBlur={saveEditingAmount}
                                onFocus={selectAllOnFocus}
                                className="h-6 w-28 px-1 py-0 text-sm bg-muted border-border text-right"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditingAmount();
                                    if (e.key === 'Escape') cancelEditingAmount();
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => startEditingAmount('subtotaal', totals.materialenTotaal)}
                            >
                                {formatCurrency(totals.materialenTotaal)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </button>
                        )}
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
                                        onFocus={selectAllOnFocus}
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
                                        onFocus={selectAllOnFocus}
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
                        {editingField === 'transport' ? (
                            <Input
                                autoFocus
                                type="text"
                                value={tempFieldValue}
                                onChange={(e) => setTempFieldValue(e.target.value)}
                                onBlur={saveEditingAmount}
                                onFocus={selectAllOnFocus}
                                className="h-6 w-28 px-1 py-0 text-sm bg-muted border-border text-right"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditingAmount();
                                    if (e.key === 'Escape') cancelEditingAmount();
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => startEditingAmount('transport', totals.transportTotaal)}
                            >
                                {formatCurrency(totals.transportTotaal)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="h-px bg-border/70" />

                <div className="rounded-lg border border-border p-3 space-y-2 bg-background/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Totaal excl. BTW</span>
                        <span className="text-foreground">{formatCurrency(totaalExclZonderMarge)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                            {settings.extras.winstMarge.mode === 'percentage' ? (
                                <>
                                    Winstmarge (
                                    {editingField === 'margePct' ? (
                                        <Input
                                            autoFocus
                                            type="text"
                                            value={tempFieldValue}
                                            onChange={(e) => setTempFieldValue(e.target.value)}
                                            onBlur={saveEditingAmount}
                                            onFocus={selectAllOnFocus}
                                            className="mx-1 inline-flex h-6 w-20 px-1 py-0 text-sm bg-muted border-border text-right"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveEditingAmount();
                                                if (e.key === 'Escape') cancelEditingAmount();
                                            }}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="mx-1 inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                            onClick={() => startEditingAmount('margePct', Number(settings.extras.winstMarge.percentage || 0))}
                                        >
                                            {settings.extras.winstMarge.percentage}%
                                            <Pencil size={12} className="text-muted-foreground" />
                                        </button>
                                    )}
                                    over totaal)
                                    {settings.extras.winstMarge.basis === 'materiaal' && <span className="text-xs text-muted-foreground ml-1">(over materialen)</span>}
                                    {settings.extras.winstMarge.basis === 'arbeid' && <span className="text-xs text-muted-foreground ml-1">(over arbeid)</span>}
                                </>
                            ) : (
                                <>Winstmarge (vast)</>
                            )}
                        </span>
                        {editingField === 'margeAmount' ? (
                            <Input
                                autoFocus
                                type="text"
                                value={tempFieldValue}
                                onChange={(e) => setTempFieldValue(e.target.value)}
                                onBlur={saveEditingAmount}
                                onFocus={selectAllOnFocus}
                                className="h-6 w-28 px-1 py-0 text-sm bg-muted border-border text-right"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditingAmount();
                                    if (e.key === 'Escape') cancelEditingAmount();
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => startEditingAmount('margeAmount', winstMargeExclBtw)}
                            >
                                {formatCurrency(winstMargeExclBtw)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between text-sm">
                        <span className="text-muted-foreground">BTW ({settings.btwTarief}%)</span>
                        <span className="text-foreground">{formatCurrency(btwMetMarge)}</span>
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
