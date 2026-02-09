'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, MaterialItem } from '@/lib/quote-calculations';
import { Package, AlertCircle, Plus, Check, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface MaterialEditorProps {
    title: string;
    items: MaterialItem[];
    onUpdateItem: (index: number, updates: Partial<MaterialItem>) => void;
    onRemoveItem?: (index: number) => void;
    onAddItem?: (item: MaterialItem) => void;
    subtotal: number;
    vatRate?: number;
    onAddClick?: () => void;
}

interface MaterialRowProps {
    item: MaterialItem;
    index: number;
    vatRate: number;
    onUpdateItem: (index: number, updates: Partial<MaterialItem>) => void;
    onRemoveItem?: (index: number) => void;
    handleKeyDown: (e: React.KeyboardEvent) => void;
}

function MaterialRow({ item, index, vatRate, onUpdateItem, onRemoveItem, handleKeyDown }: MaterialRowProps) {
    const [localAantal, setLocalAantal] = useState<string>(item.aantal?.toString() || '');
    const [localProduct, setLocalProduct] = useState<string>(item.product || '');
    const [localPrijs, setLocalPrijs] = useState<string>(item.prijs_per_stuk === 0 ? '' : item.prijs_per_stuk?.toString() || '');
    const [localEenheid, setLocalEenheid] = useState<string>(item.eenheid || 'stuk');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const UNITS = ['m1', 'm2', 'm3', 'stuk', 'doos', 'set', 'pak', 'koker', 'zak'];

    const formatPrice = (val: number) => {
        return val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Sync from props if they change externally (e.g. from modal)
    useEffect(() => {
        setLocalAantal(item.aantal?.toString() || '');
        setLocalProduct(item.product || '');
        setLocalPrijs(item.prijs_per_stuk === undefined || item.prijs_per_stuk === 0 ? '' : formatPrice(item.prijs_per_stuk));
        setLocalEenheid(item.eenheid || 'stuk');
    }, [item.aantal, item.product, item.prijs_per_stuk, item.eenheid]);

    const handleAantalBlur = () => {
        console.log('🔵 Aantal BLUR fired!', { index, localAantal, itemAantal: item.aantal });
        const val = parseFloat(localAantal) || 0;
        if (val !== item.aantal) {
            console.log('🔵 Calling onUpdateItem with aantal:', { index, val, onUpdateItemType: typeof onUpdateItem });
            onUpdateItem(index, { aantal: val });
        } else {
            console.log('⚪ Aantal unchanged, skipping');
        }
    };

    const handleProductBlur = () => {
        console.log('🟢 Product BLUR fired!', { index, localProduct, itemProduct: item.product });
        if (localProduct !== item.product) {
            console.log('🟢 Calling onUpdateItem with product:', { index, localProduct, onUpdateItemType: typeof onUpdateItem });
            onUpdateItem(index, { product: localProduct });
        } else {
            console.log('⚪ Product unchanged, skipping');
        }
    };

    const handlePrijsBlur = () => {
        console.log('🟡 Prijs BLUR fired!', { index, localPrijs, itemPrijs: item.prijs_per_stuk });
        // Parse: remove dots (thousands) and replace comma with dot (decimal)
        const parsedValue = localPrijs.replace(/\./g, '').replace(',', '.');
        const val = parseFloat(parsedValue) || 0;

        if (val !== item.prijs_per_stuk) {
            console.log('🟡 Calling onUpdateItem with prijs:', { index, val, onUpdateItemType: typeof onUpdateItem });
            onUpdateItem(index, { prijs_per_stuk: val });
        } else {
            console.log('⚪ Prijs unchanged, skipping');
        }

        // Re-format local display
        setLocalPrijs(val === 0 ? '' : formatPrice(val));
    };

    const handleEenheidChange = (val: string) => {
        setLocalEenheid(val);
        onUpdateItem(index, { eenheid: val });
    };

    const handleDelete = () => {
        if (onRemoveItem) {
            onRemoveItem(index);
        }
        setShowDeleteDialog(false);
    };

    const needsPrice = !item.prijs_per_stuk || item.prijs_per_stuk === 0;
    const itemTotal = (item.prijs_per_stuk || 0) * (item.aantal || 0);

    return (
        <>
            <tr className={`group transition-all duration-200 ${needsPrice ? 'bg-amber-500/[0.03]' : 'hover:bg-zinc-800/20'}`}>
                <td className="px-6 py-3">
                    <input
                        type="text"
                        value={localProduct}
                        onChange={(e) => setLocalProduct(e.target.value)}
                        onBlur={handleProductBlur}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-300 text-sm hover:bg-zinc-800/50 hover:border-zinc-600 transition-all font-medium"
                    />
                </td>
                <td className="px-6 py-3">
                    <input
                        type="number"
                        value={localAantal}
                        onChange={(e) => setLocalAantal(e.target.value)}
                        onBlur={handleAantalBlur}
                        onKeyDown={handleKeyDown}
                        placeholder="0"
                        className="w-12 bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-100 text-sm font-semibold hover:bg-zinc-800/50 hover:border-zinc-600 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                </td>
                <td className="px-6 py-3 text-right">
                    <label className={`flex items-center justify-end w-28 bg-zinc-900/40 border rounded px-2 py-1 hover:bg-zinc-800/50 transition-all focus-within:ring-1 focus-within:ring-emerald-500/50 focus-within:border-emerald-500/50 hover:border-zinc-600 cursor-text ${needsPrice ? 'border-amber-500/50' : 'border-zinc-700/60'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400 text-sm pointer-events-none">€</span>
                            <input
                                type="text"
                                value={localPrijs}
                                onChange={(e) => setLocalPrijs(e.target.value)}
                                onBlur={handlePrijsBlur}
                                onKeyDown={handleKeyDown}
                                placeholder="0,00"
                                style={{ width: `${Math.max(1, (localPrijs?.length || 4))}ch` }}
                                className={`bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-mono text-right p-0 ${needsPrice ? 'text-amber-400 font-bold placeholder:text-zinc-600' : 'text-zinc-200 font-medium placeholder:text-zinc-600'}`}
                            />
                        </div>
                    </label>
                </td>
                <td className="px-6 py-3">
                    <select
                        value={localEenheid}
                        onChange={(e) => handleEenheidChange(e.target.value)}
                        className="bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-300 text-xs hover:bg-zinc-800/50 hover:border-zinc-600 transition-all font-medium appearance-none min-w-[60px] text-center"
                    >
                        {UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </td>
                <td className="px-6 py-3 text-right text-zinc-300 text-sm">
                    {formatCurrency(itemTotal)}
                </td>
                <td className="px-6 py-3 text-right text-zinc-400 text-sm font-medium">
                    {formatCurrency(itemTotal * (1 + vatRate / 100))}
                </td>
                {onRemoveItem && (
                    <td className="px-6 py-3 text-right">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowDeleteDialog(true)}
                            className="h-8 w-8 text-zinc-600 hover:text-red-400 hover:bg-red-950/20 transition-all"
                        >
                            <Trash2 size={14} />
                        </Button>
                    </td>
                )}
            </tr>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Materiaal verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Weet je zeker dat je <span className="font-semibold text-zinc-300">{item.product || 'dit materiaal'}</span> wilt verwijderen?
                            Deze actie kan niet ongedaan worden gemaakt.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-2">
                        <AlertDialogCancel disabled={false} className="rounded-xl">
                            Annuleren
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            onClick={handleDelete}
                            variant="destructiveSoft"
                        >
                            Verwijderen
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export function MaterialEditor({ title, items, onUpdateItem, onRemoveItem, onAddItem, subtotal, vatRate = 21, onAddClick }: MaterialEditorProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newItem, setNewItem] = useState<Partial<MaterialItem>>({
        aantal: 1,
        product: '',
        prijs_per_stuk: 0,
        eenheid: 'stuk'
    });
    const [localNewPrice, setLocalNewPrice] = useState<string>('');

    const UNITS = ['m1', 'm2', 'm3', 'stuk', 'doos', 'set', 'pak', 'koker', 'zak'];

    const itemsNeedingPrice = items.filter(item => !item.prijs_per_stuk || item.prijs_per_stuk === 0).length;

    // Calculate subtotal including VAT
    const subtotalInclVAT = subtotal * (1 + vatRate / 100);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
        }
    };

    const handleSaveNewItem = () => {
        if (!newItem.product || !newItem.aantal) return;

        if (onAddItem) {
            const parsedPrice = parseFloat(localNewPrice.replace(/\./g, '').replace(',', '.')) || 0;
            onAddItem({
                aantal: Number(newItem.aantal),
                product: newItem.product || '',
                prijs_per_stuk: parsedPrice,
                eenheid: newItem.eenheid || 'stuk'
            });
        }

        setIsAdding(false);
        setNewItem({ aantal: 1, product: '', prijs_per_stuk: 0, eenheid: 'stuk' });
        setLocalNewPrice('');
    };

    const handleNewPrijsBlur = () => {
        const parsedValue = localNewPrice.replace(/\./g, '').replace(',', '.');
        const val = parseFloat(parsedValue) || 0;
        setNewItem({ ...newItem, prijs_per_stuk: val });
        setLocalNewPrice(val === 0 ? '' : val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    };

    const handleAddButtonClick = () => {
        if (onAddClick) {
            onAddClick();
        } else {
            setIsAdding(true);
        }
    };

    return (
        <div className="bg-card/50 rounded-xl border border-border overflow-hidden backdrop-blur-sm">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                        <Package size={18} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground tracking-tight text-sm uppercase">{title}</h3>
                        {itemsNeedingPrice > 0 && (
                            <span className="flex items-center gap-1 text-red-600 text-[10px] font-medium uppercase mt-0.5">
                                <AlertCircle size={10} />
                                {itemsNeedingPrice} zonder prijs
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-muted/20 text-left">
                            <th className="px-6 py-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider">
                                Product
                            </th>
                            <th className="px-6 py-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-24">
                                Aantal
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-36">
                                Prijs <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(excl. btw)</span>
                            </th>
                            <th className="px-6 py-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-24">
                                Eenheid
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-32">
                                Totaal <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(excl. btw)</span>
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider w-32">
                                Totaal <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(incl. btw)</span>
                            </th>
                            {onRemoveItem && <th className="px-6 py-3 w-12" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {items.map((item, index) => (
                            <MaterialRow
                                key={`${index}-${item.product}`}
                                item={item}
                                index={index}
                                vatRate={vatRate}
                                onUpdateItem={onUpdateItem}
                                onRemoveItem={onRemoveItem}
                                handleKeyDown={handleKeyDown}
                            />
                        ))}

                        {/* New Item Row */}
                        {isAdding && (
                            <tr className="bg-primary/[0.02] border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
                                <td className="px-6 py-4">
                                    <input
                                        type="text"
                                        placeholder="Product naam"
                                        value={newItem.product}
                                        onChange={(e) => setNewItem({ ...newItem, product: e.target.value })}
                                        className="w-full bg-muted border border-border focus:ring-1 focus:ring-primary/50 rounded px-2 py-1 text-foreground text-sm"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <input
                                        type="number"
                                        min="1"
                                        value={newItem.aantal || ''}
                                        onChange={(e) => setNewItem({ ...newItem, aantal: parseInt(e.target.value) || 0 })}
                                        placeholder="0"
                                        className="w-12 bg-muted border border-border focus:ring-1 focus:ring-primary/50 rounded px-2 py-1 text-foreground text-sm"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <label className="flex items-center justify-end w-36 bg-muted border border-border focus-within:ring-1 focus-within:ring-primary/50 rounded px-2 py-1 transition-all cursor-text">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-muted-foreground text-xs pointer-events-none">€</span>
                                            <input
                                                type="text"
                                                placeholder="0,00"
                                                value={localNewPrice}
                                                onChange={(e) => setLocalNewPrice(e.target.value)}
                                                onBlur={handleNewPrijsBlur}
                                                onKeyDown={handleKeyDown}
                                                className="bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-right text-foreground p-0 w-24"
                                            />
                                        </div>
                                    </label>
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        value={newItem.eenheid || 'stuk'}
                                        onChange={(e) => setNewItem({ ...newItem, eenheid: e.target.value })}
                                        className="bg-muted border border-border focus:ring-1 focus:ring-primary/50 rounded px-2 py-1 text-foreground text-xs appearance-none min-w-[60px] text-center"
                                    >
                                        {UNITS.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </td>
                                <td colSpan={2} />
                                <td className="px-6 py-4 flex justify-end gap-2">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleSaveNewItem}
                                        className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10"
                                        disabled={!newItem.product}
                                    >
                                        <Check size={16} />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setIsAdding(false)}
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
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
                <div className="p-3 bg-muted/20">
                    <Button
                        variant="ghost"
                        onClick={handleAddButtonClick}
                        className="w-full h-10 text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 justify-center border border-dashed border-border hover:border-primary transition-all rounded-lg text-xs font-semibold uppercase tracking-wider"
                    >
                        <Plus size={14} className="text-primary" /> Rij toevoegen
                    </Button>
                </div>
            )}

            <div className="border-t-2 border-border/80 bg-muted/10">
                <div className="px-6 py-3 flex justify-end items-center">
                    <div className="flex items-center">
                        <div className="text-right w-32 px-6">
                            <p className="text-primary font-bold tracking-tight">
                                {formatCurrency(subtotal)}
                            </p>
                        </div>
                        <div className="text-right w-32 px-6">
                            <p className="text-primary font-bold tracking-tight">
                                {formatCurrency(subtotalInclVAT)}
                            </p>
                        </div>
                        {onRemoveItem && <div className="w-12" />}
                    </div>
                </div>
            </div>

            {items.length === 0 && !isAdding && (
                <div className="p-12 text-center text-muted-foreground">
                    <Package size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Geen materialen in deze categorie</p>
                </div>
            )}
        </div>
    );
}
