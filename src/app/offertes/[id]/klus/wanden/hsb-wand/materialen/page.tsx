
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Trash2, Plus, Minus, Settings, AlertTriangle, Save, RotateCcw, ChevronUp, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Quote, Preset as PresetType, KleinMateriaalConfig, ExtraMaterial } from '@/lib/types';
import { getQuoteById } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Reorder } from 'framer-motion';
import { useUser, useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, query, where, getDocs, addDoc, writeBatch, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { buttonVariants } from "@/components/ui/button";

// ==================================
// Definities en Data
// ==================================
type Material = {
  row_id: string;
  materiaalnaam: string;
  subsectie: string | null;
  eenheid: string;
  prijs: number | string | null;
};

type MateriaalKeuze = Omit<Material, 'prijs' | 'row_id'> & { prijs: number; id: string };

const sectieSleutels = ['balkhout', 'isolatie', 'houten plaatmateriaal', 'gips_fermacell', 'binnen kozijnen', 'binnen deuren', 'naden_vullen', 'naden_vullen_2', 'afwerkplinten', 'extra', 'klein_materiaal'] as const;
type SectieKey = typeof sectieSleutels[number];


// ==================================
// Modal Components
// ==================================

type SavePresetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (presetName: string, isDefault: boolean) => void;
};

function SavePresetDialog({ open, onOpenChange, onSave }: SavePresetDialogProps) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name) return;
    setIsSaving(true);
    await onSave(name, isDefault);
    setIsSaving(false);
    onOpenChange(false);
    // Reset state after closing
    setTimeout(() => {
        setName('');
        setIsDefault(false);
    }, 200);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Werkwijze opslaan</DialogTitle>
          <DialogDescription>
            Sla de huidige materiaalconfiguratie op voor later gebruik bij HSB wanden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="preset-name">Naam werkwijze *</Label>
                <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Standaard HSB wand" />
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox id="default-preset" checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked as boolean)} />
                <Label htmlFor="default-preset">Maak dit mijn standaard voor HSB wanden</Label>
            </div>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={handleSave} disabled={!name || isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? 'Opslaan...' : 'Opslaan'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ManagePresetsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PresetType[];
  onDelete: (preset: PresetType) => void;
  onSetDefault: (preset: PresetType) => void;
};

function ManagePresetsDialog({ open, onOpenChange, presets, onDelete, onSetDefault }: ManagePresetsDialogProps) {
  if (!presets || presets.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Werkwijzen beheren</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm py-8 text-center">Er zijn geen werkwijzen om te beheren.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Werkwijzen beheren</DialogTitle>
          <DialogDescription>
            Beheer hier uw opgeslagen werkwijzen voor dit klustype.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {presets.map(preset => (
            <div key={preset.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
              <span className="text-sm font-medium">{preset.name}
                {preset.isDefault && <span className="text-xs text-muted-foreground ml-2">(standaard)</span>}
              </span>
              <div className="flex items-center gap-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onSetDefault(preset)}
                    disabled={preset.isDefault}
                >
                    <Star className="mr-2 h-4 w-4" />
                    Maak standaard
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(preset)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Verwijderen
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


type MateriaalKiezerModalProps = {
  open: boolean;
  sectieSleutel: SectieKey;
  geselecteerdMateriaalId?: string;
  onSluiten: () => void;
  onSelecteren: (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => void;
  onAddExtra: (materiaal: ExtraMaterial) => void;
  materialen: MateriaalKeuze[];
};

const MateriaalKiezerModal = React.forwardRef<
  HTMLDivElement,
  MateriaalKiezerModalProps
>(({ open, sectieSleutel, geselecteerdMateriaalId, onSluiten, onSelecteren, materialen: initialMaterials, onAddExtra }, ref) => {
  const { user } = useUser();
  const { toast } = useToast();
  const [zoekterm, setZoekterm] = useState('');
  const [subsectieFilter, setSubsectieFilter] = useState('all');
  const [activeTab, setActiveTab] = useState("eigen");
  const [orderedMaterials, setOrderedMaterials] = useState(initialMaterials);
  const [favorieten, setFavorieten] = useState<string[]>([]);

  const FAVORITES_LIMIT = 30;

  // Helper functions for favorites
  const laadFavorieten = useCallback((uid: string): string[] => {
    if (typeof window === 'undefined') return [];
    try {
      const favs = localStorage.getItem(`offertehulp:favorieten:${uid}`);
      return favs ? JSON.parse(favs) : [];
    } catch (e) {
      console.error("Kon favorieten niet laden uit localStorage", e);
      return [];
    }
  }, []);

  const bewaarFavorieten = useCallback((uid: string, ids: string[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`offertehulp:favorieten:${uid}`, JSON.stringify(ids));
    } catch (e) {
      console.error("Kon favorieten niet opslaan in localStorage", e);
    }
  }, []);

  const isFavoriet = useCallback((id: string): boolean => {
    return favorieten.includes(id);
  }, [favorieten]);

  const toggleFavoriet = useCallback((id: string) => {
    if (!user) return;
    const currentFavorieten = laadFavorieten(user.uid);
    let nieuweFavorieten;
    if (currentFavorieten.includes(id)) {
      nieuweFavorieten = currentFavorieten.filter(favId => favId !== id);
    } else {
      if (currentFavorieten.length >= FAVORITES_LIMIT) {
        toast({
          variant: "destructive",
          title: "Limiet bereikt",
          description: `U kunt maximaal ${FAVORITES_LIMIT} favorieten opslaan.`,
        });
        return;
      }
      nieuweFavorieten = [...currentFavorieten, id];
    }
    bewaarFavorieten(user.uid, nieuweFavorieten);
    setFavorieten(nieuweFavorieten); // Optimistic UI update
  }, [user, laadFavorieten, bewaarFavorieten, toast]);

  useEffect(() => {
    if (user) {
      setFavorieten(laadFavorieten(user.uid));
    } else {
      setFavorieten([]);
    }
  }, [user, laadFavorieten]);

  useEffect(() => {
    setOrderedMaterials(initialMaterials);
  }, [initialMaterials]);

  const uniekeSubsecties = useMemo(() => {
      if (!initialMaterials) return [];
      const subsecties = initialMaterials.map(m => m.subsectie).filter(Boolean);
      // @ts-ignore
      return [...new Set(subsecties)].sort();
  }, [initialMaterials]);
  
  const gefilterdeMaterialen = useMemo(() => {
    if (!initialMaterials) return { favorieteResultaten: [], overigeResultaten: [] };

    let filtered = initialMaterials;

    if (zoekterm) {
        filtered = filtered.filter(m => 
            m.materiaalnaam.toLowerCase().includes(zoekterm.toLowerCase())
        );
    }

    if (subsectieFilter !== 'all') {
        filtered = filtered.filter(m => m.subsectie === subsectieFilter);
    }

    const favorieteResultaten = filtered.filter(m => isFavoriet(m.id));
    const overigeResultaten = filtered.filter(m => !isFavoriet(m.id));
    
    return { favorieteResultaten, overigeResultaten };
  }, [zoekterm, subsectieFilter, initialMaterials, isFavoriet]);


  const [eigenNaam, setEigenNaam] = useState('');
  const [eigenEenheid, setEigenEenheid] = useState<string>('');
  const [eigenPrijs, setEigenPrijs] = useState('');
  const [usageDescription, setUsageDescription] = useState('');
  const [aantal, setAantal] = useState<number | undefined>();
  const [lengte, setLengte] = useState('');
  const [breedte, setBreedte] = useState('');
  const [hoogte, setHoogte] = useState('');

  const [formErrors, setFormErrors] = useState({ naam: '', eenheid: '', prijs: '', usageDescription: '' });
  
  const showWarning = !!(eigenNaam || eigenEenheid || eigenPrijs || aantal);
  const requiresDescription = ['stuk', 'doos', 'set', 'uur', 'anders'].includes(eigenEenheid);

  useEffect(() => {
    if (open) {
        setEigenNaam('');
        setEigenEenheid('');
        setEigenPrijs('');
        setUsageDescription('');
        setAantal(undefined);
        setLengte('');
        setBreedte('');
        setHoogte('');
        setFormErrors({ naam: '', eenheid: '', prijs: '', usageDescription: '' });
        setZoekterm('');
        setActiveTab(sectieSleutel === 'extra' ? 'eigen' : 'lijst');
    }
  }, [open, sectieSleutel]);

  if (!open) {
    return null;
  }

  const handleSelect = (materiaal: MateriaalKeuze) => {
    onSelecteren(sectieSleutel, materiaal);
    onSluiten();
  }

  const handleAddEigenMateriaal = () => {
    const errors = { naam: '', eenheid: '', prijs: '', usageDescription: '' };
    let hasError = false;

    if (!eigenNaam) {
        errors.naam = 'Naam is verplicht';
        hasError = true;
    }
    if (!eigenEenheid) {
        errors.eenheid = 'Eenheid is verplicht';
        hasError = true;
    }
    const prijsNum = parseFloat(eigenPrijs);
    if (!eigenPrijs || isNaN(prijsNum) || prijsNum < 0) {
        errors.prijs = 'Geldige prijs is verplicht';
        hasError = true;
    }
    if (requiresDescription && !usageDescription.trim()) {
        errors.usageDescription = 'Beschrijf kort waar dit materiaal voor gebruikt wordt.';
        hasError = true;
    }

    setFormErrors(errors);

    if (hasError) return;

    const nieuwItem: ExtraMaterial = {
        id: crypto.randomUUID(),
        naam: eigenNaam,
        eenheid: eigenEenheid as any,
        prijsPerEenheid: prijsNum,
        aantal,
        usageDescription: usageDescription.trim()
    };
    onAddExtra(nieuwItem);
    onSluiten();
  };
  
    const eenheidLabel: Record<string, string> = {
      m1: "Prijs per meter (€)",
      m2: "Prijs per m² (€)",
      m3: "Prijs per m³ (€)",
      stuk: "Prijs per stuk (€)",
      doos: "Prijs per doos (€)",
      set: "Prijs per set (€)",
      uur: "Prijs per uur (€)",
      anders: "Prijs per eenheid (€)",
    };

  const isExtraMateriaal = sectieSleutel === 'extra';

  const renderMaterialList = (materials: MateriaalKeuze[]) => {
      return materials.map(materiaal => (
        <li
          key={materiaal.id}
          onClick={() => handleSelect(materiaal)}
          className={cn(
            "relative flex w-full cursor-pointer items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors",
            geselecteerdMateriaalId === materiaal.id && 'bg-muted'
          )}
        >
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 flex-shrink-0 rounded-full" 
            onClick={(e) => { e.stopPropagation(); toggleFavoriet(materiaal.id); }}
          >
              <Star className={cn("h-5 w-5", isFavoriet(materiaal.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50 hover:text-muted-foreground')} />
          </Button>
          <div className="flex-1 min-w-0">
             <p className={cn(
                  "font-medium break-words leading-tight", 
                  geselecteerdMateriaalId === materiaal.id && 'text-primary'
              )}>
                  {materiaal.materiaalnaam}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                  €{materiaal.prijs.toFixed(2)} • {materiaal.eenheid}
              </p>
              {materiaal.subsectie && <p className="text-xs text-muted-foreground">{materiaal.subsectie}</p>}
          </div>
        </li>
      ));
  };

  return (
    <Dialog open={open} onOpenChange={onSluiten}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
            <DialogTitle>Kies materiaal voor: {isExtraMateriaal ? "Extra Materiaal" : "de geselecteerde categorie"}</DialogTitle>
        </DialogHeader>

        {isExtraMateriaal ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6 pt-2 flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="eigen">Eigen materiaal toevoegen</TabsTrigger>
                    <TabsTrigger value="lijst">Uit lijst kiezen</TabsTrigger>
                </TabsList>
                <TabsContent value="eigen" className="pt-4 flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="space-y-2">
                        <Label htmlFor="eigen-naam">Materiaalnaam *</Label>
                        <Input id="eigen-naam" value={eigenNaam} onChange={(e) => setEigenNaam(e.target.value)} />
                        {formErrors.naam && <p className="text-sm text-destructive">{formErrors.naam}</p>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="eigen-eenheid">Eenheid *</Label>
                            <Select value={eigenEenheid} onValueChange={setEigenEenheid}>
                                <SelectTrigger id="eigen-eenheid">
                                    <SelectValue placeholder="Kies eenheid"/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="m1">m¹</SelectItem>
                                    <SelectItem value="m2">m²</SelectItem>
                                    <SelectItem value="m3">m³</SelectItem>
                                    <SelectItem value="stuk">stuk</SelectItem>
                                    <SelectItem value="doos">doos</SelectItem>
                                    <SelectItem value="set">set</SelectItem>
                                    <SelectItem value="uur">uur</SelectItem>
                                    <SelectItem value="anders">anders</SelectItem>
                                </SelectContent>
                            </Select>
                            {formErrors.eenheid && <p className="text-sm text-destructive">{formErrors.eenheid}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="eigen-prijs">{eenheidLabel[eigenEenheid] || 'Prijs per eenheid (€)'} *</Label>
                            <Input id="eigen-prijs" type="number" min="0" step="0.01" value={eigenPrijs} onChange={(e) => setEigenPrijs(e.target.value)} />
                            {formErrors.prijs && <p className="text-sm text-destructive">{formErrors.prijs}</p>}
                        </div>
                    </div>
                     <div className="mt-2 text-xs text-amber-400 p-3 bg-amber-950/80 border border-amber-900 rounded-md flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                            <span className="font-semibold">Controleer uw invoer.</span><br/>
                            Een verkeerde eenheid (bv. m² i.p.v. stuk) kan leiden tot een foutieve offerteberekening.
                        </div>
                    </div>
                    
                    {eigenEenheid === 'm1' && <div className="space-y-2"><Label>Lengte (m)</Label><Input type="number" value={lengte} onChange={e => setLengte(e.target.value)} /></div>}
                    {eigenEenheid === 'm2' && <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Lengte (m)</Label><Input type="number" value={lengte} onChange={e => setLengte(e.target.value)} /></div><div className="space-y-2"><Label>Breedte (m)</Label><Input type="number" value={breedte} onChange={e => setBreedte(e.target.value)} /></div></div>}
                    {eigenEenheid === 'm3' && <div className="grid grid-cols-3 gap-4"><div className="space-y-2"><Label>Lengte (m)</Label><Input type="number" value={lengte} onChange={e => setLengte(e.target.value)} /></div><div className="space-y-2"><Label>Breedte (m)</Label><Input type="number" value={breedte} onChange={e => setBreedte(e.target.value)} /></div><div className="space-y-2"><Label>Hoogte (m)</Label><Input type="number" value={hoogte} onChange={e => setHoogte(e.target.value)} /></div></div>}
                    {requiresDescription && <div className="space-y-2"><Label>Aantal</Label><Input type="number" value={aantal ?? ''} onChange={e => setAantal(parseInt(e.target.value, 10))} /></div>}
                    
                    {requiresDescription && (
                      <div className="space-y-2">
                        <Label htmlFor="usage-description">Beschrijving (gebruik) *</Label>
                        <Textarea id="usage-description" value={usageDescription} onChange={(e) => setUsageDescription(e.target.value)} placeholder="Waar wordt dit materiaal voor gebruikt? Dit helpt bij een correcte offerteberekening."/>
                        {formErrors.usageDescription && <p className="text-sm text-destructive">{formErrors.usageDescription}</p>}
                      </div>
                    )}
                </TabsContent>
                <TabsContent value="lijst" className="pt-4 flex-1 flex flex-col min-h-0">
                     <div className="flex gap-2 border-b pb-4">
                        <Input 
                            type="text"
                            placeholder={"Zoek op materiaalnaam..."}
                            value={zoekterm}
                            onChange={(e) => setZoekterm(e.target.value)}
                            className="w-full"
                        />
                         <Select value={subsectieFilter} onValueChange={setSubsectieFilter}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Subsectie" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Alle subsecties</SelectItem>
                                {uniekeSubsecties.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="overflow-y-auto flex-1 mt-4 max-h-[40vh]">
                        <ul className="divide-y divide-border">
                            {renderMaterialList(gefilterdeMaterialen.overigeResultaten)}
                        </ul>
                    </div>
                </TabsContent>
            </Tabs>
        ) : (
            <div className="p-6 pt-2 flex-1 flex flex-col min-h-0">
                <div className="flex gap-2 border-b pb-4">
                    <Input 
                        type="text"
                        placeholder={"Zoek op materiaalnaam..."}
                        value={zoekterm}
                        onChange={(e) => setZoekterm(e.target.value)}
                         className="w-full"
                    />
                    <Select value={subsectieFilter} onValueChange={setSubsectieFilter}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Subsectie" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle subsecties</SelectItem>
                            {uniekeSubsecties.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="overflow-y-auto flex-1 mt-4 max-h-[calc(80vh-200px)]">
                    <ul className="divide-y divide-border">
                        {gefilterdeMaterialen.favorieteResultaten.length > 0 && (
                          <>
                            <li className="px-4 py-2 bg-muted/50 font-semibold text-sm sticky top-0">Favorieten</li>
                            {renderMaterialList(gefilterdeMaterialen.favorieteResultaten)}
                            {gefilterdeMaterialen.overigeResultaten.length > 0 && <li className="py-2"><Separator /></li>}
                          </>
                        )}
                        {renderMaterialList(gefilterdeMaterialen.overigeResultaten)}
                        {initialMaterials.length === 0 && (
                             <div className="p-8 text-center text-muted-foreground">
                                <p>Geen materialen gevonden die voldoen aan de criteria.</p>
                            </div>
                        )}
                    </ul>
                </div>
            </div>
        )}
        
        <DialogFooter className="p-6 pt-0 mt-auto border-t">
            <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
            {isExtraMateriaal && activeTab === 'eigen' && (
                 <Button onClick={handleAddEigenMateriaal}>Materiaal toevoegen</Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
MateriaalKiezerModal.displayName = 'MateriaalKiezerModal';

// ==================================
// Pagina Component
// ==================================

export default function HsbWandMaterialenPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const quoteId = params.id as string;
  const JOB_TYPE = "hsb-wand";
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isPaginaLaden, setPaginaLaden] = useState(true);
  
  // State voor materialen
  const [alleMaterialen, setAlleMaterialen] = useState<MateriaalKeuze[]>([]);
  const [isMaterialenLaden, setMaterialenLaden] = useState(true);
  const [foutMaterialen, setFoutMaterialen] = useState<string | null>(null);
  
  // State voor presets
  const [presets, setPresets] = useState<PresetType[]>([]);
  const [gekozenPresetId, setGekozenPresetId] = useState<string>('default');
  const [isPresetsLaden, setPresetsLaden] = useState(true);
  
  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, MateriaalKeuze | undefined>>({});
  const [extraMaterials, setExtraMaterials] = useState<ExtraMaterial[]>([]);
  const [kleinMateriaalConfig, setKleinMateriaalConfig] = useState<KleinMateriaalConfig>({ mode: 'percentage', percentage: 5, fixedAmount: null });
  
  // State for collapsible cards / hidden slots
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // State voor modals
  const [actieveSectie, setActieveSectie] = useState<SectieKey | null>(null);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<PresetType | null>(null);
  const [managePresetsModalOpen, setManagePresetsModalOpen] = useState(false);


  const isVolgendeIngeschakeld = true;

  const toggleSection = (sectieSleutel: SectieKey) => {
    setCollapsedSections(prev => ({ ...prev, [sectieSleutel]: !prev[sectieSleutel] }));
  };

  // Quote data ophalen
  useEffect(() => {
    async function fetchQuote() {
      if (!quoteId) return;
      setPaginaLaden(true);
      const quoteData = await getQuoteById(quoteId);
      setQuote(quoteData || null);
      setPaginaLaden(false);
    }
    fetchQuote();
  }, [quoteId]);

  // Materialen ophalen uit Supabase
  useEffect(() => {
    if (user?.uid) {
        const fetchMaterials = async () => {
            setMaterialenLaden(true);
            const { data, error } = await supabase
                .from('materialen')
                .select('*')
                .eq('gebruikerid', user.uid);

            if (error) {
                console.error('Fout bij ophalen Supabase materialen:', error);
                setFoutMaterialen('Kon materialen niet laden.');
                setAlleMaterialen([]);
            } else {
                const getCorrectPrice = (p: string | number | null) => {
                    if (typeof p === 'number') return p;
                    if (typeof p === 'string') return parseFloat(p.replace(',', '.')) || 0;
                    return 0;
                }
                const materialenData = data.map(m => ({...m, id: m.row_id, prijs: getCorrectPrice(m.prijs)}));
                setAlleMaterialen(materialenData);
            }
            setMaterialenLaden(false);
        };
        fetchMaterials();
    }
  }, [user]);

  // Presets ophalen
  useEffect(() => {
    if (!user || !firestore) return;

    const fetchPresets = async () => {
      setPresetsLaden(true);
      const presetsRef = collection(firestore, 'presets');
      const q = query(presetsRef, where('userId', '==', user.uid), where('jobType', '==', JOB_TYPE));
      
      getDocs(q).then(querySnapshot => {
        const fetchedPresets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PresetType));
        setPresets(fetchedPresets);
        const defaultPreset = fetchedPresets.find(p => p.isDefault);
        if (defaultPreset) {
          setGekozenPresetId(defaultPreset.id);
        }
        setPresetsLaden(false);
      }).catch(serverError => {
        const permissionError = new FirestorePermissionError({
          path: presetsRef.path,
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setFoutMaterialen('Kon werkwijzen niet laden vanwege permissieproblemen.');
        setPresetsLaden(false);
      });
    };

    fetchPresets();
  }, [user, firestore, toast]);
  
  // Gekozen preset toepassen
  useEffect(() => {
    if (gekozenPresetId === 'default' || alleMaterialen.length === 0) {
      // Reset naar leeg
      setGekozenMaterialen({});
      setCollapsedSections({});
      setKleinMateriaalConfig({ mode: 'percentage', percentage: 5, fixedAmount: null });
      return;
    }
    const preset = presets.find(p => p.id === gekozenPresetId);
    if (!preset) return;
    const nieuweGekozenMaterialen: Record<string, MateriaalKeuze | undefined> = {};
    for (const slot in preset.slots) {
      const materiaalId = preset.slots[slot];
      const materiaal = alleMaterialen.find(m => m.id === materiaalId);
      if (materiaal) {
        nieuweGekozenMaterialen[slot] = materiaal;
      }
    }
    setGekozenMaterialen(nieuweGekozenMaterialen);
    setCollapsedSections(preset.collapsedSections || {});
    setKleinMateriaalConfig(preset.kleinMateriaalConfig || { mode: 'percentage', percentage: 5, fixedAmount: null });
  }, [gekozenPresetId, presets, alleMaterialen]);

  // Set loading to false after a short delay
    useEffect(() => {
        const timer = setTimeout(() => {
            setMaterialenLaden(false);
        }, 50); // Small delay
        return () => clearTimeout(timer);
    }, []);

    const subsectieMapping: Record<string, string> = {
        'balkhout': 'Balkhout',
        'isolatie': 'Isolatie',
        'houten plaatmateriaal': 'Houten plaatmateriaal',
        'gips_fermacell': 'Gips / Fermacell',
        'binnen kozijnen': 'Binnen kozijnen',
        'binnen deuren': 'Binnen deuren',
        'naden_vullen': 'Naden vullen',
        'naden_vullen_2': 'Naden vullen',
        'afwerkplinten': 'Afwerkplinten',
        'buitenbekleding': 'Gevelbekleding',
        'folie_buitenzijde': 'Folie',
    };

    const filterMaterialenVoorSectie = useCallback((sectieKey: SectieKey): MateriaalKeuze[] => {
      if (!alleMaterialen) return [];
      if (sectieKey === 'extra') return alleMaterialen;
      const subsectie = subsectieMapping[sectieKey];
      if (!subsectie) return alleMaterialen;
      return alleMaterialen.filter(m => m.subsectie === subsectie);
    }, [alleMaterialen]);


  const openMateriaalKiezer = (sectieSleutel: SectieKey) => {
    setActieveSectie(sectieSleutel);
  };
  
  const sluitMateriaalKiezer = () => {
    setActieveSectie(null);
  };
  
  const handleMateriaalSelectie = (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => {
    if (sectieSleutel === 'extra') {
        const newExtra: ExtraMaterial = {
            id: crypto.randomUUID(),
            naam: materiaal.materiaalnaam,
            eenheid: materiaal.eenheid as any, // Cast for simplicity, handle validation
            prijsPerEenheid: materiaal.prijs,
            usageDescription: '' // User needs to fill this in if it's from the list
        };
        setExtraMaterials(prev => [...prev, newExtra]);
    } else {
        setGekozenMaterialen(prev => ({ ...prev, [sectieSleutel]: materiaal }));
    }
  };
  
  const handleAddExtraMateriaal = (materiaal: ExtraMaterial) => {
      setExtraMaterials(prev => [...prev, materiaal]);
  };

  const handleRemoveExtraMaterial = (idToRemove: string) => {
      setExtraMaterials(prev => prev.filter(m => m.id !== idToRemove));
  };


  const handleMateriaalVerwijderen = (sectieSleutel: SectieKey) => {
    setGekozenMaterialen(prev => {
        const newState = { ...prev };
        delete newState[sectieSleutel];
        return newState;
    });
  };

  const handleSavePreset = async (presetName: string, isDefault: boolean) => {
    if (!user || !firestore) return;
    const slots: Record<string, string> = {};
    for (const key in gekozenMaterialen) {
        const materiaal = gekozenMaterialen[key];
        if (materiaal) slots[key] = materiaal.id;
    }
    
    const newPresetData: Omit<PresetType, 'id'> = {
        userId: user.uid, jobType: JOB_TYPE, name: presetName, isDefault: isDefault,
        slots: slots, collapsedSections: collapsedSections, kleinMateriaalConfig, createdAt: serverTimestamp() as any,
    };
    
    const batch = writeBatch(firestore);

    if (isDefault) {
        const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid), where('jobType', '==', JOB_TYPE), where('isDefault', '==', true));
        getDocs(q).then(querySnapshot => {
            querySnapshot.forEach(doc => batch.update(doc.ref, { isDefault: false }));
        }).catch(serverError => {
            const permissionError = new FirestorePermissionError({
              path: `presets`, // Simplified path for batch update context
              operation: 'list', // The initial operation that failed
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    }
    
    const newDocRef = doc(collection(firestore, 'presets'));
    batch.set(newDocRef, newPresetData);

    batch.commit().then(() => {
        toast({ title: 'Werkwijze opgeslagen', description: `Werkwijze "${presetName}" is succesvol opgeslagen.` });
        setSavePresetModalOpen(false);
        const newPreset = { id: newDocRef.id, ...newPresetData } as PresetType;
        setPresets(prev => [...prev.map(p => ({...p, isDefault: isDefault ? false : p.isDefault })), newPreset]);
        setGekozenPresetId(newDocRef.id);
    }).catch(serverError => {
        const permissionError = new FirestorePermissionError({
          path: newDocRef.path,
          operation: 'create',
          requestResourceData: newPresetData,
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleDeletePreset = async () => {
    if (!presetToDelete || !firestore) return;
    
    const docRef = doc(firestore, 'presets', presetToDelete.id);
    try {
      await deleteDoc(docRef);
      toast({
        title: 'Werkwijze verwijderd',
        description: `De werkwijze "${presetToDelete.name}" is verwijderd.`,
      });
      setPresets(prev => prev.filter(p => p.id !== presetToDelete.id));
      if (gekozenPresetId === presetToDelete.id) {
          setGekozenPresetId('default'); // Reset to default if the deleted one was selected
      }
    } catch (error) {
      console.error('Fout bij verwijderen werkwijze:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon werkwijze niet verwijderen.',
      });
    } finally {
      setDeleteConfirmationOpen(false);
      setPresetToDelete(null);
      setManagePresetsModalOpen(false); // Close the management modal as well
    }
  };
  
    const handleSetDefaultPreset = async (presetToSet: PresetType) => {
    if (!user || !firestore || presetToSet.isDefault) return;
    
    const batch = writeBatch(firestore);
    
    // Find and unset the current default
    const currentDefault = presets.find(p => p.isDefault);
    if (currentDefault) {
      const currentDefaultRef = doc(firestore, 'presets', currentDefault.id);
      batch.update(currentDefaultRef, { isDefault: false });
    }
    
    // Set the new default
    const newDefaultRef = doc(firestore, 'presets', presetToSet.id);
    batch.update(newDefaultRef, { isDefault: true });
    
    try {
      await batch.commit();
      toast({
        title: 'Standaard ingesteld',
        description: `"${presetToSet.name}" is nu de standaard werkwijze.`,
      });
      // Optimistically update local state
      setPresets(prev => 
        prev.map(p => ({
          ...p,
          isDefault: p.id === presetToSet.id,
        }))
      );
    } catch (error) {
      console.error("Fout bij instellen standaard werkwijze:", error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon de standaard werkwijze niet instellen.',
      });
    }
  };

  const renderSelectieRij = (sectieSleutel: SectieKey, titel: string, beschrijving?: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const isCollapsed = collapsedSections[sectieSleutel];

    if (isCollapsed) {
        return (
            <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4 shadow-[inset_0_0_4px_rgba(0,0,0,0.35)]">
                <p className={cn("text-sm font-medium text-muted-foreground")}>{titel} <span className="font-normal ml-2">· Niet van toepassing</span></p>
                <Button variant="link" size="sm" onClick={() => toggleSection(sectieSleutel)} className="h-auto p-0 text-muted-foreground hover:text-foreground flex items-center gap-1">Toon weer <ChevronRight className="h-4 w-4" /></Button>
            </div>
        );
    }
    
    if (sectieSleutel === 'naden_vullen') {
        const gekozenMateriaal1 = gekozenMaterialen['naden_vullen'];
        const gekozenMateriaal2 = gekozenMaterialen['naden_vullen_2'];

        return (
            <Card className={cn(gekozenMateriaal1 && gekozenMateriaal2 ? "" : "border-l-2 border-l-destructive")}>
                <CardHeader className="flex flex-row items-center justify-between p-4">
                    <div className="space-y-1.5"><CardTitle className="text-lg">{titel}</CardTitle></div>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">Verberg <ChevronUp className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    {/* First material */}
                    <div className="border-t pt-4">
                        <div className="flex items-center justify-between min-h-[40px]">
                            <div><p className={cn("text-sm", gekozenMateriaal1 ? 'text-muted-foreground' : 'text-destructive italic')}>
                                {gekozenMateriaal1 ? gekozenMateriaal1.materiaalnaam : 'Nog geen materiaal gekozen'}
                            </p></div>
                            <div className="flex items-center gap-2">
                                {gekozenMateriaal1 && <Button variant="ghost" size="icon" onClick={() => handleMateriaalVerwijderen('naden_vullen')} className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                                <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer('naden_vullen')}>{gekozenMateriaal1 ? 'Wijzigen' : 'Kiezen'}</Button>
                            </div>
                        </div>
                    </div>
                    {/* Second material */}
                    <div className="border-t pt-4 mt-4">
                        <div className="flex items-center justify-between min-h-[40px]">
                            <div><p className={cn("text-sm", gekozenMateriaal2 ? 'text-muted-foreground' : 'text-destructive italic')}>
                               {gekozenMateriaal2 ? gekozenMateriaal2.materiaalnaam : 'Nog geen materiaal gekozen'}
                            </p></div>
                            <div className="flex items-center gap-2">
                                {gekozenMateriaal2 && <Button variant="ghost" size="icon" onClick={() => handleMateriaalVerwijderen('naden_vullen_2')} className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                                <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer('naden_vullen_2')}>{gekozenMateriaal2 ? 'Wijzigen' : 'Kiezen'}</Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    if (sectieSleutel === 'naden_vullen_2') return null; // Don't render this key on its own

    if (sectieSleutel === 'extra') {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between p-4">
                    <div className="space-y-1.5">
                        <CardTitle className="text-lg">{titel}</CardTitle>
                    </div>
                     <Button variant="ghost" size="sm" onClick={() => openMateriaalKiezer('extra')} className="text-primary hover:text-primary/80">
                       <Plus className="mr-2 h-4 w-4" /> Toevoegen
                    </Button>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="border-t pt-4">
                        {extraMaterials.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Nog geen extra materiaal toegevoegd</p>
                        ) : (
                            <ul className="space-y-3">
                                {extraMaterials.map(mat => (
                                    <li key={mat.id} className="flex items-start justify-between text-sm">
                                        <div>
                                            <p className="font-medium">{mat.naam} – €{mat.prijsPerEenheid.toFixed(2)} / {mat.eenheid}</p>
                                            {mat.usageDescription && <p className="text-xs text-muted-foreground">{mat.usageDescription}</p>}
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveExtraMaterial(mat.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className={cn(gekozenMateriaal ? "" : "border-l-2 border-l-primary")}>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="space-y-1.5">
                    <CardTitle className="text-lg">{titel}</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                   Verberg <ChevronUp className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                 <div className="border-t pt-4">
                    {isMaterialenLaden ? <div className="h-10 bg-muted/50 rounded animate-pulse" /> : (
                         <div className="flex items-center justify-between min-h-[40px]">
                            <div>
                                {gekozenMateriaal ? <p className="text-sm text-muted-foreground">{gekozenMateriaal.materiaalnaam}</p> : <p className="text-sm text-primary italic">Nog geen materiaal gekozen</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                {gekozenMateriaal && (
                                <Button variant="ghost" size="icon" onClick={() => handleMateriaalVerwijderen(sectieSleutel)} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Verwijder materiaal">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer(sectieSleutel)}>
                                {gekozenMateriaal ? 'Wijzigen' : 'Kiezen'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
  };
  
    const renderKleinMateriaalSectie = () => {
    const sectieSleutel: SectieKey = 'klein_materiaal';
    const isCollapsed = collapsedSections[sectieSleutel];
    const isFilled = kleinMateriaalConfig.mode === 'fixed' ? (kleinMateriaalConfig.fixedAmount !== null && kleinMateriaalConfig.fixedAmount > 0) : (kleinMateriaalConfig.percentage !== null && kleinMateriaalConfig.percentage > 0);

    if (isCollapsed) {
        return (
            <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4 shadow-[inset_0_0_4px_rgba(0,0,0,0.35)]">
                <p className={cn("text-sm font-medium text-muted-foreground")}>Klein materiaal <span className="font-normal ml-2">· Niet van toepassing</span></p>
                <Button variant="link" size="sm" onClick={() => toggleSection(sectieSleutel)} className="h-auto p-0 text-muted-foreground hover:text-foreground flex items-center gap-1">Toon weer <ChevronRight className="h-4 w-4" /></Button>
            </div>
        );
    }
    
    return (
        <Card className={cn(isFilled ? "" : "border-l-2 border-l-primary")}>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="space-y-1.5">
                    <CardTitle className="text-lg">Klein materiaal</CardTitle>
                    <CardDescription>
                        Kies of je dit wilt berekenen via een percentage of een vast bedrag.
                    </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                    Verberg <ChevronUp className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="border-t pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            className={cn(
                                "p-4 rounded-lg border cursor-pointer space-y-2",
                                kleinMateriaalConfig.mode === 'percentage' ? "border-primary bg-muted/30" : "hover:bg-muted/50"
                            )}
                            onClick={() => setKleinMateriaalConfig(prev => ({...prev, mode: 'percentage'}))}
                        >
                            <h4 className="font-semibold">Percentage (%)</h4>
                            <p className="text-sm text-muted-foreground">Reken een percentage van de totale materiaalkosten.</p>
                            {kleinMateriaalConfig.mode === 'percentage' && (
                                <div className="pt-2">
                                    <Label htmlFor="percentage">Percentage</Label>
                                    <div className="relative">
                                        <Input
                                            id="percentage"
                                            type="number"
                                            step="0.1"
                                            className="w-full pr-8"
                                            value={kleinMateriaalConfig.percentage ?? ''}
                                            onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                            onBlur={(e) => {
                                              if (e.target.value === '' || kleinMateriaalConfig.percentage === null) {
                                                  setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: 5 });
                                              }
                                            }}
                                        />
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground pointer-events-none">%</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div
                            className={cn(
                                "p-4 rounded-lg border cursor-pointer space-y-2",
                                kleinMateriaalConfig.mode === 'fixed' ? "border-primary bg-muted/30" : "hover:bg-muted/50"
                            )}
                            onClick={() => setKleinMateriaalConfig(prev => ({...prev, mode: 'fixed'}))}
                        >
                            <h4 className="font-semibold">Vast bedrag (€)</h4>
                            <p className="text-sm text-muted-foreground">Voeg een vast bedrag toe voor kleine materialen.</p>
                            {kleinMateriaalConfig.mode === 'fixed' && (
                                <div className="pt-2">
                                    <Label htmlFor="fixedAmount">Bedrag</Label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground pointer-events-none">€</span>
                                        <Input
                                            id="fixedAmount"
                                            type="number"
                                            className="w-full pl-7"
                                            placeholder="Bijv. 50"
                                            value={kleinMateriaalConfig.fixedAmount || ''}
                                            onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, fixedAmount: e.target.value ? Number(e.target.value) : null })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
  };
  
  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="grid h-auto items-center grid-cols-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-center justify-start">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link href={`/offertes/${quoteId}/klus/wanden/hsb-wand`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Terug</span>
              </Link>
            </Button>
          </div>
          <div className="col-start-2 flex flex-col items-center text-center">
            <h1 className="font-semibold text-lg">HSB Wand</h1>
            <p className="text-xs text-muted-foreground">stap 5 van 6</p>
          </div>
          <div className="flex items-center justify-end">
            {isPaginaLaden ? <div className="h-4 bg-muted rounded w-32 animate-pulse"></div> : null}
          </div>
        </header>
        
        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-2xl mx-auto w-full">
              
              <div className="mb-8 space-y-2">
                <Label htmlFor='preset-select'>Gekozen werkwijze</Label>
                <div className="flex items-center gap-2">
                    <Select onValueChange={setGekozenPresetId} value={gekozenPresetId} disabled={isPresetsLaden}>
                        <SelectTrigger id='preset-select'>
                            <SelectValue placeholder="Kies een werkwijze..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Nieuw</SelectItem>
                            {presets.map(p => (<SelectItem key={p.id} value={p.id}>
                                <div className="flex items-center justify-between w-full">
                                <span>{p.name}{p.isDefault && " (standaard)"}</span>
                                </div>
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setManagePresetsModalOpen(true)}
                      disabled={presets.length === 0}
                      aria-label="Beheer werkwijzen"
                    >
                       <Settings className="h-4 w-4" />
                    </Button>
                </div>
              </div>

              <div className="space-y-4">
                {renderSelectieRij('balkhout', 'Balkhout')}
                {renderSelectieRij('isolatie', 'Isolatie')}
                {renderSelectieRij('houten plaatmateriaal', 'Houten plaatmateriaal')}
                {renderSelectieRij('gips_fermacell', 'Gips / Fermacell')}
                {renderSelectieRij('binnen kozijnen', 'Binnen kozijnen')}
                {renderSelectieRij('binnen deuren', 'Binnen deuren')}
                {renderSelectieRij('naden_vullen', 'Naden vullen')}
                {renderSelectieRij('afwerkplinten', 'Afwerkplinten')}
                
                 {renderSelectieRij('extra', 'Extra materiaal')}

                 {renderKleinMateriaalSectie()}
              </div>

              <div className="mt-8">
                <Button variant="outline" onClick={() => setSavePresetModalOpen(true)} className="w-full">
                    <Save className="mr-2 h-4 w-4" /> Huidige keuzes opslaan voor volgende keer
                </Button>
              </div>

              <div className="mt-8 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/wanden/hsb-wand`}>Terug</Link>
                  </Button>
                  <Button disabled={!isVolgendeIngeschakeld} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                      Volgende
                  </Button>
              </div>
          </div>
        </div>
      </main>

       <ManagePresetsDialog 
         open={managePresetsModalOpen}
         onOpenChange={setManagePresetsModalOpen}
         presets={presets}
         onDelete={(preset) => {
           setPresetToDelete(preset);
           setDeleteConfirmationOpen(true);
         }}
         onSetDefault={handleSetDefaultPreset}
       />

       <AlertDialog open={deleteConfirmationOpen} onOpenChange={setDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              U staat op het punt om de werkwijze "{presetToDelete?.name}" te verwijderen. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePreset} className={buttonVariants({ variant: "destructive" })}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       <SavePresetDialog 
         open={savePresetModalOpen}
         onOpenChange={setSavePresetModalOpen}
         onSave={handleSavePreset}
       />

       <MateriaalKiezerModal
          ref={null}
          open={!!actieveSectie}
          sectieSleutel={actieveSectie as SectieKey}
          geselecteerdMateriaalId={actieveSectie && actieveSectie !== 'extra' ? gekozenMaterialen[actieveSectie]?.id : undefined}
          onSluiten={sluitMateriaalKiezer}
          onSelecteren={handleMateriaalSelectie}
          onAddExtra={handleAddExtraMateriaal}
          materialen={actieveSectie ? filterMaterialenVoorSectie(actieveSectie) : []}
      />
    </>
  );
}
