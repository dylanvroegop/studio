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
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border border-border">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Package className="text-emerald-500" size={18} />
                    Materiaal Specificatie
                </h3>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                        placeholder="Materialen zoeken..."
                        className="pl-9 bg-background border-border h-9 text-sm focus:ring-emerald-500/50"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Grootmaterialen Table */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                    <h4 className="font-medium text-foreground text-sm">Grootmaterialen</h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-medium">
                            <tr>
                                <th className="px-6 py-3">Omschrijving</th>
                                <th className="px-6 py-3 w-32 text-right">Aantal</th>
                                <th className="px-6 py-3 w-32 text-right">Prijs p/st</th>
                                <th className="px-6 py-3 w-32 text-right">Totaal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredGroot.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground italic">
                                        Geen grootmaterialen gevonden
                                    </td>
                                </tr>
                            ) : (
                                filteredGroot.map((item, index) => (
                                    <tr key={index} className="hover:bg-muted/40 transition-colors">
                                        <td className="px-6 py-3 text-foreground font-medium">{item.product}</td>
                                        <td className="px-6 py-3 text-muted-foreground text-right font-mono">{item.aantal}</td>
                                        <td className="px-6 py-3 text-muted-foreground text-right font-mono">
                                            {item.prijs_per_stuk ? formatCurrency(item.prijs_per_stuk) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-foreground text-right font-mono">
                                            {formatCurrency(item.totaal_prijs ?? (item.prijs_per_stuk || 0) * item.aantal)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredGroot.length > 0 && (
                            <tfoot className="bg-muted/30 border-t border-border font-medium text-foreground">
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
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                    <h4 className="font-medium text-foreground text-sm">Verbruiksartikelen</h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-medium">
                            <tr>
                                <th className="px-6 py-3">Omschrijving</th>
                                <th className="px-6 py-3 w-32 text-right">Aantal</th>
                                <th className="px-6 py-3 w-32 text-right">Prijs p/st</th>
                                <th className="px-6 py-3 w-32 text-right">Totaal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredVerbruik.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground italic">
                                        Geen verbruiksartikelen gevonden
                                    </td>
                                </tr>
                            ) : (
                                filteredVerbruik.map((item, index) => (
                                    <tr key={index} className="hover:bg-muted/40 transition-colors">
                                        <td className="px-6 py-3 text-foreground">{item.product}</td>
                                        <td className="px-6 py-3 text-muted-foreground text-right font-mono">{item.aantal}</td>
                                        <td className="px-6 py-3 text-muted-foreground text-right font-mono">
                                            {item.prijs_per_stuk ? formatCurrency(item.prijs_per_stuk) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-foreground text-right font-mono">
                                            {formatCurrency(item.totaal_prijs ?? (item.prijs_per_stuk || 0) * item.aantal)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredVerbruik.length > 0 && (
                            <tfoot className="bg-muted/30 border-t border-border font-medium text-foreground">
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
