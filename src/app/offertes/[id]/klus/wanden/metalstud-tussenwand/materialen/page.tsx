'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Trash2, Plus, Minus, Settings, AlertTriangle, PlusCircle, Edit, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Quote } from '@/lib/types';
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
import { useUser } from '@/firebase';


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

const sectieSleutels = ['profielen', 'isolatie', 'osb_1', 'osb_2', 'gips_1', 'gips_2', 'kozijnen', 'deuren', 'naden_vullen', 'plinten', 'extra'] as const;
type SectieKey = typeof sectieSleutels[number];


// ==================================
// Modal Components
// ==================================

type ReorderModalProps = {
  open: boolean;
  onSluiten: () => void;
  materialen: MateriaalKeuze[];
  onOpslaan: (opgeslagenMaterialen: MateriaalKeuze[]) => void;
}

function ReorderModal({ open, onSluiten, materialen, onOpslaan }: ReorderModalProps) {
  const [items, setItems] = useState(materialen);

  useEffect(() => {
    setItems(materialen);
  }, [materialen]);

  const handleSave = () => {
    const opgeslagenMaterialen = items.map((item, index) => ({...item, sort_order: index}));
    onOpslaan(opgeslagenMaterialen);
    onSluiten();
  }

  return (
    <Dialog open={open} onOpenChange={onSluiten}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>Materiaal volgorde aanpassen</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-6">
          <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
            {items.map(item => (
              <Reorder.Item key={item.id} value={item}>
                <div className="flex items-center gap-4 p-2 rounded-md bg-muted/50 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{item.materiaalnaam}</span>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
          <Button onClick={handleSave}>Opslaan</Button>
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

const defaultExtraMateriaal: Omit<ExtraMateriaal, 'id'> = {
    naam: '',
    eenheid: 'stuk',
    lengteMm: undefined,
    breedteMm: undefined,
    hoogteMm: undefined,
    prijsPerEenheid: 0,
};

type ExtraMateriaalModalProps = {
    open: boolean;
    mode: 'add' | 'edit';
    onSluiten: () => void;
    onOpslaan: (materiaal: Omit<ExtraMateriaal, 'id'> | ExtraMateriaal) => void;
    existingRecord?: ExtraMateriaal;
}

function ExtraMateriaalModal({ open, mode, onSluiten, onOpslaan, existingRecord }: ExtraMateriaalModalProps) {
    const [item, setItem] = useState<Omit<ExtraMateriaal, 'id'> | ExtraMateriaal>(defaultExtraMateriaal);

    useEffect(() => {
      if (open) {
        if (mode === 'edit' && existingRecord) {
            setItem(existingRecord)
        } else {
            setItem(defaultExtraMateriaal);
        }
      }
    }, [open, mode, existingRecord]);

    const handleFieldChange = (field: keyof Omit<ExtraMateriaal, 'id'>, value: any) => {
        setItem(prev => ({...prev, [field]: value}));
    };

    const handleOpslaan = () => {
        onOpslaan(item);
        onSluiten();
    };

    const isEenheidDimensie = ['m¹', 'm²', 'm³'].includes(item.eenheid);
    
    const prijsLabelMap: Record<string, string> = {
      'stuk': 'Prijs per stuk (€)',
      'm¹': 'Prijs per meter (€)',
      'm²': 'Prijs per m² (géén plaatprijs!)',
      'm³': 'Prijs per m³ (€)',
    };
    
    const prijsHelperTextMap: Record<string, string> = {
      'stuk': 'Gebruik ‘stuk’ alleen voor losse artikelen, zoals beslag of haken. Koop je dit normaal in een doos of pak? Reken dan eerst de prijs per stuk uit, anders klopt de offerte niet.',
      'm¹': 'Let op: dit is prijs per strekkende meter. Niet per balk, niet per bundel. Krijg je een prijs per stuk? Reken die eerst om naar prijs per meter.',
      'm²': 'Geen plaatprijs! Krijg je een prijs per plaat? Deel die eerst door het aantal m² per plaat. Fout ingevulde plaatprijzen zorgen voor verkeerde offertes.',
      'm³': 'Let op: gebruik m³ alleen als het materiaal echt per kubieke meter wordt verkocht (bijv. isolatie in bulk). Krijg je een prijs per plaat of balk? Gebruik dan m² of m¹ in plaats van m³.',
    };

    const dynamischPrijsLabel = prijsLabelMap[item.eenheid] || 'Materiaalkosten per eenheid (€)';
    const dynamischPrijsHelperText = prijsHelperTextMap[item.eenheid];
    
    return (
        <Dialog open={open} onOpenChange={onSluiten}>
            <DialogContent className="sm:max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>{mode === 'edit' ? 'Materiaal Bewerken' : 'Extra Materiaal Toevoegen'}</DialogTitle>
                     <DialogDescription>
                         Gebruik dit voor uitzonderlijke materialen die niet in de vaste lijst staan.
                         <span className="block mt-1 text-xs text-muted-foreground">Voer altijd de prijs per gekozen eenheid in. Verkeerde prijzen geven verkeerde offertes.</span>
                     </DialogDescription>
                 </DialogHeader>

                <div className="grid gap-6 py-4">
                   <div className="space-y-2"><Label htmlFor="extra-naam">Materiaalnaam *</Label><Input id="extra-naam" value={item.naam} onChange={e => handleFieldChange('naam', e.target.value)} placeholder="Bijv. multiplex plaat, staalprofiel, …" /></div>
                    <div className="grid grid-cols-1"><div className="space-y-2"><Label htmlFor="extra-eenheid">Eenheid *</Label><Select value={item.eenheid} onValueChange={value => handleFieldChange('eenheid', value as ExtraMateriaal['eenheid'])}><SelectTrigger id="extra-eenheid"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stuk">stuk</SelectItem><SelectItem value="m¹">m¹</SelectItem><SelectItem value="m²">m²</SelectItem><SelectItem value="m³">m³</SelectItem></SelectContent></Select></div></div>
                    {isEenheidDimensie && (<div className="p-4 border rounded-md space-y-4"><p className="text-sm font-medium">Maatvoering (alleen indien relevant)</p><div className="grid grid-cols-3 gap-4">{['m¹', 'm²', 'm³'].includes(item.eenheid) && (<div className="space-y-2"><Label htmlFor="extra-lengte">Lengte (mm)</Label><Input id="extra-lengte" type="number" value={item.lengteMm || ''} onChange={e => handleFieldChange('lengteMm', e.target.value)} placeholder="Bijv. 3000"/></div>)}{['m²', 'm³'].includes(item.eenheid) && (<div className="space-y-2"><Label htmlFor="extra-breedte">Breedte (mm)</Label><Input id="extra-breedte" type="number" value={item.breedteMm || ''} onChange={e => handleFieldChange('breedteMm', e.target.value)} placeholder="Bijv. 600"/></div>)}{['m³'].includes(item.eenheid) && (<div className="space-y-2"><Label htmlFor="extra-hoogte">Hoogte / dikte (mm)</Label><Input id="extra-hoogte" type="number" value={item.hoogteMm || ''} onChange={e => handleFieldChange('hoogteMm', e.target.value)} placeholder="Bijv. 50"/></div>)}</div><p className="text-xs text-muted-foreground">Gebruik alleen lengte/breedte/hoogte als de prijs per m¹/m²/m³ wordt berekend.</p></div>)}
                    <div className="grid grid-cols-1 gap-4"><div className="space-y-2"><Label htmlFor="extra-prijs" className="text-red-300">{dynamischPrijsLabel} *</Label><Input id="extra-prijs" type="number" value={item.prijsPerEenheid || ''} onChange={e => handleFieldChange('prijsPerEenheid', Number(e.target.value))} placeholder="Bijv. 3,25"/>{dynamischPrijsHelperText && (<div className="mt-2 flex items-start gap-2 rounded-md border border-red-800 bg-red-950/40 p-2 text-sm text-red-300"><AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><p>{dynamischPrijsHelperText}</p></div>)}</div></div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onSluiten}>Annuleren</Button>
                    <Button type="button" onClick={handleOpslaan} disabled={!item.naam || !item.prijsPerEenheid}>
                        { mode === 'edit' ? 'Wijziging Opslaan' : 'Toevoegen' }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==================================
// Pagina Component
// ==================================

export default function MetalstudTussenwandMaterialenPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isPaginaLaden, setPaginaLaden] = useState(true);
  
  // State voor materialen
  const [alleMaterialen, setAlleMaterialen] = useState<MateriaalKeuze[]>([]);
  const [isMaterialenLaden, setMaterialenLaden] = useState(true);
  const [foutMaterialen, setFoutMaterialen] = useState<string | null>(null);
  
  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, MateriaalKeuze | undefined>>({});
  const [extraMaterialen, setExtraMaterialen] = useState<ExtraMateriaal[]>([]);
  const [gipsLagen, setGipsLagen] = useState(1);
  const [tempGipsLagen, setTempGipsLagen] = useState(1);
  
  // State voor modals
  const [actieveSectie, setActieveSectie] = useState<SectieKey | null>(null);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [extraMateriaalModalOpen, setExtraMateriaalModalOpen] = useState(false);
  const [extraMateriaalModalMode, setExtraMateriaalModalMode] = useState<'add' | 'edit'>('add');
  const [editingExtraMateriaal, setEditingExtraMateriaal] = useState<ExtraMateriaal | undefined>(undefined);
  const [lagenModalOpen, setLagenModalOpen] = useState(false);

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
  
  const openExtraMateriaalModal = (mode: 'add' | 'edit', item?: ExtraMateriaal) => {
    setExtraMateriaalModalMode(mode);
    setEditingExtraMateriaal(item);
    setExtraMateriaalModalOpen(true);
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
  
  const handleExtraMateriaalOpslaan = (materiaal: Omit<ExtraMateriaal, 'id'> | ExtraMateriaal) => {
    if ('id' in materiaal && materiaal.id) {
      setExtraMaterialen(prev => prev.map(m => m.id === materiaal.id ? materiaal : m));
    } else {
      const nieuwMateriaal = { ...materiaal, id: new Date().toISOString() };
      setExtraMaterialen(prev => [...prev, nieuwMateriaal]);
    }
  };

  const handleMateriaalVerwijderen = (sectieSleutel: SectieKey) => {
    setGekozenMaterialen(prev => {
        const newState = { ...prev };
        delete newState[sectieSleutel];
        if (sectieSleutel === 'gips_1' || sectieSleutel === 'gips_2') {
            setGipsLagen(1);
        }
        return newState;
    });
  };

  const handleStandaardMaterialenOpslaan = async (opgeslagenMaterialen: MateriaalKeuze[]) => {
      const updates = opgeslagenMaterialen.map(m => ({
          row_id: m.id,
          sort_order: m.sort_order,
          user_id: user?.uid
      }));

      const { error } = await supabase.from('materialen_duplicate').upsert(updates);
      if (error) {
          console.error("Fout bij opslaan sortering:", error);
          // Toon een toast?
      } else {
          // Update lokale state om re-render te forceren
          setAlleMaterialen(prev => {
              const materialMap = new Map(opgeslagenMaterialen.map(m => [m.id, m]));
              return prev.map(p => materialMap.has(p.id) ? materialMap.get(p.id)! : p);
          });
      }
  }

  const isVolgendeIngeschakeld = true;

  const renderSelectieRij = (sectieSleutel: SectieKey, titel: string, beschrijving?: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const materialenVoorSectie = filterMaterialenVoorSectie(sectieSleutel);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{titel}</CardTitle>
                 {beschrijving && <CardDescription>{beschrijving}</CardDescription>}
            </CardHeader>
            <CardContent className="-mt-4">
                 <div className="pt-4 first:pt-0">
                    {isMaterialenLaden ? (
                         <div className="h-8 bg-muted/50 rounded animate-pulse" />
                    ) : foutMaterialen ? (
                         <p className="text-sm text-destructive mt-1">Laden van materialen mislukt.</p>
                    ) : (
                         <div className="flex items-center justify-between">
                            <div>
                                {gekozenMateriaal ? (
                                <p className="text-sm text-primary mt-1">Gekozen: {gekozenMateriaal.materiaalnaam}</p>
                                ) : (
                                <p className="text-sm text-muted-foreground italic mt-1">Nog geen materiaal gekozen</p>
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

  const renderGipsSelectieRij = (sectieSleutel: SectieKey, titel: string, beschrijving?: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];

    return (
        <Card>
            <CardHeader>
                <CardTitle>{titel}</CardTitle>
                {beschrijving && <CardDescription>{beschrijving}</CardDescription>}
            </CardHeader>
            <CardContent className="-mt-4">
                <div className="pt-4 first:pt-0">
                    {isMaterialenLaden ? (
                        <div className="h-8 bg-muted/50 rounded animate-pulse" />
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    {gekozenMateriaal ? (
                                        <p className="text-sm text-primary mt-1">Gekozen: {gekozenMateriaal.materiaalnaam}</p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic mt-1">Nog geen materiaal gekozen</p>
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
                            {gekozenMateriaal && (
                                <div className="mt-2 pl-1">
                                    <button onClick={openLagenKiezer} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-foreground transition-colors">
                                        <Settings className="w-3 h-3"/>
                                        Lagen: {gipsLagen} (aanpassen)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
  };
  
  const formatExtraMateriaalRow = (item: ExtraMateriaal) => {
    let details = [];
    if (item.eenheid === 'm²' && item.lengteMm && item.breedteMm) {
      details.push(`m²`, `${item.lengteMm} × ${item.breedteMm} mm`);
    } else if (item.eenheid === 'm¹' && item.lengteMm) {
      details.push(`m¹`, `lengte ${item.lengteMm} mm`);
    } else {
        details.push(item.eenheid);
    }
    return `${item.naam} – ${details.join(' – ')}`;
  };
  
  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center justify-start">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link href={`/offertes/${quoteId}/klus/wanden/metalstud-tussenwand`}>
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
                   <h1 className="font-semibold text-2xl md:text-3xl">Materialen – Metalstud Tussenwand</h1>
                  <p className="text-muted-foreground mt-2">
                      Kies de materialen die u voor deze wand gebruikt. U kunt deze keuzes als preset opslaan voor volgende offertes.
                  </p>
              </div>

              <div className="space-y-8">
                {renderSelectieRij('profielen', 'Profielen')}
                {renderSelectieRij('isolatie', 'Isolatie')}
                
                {renderSelectieRij('osb_1', 'OSB / Constructieplaat')}
                {renderSelectieRij('osb_2', 'OSB / Constructieplaat')}

                {renderGipsSelectieRij('gips_1', 'Gips / Fermacell')}
                {renderGipsSelectieRij('gips_2', 'Gips / Fermacell')}

                {renderSelectieRij('kozijnen', 'Kozijnen')}
                {renderSelectieRij('deuren', 'Deuren')}
                {renderSelectieRij('naden_vullen', 'Naden vullen')}
                {renderSelectieRij('plinten', 'Plinten')}
                
                <Card>
                    <CardHeader>
                        <CardTitle>Extra materiaal</CardTitle>
                        <CardDescription>Optionele extra materialen voor dit project.</CardDescription>
                    </CardHeader>
                    <CardContent className="-mt-4">
                        <div className="pt-4 first:pt-0">
                            {extraMaterialen.length === 0 ? (
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground italic mt-1">Nog geen materiaal gekozen</p>
                                     <Button variant="outline" size="sm" onClick={() => openExtraMateriaalModal('add')}>
                                        Kiezen
                                    </Button>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 space-y-2">
                                            <p className="text-sm text-primary mt-1">
                                                {extraMaterialen.length > 1 ? 'Gekozen extra materialen:' : 'Gekozen extra materiaal:'}
                                            </p>
                                            <div className="space-y-1">
                                                {extraMaterialen.map(item => (
                                                    <p key={item.id} className="text-sm text-primary">{formatExtraMateriaalRow(item)}</p>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => setExtraMaterialen([])} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Verwijder alle extra materialen">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => openExtraMateriaalModal('edit', extraMaterialen[0])}>
                                                Wijzigen
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                         <button onClick={() => openExtraMateriaalModal('add')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                            <PlusCircle className="w-3 h-3"/>
                                            Extra materiaal toevoegen
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

              </div>

              <div className="mt-8 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/wanden/metalstud-tussenwand`}>Terug</Link>
                  </Button>
                  <Button disabled={!isVolgendeIngeschakeld} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                      Volgende
                  </Button>
              </div>
          </div>
        </div>
      </main>

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
      
      <ExtraMateriaalModal
          open={extraMateriaalModalOpen}
          mode={extraMateriaalModalMode}
          onSluiten={() => setExtraMateriaalModalOpen(false)}
          onOpslaan={handleExtraMateriaalOpslaan}
          existingRecord={editingExtraMateriaal}
      />

      {actieveSectie && <ReorderModal 
        open={reorderModalOpen}
        onSluiten={() => {
            setReorderModalOpen(false);
            openMateriaalKiezer(actieveSectie);
        }}
        materialen={filterMaterialenVoorSectie(actieveSectie)}
        onOpslaan={handleStandaardMaterialenOpslaan}
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
