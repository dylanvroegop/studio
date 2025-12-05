'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Wall = {
  lengte: string;
  hoogte: string;
  balkafstand: string;
  gipsLagen: string;
  heeftSparingen: boolean;
  aantalSparingen: string;
  omschrijvingSparingen: string;
  wandtype: 'dragend' | 'niet-dragend' | 'onbekend';
  opmerkingen: string;
};

const defaultWallState: Wall = {
  lengte: '',
  hoogte: '',
  balkafstand: '600',
  gipsLagen: '1',
  heeftSparingen: false,
  aantalSparingen: '',
  omschrijvingSparingen: '',
  wandtype: 'onbekend',
  opmerkingen: '',
};

export default function HsbWandPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [walls, setWalls] = useState<Wall[]>([defaultWallState]);

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
  
  const handleAddWall = () => {
    setWalls([...walls, { ...defaultWallState }]);
  };
  
  const handleRemoveWall = (index: number) => {
    const newWalls = walls.filter((_, i) => i !== index);
    setWalls(newWalls);
  };

  const handleWallChange = <K extends keyof Wall>(index: number, field: K, value: Wall[K]) => {
    const newWalls = [...walls];
    newWalls[index][field] = value;
    setWalls(newWalls);
  };
  
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    if (walls.some(wall => !wall.lengte || !wall.hoogte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de lengte en hoogte voor alle wanden in.",
        });
        return;
    }
    
    // Store wall data in localStorage to pass to the next page
    localStorage.setItem(`quote-${quoteId}-hsb-wanden`, JSON.stringify(walls));
    
    router.push(`/offertes/${quoteId}/klus/wanden/hsb-wand/materialen`);
  };
  
  const isNextDisabled = walls.some(wall => !wall.lengte || !wall.hoogte);

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/wanden`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Wanden: stap 4 van 6</h1>
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
                <p className="text-muted-foreground">
                    Vul hieronder de gevraagde gegevens in. Deze informatie gebruiken wij om jouw offerte nauwkeurig voor je uit te werken.
                </p>
            </div>
            <form>
                <div className="space-y-6">
                    {walls.map((wall, index) => (
                       <Card key={index}>
                           <CardHeader className="flex flex-row items-center justify-between">
                               <div>
                                   <CardTitle>Wand {index + 1}</CardTitle>
                                   <CardDescription>
                                       Specificeer de afmetingen en details voor deze wand.
                                   </CardDescription>
                               </div>
                                {index > 0 && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveWall(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Verwijder wand</span>
                                    </Button>
                                )}
                           </CardHeader>
                           <CardContent className="space-y-6">
                               <div className="grid grid-cols-2 gap-4">
                                   <div className="space-y-2">
                                     <Label htmlFor={`lengte-${index}`}>Lengte (mm) *</Label>
                                     <Input id={`lengte-${index}`} type="number" placeholder="Bijv. 5000" required value={wall.lengte} onChange={(e) => handleWallChange(index, 'lengte', e.target.value)} />
                                   </div>
                                   <div className="space-y-2">
                                     <Label htmlFor={`hoogte-${index}`}>Hoogte (mm) *</Label>
                                     <Input id={`hoogte-${index}`} type="number" placeholder="Bijv. 2600" required value={wall.hoogte} onChange={(e) => handleWallChange(index, 'hoogte', e.target.value)} />
                                   </div>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div className="space-y-2">
                                   <Label htmlFor={`balkafstand-${index}`}>Balkafstand (h.o.h.)</Label>
                                   <Input id={`balkafstand-${index}`} type="number" placeholder="Bijv. 600" value={wall.balkafstand} onChange={(e) => handleWallChange(index, 'balkafstand', e.target.value)} />
                                   <p className="text-xs text-muted-foreground">Hart-op-hart afstand tussen de balken.</p>
                                 </div>
                                 <div className="space-y-2">
                                    <Label htmlFor={`gipsLagen-${index}`}>Aantal lagen gips</Label>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10"
                                            onClick={() => {
                                                const currentValue = parseInt(wall.gipsLagen) || 1;
                                                handleWallChange(index, 'gipsLagen', Math.max(1, currentValue - 1).toString());
                                            }}
                                        >
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <div className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base justify-center items-center md:text-sm">
                                            {wall.gipsLagen}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10"
                                            onClick={() => {
                                                const currentValue = parseInt(wall.gipsLagen) || 0;
                                                handleWallChange(index, 'gipsLagen', (currentValue + 1).toString());
                                            }}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Aantal binnenlagen gips of fermacell.</p>
                                 </div>
                               </div>
                                 <div className="space-y-4 rounded-md border p-4">
                                     <div className="flex items-center justify-between">
                                         <Label htmlFor={`sparingen-${index}`} className="font-medium">Sparingen in deze wand</Label>
                                         <Switch id={`sparingen-${index}`} checked={wall.heeftSparingen} onCheckedChange={(checked) => handleWallChange(index, 'heeftSparingen', checked)} />
                                     </div>
                                     {wall.heeftSparingen && (
                                         <div className="space-y-4 pt-4 border-t border-dashed">
                                             <div className="space-y-2">
                                                 <Label htmlFor={`aantal-sparingen-${index}`}>Aantal sparingen</Label>
                                                 <Input id={`aantal-sparingen-${index}`} type="number" placeholder="Bijv. 2" value={wall.aantalSparingen} onChange={(e) => handleWallChange(index, 'aantalSparingen', e.target.value)} />
                                             </div>
                                             <div className="space-y-2">
                                                 <Label htmlFor={`omschrijving-sparingen-${index}`}>Omschrijving sparing(en)</Label>
                                                 <Textarea id={`omschrijving-sparingen-${index}`} placeholder="Bijv. 1x deurkozijn, 1x raam" value={wall.omschrijvingSparingen} onChange={(e) => handleWallChange(index, 'omschrijvingSparingen', e.target.value)} />
                                             </div>
                                         </div>
                                     )}
                                 </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`wandtype-${index}`}>Wandtype</Label>
                                  <Select value={wall.wandtype} onValueChange={(value: Wall['wandtype']) => handleWallChange(index, 'wandtype', value)}>
                                    <SelectTrigger id={`wandtype-${index}`}>
                                      <SelectValue placeholder="Kies een type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="dragend">Dragend</SelectItem>
                                      <SelectItem value="niet-dragend">Niet-dragend</SelectItem>
                                      <SelectItem value="onbekend">Onbekend</SelectItem>
                                    </SelectContent>
                                  </Select>
                                   <p className="text-xs text-muted-foreground">Gebruik voor berekening en materiaallijst.</p>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen</Label>
                                  <Textarea id={`opmerkingen-${index}`} placeholder="Eventuele bijzonderheden..." value={wall.opmerkingen} onChange={(e) => handleWallChange(index, 'opmerkingen', e.target.value)} />
                                </div>
                           </CardContent>
                       </Card>
                    ))}
                </div>
                 <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddWall}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Wand toevoegen
                </Button>
                <div className="mt-6 flex justify-between items-center">
                    <Button variant="outline" asChild>
                        <Link href={`/offertes/${quoteId}/klus/wanden`}>Terug</Link>
                    </Button>
                    <Button type="submit" disabled={isNextDisabled} onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                        Volgende
                    </Button>
                </div>
            </form>
        </div>
      </div>
    </main>
  );
}

    