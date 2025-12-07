
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Trash2, Plus, Minus, Settings, AlertTriangle, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Quote, Preset as PresetType } from '@/lib/types';
import { getQuoteById } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { supabase } from '@/lib/supabase';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, addDoc, writeBatch, serverTimestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';


// ==================================
// Definities en Data
// ==================================
type Materiaal = {
  row_id: string;
  id: string;
  materiaalnaam: string;
  categorie: string | null;
  eenheid: string;
  prijs: number | string | null;
  sort_order: number | null;
  user_id: string;
};

type MateriaalKeuze = Omit<Materiaal, 'row_id' | 'user_id' | 'prijs'> & { prijs: number };

type ExtraMateriaal = {
  id: string;
  naam: string;
  eenheid: 'stuk' | 'm¹' | 'm²' | 'm³';
  lengteMm?: number;
  breedteMm?: number;
  hoogteMm?: number;
  prijsPerEenheid: number;
}

const sectieSleutels = ['balktype', 'isolatie', 'folie', 'binnenbekleding', 'buitenbekleding', 'gips_fermacell', 'kozijnen', 'deuren', 'naden_vullen', 'plinten', 'extra'] as const;
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
          <DialogTitle>Voorinstelling opslaan</DialogTitle>
          <DialogDescription>
            Sla de huidige materiaalconfiguratie op voor later gebruik bij HSB tussenwanden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="preset-name">Naam voorinstelling *</Label>
                <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Standaard tussenwand" />
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox id="default-preset" checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked as boolean)} />
                <Label htmlFor="default-preset">Maak dit mijn standaard voor HSB tussenwanden</Label>
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

type MateriaalKiezerModalProps = {
  open: boolean;
  sectieSleutel: SectieKey;
  geselecteerdMateriaalId?: string;
  onSluiten: () => void;
  onSelecteren: (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => void;
  openReorderModal: () => void;
  materialen: MateriaalKeuze[];
};

function MateriaalKiezerModal({ open, sectieSleutel, geselecteerdMateriaalId, onSluiten, onSelecteren, openReorderModal, materialen }: MateriaalKiezerModalProps) {
  const [zoekterm, setZoekterm] = useState('');
  
  const gefilterdeMaterialen = useMemo(() => {
    return materialen.filter(m => m.materiaalnaam.toLowerCase().includes(zoekterm.toLowerCase()));
  }, [zoekterm, materialen]);

  if (!open || !sectieSleutel) {
    return null;
  }

  const handleSelect = (materiaal: MateriaalKeuze) => {
    onSelecteren(sectieSleutel, materiaal);
    onSluiten();
  }

  return (
    <Dialog open={open} onOpenChange={onSluiten}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
            <DialogTitle>Kies materiaal</DialogTitle>
            <DialogDescription>Zoek op naam of kies uit de lijst.</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 border-b">
            <Input 
                type="text"
                placeholder={"Zoek op materiaalnaam..."}
                value={zoekterm}
                onChange={(e) => setZoekterm(e.target.value)}
            />
            <button onClick={openReorderModal} className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-3">
              Lijst opnieuw ordenen
            </button>
        </div>
        
        <div className="overflow-y-auto flex-1">
            <ul className="divide-y divide-border">
                {gefilterdeMaterialen.length > 0 ? gefilterdeMaterialen.map(materiaal => (
                    <li 
                        key={materiaal.id}
                        onClick={() => handleSelect(materiaal)}
                        className={cn("p-4 cursor-pointer hover:bg-muted/50 transition-colors", geselecteerdMateriaalId === materiaal.id && 'bg-muted')}
                    >
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium">{materiaal.materiaalnaam}</p>
                                <p className="text-sm text-muted-foreground">{materiaal.categorie}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm">{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(materiaal.prijs)}</p>
                                <p className="text-xs text-muted-foreground">per {materiaal.eenheid}</p>
                            </div>
                        </div>
                    </li>
                )) : (
                     <div className="p-8 text-center text-muted-foreground">
                        <p>Geen materialen gevonden die voldoen aan de criteria.</p>
                    </div>
                )}
            </ul>
        </div>

        <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ==================================
// Pagina Component
// ==================================

export default function HsbTussenwandMaterialenPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const quoteId = params.id as string;
  const JOB_TYPE = "hsb-tussenwand";
  
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
  const [gipsLagen, setGipsLagen] = useState(1);
  const [tempGipsLagen, setTempGipsLagen] = useState(1);
  
  // State for collapsible cards / hidden slots
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // State voor modals
  const [actieveSectie, setActieveSectie] = useState<SectieKey | null>(null);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [lagenModalOpen, setLagenModalOpen] = useState(false);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  
  const [onvolledigeSecties, setOnvolledigeSecties] = useState<Set<SectieKey>>(new Set());

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

  // Presets ophalen
  useEffect(() => {
    if (!user || !firestore) return;

    const fetchPresets = async () => {
      setPresetsLaden(true);
      try {
        const presetsRef = collection(firestore, 'presets');
        const q = query(presetsRef, where('userId', '==', user.uid), where('jobType', '==', JOB_TYPE));
        const querySnapshot = await getDocs(q);
        const fetchedPresets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PresetType));
        setPresets(fetchedPresets);

        const defaultPreset = fetchedPresets.find(p => p.isDefault);
        if (defaultPreset) {
          setGekozenPresetId(defaultPreset.id);
        } else {
          setGekozenPresetId('default');
        }
      } catch (error) {
        console.error("Fout bij ophalen presets:", error);
        toast({ variant: 'destructive', title: 'Fout', description: 'Kon presets niet laden.' });
      } finally {
        setPresetsLaden(false);
      }
    };

    fetchPresets();
  }, [user, firestore, toast]);
  
  // Gekozen preset toepassen
  useEffect(() => {
    if (gekozenPresetId === 'default') {
      // Reset naar leeg
      setGekozenMaterialen({});
      setCollapsedSections({});
      setGipsLagen(1);
      return;
    }
    
    // Wacht tot materialen geladen zijn
    if (alleMaterialen.length === 0) return;

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
    setGipsLagen(preset.gipsLagen || 1);
  }, [gekozenPresetId, presets, alleMaterialen]);

  // Set loading to false after a short delay to prevent flash of loading state
    useEffect(() => {
        const timer = setTimeout(() => {
            setMaterialenLaden(false);
        }, 50); // Small delay
        return () => clearTimeout(timer);
    }, []);


  const filterMaterialenVoorSectie = useCallback((sectieKey: SectieKey): MateriaalKeuze[] => {
      // Always return empty array as per user request
      return [];
  }, []);


  const openMateriaalKiezer = (sectieSleutel: SectieKey) => {
    setActieveSectie(sectieSleutel);
  };
  
  const sluitMateriaalKiezer = () => {
    setActieveSectie(null);
  };
  
  const openLagenKiezer = () => {
    setTempGipsLagen(gipsLagen);
    setLagenModalOpen(true);
  }

  const handleLagenOpslaan = () => {
    setGipsLagen(tempGipsLagen);
    setLagenModalOpen(false);
  }

  const handleMateriaalSelectie = (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => {
    setGekozenMaterialen(prev => ({ ...prev, [sectieSleutel]: materiaal }));
  };

  const handleMateriaalVerwijderen = (sectieSleutel: SectieKey) => {
    setGekozenMaterialen(prev => {
        const newState = { ...prev };
        delete newState[sectieSleutel];
        if (sectieSleutel === 'gips_fermacell') {
            setGipsLagen(1);
        }
        return newState;
    });
  };

  const handleSavePreset = async (presetName: string, isDefault: boolean) => {
    if (!user || !firestore) return;

    const slots: Record<string, string> = {};
    for (const key in gekozenMaterialen) {
        const materiaal = gekozenMaterialen[key];
        if (materiaal) {
            slots[key] = materiaal.id;
        }
    }
    
    const newPresetData: Omit<PresetType, 'id'> = {
        userId: user.uid,
        jobType: JOB_TYPE,
        name: presetName,
        isDefault: isDefault,
        slots: slots,
        collapsedSections: collapsedSections,
        gipsLagen: gipsLagen,
        createdAt: serverTimestamp() as any,
    };
    
    try {
        const batch = writeBatch(firestore);

        if (isDefault) {
            const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid), where('jobType', '==', JOB_TYPE), where('isDefault', '==', true));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(doc => {
                batch.update(doc.ref, { isDefault: false });
            });
        }
        
        const newDocRef = doc(collection(firestore, 'presets'));
        batch.set(newDocRef, newPresetData);

        await batch.commit();

        toast({ title: 'Voorinstelling opgeslagen', description: `"${presetName}" is succesvol opgeslagen.` });
        setSavePresetModalOpen(false);
        
        const newPreset = { id: newDocRef.id, ...newPresetData } as PresetType;
        setPresets(prev => [...prev.map(p => ({...p, isDefault: isDefault ? false : p.isDefault })), newPreset]);
        setGekozenPresetId(newDocRef.id);

    } catch (error) {
        console.error("Fout bij opslaan preset:", error);
        toast({ variant: 'destructive', title: 'Fout', description: 'Kon de voorinstelling niet opslaan.' });
    }
  };

  const isVolgendeIngeschakeld = useMemo(() => {
    const onvolledig = new Set<SectieKey>();
    for (const key of sectieSleutels) {
        const isGekozen = !!gekozenMaterialen[key];
        const isCollapsed = !!collapsedSections[key];
        if (!isGekozen && !isCollapsed) {
            onvolledig.add(key);
        }
    }
    setOnvolledigeSecties(onvolledig);
    return onvolledig.size === 0;
  }, [gekozenMaterialen, collapsedSections]);


  const renderSelectieRij = (sectieSleutel: SectieKey, titel: string, beschrijving?: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const isCollapsed = collapsedSections[sectieSleutel];
    const isIncompleet = onvolledigeSecties.has(sectieSleutel);

    if (isCollapsed) {
        return (
            <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4">
                <p className="text-sm font-medium">{titel} <span className="text-muted-foreground font-normal ml-2">· Niet van toepassing</span></p>
                <Button variant="link" size="sm" onClick={() => toggleSection(sectieSleutel)} className="h-auto p-0">Toon weer</Button>
            </div>
        );
    }
    
    return (
        <Card className={cn(isIncompleet && !isVolgendeIngeschakeld && "border-destructive/50 ring-2 ring-destructive/20")}>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">{titel}</CardTitle>
                    {beschrijving && <CardDescription>{beschrijving}</CardDescription>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => toggleSection(sectieSleutel)} className="h-8 w-8 text-muted-foreground">
                   <X className="h-4 w-4" />
                   <span className="sr-only">Verberg sectie</span>
                </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                 <div className="border-t pt-4">
                    {isMaterialenLaden ? (
                         <div className="h-10 bg-muted/50 rounded animate-pulse" />
                    ) : foutMaterialen ? (
                         <p className="text-sm text-destructive">Laden van materialen mislukt.</p>
                    ) : (
                         <div className="flex items-center justify-between min-h-[40px]">
                            <div>
                                {gekozenMateriaal ? (
                                <p className="text-sm text-primary">Gekozen: {gekozenMateriaal.materiaalnaam}</p>
                                ) : (
                                <p className="text-sm text-muted-foreground italic">Nog geen materiaal gekozen</p>
                                )}
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
                {(sectieSleutel === 'gips_fermacell' || sectieSleutel === 'buitenbekleding') && gekozenMateriaal && !isMaterialenLaden && (
                    <div className="mt-2 pl-1">
                        <button onClick={openLagenKiezer} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-foreground transition-colors">
                            <Settings className="w-3 h-3"/>
                            Lagen: {gipsLagen} (aanpassen)
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
  };
  
  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center justify-start">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link href={`/offertes/${quoteId}/klus/wanden/hsb-tussenwand`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Terug</span>
              </Link>
            </Button>
          </div>
          <h1 className="text-center font-semibold text-lg">Materialen: stap 5 van 6</h1>
          <div className="flex items-center justify-end">
            {isPaginaLaden ? (
              <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
            ) : quote ? (
              <p className="text-sm text-muted-foreground truncate">Offerte voor: {quote.clientName}</p>
            ) : null}
          </div>
        </header>
        
        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-2xl mx-auto w-full">
              <div className="text-center mb-8">
                   <h1 className="font-semibold text-2xl md:text-3xl">Materialen – HSB Tussenwand</h1>
                  <p className="text-muted-foreground mt-2">
                      Kies de materialen die u voor deze wand gebruikt. U kunt deze keuzes als voorinstelling opslaan.
                  </p>
              </div>
              
              <div className="mb-8">
                  <Label htmlFor='preset-select' className='text-xs text-muted-foreground'>Voorinstellingen</Label>
                  <div className="flex items-center gap-2">
                      <Select onValueChange={setGekozenPresetId} value={gekozenPresetId} disabled={isPresetsLaden}>
                          <SelectTrigger id='preset-select' className="h-9">
                              <SelectValue placeholder="Kies een voorinstelling..." />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="default">Standaard (leeg)</SelectItem>
                              {presets.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault && ' (standaard)'}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                      <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setGekozenPresetId('default')}
                          disabled={gekozenPresetId === 'default'}
                          className="text-muted-foreground"
                      >
                         <RotateCcw className="h-3.5 w-3.5 mr-2"/>
                          Reset
                      </Button>
                  </div>
              </div>


              <div className="space-y-4">
                {renderSelectieRij('balktype', 'Balktype')}
                {renderSelectieRij('isolatie', 'Isolatie')}
                {renderSelectieRij('folie', 'Folie')}
                {renderSelectieRij('binnenbekleding', 'Binnenbekleding (OSB)', 'OSB of andere constructieplaat')}
                {renderSelectieRij('buitenbekleding', 'Buitenbekleding (Gips)', 'Gips, Fermacell of andere afwerking')}
                {renderSelectieRij('kozijnen', 'Kozijnen')}
                {renderSelectieRij('deuren', 'Deuren')}
                {renderSelectieRij('naden_vullen', 'Naden vullen')}
                {renderSelectieRij('plinten', 'Plinten')}
                {renderSelectieRij('extra', 'Extra materiaal', 'Optionele extra materialen voor dit project.')}
              </div>
              
              <div className="mt-8">
                <Button variant="outline" onClick={() => setSavePresetModalOpen(true)} className="w-full">
                    <Save className="mr-2 h-4 w-4" />
                    Huidige keuzes opslaan voor volgende keer
                </Button>
              </div>


              <div className="mt-8 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/wanden/hsb-tussenwand`}>Terug</Link>
                  </Button>
                  <div>
                    <Button disabled={!isVolgendeIngeschakeld} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                        Volgende
                    </Button>
                   </div>
              </div>
                {!isVolgendeIngeschakeld && (
                    <p className="text-xs text-destructive text-right mt-2">
                        Vul de gemarkeerde keuzes in of markeer ze als ‘Niet van toepassing’.
                    </p>
                )}
          </div>
        </div>
      </main>

       <SavePresetDialog 
         open={savePresetModalOpen}
         onOpenChange={setSavePresetModalOpen}
         onSave={handleSavePreset}
       />

       {actieveSectie && <MateriaalKiezerModal
          open={!!actieveSectie}
          sectieSleutel={actieveSectie}
          geselecteerdMateriaalId={actieveSectie ? gekozenMaterialen[actieveSectie]?.id : undefined}
          onSluiten={sluitMateriaalKiezer}
          onSelecteren={handleMateriaalSelectie}
          materialen={filterMaterialenVoorSectie(actieveSectie)}
          openReorderModal={() => {
            sluitMateriaalKiezer();
            setReorderModalOpen(true);
          }}
      />}
      
       <Dialog open={lagenModalOpen} onOpenChange={setLagenModalOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Aantal lagen gips</DialogTitle>
                    <DialogDescription>
                        Standaard gebruiken we 1 laag. Pas dit alleen aan bij speciale situaties.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <div className="flex items-center justify-center gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12"
                            onClick={() => setTempGipsLagen(prev => Math.max(1, prev - 1))}
                        >
                            <Minus className="h-6 w-6" />
                        </Button>
                        <div className="flex h-12 w-24 items-center justify-center rounded-md border border-input bg-background text-2xl font-bold">
                            {tempGipsLagen}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12"
                            onClick={() => setTempGipsLagen(prev => Math.min(4, prev + 1))}
                        >
                            <Plus className="h-6 w-6" />
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setLagenModalOpen(false)}>Annuleren</Button>
                    <Button type="button" onClick={handleLagenOpslaan}>Opslaan</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}
