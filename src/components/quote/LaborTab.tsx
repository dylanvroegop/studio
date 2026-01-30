'use client';

import { UrenItem, formatCurrency } from '@/lib/quote-calculations';
import { Clock, Timer } from 'lucide-react';

interface LaborTabProps {
    urenSpecificatie: UrenItem[];
    totaalUren: number;
    uurTarief: number;
}

export function LaborTab({ urenSpecificatie, totaalUren, uurTarief }: LaborTabProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Clock size={20} />
                    </div>
                    <div>
                        <p className="text-zinc-500 text-xs uppercase font-semibold">Totaal Uren</p>
                        <p className="text-xl font-bold text-zinc-100">{totaalUren} uur</p>
                    </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <span className="font-bold text-lg">€</span>
                    </div>
                    <div>
                        <p className="text-zinc-500 text-xs uppercase font-semibold">Uurtarief (excl.)</p>
                        <p className="text-xl font-bold text-zinc-100">{formatCurrency(uurTarief)}</p>
                    </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Timer size={20} />
                    </div>
                    <div>
                        <p className="text-zinc-500 text-xs uppercase font-semibold">Totaal Arbeid</p>
                        <p className="text-xl font-bold text-white">{formatCurrency(totaalUren * uurTarief)}</p>
                    </div>
                </div>
            </div>

            {/* Breakdown Table */}
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                    <h4 className="font-medium text-zinc-300 text-sm flex items-center gap-2">
                        <Clock size={16} className="text-zinc-500" />
                        Uren Specificatie
                    </h4>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-900/80 text-zinc-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Taak / Omschrijving</th>
                                <th className="px-6 py-3 w-40 text-right">Geschatte Uren</th>
                                <th className="px-6 py-3 w-40 text-right">Kosten (excl.)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {urenSpecificatie.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-zinc-500 italic">
                                        Geen urenspecificatie beschikbaar
                                    </td>
                                </tr>
                            ) : (
                                urenSpecificatie.map((item, index) => (
                                    <tr key={index} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-6 py-3 text-zinc-300 font-medium">{item.taak}</td>
                                        <td className="px-6 py-3 text-zinc-400 text-right font-mono">{item.uren}</td>
                                        <td className="px-6 py-3 text-zinc-300 text-right font-mono">
                                            {formatCurrency(item.uren * uurTarief)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {urenSpecificatie.length > 0 && (
                            <tfoot className="bg-zinc-900/30 border-t border-zinc-800 font-medium text-zinc-300">
                                <tr>
                                    <td className="px-6 py-3 text-right">Totaal</td>
                                    <td className="px-6 py-3 text-right font-mono text-emerald-400">{totaalUren}</td>
                                    <td className="px-6 py-3 text-right font-mono text-emerald-400">
                                        {formatCurrency(totaalUren * uurTarief)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
