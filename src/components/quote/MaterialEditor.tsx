'use client';

import { useState } from 'react';
import { formatCurrency, MaterialItem } from '@/lib/quote-calculations';
import { Package, AlertCircle, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MaterialEditorProps {
    title: string;
    items: MaterialItem[];
    onUpdatePrice: (index: number, price: number) => void;
    onAddItem?: (item: MaterialItem) => void;
    subtotal: number;
    vatRate?: number;
    onAddClick?: () => void;
}

export function MaterialEditor({ title, items, onUpdatePrice, onAddItem, subtotal, vatRate = 21, onAddClick }: MaterialEditorProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    // State for adding new item
    const [isAdding, setIsAdding] = useState(false);
    const [newItem, setNewItem] = useState<Partial<MaterialItem>>({
        aantal: 1,
        product: '',
        prijs_per_stuk: 0
    });

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

    const handleSaveNewItem = () => {
        if (!newItem.product || !newItem.aantal) return;

        if (onAddItem) {
            onAddItem({
                aantal: Number(newItem.aantal),
                product: newItem.product,
                prijs_per_stuk: Number(newItem.prijs_per_stuk) || 0
            });
        }

        setIsAdding(false);
        setNewItem({ aantal: 1, product: '', prijs_per_stuk: 0 });
    };

    const handleAddButtonClick = () => {
        if (onAddClick) {
            onAddClick();
        } else {
            setIsAdding(true);
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
                <div className="flex items-center gap-4">
                    <span className="text-emerald-400 font-medium">
                        Subtotaal: {formatCurrency(subtotal)}
                    </span>
                </div>
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
                                Per stuk <span className="text-xs font-normal opacity-50 block">excl. btw</span>
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400 w-32">
                                Totaal <span className="text-xs font-normal opacity-50 block">excl. btw</span>
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400 w-32">
                                Totaal <span className="text-xs font-normal opacity-50 block">incl. btw</span>
                            </th>
                            {/* Empty header column for alignment/actions if needed later */}
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
                                    <td className="px-4 py-3 text-right text-zinc-400">
                                        {formatCurrency(itemTotal * (1 + vatRate / 100))}
                                    </td>
                                </tr>
                            );
                        })}

                        {/* New Item Row */}
                        {isAdding && (
                            <tr className="bg-zinc-800/50 border-b border-zinc-800 animate-in fade-in slide-in-from-top-1 duration-200">
                                <td className="px-4 py-3">
                                    <Input
                                        type="number"
                                        min="1"
                                        value={newItem.aantal}
                                        onChange={(e) => setNewItem({ ...newItem, aantal: parseInt(e.target.value) || 0 })}
                                        className="w-16 h-8 bg-zinc-900 border-zinc-700"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <Input
                                        type="text"
                                        placeholder="Product naam"
                                        value={newItem.product}
                                        onChange={(e) => setNewItem({ ...newItem, product: e.target.value })}
                                        className="h-8 bg-zinc-900 border-zinc-700"
                                        autoFocus
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Prijs"
                                        value={newItem.prijs_per_stuk}
                                        onChange={(e) => setNewItem({ ...newItem, prijs_per_stuk: parseFloat(e.target.value) || 0 })}
                                        className="h-8 bg-zinc-900 border-zinc-700 text-right"
                                    />
                                </td>
                                <td className="px-4 py-3 text-right text-zinc-500 text-sm">
                                    -
                                </td>
                                <td className="px-4 py-3 text-right text-zinc-500 text-sm">
                                    -
                                </td>
                                <td className="px-4 py-3 flex justify-end gap-2 items-center h-full min-h-[56px]">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleSaveNewItem}
                                        className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-950/50"
                                        disabled={!newItem.product}
                                    >
                                        <Check size={16} />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setIsAdding(false)}
                                        className="h-8 w-8 text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800"
                                    >
                                        <X size={16} />
                                    </Button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer / Add Button */}
            {!isAdding && onAddItem && (
                <div className="p-2 border-t border-zinc-800 bg-zinc-900/50">
                    <Button
                        variant="ghost"
                        onClick={handleAddButtonClick}
                        className="w-full h-9 text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center gap-2 justify-center border border-dashed border-zinc-800 hover:border-zinc-700"
                    >
                        <Plus size={14} /> Rij toevoegen
                    </Button>
                </div>
            )}

            {items.length === 0 && !isAdding && (
                <div className="p-8 text-center text-zinc-500">
                    Geen materialen in deze categorie
                </div>
            )}
        </div>
    );
}
