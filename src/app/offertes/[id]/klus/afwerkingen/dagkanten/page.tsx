
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

type Dagkant = {
  lengte: string;
  breedte: string;
  opmerkingen: string;
};

const defaultDagkantState: Dagkant = {
  lengte: '',
  breedte: '',
  opmerkingen: '',
};

export default function DagkantenPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [dagkanten, setDagkanten] = useState<Dagkant[]>([defaultDagkantState]);

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
  
  const handleAddDagkant = () => {
    setDagkanten([...dagkanten, { ...defaultDagkantState }]);
  };
  
  const handleRemoveDagkant = (index: number) => {
    const newDagkanten = dagkanten.filter((_, i) => i !== index);
    setDagkanten(newDagkanten);
  };

  const handleDagkantChange = <K extends keyof Dagkant>(index: number, field: K, value: Dagkant[K]) => {
    const newDagkanten = [...dagkanten];
    newDagkanten[index][field] = value;
    setDagkanten(newDagkanten);
  };
  
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    if (dagkanten.some(p => !p.lengte || !p.breedte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de lengte en breedte voor alle dagkanten in.",
        });
        return;
    }

    localStorage.setItem(`quote-${quoteId}-dagkanten`, JSON.stringify(dagkanten));
    
    router.push(`/offertes/${quoteId}/klus/afwerkingen/dagkanten/materialen`);
  };
  
  const isNextDisabled = dagkanten.some(p => !p.lengte || !p.breedte);

  return (
    <main className="flex flex-1 flex-col">
      <header className="grid w-full grid-cols-3 items-center border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/afwerkingen`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <div className="text-center">
            <h1 className="font-semibold text-lg">Afwerkingen:</h1>
            <p className="text-xs text-muted-foreground">stap 4 van 6</p>
        </div>
        <div className="flex items-center justify-end">
          {loading ? (
            <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
          ) : quote ? (
            <p className="text-sm text-muted-foreground truncate"></p>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto w-full">
            <form>
              <div className="space-y-6">
                {dagkanten.map((dagkant, index) => (
                   <Card key={index}>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Dagkant {index + 1}</CardTitle>
                               <CardDescription>
                                   Specificeer de afmetingen en details.
                               </CardDescription>
                           </div>
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveDagkant(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Verwijder dagkant</span>
                                </Button>
                            )}
                       </CardHeader>
                       <CardContent className="space-y-6">
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`lengte-${index}`}>Lengte (mm) *</Label>
                                 <Input id={`lengte-${index}`} type="number" placeholder="Bijv. 1800" required value={dagkant.lengte} onChange={(e) => handleDagkantChange(index, 'lengte', e.target.value)} />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`breedte-${index}`}>Breedte / diepte (mm) *</Label>
                                 <Input id={`breedte-${index}`} type="number" placeholder="Bijv. 250" required value={dagkant.breedte} onChange={(e) => handleDagkantChange(index, 'breedte', e.target.value)} />
                               </div>
                           </div>
                           <div className="space-y-2 pt-2">
                              <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                              <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details, alleen indien nodig…" value={dagkant.opmerkingen} onChange={(e) => handleDagkantChange(index, 'opmerkingen', e.target.value)} />
                            </div>
                       </CardContent>
                   </Card>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddDagkant}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Dagkant toevoegen
              </Button>
              <div className="mt-6 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/afwerkingen`}>Terug</Link>
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
