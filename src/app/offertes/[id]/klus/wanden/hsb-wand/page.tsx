
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

type Wall = {
  lengte: string;
  hoogte: string;
  balkafstand: string;
  opmerkingen: string;
};

const defaultWallState: Wall = {
  lengte: '',
  hoogte: '',
  balkafstand: '600',
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
    
    localStorage.setItem(`quote-${quoteId}-hsb-wand`, JSON.stringify(walls));
    router.push(`/offertes/${quoteId}/klus/wanden/hsb-wand/materialen`);
  };
  
  const isNextDisabled = walls.some(p => !p.lengte || !p.hoogte);

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
        <div className="text-center">
            <h1 className="font-semibold text-lg">Wanden:</h1>
            <p className="text-xs text-muted-foreground">stap 4 van 6</p>
        </div>
        <div className="flex items-center justify-end">
          {loading ? (
            <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
          ) : quote ? (
            <p className="text-sm text-muted-foreground truncate">Offerte: {quote.clientName}</p>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto w-full">
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
                               <div className="space-y-2">
                                   <Label htmlFor={`balkafstand-${index}`}>Balkafstand (h.o.h.)</Label>
                                   <Input id={`balkafstand-${index}`} type="number" placeholder="Bijv. 600" value={wall.balkafstand} onChange={(e) => handleWallChange(index, 'balkafstand', e.target.value)} />
                                   <p className="text-xs text-muted-foreground">Hart-op-hart afstand tussen de balken.</p>
                               </div>

                               <div className="space-y-2 pt-2">
                                  <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                                   <p className="text-xs text-muted-foreground">Alleen invullen bij bijzondere situaties. Meestal kun je dit leeg laten.</p>
                                  <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details, alleen indien nodig…" value={wall.opmerkingen} onChange={(e) => handleWallChange(index, 'opmerkingen', e.target.value)} />
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
