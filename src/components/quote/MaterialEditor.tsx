'use client';

import { useState } from 'react';
import { formatCurrency, MaterialItem } from '@/lib/quote-calculations';
import { Package, AlertCircle } from 'lucide-react';

interface MaterialEditorProps {
    title: string;
    items: MaterialItem[];
    onUpdatePrice: (index: number, price: number) => void;
    subtotal: number;
}

export function MaterialEditor({ title, items, onUpdatePrice, subtotal }: MaterialEditorProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    const itemsNeedingPrice = items.filter(item => !item.prijs_per_stuk || item.prijs_per_stuk === 0).length;

    const handleStartEdit = (index: number, currentPrice: number) => {
        setEditingIndex(index);
        setEditValue(currentPrice.toString());
    };

    const handleSaveEdit = (index: number) => {
        const newPrice = parseFloat(editValue) || 0;
        onUpdatePrice(index, newPrice);
        setEditingIndex(null);
        setEditValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            handleSaveEdit(index);
        } else if (e.key === 'Escape') {
            setEditingIndex(null);
            setEditValue('');
        }
    };

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <Package size={18} className="text-zinc-400" />
                    <h3 className="font-semibold text-white">{title}</h3>
                    {itemsNeedingPrice > 0 && (
                        <span className="flex items-center gap-1 text-yellow-400 text-sm">
                            <AlertCircle size={14} />
                            {itemsNeedingPrice} zonder prijs
                        </span>
                    )}
                </div>
                <span className="text-emerald-400 font-medium">
                    Subtotaal: {formatCurrency(subtotal)}
                </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-zinc-800/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400 w-20">
                                Aantal
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
                                Product
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400 w-32">
                                Per stuk
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400 w-32">
                                Totaal
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const needsPrice = !item.prijs_per_stuk || item.prijs_per_stuk === 0;
                            const itemTotal = (item.prijs_per_stuk || 0) * item.aantal;

                            return (
                                <tr
                                    key={index}
                                    className={`border-b border-zinc-800 transition-colors ${needsPrice ? 'bg-yellow-900/10' : 'hover:bg-zinc-800/30'
                                        }`}
                                >
                                    <td className="px-4 py-3 text-zinc-300 font-medium">
                                        {item.aantal}×
                                    </td>
                                    <td className="px-4 py-3 text-zinc-300">
                                        {item.product}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {editingIndex === index ? (
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onBlur={() => handleSaveEdit(index)}
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                className="w-24 bg-zinc-800 border border-emerald-500 rounded px-2 py-1 text-right text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                autoFocus
                                            />
                                        ) : (
                                            <button
                                                onClick={() => handleStartEdit(index, item.prijs_per_stuk || 0)}
                                                className={`px-2 py-1 rounded transition-colors ${needsPrice
                                                        ? 'text-yellow-400 hover:bg-yellow-900/30'
                                                        : 'text-zinc-300 hover:bg-zinc-800'
                                                    }`}
                                            >
                                                {needsPrice ? '€ 0,00 ✏️' : formatCurrency(item.prijs_per_stuk || 0)}
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-zinc-300">
                                        {formatCurrency(itemTotal)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            {items.length === 0 && (
                <div className="p-8 text-center text-zinc-500">
                    Geen materialen in deze categorie
                </div>
            )}
        </div>
    );
}
