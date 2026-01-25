/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps, prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */

import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { COMPONENT_REGISTRY } from '@/lib/component-registry';
import { JOB_REGISTRY } from '@/lib/job-registry';
import { JobComponent, JobComponentType } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface JobComponentsManagerProps {
    components: JobComponent[];
    onChange: (components: JobComponent[]) => void;
    disabled?: boolean;
    limitToType?: string; // Optional: Only allow adding/managing this specific type
    forceOpen?: boolean; // Optional: Control the modal state externally
    onOpenChange?: (open: boolean) => void; // Optional: Callback for external modal state
    hideAddButton?: boolean; // Optional: Hide the internal add button if controlled externally
    renderList?: boolean;
    externalEditingId?: string | null;
    onEditingIdChange?: (id: string | null) => void;
}

export function JobComponentsManager({
    components,
    onChange,
    disabled,
    limitToType,
    forceOpen,
    onOpenChange,
    hideAddButton,
    renderList = true,
    externalEditingId,
    onEditingIdChange
}: JobComponentsManagerProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    // Determine the effective open state: external > internal
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : internalOpen;

    const setOpen = (val: boolean) => {
        if (onOpenChange) {
            onOpenChange(val);
        } else {
            setInternalOpen(val);
        }
    };

    const [selectedType, setSelectedType] = useState<string>('');
    const [tempMeasurements, setTempMeasurements] = useState<Record<string, any>>({});

    // Controlled vs Uncontrolled editingId
    const [internalEditingId, setInternalEditingId] = useState<string | null>(null);
    const editingId = typeof externalEditingId !== 'undefined' ? externalEditingId : internalEditingId;

    const setEditingId = (id: string | null) => {
        if (onEditingIdChange) onEditingIdChange(id);
        else setInternalEditingId(id);
    };

    // Effect to initialize state when opening and cleanup when closing
    React.useEffect(() => {
        if (isOpen) {
            if (limitToType) {
                setSelectedType(limitToType);
            }
        } else {
            // Reset state when closed so next open is fresh
            setEditingId(null);
            setTempMeasurements({});
        }
    }, [isOpen, limitToType]);

    const handleOpen = () => {
        setSelectedType(limitToType || '');
        setTempMeasurements({});
        setEditingId(null);
        setOpen(true);
    };

    const handleEdit = (comp: JobComponent) => {
        setSelectedType(comp.type);
        // Fallback to legacy 'measurements' if specific one is missing
        const measurements = (comp as any)[`measurements_${comp.type}`] || comp.measurements || {};
        setTempMeasurements({ ...measurements, _variantMode: !!comp.slug }); // If it has a slug, treat as variant mode to skip list
        setEditingId(comp.id);
        setOpen(true);
    };

    const handleSave = () => {
        if (!selectedType) return;

        const { _variantMode, subtitle, ...actualMeasurements } = tempMeasurements;
        const config = COMPONENT_REGISTRY[selectedType];

        // Determine label: Use subtitle (variant name) if available, otherwise default logic
        let baseLabel = subtitle || config.title;

        const newLabel = editingId
            ? components.find(c => c.id === editingId)?.label || baseLabel
            : `${baseLabel} ${components.filter(c => c.type === selectedType && c.id !== editingId).length + 1}`;

        // Lookup slug from JOB_REGISTRY if applicable
        let matchedItem: any = null;
        if (selectedType === 'kozijn' || selectedType === 'deur') {
            const prevComp = editingId ? components.find(c => c.id === editingId) : null;
            const prevMeasurements = prevComp ? ((prevComp as any)[`measurements_${selectedType}`] || prevComp.measurements) : null;
            const variantTitle = subtitle || (prevMeasurements?.subtitle);
            if (variantTitle) {
                // Determine which category to search.
                if (selectedType === 'kozijn') {
                    matchedItem = JOB_REGISTRY.kozijnen.items.find((i: any) => i.title === variantTitle);
                } else if (selectedType === 'deur') {
                    matchedItem = JOB_REGISTRY.deuren.items.find((i: any) => i.title === variantTitle);
                }
            }
        }

        const newItem: JobComponent = {
            id: editingId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
            type: selectedType as JobComponentType,
            label: newLabel,
            // measurements: {}, // Removed duplicate 
            // Assuming JobComponent has [key: string]: any or we just use measurements for now but ALSO add the specific key?
            // User requested "measurements_${type}".
            // Let's store BOTH or just the specific one?
            // "currently it stores ... under 'maatwerk' ... I want ... slug + maatwerk ... component ... doing the same thing"
            // If I change 'measurements' to {} and put data in `measurements_${type}`, I need to update the interface or cast.
            // Let's start by storing it in the dynamic key AND 'measurements' for compatibility if feasible, OR just dynamic key if we update readers.
            // I'll assume we want to Move away from 'measurements'.
            // So:
            [`measurements_${selectedType}`]: { ...actualMeasurements, subtitle },
            measurements: { ...actualMeasurements, subtitle }, // Keeping this for UI compatibility in other places for now? 
            // User said: "maybe doing the same thing? it already has 'type' in there but to be safe"
            // If I duplicate, it is safe.
            slug: matchedItem?.slug || (editingId ? components.find(c => c.id === editingId)?.slug : undefined),
        };

        if (editingId) {
            onChange(components.map((c) => (c.id === editingId ? newItem : c)));
        } else {
            onChange([...components, newItem]);
        }
        setOpen(false);
    };

    const handleDelete = (id: string) => {
        onChange(components.filter((c) => c.id !== id));
    };

    return (
        <div className="space-y-4">
            {/* Only show header if NOT limited to a type (assuming parent handles header in that case) */}
            {!limitToType && (
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Box className="w-5 h-5" />
                        Extra Onderdelen
                    </h3>
                    <Button onClick={handleOpen} variant="outline" size="sm" disabled={disabled}>
                        <Plus className="w-4 h-4 mr-2" />
                        Onderdeel toevoegen
                    </Button>
                </div>
            )}

            {/* If limited to type, show a dedicated add button at the top if list is empty or always? 
                Actually, the user wants a "+ Kozijn toevoegen" button which implies the list might be empty initially. 
                Let's stick to the list view first. 
            */}

            {limitToType && !hideAddButton && (
                <div className="flex justify-end mb-2">
                    <Button onClick={handleOpen} variant="ghost" size="sm" disabled={disabled} className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50">
                        <Plus className="w-4 h-4 mr-2" />
                        {COMPONENT_REGISTRY[limitToType]?.title || 'Onderdeel'} toevoegen
                    </Button>
                </div>
            )}

            {renderList && (
                <div className="grid grid-cols-1 gap-3">
                    {components.filter(c => !limitToType || c.type === limitToType).map((comp) => {
                        const config = COMPONENT_REGISTRY[comp.type];
                        return (
                            <Card key={comp.id} className="relative group hover:border-emerald-500/50 transition-colors">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-secondary/30 flex items-center justify-center">
                                            <Box className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">{comp.label}</div>
                                            <div className="text-xs text-muted-foreground">{config?.title}</div>
                                            <div className="text-xs text-muted-foreground mt-1 flex gap-2 flex-wrap">
                                                {(() => {
                                                    const m = (comp as any)[`measurements_${comp.type}`] || comp.measurements || {};
                                                    return Object.entries(m).filter(([k]) => k !== 'subtitle' && k !== '_variantMode').map(([k, v]) => (
                                                        <span key={k} className="bg-secondary px-1.5 py-0.5 rounded text-[10px]">
                                                            {k}: {v as React.ReactNode}
                                                        </span>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(comp)} disabled={disabled}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(comp.id)} disabled={disabled} className="text-destructive hover:text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
            {/* Only show empty state if NOT limited to a type. 
                    If limited, the parent container handles the "add" interaction via the header, 
                    so we don't need a placeholder here. 
                */}
            {renderList && !limitToType && components.filter(c => !limitToType || c.type === limitToType).length === 0 && (
                <div className="text-center py-8 border border-dashed rounded-xl bg-muted/20 text-muted-foreground text-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={handleOpen}>
                    Nog geen onderdelen toegevoegd.
                </div>
            )}

            <Dialog open={isOpen} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Onderdeel aanpassen' : 'Onderdeel toevoegen'}</DialogTitle>
                        <DialogDescription>
                            Voeg losse bouwelementen toe aan deze klus.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            {/* IF limitToType is set, special flow: Select Variant -> Then Measurements */}
                            {!limitToType ? (
                                <>
                                    <Label>Type onderdeel</Label>
                                    <Select
                                        value={selectedType}
                                        onValueChange={(val) => {
                                            setSelectedType(val);
                                            setTempMeasurements({});
                                        }}
                                        disabled={!!editingId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Kies een type..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(COMPONENT_REGISTRY).map(([key, config]) => (
                                                <SelectItem key={key} value={key}>
                                                    {config.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            ) : (
                                selectedType && COMPONENT_REGISTRY[selectedType] ? (
                                    <div className="text-sm font-medium text-muted-foreground mb-2">
                                        {/* If we are in measurement mode, just show title */}
                                        {editingId ? 'Onderdeel aanpassen' : `Nieuw ${COMPONENT_REGISTRY[limitToType]?.title}`}
                                    </div>
                                ) : (
                                    // This branch shouldn't be reached if we set selectedType in useEffect, 
                                    // UNLESS we want to show the list *before* setting selectedType?
                                    // Actually, let's change the state logic.
                                    // If limitToType is set, we want to show a custom "Variant Selector" if it's a new item.
                                    null
                                )
                            )}
                        </div>

                        {/* SELECTION LIST (Step 1) */}
                        {(limitToType === 'kozijn' || limitToType === 'deur') && !editingId && !tempMeasurements._variantMode && (
                            <div className="grid grid-cols-1 gap-2">
                                {(limitToType === 'kozijn' ? [
                                    { title: 'Binnendeur Kozijnen – Hout', desc: 'Kant-en-klaar element' },
                                    { title: 'Binnen Kozijnen – Staal', desc: 'Kant-en-klaar element' },
                                    { title: 'Buiten kozijnen – Hout', desc: 'Kant-en-klaar element' },
                                    { title: 'Buiten Kozijnen – Kunststof', desc: 'Kant-en-klaar element' },
                                    { title: 'Zelf gemaakte houtkozijnen', desc: 'Productie in eigen werkplaats' },
                                    { title: 'Overig Kozijnen', desc: 'Renovatie of reparatie' },
                                    { title: 'Waterslagen / Dorpels', desc: 'Vervangen van waterslagen of...' }
                                ] : [
                                    { title: 'Binnendeuren', desc: 'Stomp of opdek' },
                                    { title: 'Buitendeuren', desc: 'Voordeur/Achterdeur' },
                                    { title: 'Schuifdeuren', desc: 'Schuifdeuren systeem' },
                                    { title: 'Overig Deuren', desc: 'Afwijkend deurwerk' }
                                ]).map((variant, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                                        onClick={() => {
                                            // Select logic
                                            setTempMeasurements(prev => ({ ...prev, _variantMode: true, subtitle: variant.title }));
                                            // selectedType is already 'kozijn' from useEffect
                                        }}
                                    >
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium group-hover:text-emerald-500 transition-colors">{variant.title}</div>
                                            <div className="text-xs text-muted-foreground">{variant.desc}</div>
                                        </div>
                                        <div className="h-6 w-6 rounded-full border flex items-center justify-center group-hover:border-emerald-500 group-hover:text-emerald-500">
                                            <Plus className="h-3 w-3" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* MEASUREMENTS (Step 2 or Default) */}
                        {selectedType && COMPONENT_REGISTRY[selectedType] && ((limitToType !== 'kozijn' && limitToType !== 'deur') || editingId || tempMeasurements._variantMode) && (
                            <div className="space-y-4 mt-2 border-t pt-4">
                                {/* Werkwijze selector removed - now shown inline on the materials page */}

                                <div className="text-sm font-medium">Specificaties</div>
                                {(() => {
                                    let fields = COMPONENT_REGISTRY[selectedType].measurements;

                                    // Helper to lookup variant measurements
                                    if (selectedType === 'kozijn' || selectedType === 'deur') {
                                        const prevComp = editingId ? components.find(c => c.id === editingId) : null;
                                        const prevMeasurements = prevComp ? ((prevComp as any)[`measurements_${selectedType}`] || prevComp.measurements) : null;
                                        const variantTitle = tempMeasurements.subtitle || prevMeasurements?.subtitle;
                                        if (variantTitle) {
                                            let matchedItem: any = null;
                                            if (selectedType === 'kozijn') matchedItem = JOB_REGISTRY.kozijnen.items.find((i: any) => i.title === variantTitle);
                                            else if (selectedType === 'deur') matchedItem = JOB_REGISTRY.deuren.items.find((i: any) => i.title === variantTitle);

                                            if (matchedItem && matchedItem.measurements) {
                                                fields = matchedItem.measurements;
                                            }
                                        }
                                    }

                                    return fields.map((field) => (
                                        <div key={field.key} className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor={field.key} className="text-right col-span-1 text-xs sm:text-sm">
                                                {field.label}
                                            </Label>

                                            {field.type === 'textarea' ? (
                                                <div className="col-span-3">
                                                    <textarea
                                                        id={field.key}
                                                        placeholder={field.placeholder}
                                                        value={tempMeasurements[field.key] || ''}
                                                        onChange={(e) => setTempMeasurements(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="col-span-3 relative">
                                                    <Input
                                                        id={field.key}
                                                        type={field.type === 'number' ? 'number' : 'text'}
                                                        placeholder={field.placeholder}
                                                        value={tempMeasurements[field.key] || ''}
                                                        onChange={(e) => setTempMeasurements(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                        className="h-9"
                                                    />
                                                    {field.suffix && (
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                                            {field.suffix}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} className="mr-auto">Annuleren</Button>
                        {/* Only show Save button if NOT in the selection step */}
                        {!((limitToType === 'kozijn' || limitToType === 'deur') && !editingId && !tempMeasurements._variantMode) && (
                            <Button onClick={handleSave} disabled={!selectedType} variant="success">Opslaan</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
