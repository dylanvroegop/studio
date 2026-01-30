'use client';

import { CalculationResult, QuoteSettings, formatCurrency } from '@/lib/quote-calculations';
import { Euro } from 'lucide-react';

interface CostSummaryCardProps {
    totals: CalculationResult | null;
    settings: QuoteSettings | null;
    totalUren: number;
}

export function CostSummaryCard({ totals, settings, totalUren }: CostSummaryCardProps) {
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
                    <span className="text-zinc-400">
                        Arbeid ({totalUren} uur × {formatCurrency(settings.uurTariefExclBtw)})
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
