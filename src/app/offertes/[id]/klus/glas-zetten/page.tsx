
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

type GlassPane = {
  breedte: string;
  hoogte: string;
  opmerkingen: string;
};

const defaultGlassPaneState: GlassPane = {
  breedte: '',
  hoogte: '',
  opmerkingen: '',
};

export default function GlasZettenPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [glassPanes, setGlassPanes] = useState<GlassPane[]>([defaultGlassPaneState]);

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
  
  const handleAddPane = () => {
    setGlassPanes([...glassPanes, { ...defaultGlassPaneState }]);
  };
  
  const handleRemovePane = (index: number) => {
    const newPanes = glassPanes.filter((_, i) => i !== index);
    setGlassPanes(newPanes);
  };

  const handlePaneChange = <K extends keyof GlassPane>(index: number, field: K, value: GlassPane[K]) => {
    const newPanes = [...glassPanes];
    newPanes[index][field] = value;
    setGlassPanes(newPanes);
  };
  
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    if (glassPanes.some(p => !p.breedte || !p.hoogte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de breedte en hoogte voor alle ruiten in.",
        });
        return;
    }

    localStorage.setItem(`quote-${quoteId}-glas-zetten`, JSON.stringify(glassPanes));
    
    router.push(`/offertes/${quoteId}/klus/glas-zetten/materialen`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
    }
  };
  
  const isNextDisabled = glassPanes.some(p => !p.breedte || !p.hoogte);

  return (
    <main className="flex flex-1 flex-col">
      <header className="grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/nieuw`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <div className="text-center">
            <h1 className="font-semibold text-lg">Glas zetten:</h1>
            <p className="text-xs text-muted-foreground">stap 3 van 6</p>
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
                {glassPanes.map((pane, index) => (
                   <Card key={index}>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Ruit {index + 1}</CardTitle>
                               <CardDescription>
                                   Specificeer de afmetingen en details voor deze ruit.
                               </CardDescription>
                           </div>
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemovePane(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Verwijder ruit</span>
                                </Button>
                            )}
                       </CardHeader>
                       <CardContent className="space-y-6">
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`breedte-${index}`}>Breedte (mm) *</Label>
                                 <Input id={`breedte-${index}`} type="number" placeholder="Bijv. 800" required value={pane.breedte} onChange={(e) => handlePaneChange(index, 'breedte', e.target.value)} onKeyDown={handleKeyDown} />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`hoogte-${index}`}>Hoogte (mm) *</Label>
                                 <Input id={`hoogte-${index}`} type="number" placeholder="Bijv. 1200" required value={pane.hoogte} onChange={(e) => handlePaneChange(index, 'hoogte', e.target.value)} onKeyDown={handleKeyDown} />
                               </div>
                           </div>
                           <div className="space-y-2 pt-2">
                              <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                              <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details, alleen indien nodig…" value={pane.opmerkingen} onChange={(e) => handlePaneChange(index, 'opmerkingen', e.target.value)} />
                            </div>
                       </CardContent>
                   </Card>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddPane}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Ruit toevoegen
              </Button>
              <div className="mt-6 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/nieuw`}>Terug</Link>
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
