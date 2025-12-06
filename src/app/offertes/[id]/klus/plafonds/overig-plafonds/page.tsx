'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createJobAction } from '@/lib/actions';
import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

type Plafond = {
  lengte: string;
  breedte: string;
};

export default function OverigPlafondsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [plafonds, setPlafonds] = useState<Plafond[]>([{ lengte: '', breedte: '' }]);

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
  
  const handleAddPlafond = () => {
    setPlafonds([...plafonds, { lengte: '', breedte: '' }]);
  };

  const handlePlafondChange = (index: number, field: keyof Plafond, value: string) => {
    const newPlafonds = [...plafonds];
    newPlafonds[index][field] = value;
    setPlafonds(newPlafonds);
  };
  
    const handleRemovePlafond = (index: number) => {
    const newPlafonds = plafonds.filter((_, i) => i !== index);
    setPlafonds(newPlafonds);
  };
  
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (plafonds.some(p => !p.lengte || !p.breedte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de lengte en breedte voor alle plafonds in.",
        });
        return;
    }

    const description = `Overig Plafonds (${plafonds.length} stuks)`;
    
    await createJobAction(quoteId, 'Plafonds', description);
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/plafonds`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Plafonds: stap 4 van 6</h1>
        <div className="flex items-center justify-end">
          {loading ? (
            <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
          ) : quote ? (
            <p className="text-sm text-muted-foreground truncate">Offerte voor: {quote.clientName}</p>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-xl mx-auto w-full">
            <div className="text-center mb-8">
                 <h2 className="font-semibold text-2xl">Overig Plafonds</h2>
                <p className="text-muted-foreground mt-2">
                    Vul hieronder de gevraagde gegevens in. Deze informatie gebruiken wij om jouw offerte nauwkeurig voor je uit te werken.
                </p>
            </div>
            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Afmetingen – Overig Plafond</CardTitle>
                        <CardDescription>
                            Totaal aantal plafonds: {plafonds.length}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {plafonds.map((plafond, index) => (
                           <div key={index} className="space-y-4 pt-4 border-t border-dashed first:border-t-0 first:pt-0">
                             <div className="flex justify-between items-center">
                                <h3 className="font-medium">Plafond {index + 1}</h3>
                                {index > 0 && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleRemovePlafond(index)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Verwijder plafond</span>
                                    </Button>
                                )}
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`lengte-${index}`}>Lengte (mm)</Label>
                                 <Input 
                                    id={`lengte-${index}`} 
                                    name={`lengte-${index}`} 
                                    type="number" 
                                    placeholder="Bijv. 5000" 
                                    required 
                                    value={plafond.lengte}
                                    onChange={(e) => handlePlafondChange(index, 'lengte', e.target.value)}
                                 />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`breedte-${index}`}>Breedte (mm)</Label>
                                 <Input 
                                    id={`breedte-${index}`} 
                                    name={`breedte-${index}`} 
                                    type="number" 
                                    placeholder="Bijv. 3000" 
                                    required
                                    value={plafond.breedte}
                                    onChange={(e) => handlePlafondChange(index, 'breedte', e.target.value)}
                                 />
                               </div>
                             </div>
                           </div>
                        ))}
                         <Button type="button" variant="outline" className="w-full" onClick={handleAddPlafond}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Plafond toevoegen
                        </Button>
                    </CardContent>
                </Card>
                <div className="mt-6 flex justify-between items-center">
                    <Button variant="outline" asChild>
                        <Link href={`/offertes/${quoteId}/klus/plafonds`}>Terug</Link>
                    </Button>
                    <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                        Volgende
                    </Button>
                </div>
            </form>
        </div>
      </div>
    </main>
  );
}
