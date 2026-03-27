'use client';

import { formatCurrency, formatNumber, UrenItem } from '@/lib/quote-calculations';
import { Clock } from 'lucide-react';

interface LaborBreakdownProps {
    urenSpecificatie: UrenItem[];
    totaalUren: number;
    uurTarief: number;
    btwTarief?: number;
    urenPerDag?: number;
    showSummaryInHeader?: boolean;
    onUpdateHourlyRate?: (rate: number) => void;
    onUpdateTotalHours?: (hours: number) => void;
    onUpdateItem?: (index: number, hours: number) => void;
}

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Minus } from 'lucide-react';

export function LaborBreakdown({
    urenSpecificatie,
    totaalUren,
    uurTarief,
    btwTarief = 21,
    urenPerDag = 8,
    showSummaryInHeader = true,
    onUpdateHourlyRate,
    onUpdateTotalHours,
    onUpdateItem
}: LaborBreakdownProps) {
    // Row editing state
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [tempRowHours, setTempRowHours] = useState<string>('');
    const rowInputRef = useRef<HTMLInputElement>(null);

    // Focus row input when editing starts
    useEffect(() => {
        if (editingRowIndex !== null && rowInputRef.current) {
            rowInputRef.current.focus();
        }
    }, [editingRowIndex]);

    const startEditingRow = (index: number, hours: number) => {
        setEditingRowIndex(index);
        setTempRowHours(hours.toString());
    };

    const saveRow = (index: number) => {
        const newHours = parseFloat(tempRowHours);
        if (!isNaN(newHours) && onUpdateItem) {
            onUpdateItem(index, newHours);
        }
        setEditingRowIndex(null);
    };

    const cancelEditingRow = () => {
        setEditingRowIndex(null);
    };

    const [isEditingRate, setIsEditingRate] = useState(false);
    const [tempRate, setTempRate] = useState<string>('');
    const rateInputRef = useRef<HTMLInputElement>(null);

    const [isEditingHours, setIsEditingHours] = useState(false);
    const [tempHours, setTempHours] = useState<string>('');
    const hoursInputRef = useRef<HTMLInputElement>(null);
    const [isEditingDays, setIsEditingDays] = useState(false);
    const [tempDays, setTempDays] = useState<string>('');
    const daysInputRef = useRef<HTMLInputElement>(null);
    const [showCalculationRows, setShowCalculationRows] = useState(false);

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
    useEffect(() => {
        if (isEditingDays && daysInputRef.current) {
            daysInputRef.current.focus();
        }
    }, [isEditingDays]);

    const startEditingRate = () => {
        setTempRate(uurTarief.toString());
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
        setTempHours(totaalUren.toString());
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
    const startEditingDays = () => {
        setTempDays((totaalUren / safeUrenPerDag).toString());
        setIsEditingDays(true);
    };
    const saveDays = () => {
        const newDays = parseFloat(tempDays);
        if (!isNaN(newDays) && onUpdateTotalHours) {
            const newHours = Math.max(0, newDays * safeUrenPerDag);
            onUpdateTotalHours(Number(newHours.toFixed(2)));
        }
        setIsEditingDays(false);
    };
    const cancelEditingDays = () => {
        setIsEditingDays(false);
    };

    const totaalArbeid = totaalUren * uurTarief;
    const totaalArbeidInclBtw = totaalArbeid * (1 + ((Number.isFinite(btwTarief) ? btwTarief : 21) / 100));
    const safeUrenPerDag = Number.isFinite(urenPerDag) && urenPerDag > 0 ? urenPerDag : 8;
    const totaalDagen = totaalUren / safeUrenPerDag;

    const adjustDays = (deltaDays: number) => {
        if (!onUpdateTotalHours) return;
        const nextHours = Math.max(0, totaalUren + (deltaDays * safeUrenPerDag));
        onUpdateTotalHours(Number(nextHours.toFixed(2)));
    };

    return (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <Clock size={18} className="text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">URENSPECIFICATIE</h3>
                </div>
                {showSummaryInHeader && <div className="flex items-center gap-4 text-sm">
                    {urenSpecificatie.length > 0 && (
                        <span className="text-muted-foreground flex items-center gap-2">
                            <span className="text-xs">Laat berekening zien</span>
                            <Switch checked={showCalculationRows} onCheckedChange={setShowCalculationRows} />
                        </span>
                    )}
                    <span className="text-muted-foreground flex items-center gap-2">
                        Uurtarief:
                        {isEditingRate ? (
                            <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">€</span>
                                <Input
                                    ref={rateInputRef}
                                    type="number"
                                    value={tempRate}
                                    onChange={(e) => setTempRate(e.target.value)}
                                    onBlur={saveRate}
                                    className="h-7 w-20 px-2 py-1 text-sm bg-background border-border"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveRate();
                                        if (e.key === 'Escape') cancelEditingRate();
                                    }}
                                />
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="p-0 border-0 bg-transparent text-foreground/90 flex items-center gap-2 hover:text-foreground transition-colors"
                                onClick={startEditingRate}
                            >
                                {formatCurrency(uurTarief)}
                                <Pencil size={12} className="text-muted-foreground" />
                            </button>
                        )}
                        <span className="text-xs text-muted-foreground">excl. btw</span>
                    </span>
                    <span className="text-emerald-400 font-medium flex items-center gap-2">
                        Totaal:
                        {isEditingHours ? (
                            <div className="flex items-center gap-1">
                                <Input
                                    ref={hoursInputRef}
                                    type="number"
                                    value={tempHours}
                                    onChange={(e) => setTempHours(e.target.value)}
                                    onBlur={saveHours}
                                    className="h-7 w-20 px-2 py-1 text-sm bg-background border-border"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveHours();
                                        if (e.key === 'Escape') cancelEditingHours();
                                    }}
                                />
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="p-0 border-0 bg-transparent flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                                onClick={startEditingHours}
                            >
                                {formatNumber(totaalUren)} uur ({formatNumber(totaalDagen)} dagen)
                                <Pencil size={12} className="text-emerald-600" />
                            </button>
                        )}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-2">
                        Dagen:
                        {isEditingDays ? (
                            <div className="flex items-center gap-1">
                                <Input
                                    ref={daysInputRef}
                                    type="number"
                                    value={tempDays}
                                    onChange={(e) => setTempDays(e.target.value)}
                                    onBlur={saveDays}
                                    className="h-7 w-20 px-2 py-1 text-sm bg-background border-border"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveDays();
                                        if (e.key === 'Escape') cancelEditingDays();
                                    }}
                                />
                                <span className="text-xs text-muted-foreground">dagen</span>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
                                    onClick={() => adjustDays(-1)}
                                    disabled={!onUpdateTotalHours || totaalUren <= 0}
                                    aria-label="Verlaag met 1 dag"
                                >
                                    <Minus size={12} />
                                </button>
                                <button
                                    type="button"
                                    className="p-0 border-0 bg-transparent text-foreground hover:text-emerald-300 transition-colors inline-flex items-center gap-2"
                                    onClick={startEditingDays}
                                >
                                    <span className="min-w-[3ch] text-center">{formatNumber(totaalDagen)}</span>
                                    <Pencil size={12} className="text-muted-foreground" />
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
                                    onClick={() => adjustDays(1)}
                                    disabled={!onUpdateTotalHours}
                                    aria-label="Verhoog met 1 dag"
                                >
                                    <Plus size={12} />
                                </button>
                            </>
                        )}
                    </span>
                </div>}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-20">
                                Dagen
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-20">
                                Uren
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground w-28">
                                Excl. btw
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground w-28">
                                Incl. btw
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {showCalculationRows ? (
                            urenSpecificatie.map((item, index) => (
                                <tr
                                    key={index}
                                    className="border-b border-border hover:bg-muted/30 transition-colors"
                                >
                                    <td className="px-4 py-3 text-foreground/80">
                                        {formatNumber(item.uren / safeUrenPerDag)}
                                    </td>
                                    <td className="px-4 py-3 text-foreground/80 font-medium">
                                        {editingRowIndex === index ? (
                                            <Input
                                                ref={rowInputRef}
                                                type="number"
                                                value={tempRowHours}
                                                onChange={(e) => setTempRowHours(e.target.value)}
                                                onBlur={() => saveRow(index)}
                                                className="h-7 w-20 px-2 py-1 text-sm bg-background border-border font-medium"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveRow(index);
                                                    if (e.key === 'Escape') cancelEditingRow();
                                                }}
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                className="p-0 border-0 bg-transparent flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
                                                onClick={() => startEditingRow(index, item.uren)}
                                            >
                                                {formatNumber(item.uren)}
                                                <Pencil size={12} className="text-muted-foreground" />
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-foreground/80">
                                        {formatCurrency(item.uren * uurTarief)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-foreground/80">
                                        {formatCurrency((item.uren * uurTarief) * (1 + ((Number.isFinite(btwTarief) ? btwTarief : 21) / 100)))}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr className="border-b border-border">
                                <td colSpan={4} className="px-4 py-3 text-sm text-muted-foreground">
                                    Berekening verborgen. Zet <span className="text-foreground">Laat berekening zien</span> aan om details te bekijken.
                                </td>
                            </tr>
                        )}
                    </tbody>

                    {/* Footer with totals */}
                    <tfoot className="bg-muted/50">
                        <tr>
                            <td className="px-4 py-4 font-semibold text-foreground">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
                                        onClick={() => adjustDays(-1)}
                                        disabled={!onUpdateTotalHours || totaalUren <= 0}
                                        aria-label="Verlaag met 1 dag"
                                    >
                                        <Minus size={12} />
                                    </button>
                                    {isEditingDays ? (
                                        <Input
                                            ref={daysInputRef}
                                            type="number"
                                            value={tempDays}
                                            onChange={(e) => setTempDays(e.target.value)}
                                            onBlur={saveDays}
                                            className="h-7 w-20 px-2 py-1 text-sm bg-background border-border"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveDays();
                                                if (e.key === 'Escape') cancelEditingDays();
                                            }}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="p-0 border-0 bg-transparent text-foreground hover:text-emerald-300 transition-colors inline-flex items-center gap-2"
                                            onClick={startEditingDays}
                                        >
                                            {formatNumber(totaalDagen)}
                                            <Pencil size={12} className="text-muted-foreground" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
                                        onClick={() => adjustDays(1)}
                                        disabled={!onUpdateTotalHours}
                                        aria-label="Verhoog met 1 dag"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </td>
                            <td className="px-4 py-4 font-semibold text-foreground">
                                {isEditingHours ? (
                                    <Input
                                        ref={hoursInputRef}
                                        type="number"
                                        value={tempHours}
                                        onChange={(e) => setTempHours(e.target.value)}
                                        onBlur={saveHours}
                                        className="h-7 w-20 px-2 py-1 text-sm bg-background border-border"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveHours();
                                            if (e.key === 'Escape') cancelEditingHours();
                                        }}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        className="p-0 border-0 bg-transparent text-foreground hover:text-emerald-300 transition-colors inline-flex items-center gap-2"
                                        onClick={startEditingHours}
                                    >
                                        {formatNumber(totaalUren)}
                                        <Pencil size={12} className="text-muted-foreground" />
                                    </button>
                                )}
                            </td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-400">
                                {formatCurrency(totaalArbeid)}
                            </td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-400">
                                {formatCurrency(totaalArbeidInclBtw)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
