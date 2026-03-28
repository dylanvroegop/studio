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

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Minus, MoreHorizontal } from 'lucide-react';

export function LaborBreakdown({
    urenSpecificatie,
    totaalUren,
    uurTarief,
    btwTarief: _btwTarief = 21,
    urenPerDag = 8,
    showSummaryInHeader = true,
    onUpdateHourlyRate,
    onUpdateTotalHours,
    onUpdateItem: _onUpdateItem
}: LaborBreakdownProps) {
    const [tempRate, setTempRate] = useState<string>('');
    const [tempHours, setTempHours] = useState<string>('');
    const [tempDays, setTempDays] = useState<string>('');
    const [showCalculationRows, setShowCalculationRows] = useState(false);

    const parseLocalizedNumber = (value: string): number => {
        const normalized = value.replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : NaN;
    };

    const saveRate = () => {
        const newRate = parseLocalizedNumber(tempRate);
        if (!isNaN(newRate) && onUpdateHourlyRate) {
            onUpdateHourlyRate(newRate);
        }
    };

    const saveHours = () => {
        const newHours = parseLocalizedNumber(tempHours);
        if (!isNaN(newHours) && onUpdateTotalHours) {
            onUpdateTotalHours(newHours);
        }
    };
    const saveDays = () => {
        const newDays = parseLocalizedNumber(tempDays);
        if (!isNaN(newDays) && onUpdateTotalHours) {
            const newHours = Math.max(0, newDays * safeUrenPerDag);
            onUpdateTotalHours(Number(newHours.toFixed(2)));
        }
    };

    const totaalArbeid = totaalUren * uurTarief;
    const safeUrenPerDag = Number.isFinite(urenPerDag) && urenPerDag > 0 ? urenPerDag : 8;
    const totaalDagen = totaalUren / safeUrenPerDag;

    useEffect(() => {
        setTempRate(uurTarief.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }, [uurTarief]);

    useEffect(() => {
        setTempHours(totaalUren.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
    }, [totaalUren]);

    useEffect(() => {
        setTempDays(totaalDagen.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
    }, [totaalDagen]);

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
                {showSummaryInHeader && urenSpecificatie.length > 0 && (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                                aria-label="Meer opties"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                            <DropdownMenuItem
                                onSelect={(event) => event.preventDefault()}
                                className="cursor-default focus:bg-muted/60"
                            >
                                <div className="flex w-full items-center justify-between gap-3">
                                    <span className="text-xs text-foreground">Laat berekening zien</span>
                                    <Switch
                                        checked={showCalculationRows}
                                        onCheckedChange={setShowCalculationRows}
                                        onClick={(event) => event.stopPropagation()}
                                    />
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-muted/20 text-left">
                            <th className="px-6 py-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider">
                                Dagen
                            </th>
                            <th className="px-6 py-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-24">
                                Uren
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-36">
                                Tarief <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(excl. btw)</span>
                            </th>
                            <th className="px-6 py-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-24">
                                Eenheid
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-32">
                                Totaal <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(excl. btw)</span>
                            </th>
                            <th className="px-6 py-3 w-12" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        <tr>
                            <td className="px-6 py-3 font-semibold text-foreground">
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
                                    <Input
                                        type="text"
                                        value={tempDays}
                                        onChange={(e) => setTempDays(e.target.value)}
                                        onBlur={saveDays}
                                        className="w-12 bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-100 text-sm font-semibold text-center hover:bg-zinc-800/50 hover:border-zinc-600 transition-all"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveDays();
                                            if (e.key === 'Escape') setTempDays(totaalDagen.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
                                        }}
                                    />
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
                            <td className="px-6 py-3 font-semibold text-foreground">
                                <Input
                                    type="text"
                                    value={tempHours}
                                    onChange={(e) => setTempHours(e.target.value)}
                                    onBlur={saveHours}
                                    className="w-12 bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-100 text-sm font-semibold hover:bg-zinc-800/50 hover:border-zinc-600 transition-all"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveHours();
                                        if (e.key === 'Escape') setTempHours(totaalUren.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
                                    }}
                                />
                            </td>
                            <td className="px-6 py-3 text-right">
                                <label className="flex items-center justify-end w-28 bg-zinc-900/40 border border-zinc-700/60 rounded px-2 py-1 hover:bg-zinc-800/50 transition-all focus-within:ring-1 focus-within:ring-emerald-500/50 focus-within:border-emerald-500/50 hover:border-zinc-600 cursor-text">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-zinc-400 text-sm pointer-events-none">€</span>
                                        <input
                                            type="text"
                                            value={tempRate}
                                            onChange={(e) => setTempRate(e.target.value)}
                                            onBlur={saveRate}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveRate();
                                                if (e.key === 'Escape') setTempRate(uurTarief.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                            }}
                                            style={{ width: `${Math.max(1, (tempRate?.length || 4))}ch` }}
                                            className="bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-mono text-right p-0 text-zinc-200 font-medium"
                                        />
                                    </div>
                                </label>
                            </td>
                            <td className="px-6 py-3 text-zinc-300 text-sm">uur</td>
                            <td className="px-6 py-3 text-right text-zinc-300 text-sm">
                                {formatCurrency(totaalArbeid)}
                            </td>
                            <td className="px-6 py-3 text-right w-12">
                                <span className="inline-flex h-9 w-9 opacity-0 pointer-events-none" aria-hidden />
                            </td>
                        </tr>
                        {showCalculationRows && urenSpecificatie.map((item, index) => (
                            <tr key={`detail-${index}`} className="bg-zinc-900/20">
                                <td colSpan={6} className="px-6 py-3 text-xs text-zinc-300">
                                    {item.taak || `Urenregel ${index + 1}`}: {formatNumber(item.uren / safeUrenPerDag)} dagen • {formatNumber(item.uren)} uur • {formatCurrency(item.uren * uurTarief)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
