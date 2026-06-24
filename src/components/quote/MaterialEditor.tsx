'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, MaterialItem } from '@/lib/quote-calculations';
import { Package, AlertCircle, Plus, Minus, Check, X, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const DISALLOWED_NUMBER_KEYS = new Set(['e', 'E', '+', '-']);
const DISALLOWED_NUMBER_PASTE = /[eE+-]/;
const MAX_INPUT_LENGTH = 100;

type MaterialViewMode = 'single' | 'split';
type MaterialCategoryStyle = 'groot' | 'verbruik' | 'neutral';

interface MaterialEditorProps {
    title: string;
    items: MaterialItem[];
    onUpdateItem: (index: number, updates: Partial<MaterialItem>) => void;
    onRemoveItem?: (index: number) => void;
    onAddItem?: (item: MaterialItem) => void;
    subtotal: number;
    vatRate?: number;
    onAddClick?: () => void;
    enableCalculationViewToggle?: boolean;
    calculationTextFields?: string | string[];
    calculationToggleLabel?: string;
    calculationRowLabel?: string;
    showDontAutoIncludeOption?: boolean;
    showLineTotalInclBtw?: boolean;
    viewMode?: MaterialViewMode;
    categoryStyle?: MaterialCategoryStyle;
    showHeaderSummary?: boolean;
    showAdvancedControlsMenu?: boolean;
    listViewToggle?: {
        label: string;
        checked: boolean;
        onCheckedChange: (checked: boolean) => void;
    };
    hideHeader?: boolean;
}

interface MaterialRowProps {
    item: MaterialItem;
    index: number;
    vatRate: number;
    onUpdateItem: (index: number, updates: Partial<MaterialItem>) => void;
    onRemoveItem?: (index: number) => void;
    handleKeyDown: (e: React.KeyboardEvent) => void;
    showCalculation: boolean;
    calculationText: string;
    calculationRowLabel: string;
    totalColumns: number;
    showDontAutoIncludeOption: boolean;
    showLineTotalInclBtw: boolean;
    showSourceCategoryBadge: boolean;
}

function MaterialRow({
    item,
    index,
    vatRate,
    onUpdateItem,
    onRemoveItem,
    handleKeyDown,
    showCalculation,
    calculationText,
    calculationRowLabel,
    totalColumns,
    showDontAutoIncludeOption,
    showLineTotalInclBtw,
    showSourceCategoryBadge,
}: MaterialRowProps) {
    const [localAantal, setLocalAantal] = useState<string>(item.aantal?.toString() || '');
    const [localProduct, setLocalProduct] = useState<string>(item.product || '');
    const [localPrijs, setLocalPrijs] = useState<string>(item.prijs_per_stuk === 0 ? '' : item.prijs_per_stuk?.toString() || '');
    const [localEenheid, setLocalEenheid] = useState<string>(item.eenheid || 'stuk');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [dontAutoIncludeNextTime, setDontAutoIncludeNextTime] = useState(false);

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

    const handleAantalStep = (delta: number) => {
        const baseValue = Number.isFinite(parseFloat(localAantal))
            ? parseFloat(localAantal)
            : (item.aantal || 0);
        const nextValue = Math.max(0, baseValue + delta);
        const nextAsText = String(nextValue);
        setLocalAantal(nextAsText);
        onUpdateItem(index, { aantal: nextValue });
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
        setDontAutoIncludeNextTime(false);
        setShowDeleteDialog(false);
    };

    const needsPrice = !item.prijs_per_stuk || item.prijs_per_stuk === 0;
    const itemTotal = (item.prijs_per_stuk || 0) * (item.aantal || 0);
    const sourceCategoryLabel = showSourceCategoryBadge
        ? item?._sourceCategory === 'groot'
            ? 'Groot'
            : item?._sourceCategory === 'verbruik'
                ? 'Verbruik'
                : null
        : null;
    return (
        <>
            <tr className="sm:hidden">
                <td colSpan={totalColumns} className="px-2 py-2">
                    <div className={`rounded-xl border p-3 ${needsPrice ? 'border-amber-500/35 bg-amber-500/[0.04]' : 'border-border/70 bg-zinc-900/20'}`}>
                        <div className="space-y-2">
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1 space-y-1">
                                    {sourceCategoryLabel && (
                                        <span className="inline-flex rounded-md border border-zinc-700/60 bg-zinc-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                                            {sourceCategoryLabel}
                                        </span>
                                    )}
                                    <input
                                        type="text"
                                        value={localProduct}
                                        onChange={(e) => setLocalProduct(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                                        onBlur={handleProductBlur}
                                        onKeyDown={handleKeyDown}
                                        maxLength={MAX_INPUT_LENGTH}
                                        className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-2.5 py-2 text-sm font-medium text-zinc-200 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                                    />
                                </div>
                                {onRemoveItem && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setShowDeleteDialog(true)}
                                        className="h-9 w-9 shrink-0 rounded-lg text-red-300/80 transition-all hover:bg-red-500/10 hover:text-red-300"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Verwijder materiaal</span>
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                                <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/35 p-2">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Aantal</div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleAantalStep(-1)}
                                            className="h-8 w-8 shrink-0 rounded border border-zinc-700/60 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
                                            aria-label="Verlaag aantal"
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </Button>
                                        <input
                                            type="number"
                                            min="0"
                                            value={localAantal}
                                            onChange={(e) => setLocalAantal(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                                            onBlur={handleAantalBlur}
                                            onKeyDown={(e) => {
                                                if (DISALLOWED_NUMBER_KEYS.has(e.key)) {
                                                    e.preventDefault();
                                                }
                                                handleKeyDown(e);
                                            }}
                                            onPaste={(e) => {
                                                if (DISALLOWED_NUMBER_PASTE.test(e.clipboardData.getData('text'))) {
                                                    e.preventDefault();
                                                }
                                            }}
                                            placeholder="0"
                                            className="h-8 min-w-0 flex-1 rounded border border-zinc-700/60 bg-zinc-900/40 px-2 text-center text-sm font-semibold text-zinc-100 transition-all [appearance:textfield] hover:border-zinc-600 hover:bg-zinc-800/50 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleAantalStep(1)}
                                            className="h-8 w-8 shrink-0 rounded border border-zinc-700/60 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
                                            aria-label="Verhoog aantal"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/35 p-2">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Eenheid</div>
                                    <select
                                        value={localEenheid}
                                        onChange={(e) => handleEenheidChange(e.target.value)}
                                        className="h-8 w-full rounded border border-zinc-700/60 bg-zinc-900/40 px-2 text-center text-xs font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                                    >
                                        {UNITS.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <label className={`rounded-lg border bg-zinc-900/35 p-2 transition-all focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 ${needsPrice ? 'border-amber-500/50' : 'border-zinc-700/60'}`}>
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Prijs excl.</div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm text-zinc-400">€</span>
                                        <input
                                            type="text"
                                            value={localPrijs}
                                            onChange={(e) => setLocalPrijs(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                                            onBlur={handlePrijsBlur}
                                            onKeyDown={handleKeyDown}
                                            placeholder="0,00"
                                            maxLength={MAX_INPUT_LENGTH}
                                            className={`min-w-0 flex-1 border-none bg-transparent p-0 text-right font-mono text-sm focus:outline-none focus:ring-0 ${needsPrice ? 'font-bold text-amber-400 placeholder:text-zinc-600' : 'font-medium text-zinc-200 placeholder:text-zinc-600'}`}
                                        />
                                    </div>
                                </label>

                                <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/35 p-2 text-right">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Totaal</div>
                                    <div className="text-sm font-semibold text-zinc-200">{formatCurrency(itemTotal)}</div>
                                    {showLineTotalInclBtw && (
                                        <div className="mt-0.5 text-[11px] text-zinc-500">incl. {formatCurrency(itemTotal * (1 + vatRate / 100))}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
            <tr className={`group hidden transition-all duration-200 sm:table-row ${needsPrice ? 'bg-amber-500/[0.03]' : 'hover:bg-zinc-800/20'}`}>
                <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="space-y-1">
                        {sourceCategoryLabel && (
                            <span className="inline-flex rounded-md border border-zinc-700/60 bg-zinc-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                                {sourceCategoryLabel}
                            </span>
                        )}
                        <input
                            type="text"
                            value={localProduct}
                            onChange={(e) => setLocalProduct(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                            onBlur={handleProductBlur}
                            onKeyDown={handleKeyDown}
                            maxLength={MAX_INPUT_LENGTH}
                            className="w-full bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-300 text-sm hover:bg-zinc-800/50 hover:border-zinc-600 transition-all font-medium"
                        />
                    </div>
                </td>
                <td className="px-2 py-2 sm:px-2 sm:py-3">
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleAantalStep(-1)}
                            className="h-7 w-7 shrink-0 rounded border border-zinc-700/60 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
                            aria-label="Verlaag aantal"
                        >
                            <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <input
                            type="number"
                            min="0"
                            value={localAantal}
                            onChange={(e) => setLocalAantal(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                            onBlur={handleAantalBlur}
                            onKeyDown={(e) => {
                                if (DISALLOWED_NUMBER_KEYS.has(e.key)) {
                                    e.preventDefault();
                                }
                                handleKeyDown(e);
                            }}
                            onPaste={(e) => {
                                if (DISALLOWED_NUMBER_PASTE.test(e.clipboardData.getData('text'))) {
                                    e.preventDefault();
                                }
                            }}
                            placeholder="0"
                            className="w-10 bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1.5 py-1 text-zinc-100 text-sm font-semibold hover:bg-zinc-800/50 hover:border-zinc-600 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none sm:w-12"
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleAantalStep(1)}
                            className="h-7 w-7 shrink-0 rounded border border-zinc-700/60 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
                            aria-label="Verhoog aantal"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </td>
                <td className="px-2 py-2 text-right sm:px-2 sm:py-3">
                    <label className={`flex items-center justify-end w-24 bg-zinc-900/40 border rounded px-2 py-1 hover:bg-zinc-800/50 transition-all focus-within:ring-1 focus-within:ring-emerald-500/50 focus-within:border-emerald-500/50 hover:border-zinc-600 cursor-text sm:w-28 ${needsPrice ? 'border-amber-500/50' : 'border-zinc-700/60'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400 text-sm pointer-events-none">€</span>
                            <input
                                type="text"
                                value={localPrijs}
                                onChange={(e) => setLocalPrijs(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                                onBlur={handlePrijsBlur}
                                onKeyDown={handleKeyDown}
                                placeholder="0,00"
                                maxLength={MAX_INPUT_LENGTH}
                                style={{ width: `${Math.max(1, (localPrijs?.length || 4))}ch` }}
                                className={`bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-mono text-right p-0 ${needsPrice ? 'text-amber-400 font-bold placeholder:text-zinc-600' : 'text-zinc-200 font-medium placeholder:text-zinc-600'}`}
                            />
                        </div>
                    </label>
                    <p className="mt-1 text-[10px] font-medium text-zinc-400 sm:hidden">
                        {formatCurrency(itemTotal)}
                    </p>
                </td>
                <td className="px-2 py-2 sm:px-2 sm:py-3">
                    <select
                        value={localEenheid}
                        onChange={(e) => handleEenheidChange(e.target.value)}
                        className="bg-zinc-900/40 border border-zinc-700/60 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 rounded px-1 py-1 text-zinc-300 text-[11px] hover:bg-zinc-800/50 hover:border-zinc-600 transition-all font-medium appearance-none min-w-[50px] text-center sm:min-w-[60px] sm:px-1.5 sm:text-xs"
                    >
                        {UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </td>
                <td className="hidden px-2 py-3 text-right text-zinc-300 text-sm sm:table-cell">
                    {formatCurrency(itemTotal)}
                </td>
                {showLineTotalInclBtw && (
                    <td className="hidden px-2 py-3 text-right text-zinc-400 text-sm font-medium sm:table-cell">
                        {formatCurrency(itemTotal * (1 + vatRate / 100))}
                    </td>
                )}
                {onRemoveItem && (
                    <td className="px-2 py-2 text-right sm:px-2 sm:py-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowDeleteDialog(true)}
                            className="h-9 w-9 shrink-0 rounded-lg text-red-300/80 transition-all hover:bg-red-500/10 hover:text-red-300"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Verwijder materiaal</span>
                        </Button>
                    </td>
                )}
            </tr>
            {showCalculation && calculationText && (
                <tr className="bg-zinc-900/20">
                    <td colSpan={totalColumns} className="px-6 py-3 text-xs text-zinc-300">
                        <span className="font-semibold text-zinc-200">{calculationRowLabel}:</span> {calculationText}
                    </td>
                </tr>
            )}
            {showDeleteDialog && (
                <tr className="bg-red-500/[0.06]">
                    <td colSpan={totalColumns} className="px-3 py-3 sm:px-6">
                        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] p-3">
                            <div className="text-sm text-zinc-200">
                                Weet je zeker dat je <span className="font-semibold">{item.product || 'dit materiaal'}</span> wilt verwijderen?
                            </div>
                            {showDontAutoIncludeOption && (
                                <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                                    <label htmlFor={`dont-auto-include-${index}`} className="flex items-center justify-between gap-3">
                                        <span className="text-sm text-foreground">
                                            Niet meer automatisch mee berekenen voor volgende keer
                                        </span>
                                        <Switch
                                            id={`dont-auto-include-${index}`}
                                            checked={dontAutoIncludeNextTime}
                                            onCheckedChange={(checked) => setDontAutoIncludeNextTime(Boolean(checked))}
                                        />
                                    </label>
                                </div>
                            )}
                            <div className="mt-3 flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setShowDeleteDialog(false);
                                        setDontAutoIncludeNextTime(false);
                                    }}
                                >
                                    Annuleren
                                </Button>
                                <Button type="button" variant="destructiveSoft" onClick={handleDelete}>
                                    Verwijderen
                                </Button>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export function MaterialEditor({
    title,
    items,
    onUpdateItem,
    onRemoveItem,
    onAddItem,
    subtotal,
    vatRate = 21,
    onAddClick,
    enableCalculationViewToggle = false,
    calculationTextFields = 'hoe_berekend',
    calculationToggleLabel = 'Laat berekening zien',
    calculationRowLabel = 'Berekening',
    showDontAutoIncludeOption = false,
    showLineTotalInclBtw = true,
    viewMode = 'single',
    categoryStyle = 'neutral',
    showHeaderSummary = false,
    showAdvancedControlsMenu = true,
    listViewToggle,
    hideHeader = false,
}: MaterialEditorProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newItem, setNewItem] = useState<Partial<MaterialItem>>({
        aantal: 1,
        product: '',
        prijs_per_stuk: 0,
        eenheid: 'stuk'
    });
    const [localNewPrice, setLocalNewPrice] = useState<string>('');
    const [showCalculation, setShowCalculation] = useState(false);

    const UNITS = ['m1', 'm2', 'm3', 'stuk', 'doos', 'set', 'pak', 'koker', 'zak'];
    const totalColumns = onRemoveItem
        ? (showLineTotalInclBtw ? 7 : 6)
        : (showLineTotalInclBtw ? 6 : 5);
    const calculationKeys = Array.isArray(calculationTextFields) ? calculationTextFields : [calculationTextFields];
    const getCalculationText = (item: MaterialItem): string => {
        for (const key of calculationKeys) {
            const value = item?.[key];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value;
            }
        }
        return '';
    };
    const hasCalculationData = items.some((item) => getCalculationText(item).length > 0);
    const hasAdvancedControls = (enableCalculationViewToggle && hasCalculationData) || Boolean(listViewToggle);

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

    const categoryContainerClass = categoryStyle === 'groot'
        ? 'border-l-2 border-l-emerald-500/70'
        : categoryStyle === 'verbruik'
            ? 'border-l-2 border-l-cyan-500/70'
            : 'border-l-2 border-l-border/70';
    const categoryHeaderClass = categoryStyle === 'groot'
        ? 'bg-emerald-500/[0.08]'
        : categoryStyle === 'verbruik'
            ? 'bg-cyan-500/[0.08]'
            : 'bg-muted/20';
    const categoryIconClass = categoryStyle === 'groot'
        ? 'bg-emerald-500/15 text-emerald-300'
        : categoryStyle === 'verbruik'
            ? 'bg-cyan-500/15 text-cyan-300'
            : 'bg-muted text-muted-foreground';
    const categoryChipClass = categoryStyle === 'groot'
        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
        : categoryStyle === 'verbruik'
            ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200'
            : 'border-border/70 bg-background/40 text-muted-foreground';

    return (
        <div className={`bg-card/50 rounded-xl border border-border overflow-hidden backdrop-blur-sm ${categoryContainerClass}`}>
            {/* Header */}
            {!hideHeader && (
                <div className={`flex justify-between items-start gap-3 px-6 py-4 border-b border-border ${categoryHeaderClass}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${categoryIconClass}`}>
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
                            {showHeaderSummary && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${categoryChipClass}`}>
                                        Aantal regels: {items.length}
                                    </span>
                                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${categoryChipClass}`}>
                                        Subtotaal (excl. btw): {formatCurrency(subtotal)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    {hasAdvancedControls && (
                        showAdvancedControlsMenu ? (
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground transition-all hover:bg-muted/70"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Meer opties</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-72">
                                    {enableCalculationViewToggle && hasCalculationData && (
                                        <DropdownMenuItem
                                            onSelect={(event) => event.preventDefault()}
                                            className="cursor-default focus:bg-muted/60"
                                        >
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <span className="text-xs text-foreground">{calculationToggleLabel}</span>
                                                <Switch
                                                    checked={showCalculation}
                                                    onCheckedChange={setShowCalculation}
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                            </div>
                                        </DropdownMenuItem>
                                    )}
                                    {listViewToggle && (
                                        <DropdownMenuItem
                                            onSelect={(event) => event.preventDefault()}
                                            className="cursor-default focus:bg-muted/60"
                                        >
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <span className="text-xs text-foreground">{listViewToggle.label}</span>
                                                <Switch
                                                    checked={listViewToggle.checked}
                                                    onCheckedChange={listViewToggle.onCheckedChange}
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                            </div>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="flex items-center gap-4">
                                {enableCalculationViewToggle && hasCalculationData && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{calculationToggleLabel}</span>
                                        <Switch checked={showCalculation} onCheckedChange={setShowCalculation} />
                                    </div>
                                )}
                                {listViewToggle && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{listViewToggle.label}</span>
                                        <Switch
                                            checked={listViewToggle.checked}
                                            onCheckedChange={listViewToggle.onCheckedChange}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            )}
            {hideHeader && (
                <div className="flex justify-between items-center p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Package size={18} className="text-muted-foreground" />
                        <h3 className="font-semibold text-foreground">{title}</h3>
                    </div>
                    {hasAdvancedControls && (
                        showAdvancedControlsMenu ? (
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground transition-all hover:bg-muted/70"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Meer opties</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-72">
                                    {enableCalculationViewToggle && hasCalculationData && (
                                        <DropdownMenuItem
                                            onSelect={(event) => event.preventDefault()}
                                            className="cursor-default focus:bg-muted/60"
                                        >
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <span className="text-xs text-foreground">{calculationToggleLabel}</span>
                                                <Switch
                                                    checked={showCalculation}
                                                    onCheckedChange={setShowCalculation}
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                            </div>
                                        </DropdownMenuItem>
                                    )}
                                    {listViewToggle && (
                                        <DropdownMenuItem
                                            onSelect={(event) => event.preventDefault()}
                                            className="cursor-default focus:bg-muted/60"
                                        >
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <span className="text-xs text-foreground">{listViewToggle.label}</span>
                                                <Switch
                                                    checked={listViewToggle.checked}
                                                    onCheckedChange={listViewToggle.onCheckedChange}
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                            </div>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="flex items-center gap-4">
                                {enableCalculationViewToggle && hasCalculationData && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{calculationToggleLabel}</span>
                                        <Switch checked={showCalculation} onCheckedChange={setShowCalculation} />
                                    </div>
                                )}
                                {listViewToggle && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{listViewToggle.label}</span>
                                        <Switch
                                            checked={listViewToggle.checked}
                                            onCheckedChange={listViewToggle.onCheckedChange}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-hidden">
                <table className="w-full table-fixed border-collapse">
                    <thead className="hidden sm:table-header-group">
                        <tr className="bg-muted/20 text-left">
                            <th className="px-2 py-2 text-[10px] font-bold text-muted-foreground/90 uppercase tracking-wider sm:px-4 sm:py-3 sm:text-[11px]">
                                Product
                            </th>
                            <th className="w-12 px-2 py-2 text-[10px] font-bold text-muted-foreground/90 uppercase tracking-wider sm:w-32 sm:px-2 sm:py-3 sm:text-[11px]">
                                Aantal
                            </th>
                            <th className="w-28 px-2 py-2 text-right text-[10px] font-bold text-muted-foreground/90 uppercase tracking-wider sm:w-32 sm:px-2 sm:py-3 sm:text-[11px]">
                                Prijs <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(excl. btw)</span>
                            </th>
                            <th className="w-14 px-2 py-2 text-[10px] font-bold text-muted-foreground/90 uppercase tracking-wider sm:w-20 sm:px-2 sm:py-3 sm:text-[11px]">
                                Eenheid
                            </th>
                            <th className="hidden w-28 px-2 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider sm:table-cell">
                                Totaal <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(excl. btw)</span>
                            </th>
                            {showLineTotalInclBtw && (
                                <th className="hidden w-28 px-2 py-3 text-right text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider sm:table-cell">
                                    Totaal <span className="text-[9px] font-normal text-zinc-400 lowercase ml-1">(incl. btw)</span>
                                </th>
                            )}
                            {onRemoveItem && <th className="w-10 px-2 py-2 sm:w-14 sm:px-2 sm:py-3" />}
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
                                showCalculation={showCalculation}
                            calculationText={getCalculationText(item)}
                            calculationRowLabel={calculationRowLabel}
                            totalColumns={totalColumns}
                            showDontAutoIncludeOption={showDontAutoIncludeOption}
                            showLineTotalInclBtw={showLineTotalInclBtw}
                            showSourceCategoryBadge={viewMode !== 'single'}
                        />
                    ))}

                        {/* New Item Row */}
                        {isAdding && (
                            <tr className="bg-primary/[0.02] border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
                                <td className="px-4 py-4">
                                    <input
                                        type="text"
                                        placeholder="Product naam"
                                        value={newItem.product}
                                        onChange={(e) => setNewItem({ ...newItem, product: e.target.value.slice(0, MAX_INPUT_LENGTH) })}
                                        maxLength={MAX_INPUT_LENGTH}
                                        className="w-full bg-muted border border-border focus:ring-1 focus:ring-primary/50 rounded px-2 py-1 text-foreground text-sm"
                                    />
                                </td>
                                <td className="px-2 py-4">
                                    <input
                                        type="number"
                                        min="1"
                                        value={newItem.aantal || ''}
                                        onChange={(e) => {
                                            const capped = e.target.value.slice(0, MAX_INPUT_LENGTH);
                                            setNewItem({ ...newItem, aantal: parseInt(capped) || 0 });
                                        }}
                                        onKeyDown={(e) => {
                                            if (DISALLOWED_NUMBER_KEYS.has(e.key)) {
                                                e.preventDefault();
                                            }
                                            handleKeyDown(e);
                                        }}
                                        onPaste={(e) => {
                                            if (DISALLOWED_NUMBER_PASTE.test(e.clipboardData.getData('text'))) {
                                                e.preventDefault();
                                            }
                                        }}
                                        placeholder="0"
                                        className="w-12 bg-muted border border-border focus:ring-1 focus:ring-primary/50 rounded px-2 py-1 text-foreground text-sm"
                                    />
                                </td>
                                <td className="px-2 py-4">
                                    <label className="flex w-28 items-center justify-end bg-muted border border-border focus-within:ring-1 focus-within:ring-primary/50 rounded px-2 py-1 transition-all cursor-text">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-muted-foreground text-xs pointer-events-none">€</span>
                                            <input
                                                type="text"
                                                placeholder="0,00"
                                                value={localNewPrice}
                                                onChange={(e) => setLocalNewPrice(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                                                onBlur={handleNewPrijsBlur}
                                                onKeyDown={handleKeyDown}
                                                maxLength={MAX_INPUT_LENGTH}
                                                className="w-20 bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-right text-foreground p-0"
                                            />
                                        </div>
                                    </label>
                                </td>
                                <td className="px-2 py-4">
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
                                <td colSpan={showLineTotalInclBtw ? 2 : 1} />
                                <td className="flex justify-end gap-1 px-2 py-4">
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
            {!isAdding && (onAddItem || onAddClick) && (
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
                        <div className="w-28 px-2 text-right">
                            <p className="text-primary font-bold tracking-tight">
                                {formatCurrency(subtotal)}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                (excl. btw)
                            </p>
                        </div>
                        {showLineTotalInclBtw && (
                            <div className="w-28 px-2 text-right">
                                <p className="text-primary font-bold tracking-tight">
                                    {formatCurrency(subtotalInclVAT)}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    (incl. btw)
                                </p>
                            </div>
                        )}
                        {onRemoveItem && <div className="w-14" />}
                    </div>
                </div>
            </div>

        </div>
    );
}
