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
import { Textarea } from '@/components/ui/textarea';

type Boeiboord = {
  lengte: string;
  opmerkingen: string;
};

const defaultBoeiboordState: Boeiboord = {
  lengte: '',
  opmerkingen: '',
};

export default function BoeiboordenPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [boeiboorden, setBoeiboorden] = useState<Boeiboord[]>([defaultBoeiboordState]);

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
  
  const handleAddBoeiboord = () => {
    setBoeiboorden([...boeiboorden, { ...defaultBoeiboordState }]);
  };
  
  const handleRemoveBoeiboord = (index: number) => {
    const newBoeiboorden = boeiboorden.filter((_, i) => i !== index);
    setBoeiboorden(newBoeiboorden);
  };

  const handleBoeiboordChange = <K extends keyof Boeiboord>(index: number, field: K, value: Boeiboord[K]) => {
    const newBoeiboorden = [...boeiboorden];
    newBoeiboorden[index][field] = value;
    setBoeiboorden(newBoeiboorden);
  };
  
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (boeiboorden.some(p => !p.lengte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de lengte voor alle boeiboorden in.",
        });
        return;
    }

    const description = `Boeiboorden vervangen/bekleden (${boeiboorden.length} delen)`;
    
    await createJobAction(quoteId, 'Boeiboorden', description);
  };
  
  const isNextDisabled = boeiboorden.some(p => !p.lengte);

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/nieuw`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Boeiboorden: stap 3 van 6</h1>
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
                 <h2 className="font-semibold text-2xl">Boeiboorden</h2>
                <p className="text-muted-foreground mt-2">
                    Vul hieronder de afmetingen in. Voor elk apart deel, voeg een nieuw veld toe.
                </p>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {boeiboorden.map((boeiboord, index) => (
                   <Card key={index}>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Boeiboord {index + 1}</CardTitle>
                               <CardDescription>
                                   Specificeer de lengte en details voor dit deel.
                               </CardDescription>
                           </div>
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveBoeiboord(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Verwijder boeiboord</span>
                                </Button>
                            )}
                       </CardHeader>
                       <CardContent className="space-y-6">
                           <div className="grid grid-cols-1 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`lengte-${index}`}>Lengte (mm) *</Label>
                                 <Input id={`lengte-${index}`} type="number" placeholder="Bijv. 8000" required value={boeiboord.lengte} onChange={(e) => handleBoeiboordChange(index, 'lengte', e.target.value)} />
                               </div>
                           </div>
                           <div className="space-y-2 pt-2">
                              <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                              <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details, alleen indien nodig…" value={boeiboord.opmerkingen} onChange={(e) => handleBoeiboordChange(index, 'opmerkingen', e.target.value)} />
                            </div>
                       </CardContent>
                   </Card>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddBoeiboord}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Boeiboord toevoegen
              </Button>
              <div className="mt-6 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/nieuw`}>Terug</Link>
                  </Button>
                  <Button type="submit" disabled={isNextDisabled} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed">
                      Volgende
                  </Button>
              </div>
            </form>
        </div>
      </div>
    </main>
  );
}
