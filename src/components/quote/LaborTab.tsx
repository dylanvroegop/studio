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
                <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Clock size={20} />
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs uppercase font-semibold">Totaal Uren</p>
                        <p className="text-xl font-bold text-foreground">{totaalUren} uur</p>
                    </div>
                </div>

                <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <span className="font-bold text-lg">€</span>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs uppercase font-semibold">Uurtarief (excl.)</p>
                        <p className="text-xl font-bold text-foreground">{formatCurrency(uurTarief)}</p>
                    </div>
                </div>

                <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Timer size={20} />
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs uppercase font-semibold">Totaal Arbeid</p>
                        <p className="text-xl font-bold text-foreground">{formatCurrency(totaalUren * uurTarief)}</p>
                    </div>
                </div>
            </div>

            {/* Breakdown Table */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                    <h4 className="font-medium text-foreground text-sm flex items-center gap-2">
                        <Clock size={16} className="text-muted-foreground" />
                        Uren Specificatie
                    </h4>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-medium">
                            <tr>
                                <th className="px-6 py-3">Taak / Omschrijving</th>
                                <th className="px-6 py-3 w-40 text-right">Geschatte Uren</th>
                                <th className="px-6 py-3 w-40 text-right">Kosten (excl.)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {urenSpecificatie.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground italic">
                                        Geen urenspecificatie beschikbaar
                                    </td>
                                </tr>
                            ) : (
                                urenSpecificatie.map((item, index) => (
                                    <tr key={index} className="hover:bg-muted/40 transition-colors">
                                        <td className="px-6 py-3 text-foreground font-medium">{item.taak}</td>
                                        <td className="px-6 py-3 text-muted-foreground text-right font-mono">{item.uren}</td>
                                        <td className="px-6 py-3 text-foreground text-right font-mono">
                                            {formatCurrency(item.uren * uurTarief)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {urenSpecificatie.length > 0 && (
                            <tfoot className="bg-muted/30 border-t border-border font-medium text-foreground">
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
