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

type Kozijn = {
  lengte: string;
  hoogte: string;
  opmerkingen: string;
};

const defaultKozijnState: Kozijn = {
  lengte: '',
  hoogte: '',
  opmerkingen: '',
};

export default function OverigKozijnenPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [kozijnen, setKozijnen] = useState<Kozijn[]>([defaultKozijnState]);

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
  
  const handleAddKozijn = () => {
    setKozijnen([...kozijnen, { ...defaultKozijnState }]);
  };
  
  const handleRemoveKozijn = (index: number) => {
    const newKozijnen = kozijnen.filter((_, i) => i !== index);
    setKozijnen(newKozijnen);
  };

  const handleKozijnChange = <K extends keyof Kozijn>(index: number, field: K, value: Kozijn[K]) => {
    const newKozijnen = [...kozijnen];
    newKozijnen[index][field] = value;
    setKozijnen(newKozijnen);
  };
  
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    if (kozijnen.some(p => !p.lengte || !p.hoogte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de lengte en hoogte voor alle kozijnen in.",
        });
        return;
    }

    localStorage.setItem(`quote-${quoteId}-overig-kozijnen`, JSON.stringify(kozijnen));
    router.push(`/offertes/${quoteId}/klus/kozijnen/overig-kozijnen/materialen`);
  };
  
  const isNextDisabled = kozijnen.some(p => !p.lengte || !p.hoogte);

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/kozijnen`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Kozijnen: stap 4 van 6</h1>
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
                 <h2 className="font-semibold text-2xl">Overig Kozijnen</h2>
                <p className="text-muted-foreground mt-2">
                    Vul hieronder de afmetingen in. Voor elk apart kozijn, voeg een nieuw veld toe.
                </p>
            </div>
            <form>
              <div className="space-y-6">
                {kozijnen.map((kozijn, index) => (
                   <Card key={index}>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Kozijn {index + 1}</CardTitle>
                               <CardDescription>
                                   Specificeer de afmetingen en details voor dit kozijn.
                               </CardDescription>
                           </div>
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveKozijn(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Verwijder kozijn</span>
                                </Button>
                            )}
                       </CardHeader>
                       <CardContent className="space-y-6">
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`lengte-${index}`}>Lengte / Breedte (mm) *</Label>
                                 <Input id={`lengte-${index}`} type="number" placeholder="Bijv. 1200" required value={kozijn.lengte} onChange={(e) => handleKozijnChange(index, 'lengte', e.target.value)} />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`hoogte-${index}`}>Hoogte (mm) *</Label>
                                 <Input id={`hoogte-${index}`} type="number" placeholder="Bijv. 2100" required value={kozijn.hoogte} onChange={(e) => handleKozijnChange(index, 'hoogte', e.target.value)} />
                               </div>
                           </div>
                           <div className="space-y-2 pt-2">
                              <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                              <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details, alleen indien nodig…" value={kozijn.opmerkingen} onChange={(e) => handleKozijnChange(index, 'opmerkingen', e.target.value)} />
                            </div>
                       </CardContent>
                   </Card>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddKozijn}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Kozijn toevoegen
              </Button>
              <div className="mt-6 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/kozijnen`}>Terug</Link>
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
