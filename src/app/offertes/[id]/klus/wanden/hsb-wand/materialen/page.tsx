'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Trash2, Plus, Minus, Settings } from 'lucide-react';
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


// ==================================
// Definities en Mock Data
// ==================================

// TODO: Dit wordt later vervangen door een Supabase-query voor materialen
type Materiaal = {
  id: string;
  naam: string;
  categorie: string;
  eenheid: string;
  prijs: number;
};

const mockMaterialen: Materiaal[] = [
  { id: 'h1', naam: 'Vuren SLS 38x123 C18', categorie: 'Hout', eenheid: 'm1', prijs: 2.85 },
  { id: 'h2', naam: 'Vuren SLS 38x140 C24', categorie: 'Hout', eenheid: 'm1', prijs: 3.45 },
  { id: 'i1', naam: 'Glaswol Isover 120mm RD 3.4', categorie: 'Isolatie', eenheid: 'm2', prijs: 8.50 },
  { id: 'i2', naam: 'Steenwol Rockwool 120mm', categorie: 'Isolatie', eenheid: 'm2', prijs: 9.75 },
  { id: 'p1', naam: 'Gipsplaat RK 12.5mm 60x260cm', categorie: 'Gips', eenheid: 'm2', prijs: 4.20 },
  { id: 'p2', naam: 'Gipsvezelplaat Fermacell 12.5mm', categorie: 'Gips', eenheid: 'm2', prijs: 7.80 },
  { id: 'osb1', naam: 'OSB-3 18mm TG4', categorie: 'Constructieplaat', eenheid: 'm2', prijs: 11.25 },
  { id: 'f1', naam: 'Miofol 125S dampremmende folie', categorie: 'Folie', eenheid: 'm2', prijs: 1.50 },
  { id: 'k1', naam: 'Houten binnenkozijn stomp', categorie: 'Kozijnen', eenheid: 'st', prijs: 85.00 },
  { id: 'd1', naam: 'Opdekdeur wit', categorie: 'Deuren', eenheid: 'st', prijs: 120.00 },
  { id: 's1', naam: 'Knauf Roodband 25kg', categorie: 'Stuc', eenheid: 'zak', prijs: 15.00 },
  { id: 'pl1', naam: 'MDF Plint 90x12mm', categorie: 'Plinten', eenheid: 'm1', prijs: 3.50 },
  { id: 'extra1', naam: 'Schroeven 5x60', categorie: 'Extra', eenheid: 'doos', prijs: 12.50 },
];

type MateriaalSlot = {
  key: string;
  standaardCategorieen: string[];
};

type ExtraMateriaal = {
  id: string;
  naam: string;
  eenheid: string;
  lengteMm?: number;
  breedteMm?: number;
  hoogteMm?: number;
  prijsPerEenheid: number;
}

// ==================================
// Modal Components
// ==================================

type MateriaalKiezerModalProps = {
  open: boolean;
  slot: MateriaalSlot | null;
  geselecteerdMateriaalId?: string;
  onSluiten: () => void;
  onSelecteren: (slotKey: string, materiaal: Materiaal) => void;
};

function MateriaalKiezerModal({ open, slot, geselecteerdMateriaalId, onSluiten, onSelecteren }: MateriaalKiezerModalProps) {
  const [zoekterm, setZoekterm] = useState('');
  
  const gefilterdeMaterialen = useMemo(() => {
    if (!slot) return [];
    let materialenLijst = mockMaterialen;

    const categorieFilter = slot.standaardCategorieen;
    if(categorieFilter.length > 0){
        materialenLijst = materialenLijst.filter(m => categorieFilter.includes(m.categorie));
    }
    
    return materialenLijst.filter(m => m.naam.toLowerCase().includes(zoekterm.toLowerCase()));
  }, [zoekterm, slot]);

  if (!open || !slot) {
    return null;
  }

  const handleSelect = (materiaal: Materiaal) => {
    onSelecteren(slot.key, materiaal);
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
                                <p className="font-medium">{materiaal.naam}</p>
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

const defaultExtraMateriaal = {
    naam: '',
    eenheid: 'stuk',
    lengteMm: undefined,
    breedteMm: undefined,
    hoogteMm: undefined,
    prijsPerEenheid: undefined,
};

type ExtraMateriaalModalProps = {
    open: boolean;
    onSluiten: () => void;
    onOpslaan: (materiaal: Omit<ExtraMateriaal, 'id'>) => void;
}

function ExtraMateriaalModal({ open, onSluiten, onOpslaan }: ExtraMateriaalModalProps) {
    const [item, setItem] = useState<any>(defaultExtraMateriaal);

    const handleFieldChange = (field: string, value: any) => {
        setItem(prev => ({...prev, [field]: value}));
    };

    const handleOpslaan = () => {
        const nieuwItem: Omit<ExtraMateriaal, 'id'> = {
            naam: item.naam,
            eenheid: item.eenheid,
            prijsPerEenheid: Number(item.prijsPerEenheid),
            lengteMm: item.lengteMm ? Number(item.lengteMm) : undefined,
            breedteMm: item.breedteMm ? Number(item.breedteMm) : undefined,
            hoogteMm: item.hoogteMm ? Number(item.hoogteMm) : undefined,
        }
        onOpslaan(nieuwItem);
        setItem(defaultExtraMateriaal);
        onSluiten();
    };
    
    const isEenheidDimensie = ['m¹', 'm²', 'm³'].includes(item.eenheid);
    
    const prijsLabelMap: Record<string, string> = {
      'stuk': 'Prijs per stuk (€)',
      'doos / pak': 'Prijs per doos / pak (€)',
      'm¹': 'Prijs per meter (€)',
      'm²': 'Prijs per m² (géén plaatprijs!)',
      'm³': 'Prijs per m³ (€)',
    };
    
    const prijsHelperTextMap: Record<string, string> = {
        'stuk': 'Gebruik ‘stuk’ alleen voor losse artikelen, zoals beslag of haken.',
        'doos / pak': 'Vul hier de prijs van één doos/pak in. Wij berekenen automatisch hoeveel er nodig is.',
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
                    <DialogTitle>Extra materiaal toevoegen</DialogTitle>
                    <DialogDescription>
                        Gebruik dit voor uitzonderlijke materialen die niet in de vaste lijst staan.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                   <p className="text-xs text-muted-foreground -mt-2">
                        Voer altijd de prijs per gekozen eenheid in. Verkeerde prijzen geven verkeerde offertes.
                    </p>
                   <div className="space-y-2">
                        <Label htmlFor="extra-naam">Materiaalnaam *</Label>
                        <Input id="extra-naam" value={item.naam} onChange={e => handleFieldChange('naam', e.target.value)} placeholder="Bijv. multiplex plaat, staalprofiel, …" />
                    </div>
                    <div className="grid grid-cols-1">
                        <div className="space-y-2">
                            <Label htmlFor="extra-eenheid">Eenheid *</Label>
                            <Select value={item.eenheid} onValueChange={value => handleFieldChange('eenheid', value)}>
                                <SelectTrigger id="extra-eenheid"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="stuk">stuk</SelectItem>
                                    <SelectItem value="doos / pak">doos / pak</SelectItem>
                                    <SelectItem value="m¹">m¹</SelectItem>
                                    <SelectItem value="m²">m²</SelectItem>
                                    <SelectItem value="m³">m³</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {isEenheidDimensie && (
                        <div className="p-4 border rounded-md space-y-4">
                            <p className="text-sm font-medium">Maatvoering (voor prijsberekening)</p>
                             <div className="grid grid-cols-3 gap-4">
                                {['m¹', 'm²', 'm³'].includes(item.eenheid) && (
                                    <div className="space-y-2">
                                        <Label htmlFor="extra-lengte">Lengte (mm)</Label>
                                        <Input id="extra-lengte" type="number" value={item.lengteMm || ''} onChange={e => handleFieldChange('lengteMm', e.target.value)} placeholder="Bijv. 3000"/>
                                    </div>
                                )}
                                 {['m²', 'm³'].includes(item.eenheid) && (
                                    <div className="space-y-2">
                                        <Label htmlFor="extra-breedte">Breedte (mm)</Label>
                                        <Input id="extra-breedte" type="number" value={item.breedteMm || ''} onChange={e => handleFieldChange('breedteMm', e.target.value)} placeholder="Bijv. 600"/>
                                    </div>
                                )}
                                 {['m³'].includes(item.eenheid) && (
                                    <div className="space-y-2">
                                        <Label htmlFor="extra-hoogte">Hoogte / dikte (mm)</Label>
                                        <Input id="extra-hoogte" type="number" value={item.hoogteMm || ''} onChange={e => handleFieldChange('hoogteMm', e.target.value)} placeholder="Bijv. 50"/>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">Gebruik alleen lengte/breedte/hoogte als de prijs per m¹/m²/m³ wordt berekend.</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="extra-prijs">{dynamischPrijsLabel} *</Label>
                            <Input id="extra-prijs" type="number" value={item.prijsPerEenheid || ''} onChange={e => handleFieldChange('prijsPerEenheid', e.target.value)} placeholder="Bijv. 3,25"/>
                             {dynamischPrijsHelperText && <p className="text-xs text-muted-foreground">{dynamischPrijsHelperText}</p>}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onSluiten}>Annuleren</Button>
                    <Button type="button" onClick={handleOpslaan} disabled={!item.naam || !item.prijsPerEenheid}>Opslaan</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==================================
// Pagina Component
// ==================================

export default function HsbWandMaterialenPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, Materiaal | undefined>>({});
  const [extraMaterialen, setExtraMaterialen] = useState<ExtraMateriaal[]>([]);
  const [gipsLagen, setGipsLagen] = useState(1);
  const [tempGipsLagen, setTempGipsLagen] = useState(1);
  
  const [materiaalModalOpen, setMateriaalModalOpen] = useState(false);
  const [extraMateriaalModalOpen, setExtraMateriaalModalOpen] = useState(false);
  const [lagenModalOpen, setLagenModalOpen] = useState(false);
  const [actiefSlot, setActiefSlot] = useState<MateriaalSlot | null>(null);

  useEffect(() => {
    async function fetchQuote() {
      if (!quoteId) return;
      setLoading(true);
      const quoteData = await getQuoteById(quoteId);
      setQuote(quoteData || null);
      setLoading(false);
    }
    fetchQuote();
  }, [quoteId]);

  const openMateriaalKiezer = (slot: MateriaalSlot) => {
    setActiefSlot(slot);
    setMateriaalModalOpen(true);
  };
  
  const sluitMateriaalKiezer = () => {
    setMateriaalModalOpen(false);
    setActiefSlot(null);
  };
  
  const openLagenKiezer = () => {
    setTempGipsLagen(gipsLagen);
    setLagenModalOpen(true);
  }

  const handleLagenOpslaan = () => {
    setGipsLagen(tempGipsLagen);
    setLagenModalOpen(false);
  }

  const handleMateriaalSelectie = (slotKey: string, materiaal: Materiaal) => {
    setGekozenMaterialen(prev => ({ ...prev, [slotKey]: materiaal }));
  };
  
  const handleExtraMateriaalOpslaan = (materiaal: Omit<ExtraMateriaal, 'id'>) => {
    const nieuwMateriaal = { ...materiaal, id: new Date().toISOString() };
    setExtraMaterialen(prev => [...prev, nieuwMateriaal]);
  };

  const handleMateriaalVerwijderen = (slotKey: string) => {
    setGekozenMaterialen(prev => {
        const newState = { ...prev };
        delete newState[slotKey];
        if (slotKey === 'gipsPlaat') {
            setGipsLagen(1); // Reset lagen if gips is removed
        }
        return newState;
    });
  };

  const isVolgendeIngeschakeld = true;

  const renderSelectieRij = (slot: MateriaalSlot) => {
    const gekozenMateriaal = gekozenMaterialen[slot.key];

    return (
      <div key={slot.key}>
        <div className="flex items-center justify-between pt-4 first:pt-0">
          <div>
            {gekozenMateriaal ? (
              <p className="text-sm text-primary mt-1">Gekozen: {gekozenMateriaal.naam}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic mt-1">Nog geen materiaal gekozen</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {gekozenMateriaal && (
              <Button variant="ghost" size="icon" onClick={() => handleMateriaalVerwijderen(slot.key)} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Verwijder materiaal">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer(slot)}>
              {gekozenMateriaal ? 'Wijzigen' : 'Kiezen'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const totaalExtraMateriaal = useMemo(() => {
    return extraMaterialen.reduce((sum, item) => sum + item.prijsPerEenheid, 0);
  }, [extraMaterialen]);

  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center justify-start">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link href={`/offertes/${quoteId}/klus/wanden/hsb-wand`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Terug</span>
              </Link>
            </Button>
          </div>
          <h1 className="text-center font-semibold text-lg">Materialen: stap 5 van 6</h1>
          <div className="flex items-center justify-end">
            {loading ? (
              <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
            ) : quote ? (
              <p className="text-sm text-muted-foreground truncate">Offerte voor: {quote.clientName}</p>
            ) : null}
          </div>
        </header>
        
        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-2xl mx-auto w-full">
              <div className="text-center mb-8">
                   <h1 className="font-semibold text-2xl md:text-3xl">Materialen – HSB Wand</h1>
                  <p className="text-muted-foreground mt-2">
                      Kies de materialen die u voor deze wand gebruikt. U kunt deze keuzes als preset opslaan voor volgende offertes.
                  </p>
              </div>

              <div className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Balktype</CardTitle>
                        <CardDescription>Balktype voor de wandconstructie.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        {renderSelectieRij({ key: 'typeBalk', standaardCategorieen: ['Hout'] })}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Isolatie</CardTitle>
                        <CardDescription>Kies het isolatiemateriaal voor deze wand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        {renderSelectieRij({ key: 'typeIsolatie', standaardCategorieen: ['Isolatie'] })}
                    </CardContent>
                 </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Folie</CardTitle>
                        <CardDescription>Selecteer de benodigde luchtdichtingsfolie.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                       {renderSelectieRij({ key: 'typeFolie', standaardCategorieen: ['Folie'] })}
                    </CardContent>
                 </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Binnenbekleding</CardTitle>
                        <CardDescription>Binnenplaat of constructieplaat.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                       {renderSelectieRij({ key: 'typeConstructieplaat', standaardCategorieen: ['Constructieplaat'] })}
                    </CardContent>
                 </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Gips / Fermacell</CardTitle>
                        <CardDescription>Kies de binnenafwerking van de wand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        <div key='gipsPlaat'>
                           <div className="flex items-center justify-between pt-4 first:pt-0">
                             <div>
                               {gekozenMaterialen['gipsPlaat'] ? (
                                 <p className="text-sm text-primary mt-1">Gekozen: {gekozenMaterialen['gipsPlaat'].naam}</p>
                               ) : (
                                 <p className="text-sm text-muted-foreground italic mt-1">Nog geen materiaal gekozen</p>
                               )}
                             </div>
                             <div className="flex items-center gap-2">
                               {gekozenMaterialen['gipsPlaat'] && (
                                 <Button variant="ghost" size="icon" onClick={() => handleMateriaalVerwijderen('gipsPlaat')} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Verwijder materiaal">
                                   <Trash2 className="h-4 w-4" />
                                 </Button>
                               )}
                               <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer({ key: 'gipsPlaat', standaardCategorieen: ['Gips'] })}>
                                 {gekozenMaterialen['gipsPlaat'] ? 'Wijzigen' : 'Kiezen'}
                               </Button>
                             </div>
                           </div>
                           {gekozenMaterialen['gipsPlaat'] && (
                             <div className="mt-2 pl-1">
                                <button onClick={openLagenKiezer} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-foreground transition-colors">
                                   <Settings className="w-3 h-3"/>
                                   Lagen: {gipsLagen} (aanpassen)
                               </button>
                             </div>
                           )}
                         </div>
                    </CardContent>
                 </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Kozijnen</CardTitle>
                        <CardDescription>Materiaal voor raamkozijnen in deze wand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        {renderSelectieRij({ key: 'typeKozijn', standaardCategorieen: ['Kozijnen'] })}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Deuren</CardTitle>
                        <CardDescription>Materiaal voor deuren in deze wand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        {renderSelectieRij({ key: 'typeDeur', standaardCategorieen: ['Deuren'] })}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Naden vullen</CardTitle>
                        <CardDescription>Vulmiddel voor het dichten van naden tussen platen.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        {renderSelectieRij({ key: 'stucVulling', standaardCategorieen: ['Stuc'] })}
                    </CardContent>
                 </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Plinten</CardTitle>
                        <CardDescription>Afwerkplinten voor deze wand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                       {renderSelectieRij({ key: 'afwerkplint', standaardCategorieen: ['Plinten'] })}
                    </CardContent>
                 </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Extra materiaal</CardTitle>
                        <CardDescription>Optionele extra materialen voor dit project.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                         {extraMaterialen.length > 0 ? (
                            <div className="pt-4">
                                <ul className="space-y-3">
                                {extraMaterialen.map(item => (
                                    <li key={item.id} className="flex justify-between items-center text-sm p-2 -m-2 rounded-md hover:bg-muted/50">
                                        <div>
                                            <p className="font-medium">{item.naam}</p>
                                            <p className="text-xs text-muted-foreground">{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(item.prijsPerEenheid)} / {item.eenheid}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => setExtraMaterialen(prev => prev.filter(m => m.id !== item.id))} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                            <Trash2 className="w-4 h-4"/>
                                        </Button>
                                    </li>
                                ))}
                                </ul>
                            </div>
                        ) : (
                           <div className="flex items-center justify-between pt-4 first:pt-0">
                                <p className="text-sm text-muted-foreground italic mt-1">Nog geen materiaal gekozen</p>
                            </div>
                        )}
                        <div className="flex items-center justify-between pt-4">
                             {extraMaterialen.length > 0 && <p className="text-sm font-medium">Aantal items: {extraMaterialen.length} — Totaal materiaal: {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(totaalExtraMateriaal)}</p>}
                             <Button variant="outline" size="sm" onClick={() => setExtraMateriaalModalOpen(true)} className="ml-auto">
                                 Materiaal toevoegen
                             </Button>
                        </div>
                    </CardContent>
                 </Card>

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

      <MateriaalKiezerModal
          open={materiaalModalOpen}
          slot={actiefSlot}
          geselecteerdMateriaalId={actiefSlot ? gekozenMaterialen[actiefSlot.key]?.id : undefined}
          onSluiten={sluitMateriaalKiezer}
          onSelecteren={handleMateriaalSelectie}
      />
      
      <ExtraMateriaalModal
          open={extraMateriaalModalOpen}
          onSluiten={() => setExtraMateriaalModalOpen(false)}
          onOpslaan={handleExtraMateriaalOpslaan}
      />
      
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
