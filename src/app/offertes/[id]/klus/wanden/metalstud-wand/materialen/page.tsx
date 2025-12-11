
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Trash2, Plus, Minus, Settings, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Quote, Preset as PresetType, KleinMateriaalConfig } from '@/lib/types';
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
import { useUser, useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, query, where, getDocs, addDoc, writeBatch, serverTimestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';


// ==================================
// Definities en Data
// ==================================
type MateriaalKeuze = {
  id: string;
  materiaalnaam: string;
  categorie: string | null;
  eenheid: string;
  prijs: number;
};

const sectieSleutels = ['profielen', 'isolatie', 'folie', 'binnenbekleding', 'gips_fermacell', 'kozijnen', 'deuren', 'naden_vullen', 'plinten', 'extra', 'klein_materiaal'] as const;
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
            Sla de huidige materiaalconfiguratie op voor later gebruik bij Metalstud wanden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="preset-name">Naam voorinstelling *</Label>
                <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Standaard metalstud wand" />
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox id="default-preset" checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked as boolean)} />
                <Label htmlFor="default-preset">Maak dit mijn standaard voor Metalstud wanden</Label>
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
};

function MateriaalKiezerModal({ open, sectieSleutel, geselecteerdMateriaalId, onSluiten, onSelecteren }: MateriaalKiezerModalProps) {
  const [zoekterm, setZoekterm] = useState('');
  const [materialen, setMaterialen] = useState<MateriaalKeuze[]>([]);
  
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

export default function MetalstudWandMaterialenPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const quoteId = params.id as string;
  const JOB_TYPE = "metalstud-wand";
  
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
  const [kleinMateriaalConfig, setKleinMateriaalConfig] = useState<KleinMateriaalConfig>({ mode: 'percentage', percentage: 5, fixedAmount: null });
  
  // State for collapsible cards / hidden slots
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // State voor modals
  const [actieveSectie, setActieveSectie] = useState<SectieKey | null>(null);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);

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
  }, [user, firestore, toast, JOB_TYPE]);
  
  // Gekozen preset toepassen
  useEffect(() => {
    if (gekozenPresetId === 'default') {
      // Reset naar leeg
      setGekozenMaterialen({});
      setCollapsedSections({});
      setKleinMateriaalConfig({ mode: 'percentage', percentage: 5, fixedAmount: null });
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
    setKleinMateriaalConfig(preset.kleinMateriaalConfig || { mode: 'percentage', percentage: 5, fixedAmount: null });
  }, [gekozenPresetId, presets, alleMaterialen]);

  // Set loading to false after a short delay
    useEffect(() => {
        const timer = setTimeout(() => {
            setMaterialenLaden(false);
        }, 50);
        return () => clearTimeout(timer);
    }, []);


  const openMateriaalKiezer = (sectieSleutel: SectieKey) => {
    setActieveSectie(sectieSleutel);
  };
  
  const sluitMateriaalKiezer = () => {
    setActieveSectie(null);
  };
  
  const handleMateriaalSelectie = (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => {
    setGekozenMaterialen(prev => ({ ...prev, [sectieSleutel]: materiaal }));
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

  const isVolgendeIngeschakeld = true;

  const renderSelectieRij = (sectieSleutel: SectieKey, titel: string, beschrijving?: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const isCollapsed = collapsedSections[sectieSleutel];

    if (isCollapsed) {
        return (
            <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4">
                <p className="text-sm font-medium">{titel} <span className="text-muted-foreground font-normal ml-2">· Niet van toepassing</span></p>
                <Button variant="link" size="sm" onClick={() => toggleSection(sectieSleutel)} className="h-auto p-0">Toon weer</Button>
            </div>
        );
    }
    
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">{titel}</CardTitle>
                    {beschrijving && <CardDescription>{beschrijving}</CardDescription>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground">
                   Verberg
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
            </CardContent>
        </Card>
    );
  };
  
    const renderKleinMateriaalSectie = () => {
    const sectieSleutel: SectieKey = 'klein_materiaal';
    const isCollapsed = collapsedSections[sectieSleutel];

    if (isCollapsed) {
        return (
            <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4">
                <p className="text-sm font-medium">Klein materiaal <span className="text-muted-foreground font-normal ml-2">· Niet van toepassing</span></p>
                <Button variant="link" size="sm" onClick={() => toggleSection(sectieSleutel)} className="h-auto p-0 text-muted-foreground hover:text-foreground">Toon weer</Button>
            </div>
        );
    }
    
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="space-y-1.5">
                    <CardTitle className="text-lg">Klein materiaal</CardTitle>
                    <CardDescription>
                        Kies of je dit wilt berekenen via een percentage of een vast bedrag.
                    </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground hover:text-foreground">
                    Verberg
                </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="border-t pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            className={cn(
                                "p-4 rounded-lg border cursor-pointer",
                                kleinMateriaalConfig.mode === 'percentage' ? "border-primary bg-muted/30" : "hover:bg-muted/50"
                            )}
                            onClick={() => setKleinMateriaalConfig(prev => ({...prev, mode: 'percentage'}))}
                        >
                            <h4 className="font-semibold">Percentage (%)</h4>
                            <p className="text-sm text-muted-foreground">Reken een percentage van de totale materiaalkosten.</p>
                        </div>
                        <div
                            className={cn(
                                "p-4 rounded-lg border cursor-pointer",
                                kleinMateriaalConfig.mode === 'fixed' ? "border-primary bg-muted/30" : "hover:bg-muted/50"
                            )}
                            onClick={() => setKleinMateriaalConfig(prev => ({...prev, mode: 'fixed'}))}
                        >
                            <h4 className="font-semibold">Vast bedrag (€)</h4>
                            <p className="text-sm text-muted-foreground">Voeg een vast bedrag toe voor kleine materialen.</p>
                        </div>
                    </div>

                    {kleinMateriaalConfig.mode === 'percentage' && (
                        <div className="pt-2">
                            <Label htmlFor="percentage">Percentage</Label>
                            <div className="relative">
                                <Input
                                    id="percentage"
                                    type="number"
                                    step="0.1"
                                    className="pr-8"
                                    value={kleinMateriaalConfig.percentage ?? ''}
                                    onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                    onBlur={(e) => {
                                      if (e.target.value === '' || kleinMateriaalConfig.percentage === null) {
                                          setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: 5 });
                                      }
                                    }}
                                />
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">%</span>
                            </div>
                        </div>
                    )}

                    {kleinMateriaalConfig.mode === 'fixed' && (
                        <div className="pt-2">
                            <Label htmlFor="fixedAmount">Bedrag</Label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">€</span>
                                <Input
                                    id="fixedAmount"
                                    type="number"
                                    className="pl-7"
                                    placeholder="Bijv. 50"
                                    value={kleinMateriaalConfig.fixedAmount || ''}
                                    onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, fixedAmount: e.target.value ? Number(e.target.value) : null })}
                                />
                            </div>
                        </div>
                    )}
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
              <Link href={`/offertes/${quoteId}/klus/wanden/metalstud-wand`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Terug</span>
              </Link>
            </Button>
          </div>
          <h1 className="text-center font-semibold text-lg">Materialen: stap 5 van 6</h1>
          <div className="flex items-center justify-end">
            
          </div>
        </header>
        
        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-2xl mx-auto w-full">
              
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
                {renderSelectieRij('profielen', 'Metalstud Profielen')}
                {renderSelectieRij('isolatie', 'Isolatie')}
                {renderSelectieRij('osb_1', 'Constructieplaat (zijde 1)')}
                {renderSelectieRij('gips_1', 'Gips / Fermacell (zijde 1)')}
                {renderSelectieRij('osb_2', 'Constructieplaat (zijde 2)')}
                {renderSelectieRij('gips_2', 'Gips / Fermacell (zijde 2)')}
                {renderSelectieRij('kozijnen', 'Kozijnen')}
                {renderSelectieRij('deuren', 'Deuren')}
                {renderSelectieRij('naden_vullen', 'Naden vullen')}
                {renderSelectieRij('plinten', 'Plinten')}
                {renderSelectieRij('extra', 'Extra materiaal', 'Optionele extra materialen voor dit project.')}
                {renderKleinMateriaalSectie()}
              </div>
              
              <div className="mt-8">
                <Button variant="outline" onClick={() => setSavePresetModalOpen(true)} className="w-full">
                    <Save className="mr-2 h-4 w-4" />
                    Huidige keuzes opslaan voor volgende keer
                </Button>
              </div>


              <div className="mt-8 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/wanden/metalstud-tussenwand`}>Terug</Link>
                  </Button>
                  <div>
                    <Button disabled={!isVolgendeIngeschakeld} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                        Volgende
                    </Button>
                   </div>
              </div>
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
      />}
    </>
  );
}
