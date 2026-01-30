'use client';

import { formatCurrency, formatNumber, UrenItem } from '@/lib/quote-calculations';
import { Clock, Wrench } from 'lucide-react';

interface LaborBreakdownProps {
    urenSpecificatie: UrenItem[];
    totaalUren: number;
    uurTarief: number;
}

export function LaborBreakdown({ urenSpecificatie, totaalUren, uurTarief }: LaborBreakdownProps) {
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
                    <span className="text-zinc-400">
                        Uurtarief: <span className="text-zinc-200">{formatCurrency(uurTarief)}</span>
                    </span>
                    <span className="text-emerald-400 font-medium">
                        Totaal: {formatNumber(totaalUren)} uur
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
                                    {formatNumber(item.uren)}
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
