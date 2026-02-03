import React, { useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Trash2, PlusCircle } from 'lucide-react';
import { MeasurementInput } from '@/components/MeasurementInput';

interface VensterbankItem {
    id: string;
    openingId?: string | null;
    lengte: number | string;
    diepte: number | string;
    uitstekLinks: number | string;
    uitstekRechts: number | string;
}

interface VensterbankSectionProps {
    vensterbanken: VensterbankItem[];
    onAdd: () => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<VensterbankItem>) => void;
    isCollapsed?: boolean;
    onToggleCollapsed?: () => void;
}

export function VensterbankSection({
    vensterbanken,
    onAdd,
    onDelete,
    onUpdate,
    isCollapsed = false,
    onToggleCollapsed,
}: VensterbankSectionProps) {
    const addedRef = useRef(false);
    const filledVensterbankCount = vensterbanken.filter((vb) => {
        const hasValue = (value: number | string | undefined) => {
            if (value === undefined || value === null) return false;
            if (typeof value === 'number') return value > 0;
            return value.trim() !== '' && Number(value) > 0;
        };
        return (
            hasValue(vb.lengte) ||
            hasValue(vb.diepte) ||
            hasValue(vb.uitstekLinks) ||
            hasValue(vb.uitstekRechts)
        );
    }).length;

    const ensureFirstItem = () => {
        if (vensterbanken.length === 0 && !addedRef.current) {
            addedRef.current = true;
            onAdd();
            setTimeout(() => { addedRef.current = false; }, 100);
        }
    };

    useEffect(() => {
        if (!isCollapsed && vensterbanken.length === 0) {
            ensureFirstItem();
        }
    }, [isCollapsed, vensterbanken.length]);

    return (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
            <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                onClick={onToggleCollapsed}
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-200">Vensterbanken</span>
                    {isCollapsed && filledVensterbankCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            {filledVensterbankCount} vensterbank{filledVensterbankCount !== 1 ? 'en' : ''}
                        </span>
                    )}
                </div>
                <div className="text-zinc-500">
                    {isCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </div>
            </div>

            {!isCollapsed && (
                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                    <div className="pt-2 border-t border-white/5 space-y-3">
                        {vensterbanken.length === 0 ? (
                            <div className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 space-y-3">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                    <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Oversteek Links (mm)</Label>
                                        <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Oversteek Rechts (mm)</Label>
                                        <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {vensterbanken.map((vb, vIdx) => (
                                    <div key={vb.id} className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 space-y-3">
                                        {vensterbanken.length > 1 && (
                                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                <span className="text-[10px] uppercase font-bold text-zinc-400">Vensterbank {vIdx + 1}</span>
                                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-red-400" onClick={() => onDelete(vb.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                            <MeasurementInput className="h-7 text-xs" value={vb.lengte} onChange={(v) => onUpdate(vb.id, { lengte: Number(v) || 0 })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Oversteek Links (mm)</Label>
                                                <MeasurementInput className="h-7 text-xs" value={vb.uitstekLinks} onChange={(v) => onUpdate(vb.id, { uitstekLinks: Number(v) || 0 })} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Oversteek Rechts (mm)</Label>
                                                <MeasurementInput className="h-7 text-xs" value={vb.uitstekRechts} onChange={(v) => onUpdate(vb.id, { uitstekRechts: Number(v) || 0 })} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={onAdd}
                                    className="w-full h-8 text-[10px] text-zinc-500 hover:text-emerald-400 justify-center gap-2 border border-dashed border-white/10"
                                >
                                    <PlusCircle className="h-3.5 w-3.5" />
                                    Extra vensterbank
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
