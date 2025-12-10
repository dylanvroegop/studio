
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

type Lichtkoepel = {
  aantal: string;
  opmerkingen: string;
};

const defaultLichtkoepelState: Lichtkoepel = {
  aantal: '1',
  opmerkingen: '',
};

export default function LichtkoepelPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [lichtkoepels, setLichtkoepels] = useState<Lichtkoepel[]>([defaultLichtkoepelState]);

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
  
  const handleAddLichtkoepel = () => {
    setLichtkoepels([...lichtkoepels, { ...defaultLichtkoepelState }]);
  };
  
  const handleRemoveLichtkoepel = (index: number) => {
    const newLichtkoepels = lichtkoepels.filter((_, i) => i !== index);
    setLichtkoepels(newLichtkoepels);
  };

  const handleLichtkoepelChange = <K extends keyof Lichtkoepel>(index: number, field: K, value: Lichtkoepel[K]) => {
    const newLichtkoepels = [...lichtkoepels];
    newLichtkoepels[index][field] = value;
    setLichtkoepels(newLichtkoepels);
  };
  
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    if (lichtkoepels.some(p => !p.aantal || parseInt(p.aantal) <= 0)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. een geldig aantal in voor alle lichtkoepels.",
        });
        return;
    }

    localStorage.setItem(`quote-${quoteId}-lichtkoepels`, JSON.stringify(lichtkoepels));
    
    router.push(`/offertes/${quoteId}/klus/dakramen/lichtkoepel/materialen`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
    }
  };
  
  const isNextDisabled = lichtkoepels.some(p => !p.aantal || parseInt(p.aantal) <= 0);

  return (
    <main className="flex flex-1 flex-col">
      <header className="grid w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/dakramen`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <div className="text-center">
            <h1 className="font-semibold text-lg">Lichtkoepels:</h1>
            <p className="text-xs text-muted-foreground">stap 4 van 6</p>
        </div>
        <div className="flex items-center justify-end">
          {loading ? (
            <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
          ) : quote ? (
            <p className="text-sm text-muted-foreground truncate">Offerte: {quote.clientName.split(' ').map(name => name.charAt(0).toUpperCase() + name.slice(1)).join(' ')}</p>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto w-full">
            <form>
              <div className="space-y-6">
                {lichtkoepels.map((lichtkoepel, index) => (
                   <Card key={index}>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Lichtkoepel {index + 1}</CardTitle>
                               <CardDescription>
                                   Specificeer het aantal en eventuele details.
                               </CardDescription>
                           </div>
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveLichtkoepel(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Verwijder lichtkoepel</span>
                                </Button>
                            )}
                       </CardHeader>
                       <CardContent className="space-y-6">
                           <div className="grid grid-cols-1 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`aantal-${index}`}>Aantal *</Label>
                                 <Input id={`aantal-${index}`} type="number" placeholder="1" required value={lichtkoepel.aantal} onChange={(e) => handleLichtkoepelChange(index, 'aantal', e.target.value)} onKeyDown={handleKeyDown} />
                               </div>
                           </div>
                           <div className="space-y-2 pt-2">
                              <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                              <Textarea id={`opmerkingen-${index}`} placeholder="Bijzondere details, type, afmetingen etc." value={lichtkoepel.opmerkingen} onChange={(e) => handleLichtkoepelChange(index, 'opmerkingen', e.target.value)} />
                            </div>
                       </CardContent>
                   </Card>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddLichtkoepel}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Lichtkoepel toevoegen
              </Button>
              <div className="mt-6 flex justify-between items-center">
                  <Button variant="outline" asChild>
                      <Link href={`/offertes/${quoteId}/klus/dakramen`}>Terug</Link>
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
