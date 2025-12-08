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

type Item = {
  lengte: string;
  breedte: string;
  hoogte: string;
  diepte: string;
  opmerkingen: string;
};

const defaultItemState: Item = {
  lengte: '',
  breedte: '',
  hoogte: '',
  diepte: '',
  opmerkingen: '',
};

export default function DiverseHoutenAftimmeringPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([defaultItemState]);

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
  
  const handleAddItem = () => {
    setItems([...items, { ...defaultItemState }]);
  };
  
  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleItemChange = <K extends keyof Item>(index: number, field: K, value: Item[K]) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };
  
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    // For now, just a placeholder action. You'll likely want to do something with the `items` state.
    toast({
        title: "Opmerking",
        description: "De materialenpagina voor deze klus is nog niet geïmplementeerd.",
    });

    // Example of saving to local storage and routing
    // localStorage.setItem(`quote-${quoteId}-diverse-houten-aftimmering`, JSON.stringify(items));
    // router.push(`/offertes/${quoteId}/klus/afwerkingen/diverse-houten-aftimmering/materialen`);
  };
  
  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/afwerkingen`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Afwerkingen: stap 4 van 6</h1>
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
                 <h2 className="font-semibold text-2xl">Diverse houten aftimmering</h2>
                <p className="text-muted-foreground mt-2">
                    Vul hieronder de afmetingen in. Voor elk apart onderdeel, voeg een nieuw item toe.
                </p>
            </div>
            <form>
              <div className="space-y-6">
                {items.map((item, index) => (
                   <Card key={index}>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Onderdeel {index + 1}</CardTitle>
                               <CardDescription>
                                   Specificeer de afmetingen en details.
                               </CardDescription>
                           </div>
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Verwijder onderdeel</span>
                                </Button>
                            )}
                       </CardHeader>
                       <CardContent className="space-y-6">
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`lengte-${index}`}>Lengte (mm)</Label>
                                 <Input id={`lengte-${index}`} type="number" placeholder="Lengte" value={item.lengte} onChange={(e) => handleItemChange(index, 'lengte', e.target.value)} />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`breedte-${index}`}>Breedte (mm)</Label>
                                 <Input id={`breedte-${index}`} type="number" placeholder="Breedte" value={item.breedte} onChange={(e) => handleItemChange(index, 'breedte', e.target.value)} />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`hoogte-${index}`}>Hoogte (mm)</Label>
                                 <Input id={`hoogte-${index}`} type="number" placeholder="Hoogte" value={item.hoogte} onChange={(e) => handleItemChange(index, 'hoogte', e.target.value)} />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`diepte-${index}`}>Diepte (mm)</Label>
                                 <Input id={`diepte-${index}`} type="number" placeholder="Diepte" value={item.diepte} onChange={(e) => handleItemChange(index, 'diepte', e.target.value)} />
                               </div>
                           </div>
                           <div className="space-y-2 pt-2">
                              <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                              <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details..." value={item.opmerkingen} onChange={(e) => handleItemChange(index, 'opmerkingen', e.target.value)} />
                            </div>
                       </CardContent>
                   </Card>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddItem}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Onderdeel toevoegen
              </Button>
              <div className="mt-6 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/afwerkingen`}>Terug</Link>
                  </Button>
                  <Button type="submit" onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                      Volgende
                  </Button>
              </div>
            </form>
        </div>
      </div>
    </main>
  );
}
