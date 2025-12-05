// Deze pagina zal later een volledige Supabase-integratie krijgen voor
// het ophalen van materialen en het opslaan van de gemaakte keuzes.
// Momenteel wordt alles client-side met mock data afgehandeld.
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Trash2, PlusCircle, MinusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Quote } from '@/lib/types';
import { getQuoteById } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
];

type MateriaalSlot = {
  key: string;
  label: string;
  description?: string;
  standaardCategorieen: string[];
};

type SlotSectie = {
  titel: string;
  description: string;
  slots: MateriaalSlot[];
};

const materiaalSlotConfig: SlotSectie[] = [
  {
    titel: 'Constructie',
    description: 'Balktype voor de wandconstructie.',
    slots: [
      { key: 'typeBalk', label: 'Selecteer type balk', standaardCategorieen: ['Hout'] },
    ]
  },
  {
    titel: 'Isolatie',
    description: 'Kies het isolatiemateriaal voor deze wand.',
    slots: [
      { key: 'typeIsolatie', label: 'Selecteer type isolatie', standaardCategorieen: ['Isolatie'] },
    ]
  },
  {
    titel: 'Folie',
    description: 'Selecteer de benodigde luchtdichtingsfolie.',
    slots: [
        { key: 'typeFolie', label: 'Selecteer type folie', standaardCategorieen: ['Folie'] }
    ]
  },
  {
    titel: 'Binnenbekleding',
    description: 'Binnenplaat of constructieplaat.',
    slots: [
        { key: 'typeConstructieplaat', label: 'Selecteer type plaat', standaardCategorieen: ['Constructieplaat'] }
    ]
  },
];

// ==================================
// Modal Component
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
    if (!slot || slot.standaardCategorieen.length === 0) return [];
    return mockMaterialen
      .filter(m => slot.standaardCategorieen.includes(m.categorie))
      .filter(m => m.naam.toLowerCase().includes(zoekterm.toLowerCase()));
  }, [zoekterm, slot]);

  if (!open || !slot) {
    return null;
  }

  const handleSelect = (materiaal: Materiaal) => {
    onSelecteren(slot.key, materiaal);
    onSluiten();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-card text-card-foreground border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="p-4 border-b flex items-center justify-between">
            <div>
                 <h2 className="text-lg font-semibold">{`Kies materiaal voor: ${slot.label}`}</h2>
                 <p className="text-sm text-muted-foreground">Zoek op naam of kies uit de lijst.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onSluiten} aria-label="Sluiten">
                <X className="h-5 w-5" />
            </Button>
        </header>

        <div className="p-4 border-b">
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
                        className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${geselecteerdMateriaalId === materiaal.id ? 'bg-muted' : ''}`}
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

        <footer className="p-4 border-t flex justify-end">
            <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
        </footer>
      </div>
    </div>
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
  const [gekozenGipsplaat, setGekozenGipsplaat] = useState<Materiaal | undefined>();

  const [modalOpen, setModalOpen] = useState(false);
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
    setModalOpen(true);
  };
  
  const sluitMateriaalKiezer = () => {
    setModalOpen(false);
    setActiefSlot(null);
  };

  const handleMateriaalSelectie = (slotKey: string, materiaal: Materiaal) => {
    setGekozenMaterialen(prev => ({ ...prev, [slotKey]: materiaal }));
  };

  const handleMateriaalVerwijderen = (slotKey: string) => {
    setGekozenMaterialen(prev => {
        const newState = { ...prev };
        delete newState[slotKey];
        return newState;
    });
  };
  
  const handleGipsSelectie = (slotKey: string, materiaal: Materiaal) => {
    setGekozenGipsplaat(materiaal);
  };
  
  const handleGipsVerwijderen = () => {
    setGekozenGipsplaat(undefined);
  };

  const isVolgendeIngeschakeld = true; // Voor nu altijd ingeschakeld

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
                {materiaalSlotConfig.map(sectie => (
                    <Card key={sectie.titel}>
                        <CardHeader>
                            <CardTitle>{sectie.titel}</CardTitle>
                            <CardDescription>{sectie.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 divide-y divide-border -mt-4">
                            {sectie.slots.map(slot => {
                                const gekozenMateriaal = gekozenMaterialen[slot.key];
                                return (
                                    <div key={slot.key} className="flex items-center justify-between pt-4 first:pt-0">
                                        <div>
                                            <Label className="font-medium">{slot.label}</Label>
                                            {gekozenMateriaal ? (
                                                <p className="text-sm text-primary">
                                                    Gekozen: {gekozenMateriaal.naam}
                                                </p>
                                            ) : (
                                                !slot.description && <p className="text-sm text-muted-foreground italic">Nog geen materiaal gekozen</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {gekozenMateriaal && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleMateriaalVerwijderen(slot.key)}
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    aria-label="Verwijder materiaal"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer(slot)}>
                                                {gekozenMateriaal ? 'Wijzigen' : 'Kiezen'}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                ))}

                {/* Gipsplaat Sectie */}
                <Card>
                    <CardHeader>
                        <CardTitle>Gips / Fermacell</CardTitle>
                        <CardDescription>Kies de binnenafwerking van de wand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 divide-y divide-border -mt-4">
                        <div className="flex items-center justify-between pt-4 first:pt-0">
                            <div>
                                <Label className="font-medium">Selecteer type plaat</Label>
                                {gekozenGipsplaat ? (
                                    <p className="text-sm text-primary">Gekozen: {gekozenGipsplaat.naam}</p>
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">Nog geen materiaal gekozen</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {gekozenGipsplaat && (
                                    <Button variant="ghost" size="icon" onClick={handleGipsVerwijderen} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Verwijder gipsplaat">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={() => openMateriaalKiezer({ key: 'gipsplaat', label: 'Selecteer type plaat', standaardCategorieen: ['Gips'] })}>
                                    {gekozenGipsplaat ? 'Wijzigen' : 'Kiezen'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Andere secties */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Kozijnen & Deuren</CardTitle>
                        <CardDescription>Materiaal voor kozijnen en deuren.</CardDescription>
                    </CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground italic">Nog niet geïmplementeerd.</p></CardContent>
                 </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Stucwerk</CardTitle>
                        <CardDescription>Vulmiddel of stucafwerking.</CardDescription>
                    </CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground italic">Nog niet geïmplementeerd.</p></CardContent>
                 </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Plinten</CardTitle>
                        <CardDescription>Afwerkplinten voor deze wand.</CardDescription>
                    </CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground italic">Nog niet geïmplementeerd.</p></CardContent>
                 </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Extra materiaal</CardTitle>
                        <CardDescription>Optionele extra materialen voor dit project.</CardDescription>
                    </CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground italic">Nog niet geïmplementeerd.</p></CardContent>
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
          open={modalOpen}
          slot={actiefSlot}
          geselecteerdMateriaalId={actiefSlot ? (actiefSlot.key === 'gipsplaat' ? gekozenGipsplaat?.id : gekozenMaterialen[actiefSlot.key]?.id) : undefined}
          onSluiten={sluitMateriaalKiezer}
          onSelecteren={actiefSlot?.key === 'gipsplaat' ? handleGipsSelectie : handleMateriaalSelectie}
      />
    </>
  );
}
