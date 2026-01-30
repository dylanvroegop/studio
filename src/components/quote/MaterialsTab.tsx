'use client';

import { MaterialItem, formatCurrency } from '@/lib/quote-calculations';
import { Package, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface MaterialsTabProps {
    grootmaterialen: MaterialItem[];
    verbruiksartikelen: MaterialItem[];
}

export function MaterialsTab({ grootmaterialen, verbruiksartikelen }: MaterialsTabProps) {
    const [search, setSearch] = useState('');

    const filterMaterials = (items: MaterialItem[]) => {
        if (!search) return items;
        return items.filter(item =>
            item.product.toLowerCase().includes(search.toLowerCase())
        );
    };

    const filteredGroot = filterMaterials(grootmaterialen);
    const filteredVerbruik = filterMaterials(verbruiksartikelen);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header / Search */}
            <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="font-semibold text-zinc-300 flex items-center gap-2">
                    <Package className="text-emerald-500" size={18} />
                    Materiaal Specificatie
                </h3>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <Input
                        placeholder="Materialen zoeken..."
                        className="pl-9 bg-zinc-900 border-zinc-800 h-9 text-sm focus:ring-emerald-500/50"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Grootmaterialen Table */}
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <h4 className="font-medium text-zinc-300 text-sm">Grootmaterialen</h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-900/80 text-zinc-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Omschrijving</th>
                                <th className="px-6 py-3 w-32 text-right">Aantal</th>
                                <th className="px-6 py-3 w-32 text-right">Prijs p/st</th>
                                <th className="px-6 py-3 w-32 text-right">Totaal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {filteredGroot.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">
                                        Geen grootmaterialen gevonden
                                    </td>
                                </tr>
                            ) : (
                                filteredGroot.map((item, index) => (
                                    <tr key={index} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-6 py-3 text-zinc-300 font-medium">{item.product}</td>
                                        <td className="px-6 py-3 text-zinc-400 text-right font-mono">{item.aantal}</td>
                                        <td className="px-6 py-3 text-zinc-400 text-right font-mono">
                                            {item.prijs_per_stuk ? formatCurrency(item.prijs_per_stuk) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-zinc-300 text-right font-mono">
                                            {formatCurrency(item.totaal_prijs ?? (item.prijs_per_stuk || 0) * item.aantal)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredGroot.length > 0 && (
                            <tfoot className="bg-zinc-900/30 border-t border-zinc-800 font-medium text-zinc-300">
                                <tr>
                                    <td colSpan={3} className="px-6 py-3 text-right">Subtotaal</td>
                                    <td className="px-6 py-3 text-right font-mono text-emerald-400">
                                        {formatCurrency(filteredGroot.reduce((acc, item) => acc + (item.totaal_prijs ?? (item.prijs_per_stuk || 0) * item.aantal), 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Verbruiksartikelen Table */}
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <h4 className="font-medium text-zinc-300 text-sm">Verbruiksartikelen</h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-900/80 text-zinc-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Omschrijving</th>
                                <th className="px-6 py-3 w-32 text-right">Aantal</th>
                                <th className="px-6 py-3 w-32 text-right">Prijs p/st</th>
                                <th className="px-6 py-3 w-32 text-right">Totaal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {filteredVerbruik.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">
                                        Geen verbruiksartikelen gevonden
                                    </td>
                                </tr>
                            ) : (
                                filteredVerbruik.map((item, index) => (
                                    <tr key={index} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-6 py-3 text-zinc-300">{item.product}</td>
                                        <td className="px-6 py-3 text-zinc-400 text-right font-mono">{item.aantal}</td>
                                        <td className="px-6 py-3 text-zinc-400 text-right font-mono">
                                            {item.prijs_per_stuk ? formatCurrency(item.prijs_per_stuk) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-zinc-300 text-right font-mono">
                                            {formatCurrency(item.totaal_prijs ?? (item.prijs_per_stuk || 0) * item.aantal)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredVerbruik.length > 0 && (
                            <tfoot className="bg-zinc-900/30 border-t border-zinc-800 font-medium text-zinc-300">
                                <tr>
                                    <td colSpan={3} className="px-6 py-3 text-right">Subtotaal</td>
                                    <td className="px-6 py-3 text-right font-mono text-emerald-400">
                                        {formatCurrency(filteredVerbruik.reduce((acc, item) => acc + (item.totaal_prijs ?? (item.prijs_per_stuk || 0) * item.aantal), 0))}
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
