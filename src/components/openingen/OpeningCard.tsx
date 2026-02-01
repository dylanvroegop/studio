import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, PlusCircle } from 'lucide-react';
import { MeasurementInput } from '@/components/MeasurementInput';

export interface OpeningConstructionOptions {
    dblStijl: boolean;
    trimmer: boolean;
    dblBovendorpel: boolean;
    dblOnderdorpel: boolean;
}

export interface OpeningData {
    id: string;
    type: string;
    width: number;
    height: number;
    fromLeft: number;
    fromBottom: number;
    dubbeleStijlLinks?: boolean;
    dubbeleStijlRechts?: boolean;
    trimmer?: boolean;
    headerDikte?: number;
    dubbeleBovendorpel?: boolean;
    dubbeleOnderdorpel?: boolean;
    onderdorpel?: boolean;
    onderdorpelDikte?: number;
}

export interface Leidingkoof {
    id: string;
    lengte: number | string;
    hoogte: number | string;
    diepte: number | string;
}

export interface Dagkant {
    id: string;
    openingId: string;
    diepte: number | string;
    lengte?: number | string;
}

export interface Vensterbank {
    id: string;
    openingId: string;
    diepte: number | string;
    uitstekLinks: number | string;
    uitstekRechts: number | string;
    lengte?: number | string;
}

interface OpeningCardProps {
    opening: OpeningData;
    openingNumber: number;
    constructionOptions: OpeningConstructionOptions;
    onUpdate: (updatedOpening: OpeningData) => void;
    onDelete: () => void;

    dagkanten: Dagkant[];
    vensterbanken: Vensterbank[];
    onAddDagkant: (openingId: string) => void;
    onDeleteDagkant: (id: string) => void;
    onUpdateDagkant: (id: string, updates: Partial<Dagkant>) => void;
    onAddVensterbank: (openingId: string) => void;
    onDeleteVensterbank: (id: string) => void;
    onUpdateVensterbank: (id: string, updates: Partial<Vensterbank>) => void;

    isWallCategory: boolean;
    isCeilingCategory: boolean;
    categorySlug: string;
}

export function OpeningCard({
    opening,
    openingNumber,
    constructionOptions,
    onUpdate,
    onDelete,
    dagkanten,
    vensterbanken,
    onAddDagkant,
    onDeleteDagkant,
    onUpdateDagkant,
    onAddVensterbank,
    onDeleteVensterbank,
    onUpdateVensterbank,
    isWallCategory,
    isCeilingCategory,
    categorySlug,
}: OpeningCardProps) {

    const openingDagkant = dagkanten.find(d => d.openingId === opening.id);
    const openingVensterbank = vensterbanken.find(v => v.openingId === opening.id);

    const handleTypeChange = (value: string) => {
        let w = opening.width;
        let h = opening.height;

        if (value === 'window') { w = 1000; h = 1000; }
        else if (value === 'frame-inner') { w = 930; h = 2115; }
        else if (value === 'frame-outer') { w = 1000; h = 2200; }
        else if (value === 'door') { w = 830; h = 2015; }
        else if (value === 'opening') { w = 1000; h = 1000; }

        onUpdate({
            ...opening,
            type: value,
            width: w,
            height: h,
        });
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
                    <Select value={opening.type} onValueChange={handleTypeChange}>
                        <SelectTrigger className="h-9 w-full bg-zinc-900/50 border-white/10">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
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

                {isWallCategory && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <Label className="text-[10px] uppercase text-zinc-500 font-bold">Constructie</Label>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                            {constructionOptions.dblStijl && (
                                <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                    <Label className="text-[10px] text-zinc-400">Dubbele Stijl</Label>
                                    <Switch
                                        checked={(opening.dubbeleStijlLinks && opening.dubbeleStijlRechts) || false}
                                        onCheckedChange={(c) => onUpdate({
                                            ...opening,
                                            dubbeleStijlLinks: c,
                                            dubbeleStijlRechts: c
                                        })}
                                        className="scale-75 origin-right"
                                    />
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
                        </div>
                    </div>
                )}

                {/* Linked Dagkant & Vensterbank Section */}
                {isWallCategory && opening.type !== 'opening' && opening.type !== 'other' && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        {/* Dagkant */}
                        {openingDagkant ? (
                            <div className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 space-y-3 animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <Label className="text-[10px] uppercase font-bold text-zinc-400">Dagkant</Label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-zinc-500 hover:text-red-400"
                                        onClick={() => onDeleteDagkant(openingDagkant.id)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Diepte (mm)</Label>
                                        <MeasurementInput
                                            className="h-7 text-xs"
                                            value={openingDagkant.diepte}
                                            onChange={(v) => onUpdateDagkant(openingDagkant.id, { diepte: Number(v) || 0 })}
                                            placeholder="100"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500">Lengte (mm)</Label>
                                        <MeasurementInput
                                            className="h-7 text-xs"
                                            value={openingDagkant.lengte}
                                            onChange={(v) => onUpdateDagkant(openingDagkant.id, { lengte: Number(v) || 0 })}
                                            placeholder={`${(opening.height * 2 + opening.width)}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onAddDagkant(opening.id)}
                                className="w-full h-8 text-[10px] text-zinc-500 hover:text-emerald-400 justify-start px-2 gap-2"
                            >
                                <PlusCircle className="h-3.5 w-3.5" />
                                Dagkant toevoegen
                            </Button>
                        )}

                        {/* Vensterbank - Only for windows */}
                        {opening.type === 'window' && (
                            openingVensterbank ? (
                                <div className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 space-y-3 animate-in fade-in slide-in-from-top-1">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <Label className="text-[10px] uppercase font-bold text-zinc-400">Vensterbank</Label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-zinc-500 hover:text-red-400"
                                            onClick={() => onDeleteVensterbank(openingVensterbank.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-zinc-500">Diepte (mm)</Label>
                                            <MeasurementInput
                                                className="h-7 text-xs"
                                                value={openingVensterbank.diepte}
                                                onChange={(v) => onUpdateVensterbank(openingVensterbank.id, { diepte: Number(v) || 0 })}
                                                placeholder="200"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Uitsteek L (mm)</Label>
                                                <MeasurementInput
                                                    className="h-7 text-xs"
                                                    value={openingVensterbank.uitstekLinks}
                                                    onChange={(v) => onUpdateVensterbank(openingVensterbank.id, { uitstekLinks: Number(v) || 0 })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-zinc-500">Uitsteek R (mm)</Label>
                                                <MeasurementInput
                                                    className="h-7 text-xs"
                                                    value={openingVensterbank.uitstekRechts}
                                                    onChange={(v) => onUpdateVensterbank(openingVensterbank.id, { uitstekRechts: Number(v) || 0 })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 space-y-2 pt-1">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-zinc-500 font-normal">Totale Lengte (mm)</Label>
                                            <MeasurementInput
                                                className="h-7 text-xs"
                                                value={openingVensterbank.lengte}
                                                onChange={(v) => onUpdateVensterbank(openingVensterbank.id, { lengte: Number(v) || 0 })}
                                                placeholder={`${(opening.width + (Number(openingVensterbank.uitstekLinks) || 0) + (Number(openingVensterbank.uitstekRechts) || 0))}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onAddVensterbank(opening.id)}
                                    className="w-full h-8 text-[10px] text-zinc-500 hover:text-emerald-400 justify-start px-2 gap-2"
                                >
                                    <PlusCircle className="h-3.5 w-3.5" />
                                    Vensterbank toevoegen
                                </Button>
                            )
                        )}
                    </div>
                )}

                {(opening.type === 'door' || opening.type === 'frame-inner' || opening.type === 'frame-outer') && (
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
