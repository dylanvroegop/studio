import React, { useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Trash2, PlusCircle } from 'lucide-react';
import { MeasurementInput } from '@/components/MeasurementInput';

interface DagkantItem {
    id: string;
    openingId?: string | null;
    lengte: number | string;
    diepte: number | string;
}

interface DagkantSectionProps {
    dagkanten: DagkantItem[];
    onAdd: () => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<DagkantItem>) => void;
    isCollapsed?: boolean;
    onToggleCollapsed?: () => void;
}

export function DagkantSection({
    dagkanten,
    onAdd,
    onDelete,
    onUpdate,
    isCollapsed = true,
    onToggleCollapsed,
}: DagkantSectionProps) {
    const addedRef = useRef(false);

    const ensureFirstItem = () => {
        if (dagkanten.length === 0 && !addedRef.current) {
            addedRef.current = true;
            onAdd();
            setTimeout(() => { addedRef.current = false; }, 100);
        }
    };

    return (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
            <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                onClick={onToggleCollapsed}
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-200">Dagkanten</span>
                    {isCollapsed && dagkanten.length > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            {dagkanten.length} dagkant{dagkanten.length !== 1 ? 'en' : ''}
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
                        {dagkanten.length === 0 ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                        <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Diepte (mm)</Label>
                                        <MeasurementInput className="h-7 text-xs" value="" onFocus={ensureFirstItem} onChange={() => ensureFirstItem()} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {dagkanten.map((dk, dIdx) => (
                                    <div
                                        key={dk.id}
                                        className={`space-y-4 animate-in fade-in slide-in-from-top-1 ${dIdx > 0 ? 'pt-3 border-t border-white/5' : ''}`}
                                    >
                                        {dagkanten.length > 1 && (
                                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                <span className="text-[10px] uppercase font-bold text-zinc-400">Dagkant {dIdx + 1}</span>
                                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-red-400" onClick={() => onDelete(dk.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                                <MeasurementInput className="h-7 text-xs" value={dk.lengte} onChange={(v) => onUpdate(dk.id, { lengte: Number(v) || 0 })} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Diepte (mm)</Label>
                                                <MeasurementInput className="h-7 text-xs" value={dk.diepte} onChange={(v) => onUpdate(dk.id, { diepte: Number(v) || 0 })} />
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
                                    Extra dagkant
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
