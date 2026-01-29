import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Eye, EyeOff } from 'lucide-react';
import { MeasurementInput } from '@/components/MeasurementInput';
import { cn } from '@/lib/utils';

interface BalkenOptionsConfig {
    dblEindbalk?: boolean;
    dblBovenbalk?: boolean;
    dblOnderbalk?: boolean;
    // potentially others
}

interface BalkenSectionProps {
    balkafstand: number;
    startFromRight: boolean;

    // Option values
    doubleEndBeams?: boolean;
    doubleTopPlate?: boolean;
    doubleBottomPlate?: boolean;
    surroundingBeams?: boolean;

    optionsConfig: BalkenOptionsConfig;
    onUpdate: (key: string, value: any) => void;

    // Context
    isWallCategory: boolean;
    jobSlug: string; // for surroundingBeams logic

    // Field definition for balkafstand (if we want to use DynamicInput logic or similar)
    // For now I will just use MeasurementInput for balkafstand to simplify dependency
}

export function BalkenSection({
    balkafstand,
    startFromRight,
    doubleEndBeams,
    doubleTopPlate,
    doubleBottomPlate,
    surroundingBeams,
    optionsConfig,
    onUpdate,
    isWallCategory,
    jobSlug
}: BalkenSectionProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
            <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-200">Balken</span>
                    {isCollapsed && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            {balkafstand}mm h.o.h
                        </span>
                    )}
                </div>
                <div className="text-zinc-500">
                    {isCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </div>
            </div>

            {!isCollapsed && (
                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                    <div className="pt-2 border-t border-white/5 space-y-4">

                        {/* Balkafstand Input */}
                        <div className="space-y-2">
                            <Label>Balkafstand (h.o.h)</Label>
                            <MeasurementInput
                                value={balkafstand}
                                onChange={v => onUpdate('balkafstand', v)}
                            // onKeyDown... 
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-xs">Startpositie</Label>
                            <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => onUpdate('startFromRight', false)}
                                    className={cn(
                                        "flex-1 text-xs py-1.5 rounded transition-colors",
                                        !startFromRight ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                >
                                    Links
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUpdate('startFromRight', true)}
                                    className={cn(
                                        "flex-1 text-xs py-1.5 rounded transition-colors",
                                        startFromRight ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                >
                                    Rechts
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-xs">Opties</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {isWallCategory && (
                                    <>
                                        {optionsConfig.dblEindbalk && (
                                            <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                                <Label className="text-[10px] text-zinc-400">Dbl. Eindbalk</Label>
                                                <Switch checked={doubleEndBeams || false} onCheckedChange={(c) => onUpdate('doubleEndBeams', c)} className="scale-75 origin-right" />
                                            </div>
                                        )}
                                        {optionsConfig.dblBovenbalk && (
                                            <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                                <Label className="text-[10px] text-zinc-400">Dbl. Bovenbalk</Label>
                                                <Switch checked={doubleTopPlate || false} onCheckedChange={(c) => onUpdate('doubleTopPlate', c)} className="scale-75 origin-right" />
                                            </div>
                                        )}
                                        {optionsConfig.dblOnderbalk && (
                                            <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                                <Label className="text-[10px] text-zinc-400">Dbl. Onderbalk</Label>
                                                <Switch checked={doubleBottomPlate || false} onCheckedChange={(c) => onUpdate('doubleBottomPlate', c)} className="scale-75 origin-right" />
                                            </div>
                                        )}
                                    </>
                                )}

                                {!jobSlug.includes('hellend-dak') && !isWallCategory && (
                                    <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                        <Label className="text-[10px] text-zinc-400">Kader (Rondom)</Label>
                                        <Switch checked={surroundingBeams || false} onCheckedChange={(c) => onUpdate('surroundingBeams', c)} className="scale-75 origin-right" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
