'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createJobAction } from '@/lib/actions';
import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';


export default function HsbWandPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const lengte = formData.get('lengteMm');
    const hoogte = formData.get('hoogteMm');
    const description = `HSB Wand - Lengte: ${lengte}mm, Hoogte: ${hoogte}mm`;
    
    // This is a server action that will redirect on success
    await createJobAction(quoteId, 'Wanden', description);
  };
  

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/wanden`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Wanden: stap 3 van 4</h1>
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
            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>HSB Wand Afmetingen</CardTitle>
                        <CardDescription>
                            Voer de afmetingen van de HSB wand in millimeters (mm) in.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="lengteMm">Lengte (mm)</Label>
                            <Input id="lengteMm" name="lengteMm" type="number" placeholder="bv. 4000" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="hoogteMm">Hoogte of Breedte (mm)</Label>
                            <Input id="hoogteMm" name="hoogteMm" type="number" placeholder="bv. 2600" required />
                        </div>
                         <Button type="submit" size="lg" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                            <Save className="mr-2 h-4 w-4" />
                            Klus toevoegen en doorgaan
                        </Button>
                    </CardContent>
                </Card>
            </form>
        </div>
      </div>
    </main>
  );
}
