'use client';

import { formatCurrency, formatNumber, UrenItem } from '@/lib/quote-calculations';
import { Clock, Wrench } from 'lucide-react';

interface LaborBreakdownProps {
    urenSpecificatie: UrenItem[];
    totaalUren: number;
    uurTarief: number;
    onUpdateHourlyRate?: (rate: number) => void;
    onUpdateTotalHours?: (hours: number) => void;
    onUpdateItem?: (index: number, hours: number) => void;
}

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';

export function LaborBreakdown({ urenSpecificatie, totaalUren, uurTarief, onUpdateHourlyRate, onUpdateTotalHours, onUpdateItem }: LaborBreakdownProps) {
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

    const totaalArbeid = totaalUren * uurTarief;

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <Clock size={18} className="text-zinc-400" />
                    <h3 className="font-semibold text-white">URENSPECIFICATIE</h3>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-zinc-400 flex items-center gap-2">
                        Uurtarief:
                        {isEditingRate ? (
                            <div className="flex items-center gap-1">
                                <span className="text-zinc-500">€</span>
                                <Input
                                    ref={rateInputRef}
                                    type="number"
                                    value={tempRate}
                                    onChange={(e) => setTempRate(e.target.value)}
                                    onBlur={saveRate}
                                    className="h-7 w-20 px-2 py-1 text-sm bg-zinc-800 border-zinc-700"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveRate();
                                        if (e.key === 'Escape') cancelEditingRate();
                                    }}
                                />
                            </div>
                        ) : (
                            <span className="text-zinc-200 flex items-center gap-2 cursor-pointer" onClick={startEditingRate}>
                                {formatCurrency(uurTarief)}
                                <Pencil size={12} className="text-zinc-500" />
                            </span>
                        )}
                        <span className="text-xs text-zinc-500">excl. btw</span>
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
                                    className="h-7 w-20 px-2 py-1 text-sm bg-zinc-800 border-zinc-700"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveHours();
                                        if (e.key === 'Escape') cancelEditingHours();
                                    }}
                                />
                            </div>
                        ) : (
                            <span className="flex items-center gap-2 cursor-pointer text-emerald-400" onClick={startEditingHours}>
                                {formatNumber(totaalUren)} uur
                                <Pencil size={12} className="text-emerald-600" />
                            </span>
                        )}
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-zinc-800/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400 w-20">
                                Uren
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
                                Taak
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400 w-28">
                                Bedrag
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {urenSpecificatie.map((item, index) => (
                            <tr
                                key={index}
                                className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                            >
                                <td className="px-4 py-3 text-zinc-300 font-medium">
                                    {editingRowIndex === index ? (
                                        <Input
                                            ref={rowInputRef}
                                            type="number"
                                            value={tempRowHours}
                                            onChange={(e) => setTempRowHours(e.target.value)}
                                            onBlur={() => saveRow(index)}
                                            className="h-7 w-20 px-2 py-1 text-sm bg-zinc-800 border-zinc-700 font-medium"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveRow(index);
                                                if (e.key === 'Escape') cancelEditingRow();
                                            }}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white transition-colors" onClick={() => startEditingRow(index, item.uren)}>
                                            {formatNumber(item.uren)}
                                            <Pencil size={12} className="text-zinc-500" />
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-zinc-300">
                                    <div className="flex items-start gap-2">
                                        <Wrench size={14} className="mt-1 text-zinc-500 flex-shrink-0" />
                                        {item.taak}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right text-zinc-300">
                                    {formatCurrency(item.uren * uurTarief)}
                                </td>
                            </tr>
                        ))}
                    </tbody>

                    {/* Footer with totals */}
                    <tfoot className="bg-zinc-800/50">
                        <tr>
                            <td className="px-4 py-4 font-semibold text-white">
                                {formatNumber(totaalUren)}
                            </td>
                            <td className="px-4 py-4 font-semibold text-white">
                                Totaal
                            </td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-400">
                                {formatCurrency(totaalArbeid)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
