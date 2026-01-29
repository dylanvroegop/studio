import React from 'react';
import { useMeasurementUnit } from '@/context/MeasurementUnitContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2 } from 'lucide-react';
import { MeasurementInput } from '@/components/MeasurementInput';
import { cn } from '@/lib/utils'; // Assuming cn utility exists

export interface OpeningConstructionOptions {
    dblStijl: boolean;
    trimmer: boolean;
    dblBovendorpel: boolean;
    dblOnderdorpel: boolean;
    dagkanten?: boolean;
}

export interface OpeningData {
    id: string;
    type: string;
    width: number;
    height: number;
    fromLeft: number;
    fromBottom: number;
    // Construction properties
    dubbeleStijlLinks?: boolean;
    dubbeleStijlRechts?: boolean;
    trimmer?: boolean;
    headerDikte?: number;
    dubbeleBovendorpel?: boolean;
    dubbeleOnderdorpel?: boolean;
    onderdorpel?: boolean;
    onderdorpelDikte?: number;
    // New fields
    dagkanten?: boolean;
    dagkantenDiepte?: number;
}

interface OpeningCardProps {
    opening: OpeningData;
    index: number;
    openingNumber: number;
    typeOptions: string[]; // e.g., ['window', 'door-frame', 'door', 'opening', 'other']
    constructionOptions: OpeningConstructionOptions;
    onUpdate: (updatedOpening: OpeningData) => void;
    onDelete: () => void;
    // Additional context passing mimicking local vars in the original page
    isWallCategory: boolean;
    isCeilingCategory: boolean;
    categorySlug: string; // Used for some labels/options
}

export function OpeningCard({
    opening,
    index,
    openingNumber,
    typeOptions, // Note: The page currently hardcodes these based on category. We might just pass the list.
    constructionOptions,
    onUpdate,
    onDelete,
    isWallCategory,
    isCeilingCategory,
    categorySlug,
}: OpeningCardProps) {
    // We can pass options list or cleaner logic, but let's stick to the page logic for "Type" SELECT for now 
    // or accept the prompt's `typeOptions` string array and map it? 
    // The page has complex logic for SelectItem values (window, door-frame, etc).
    // The prompt says: prop `typeOptions: array of available types`

    // Let's implement the internal logic of the card largely as it was.

    const handleTypeChange = (value: string) => {
        let w = opening.width;
        let h = opening.height;

        // Apply sizing defaults when type changes
        if (value === 'window') { w = 1000; h = 1000; }
        else if (value === 'door-frame') { w = 930; h = 2115; } // Keeping legacy support if needed
        else if (value === 'frame-inner') { w = 930; h = 2115; } // Standard NL binnendeur kozijn size approx
        else if (value === 'frame-outer') { w = 1000; h = 2200; } // Standard NL buitendeur/kozijn size approx
        else if (value === 'door') { w = 830; h = 2015; }
        else if (value === 'opening') { w = 1000; h = 1000; }

        onUpdate({ ...opening, type: value, width: w, height: h });
    };

    return (
        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">Opening {openingNumber}</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={onDelete}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="space-y-3">
                <div className="w-full">
                    <Select
                        value={opening.type}
                        onValueChange={handleTypeChange}
                    >
                        <SelectTrigger className="h-9 w-full bg-zinc-900/50 border-white/10">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            {/* 
                    We should probably make this dynamic based on props, 
                    but for Step 1 (Refactor only), I'll copy the logic from the page 
                    or rely on the `typeOptions` prop if I can map it back to these values.
                    
                    The prompt says: typeOptions: ['Raamkozijn', 'Deurkozijn', 'Sparing']
                    The code uses values: 'window', 'door-frame', 'opening'.
                    
                    I will re-implement the conditional rendering from the page for now 
                    to ensure parity, as "typeOptions" prop might need a custom object to map label->value.
                */}
                            {isWallCategory ? (
                                <>
                                    <SelectItem value="window">Raamkozijn</SelectItem>
                                    <SelectItem value="frame-inner">Binnen kozijn</SelectItem>
                                    <SelectItem value="frame-outer">Buiten kozijn</SelectItem>
                                    <SelectItem value="door">Deur</SelectItem>
                                    <SelectItem value="opening">Sparing</SelectItem>
                                    <SelectItem value="other">Overig</SelectItem>
                                </>
                            ) : isCeilingCategory || categorySlug === 'vloeren' ? (
                                <>
                                    <SelectItem value="opening">Sparing</SelectItem>
                                    <SelectItem value="hatch">Luik</SelectItem>
                                    <SelectItem value="pillar">Pilaar</SelectItem>
                                    <SelectItem value="other">Overig</SelectItem>
                                </>
                            ) : (
                                <>
                                    <SelectItem value="dakraam">Dakraam</SelectItem>
                                    <SelectItem value="lichtkoepel">Lichtkoepel</SelectItem>
                                    <SelectItem value="schoorsteen">Schoorsteen</SelectItem>
                                    <SelectItem value="opening">Sparing</SelectItem>
                                    <SelectItem value="other">Overig</SelectItem>
                                </>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-zinc-500">Breedte</Label>
                        <MeasurementInput
                            className="h-8 text-sm"
                            value={opening.width}
                            onChange={(v) => onUpdate({ ...opening, width: Number(v) || 0 })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-zinc-500">Hoogte</Label>
                        <MeasurementInput
                            className="h-8 text-sm"
                            value={opening.height}
                            onChange={(v) => onUpdate({ ...opening, height: Number(v) || 0 })}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-zinc-500">V. Links</Label>
                        <MeasurementInput
                            className="h-8 text-sm"
                            value={opening.fromLeft}
                            onChange={(v) => onUpdate({ ...opening, fromLeft: Number(v) || 0 })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-zinc-500">V. Onder</Label>
                        <MeasurementInput
                            className="h-8 text-sm"
                            value={opening.fromBottom}
                            onChange={(v) => onUpdate({ ...opening, fromBottom: Number(v) || 0 })}
                        />
                    </div>
                </div>

                {/* HSB Construction Logic */}
                {isWallCategory && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <Label className="text-[10px] uppercase text-zinc-500 font-bold">Constructie</Label>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                            {constructionOptions.dblStijl && (
                                <div className="col-span-2 space-y-1">
                                    <Label className="text-[10px] text-zinc-400">Dubbele Stijl</Label>
                                    <Select
                                        value={
                                            opening.dubbeleStijlLinks && opening.dubbeleStijlRechts ? 'both' :
                                                opening.dubbeleStijlLinks ? 'left' :
                                                    opening.dubbeleStijlRechts ? 'right' : 'none'
                                        }
                                        onValueChange={(val) => {
                                            onUpdate({
                                                ...opening,
                                                dubbeleStijlLinks: val === 'left' || val === 'both',
                                                dubbeleStijlRechts: val === 'right' || val === 'both'
                                            });
                                        }}
                                    >
                                        <SelectTrigger className="h-8 text-xs bg-black/20 border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Geen</SelectItem>
                                            <SelectItem value="left">Links</SelectItem>
                                            <SelectItem value="right">Rechts</SelectItem>
                                            <SelectItem value="both">Beide</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {constructionOptions.trimmer && (
                                <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                    <Label className="text-[10px] text-zinc-400">Trimmer</Label>
                                    <Switch
                                        checked={opening.trimmer || false}
                                        onCheckedChange={(c) => onUpdate({ ...opening, trimmer: c })}
                                        className="scale-75 origin-right"
                                    />
                                </div>
                            )}

                            {constructionOptions.dblBovendorpel && (
                                <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                    <Label className="text-[10px] text-zinc-400">Dbl. Boven</Label>
                                    <Switch
                                        checked={opening.dubbeleBovendorpel || false}
                                        onCheckedChange={(c) => onUpdate({ ...opening, dubbeleBovendorpel: c })}
                                        className="scale-75 origin-right"
                                    />
                                </div>
                            )}

                            {constructionOptions.dblOnderdorpel && (
                                <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                    <Label className="text-[10px] text-zinc-400">Dbl. Onder</Label>
                                    <Switch
                                        checked={opening.dubbeleOnderdorpel || false}
                                        onCheckedChange={(c) => onUpdate({ ...opening, dubbeleOnderdorpel: c })}
                                        className="scale-75 origin-right"
                                    />
                                </div>
                            )}

                            {constructionOptions.dagkanten && (
                                <div className="col-span-2 pt-2 border-t border-white/5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] uppercase text-zinc-500 font-bold">Dagkanten</Label>
                                        <Switch
                                            checked={opening.dagkanten || false}
                                            onCheckedChange={(c) => onUpdate({ ...opening, dagkanten: c })}
                                            className="scale-75 origin-right"
                                        />
                                    </div>
                                    {opening.dagkanten && (
                                        <div className="space-y-1 animate-in slide-in-from-top-1">
                                            <Label className="text-[10px] text-zinc-400">Diepte (mm)</Label>
                                            <MeasurementInput
                                                className="h-7 text-xs"
                                                value={opening.dagkantenDiepte}
                                                onChange={(v) => onUpdate({ ...opening, dagkantenDiepte: Number(v) || 0 })}
                                                placeholder="Bijv. 200"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Onderdorpel Logic for Doors - Keep existing logic conditional as per original? 
            Original only checked for type 'door' or 'door-frame'. 
            It didn't explicitly check 'isWallCategory' but was nested inside the map.
            However, the 'isWallCategory' check wraps the "Constructie" block.
            The door logic (Lines 648) was outside the "Constructie" block (Lines 566-645) in the original.
        */}
                {(opening.type === 'door' || opening.type === 'door-frame' || opening.type === 'frame-inner' || opening.type === 'frame-outer') && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-zinc-400">Onderdorpel</Label>
                            <Switch
                                checked={opening.onderdorpel || false}
                                onCheckedChange={(c) => onUpdate({
                                    ...opening,
                                    onderdorpel: c,
                                    onderdorpelDikte: c ? 20 : 0
                                })}
                                className="scale-75 origin-right"
                            />
                        </div>
                        {opening.onderdorpel && (
                            <div className="space-y-1 animation-in slide-in-from-top-1 fade-in duration-200">
                                <Label className="text-[10px] uppercase text-zinc-500">Dikte (mm)</Label>
                                <MeasurementInput
                                    className="h-8 text-sm"
                                    value={opening.onderdorpelDikte}
                                    onChange={(v) => onUpdate({ ...opening, onderdorpelDikte: Number(v) || 0 })}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
