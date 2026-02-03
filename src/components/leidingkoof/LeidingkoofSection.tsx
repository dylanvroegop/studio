import React, { useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Trash2, PlusCircle } from 'lucide-react';
import { MeasurementInput } from '@/components/MeasurementInput';
import { cn } from '@/lib/utils';

export interface LeidingkoofItem {
    id: string;
    lengte: number | string;
    hoogte: number | string;
    diepte: number | string;
    vanLinks?: number | string;
    vanOnder?: number | string;
    orientation?: 'side' | 'top';
    aantalZijden?: number;
}

interface LeidingkoofSectionProps {
    leidingkofen: LeidingkoofItem[];
    onAdd: () => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<LeidingkoofItem>) => void;
    isCollapsed?: boolean;
    onToggleCollapsed?: () => void;
    wallLength?: number;
    wallHeight?: number;
}

export function LeidingkoofSection({
    leidingkofen,
    onAdd,
    onDelete,
    onUpdate,
    isCollapsed = false,
    onToggleCollapsed,
    wallLength = 0,
    wallHeight = 0,
}: LeidingkoofSectionProps) {
    const addedRef = useRef(false);
    const filledKoofCount = leidingkofen.filter((koof) => {
        const hasValue = (value: number | string | undefined) => {
            if (value === undefined || value === null) return false;
            if (typeof value === 'number') return value > 0;
            return value.trim() !== '' && Number(value) > 0;
        };
        return (
            hasValue(koof.lengte) ||
            hasValue(koof.hoogte) ||
            hasValue(koof.diepte) ||
            hasValue(koof.vanLinks) ||
            hasValue(koof.vanOnder)
        );
    }).length;

    const ensureFirstItem = () => {
        if (leidingkofen.length === 0 && !addedRef.current) {
            addedRef.current = true;
            onAdd();
            setTimeout(() => { addedRef.current = false; }, 100);
        }
    };

    useEffect(() => {
        if (!isCollapsed && leidingkofen.length === 0) {
            ensureFirstItem();
        }
    }, [isCollapsed, leidingkofen.length]);

    return (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
            <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                onClick={onToggleCollapsed}
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-200">Leidingkoof</span>
                    {isCollapsed && filledKoofCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            {filledKoofCount} {filledKoofCount === 1 ? 'koof' : 'koven'}
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
                        {leidingkofen.length === 0 ? (
                            <div className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 space-y-3">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                    <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Breedte (mm)</Label>
                                        <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Breedte (mm)</Label>
                                        <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {leidingkofen.map((koof, kIdx) => {
                                    const orientation = koof.orientation || 'side';
                                    return (
                                        <div key={koof.id} className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 space-y-3">
                                            {leidingkofen.length > 1 && (
                                                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400">Leidingkoof {kIdx + 1}</span>
                                                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-red-400" onClick={() => onDelete(koof.id)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                                <MeasurementInput className="h-7 text-xs" value={koof.lengte} onChange={(v) => onUpdate(koof.id, { lengte: Number(v) || 0 })} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-zinc-500">Breedte (mm)</Label>
                                                    <MeasurementInput className="h-7 text-xs" value={koof.hoogte} onChange={(v) => onUpdate(koof.id, { hoogte: Number(v) || 0 })} />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-zinc-500">Breedte (mm)</Label>
                                                    <MeasurementInput className="h-7 text-xs" value={koof.diepte} onChange={(v) => onUpdate(koof.id, { diepte: Number(v) || 0 })} />
                                                </div>
                                            </div>

                                            {(() => {
                                                const vL = Number(koof.vanLinks) || 0;
                                                const vO = Number(koof.vanOnder) || 0;
                                                const kL = Number(koof.lengte) || 0;
                                                const kH = Number(koof.hoogte) || 0;
                                                const kD = Number(koof.diepte) || 0;
                                                const orientation = koof.orientation || 'side';

                                                let sides = 3;
                                                const rectWMm = orientation === 'side' ? kH : kL;
                                                const rectHMm = orientation === 'side' ? kL : kH;

                                                if (wallLength > 0 && (vL === 0 || Math.abs(vL + rectWMm - wallLength) < 2)) {
                                                    sides = 2;
                                                }
                                                if (wallHeight > 0 && (vO === 0 || Math.abs(vO + rectHMm - wallHeight) < 2)) {
                                                    sides = 2;
                                                }

                                                // Update item if sides changed
                                                if (koof.aantalZijden !== sides) {
                                                    setTimeout(() => onUpdate(koof.id, { aantalZijden: sides }), 0);
                                                }

                                                return (
                                                    <div className="px-2 py-1 rounded bg-emerald-500/5 border border-emerald-500/10 inline-flex items-center">
                                                        <span className="text-[10px] text-emerald-500/80 font-medium">
                                                            Positie: {sides === 2 ? 'Hoek' : 'Midden'} ({sides} zijden)
                                                        </span>
                                                    </div>
                                                );
                                            })()}

                                            {/* Orientation toggle */}
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Positie</Label>
                                                <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                                    <button
                                                        type="button"
                                                        onClick={() => onUpdate(koof.id, { orientation: 'side' })}
                                                        className={cn(
                                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                                            orientation === 'side' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                                                        )}
                                                    >
                                                        Verticaal
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onUpdate(koof.id, { orientation: 'top' })}
                                                        className={cn(
                                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                                            orientation === 'top' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                                                        )}
                                                    >
                                                        Horizontaal
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Position fields */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-zinc-500">V. Links (mm)</Label>
                                                    <MeasurementInput className="h-7 text-xs" value={koof.vanLinks ?? ''} onChange={(v) => onUpdate(koof.id, { vanLinks: Number(v) || 0 })} />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-zinc-500">V. Onder (mm)</Label>
                                                    <MeasurementInput className="h-7 text-xs" value={koof.vanOnder ?? ''} onChange={(v) => onUpdate(koof.id, { vanOnder: Number(v) || 0 })} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={onAdd}
                                    className="w-full h-8 text-[10px] text-zinc-500 hover:text-emerald-400 justify-center gap-2 border border-dashed border-white/10"
                                >
                                    <PlusCircle className="h-3.5 w-3.5" />
                                    Extra leidingkoof
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
