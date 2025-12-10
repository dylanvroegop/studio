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
import { createJobAction } from '@/lib/actions';

type Wall = {
  lengte: string;
  hoogte: string;
};

export default function HsbWandPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [walls, setWalls] = useState<Wall[]>([{ lengte: '', hoogte: '' }]);

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
    setWalls([...walls, { lengte: '', hoogte: '' }]);
  };

  const handleWallChange = (index: number, field: keyof Wall, value: string) => {
    const newWalls = [...walls];
    newWalls[index][field] = value;
    setWalls(newWalls);
  };
  
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Validate that all fields are filled
    if (walls.some(wall => !wall.lengte || !wall.hoogte)) {
        toast({
            variant: "destructive",
            title: "Ontbrekende gegevens",
            description: "Vul a.u.b. de lengte en hoogte voor alle wanden in.",
        });
        return;
    }

    const description = `HSB Wand (${walls.length} stuks)`;
    
    // Assuming createJobAction is updated to handle multiple walls or just a general description
    // For now, we pass a general description and the action handles the redirect.
    await createJobAction(quoteId, 'Wanden', description);
  };

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
        <div className="max-w-xl mx-auto w-full">
            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Afmetingen – HSB Wand</CardTitle>
                        <CardDescription>
                            Totaal aantal wanden: {walls.length}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {walls.map((wall, index) => (
                           <div key={index} className="space-y-4 pt-4 border-t border-dashed first:border-t-0 first:pt-0">
                             <h3 className="font-medium">Wand {index + 1}</h3>
                             <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <Label htmlFor={`lengte-${index}`}>Lengte (mm)</Label>
                                 <Input 
                                    id={`lengte-${index}`} 
                                    name={`lengte-${index}`} 
                                    type="number" 
                                    placeholder="Bijv. 5000" 
                                    required 
                                    value={wall.lengte}
                                    onChange={(e) => handleWallChange(index, 'lengte', e.target.value)}
                                 />
                               </div>
                               <div className="space-y-2">
                                 <Label htmlFor={`hoogte-${index}`}>Hoogte / Breedte (mm)</Label>
                                 <Input 
                                    id={`hoogte-${index}`} 
                                    name={`hoogte-${index}`} 
                                    type="number" 
                                    placeholder="Bijv. 2600" 
                                    required
                                    value={wall.hoogte}
                                    onChange={(e) => handleWallChange(index, 'hoogte', e.target.value)}
                                 />
                               </div>
                             </div>
                           </div>
                        ))}
                         <Button type="button" variant="outline" className="w-full" onClick={handleAddWall}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Wand toevoegen
                        </Button>
                    </CardContent>
                </Card>
                <div className="mt-6 flex justify-between items-center">
                    <Button variant="outline" asChild>
                        <Link href={`/offertes/${quoteId}/klus/wanden`}>Terug</Link>
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
