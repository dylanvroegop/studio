'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';

// 🔧 Firestore imports (pas evt. het db-importpad aan naar jouw project)
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Wall = {
  lengte: string;
  hoogte: string;
  balkafstand: string;
  opmerkingen: string;
};

type SavedWall = {
  wandNummer: number;
  lengteMm: number;
  hoogteMm: number;
  balkafstandMm: number;
  opmerkingen: string;
};

const defaultWallState: Wall = {
  lengte: '',
  hoogte: '',
  balkafstand: '600',
  opmerkingen: '',
};

function toIntOrNull(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export default function HsbWandPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const quoteId = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [walls, setWalls] = useState<Wall[]>([defaultWallState]);

  // 1) Quote ophalen (voor header etc.)
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

  // 2) Prefill: eerst Firestore (bron van waarheid), anders localStorage fallback
  useEffect(() => {
    async function prefill() {
      if (!quoteId) return;

      // Firestore proberen
      try {
        const ref = doc(db, 'quotes', quoteId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as any;
          const saved = data?.jobData?.wanden?.hsbWand?.wanden as SavedWall[] | undefined;

          if (Array.isArray(saved) && saved.length > 0) {
            const mapped: Wall[] = saved.map((w) => ({
              lengte: String(w?.lengteMm ?? ''),
              hoogte: String(w?.hoogteMm ?? ''),
              balkafstand: String(w?.balkafstandMm ?? '600'),
              opmerkingen: String(w?.opmerkingen ?? ''),
            }));

            setWalls(mapped);
            // ook localStorage synchroniseren (handig bij refresh/offline)
            localStorage.setItem(`quote-${quoteId}-hsb-wand`, JSON.stringify(mapped));
            return;
          }
        }
      } catch (e) {
        // Stil falen -> we proberen localStorage
        console.error('Prefill Firestore mislukt:', e);
      }

      // localStorage fallback
      const savedWalls = localStorage.getItem(`quote-${quoteId}-hsb-wand`);
      if (savedWalls) {
        try {
          const parsedWalls = JSON.parse(savedWalls);
          if (Array.isArray(parsedWalls) && parsedWalls.length > 0) {
            setWalls(parsedWalls);
          }
        } catch (e) {
          console.error('Failed to parse walls from localStorage', e);
        }
      }
    }

    prefill();
  }, [quoteId]);

  const handleAddWall = () => {
    setWalls((prev) => {
      const last = prev[prev.length - 1];
      const newWall: Wall = {
        lengte: '',
        hoogte: '',
        balkafstand: last ? last.balkafstand : '600',
        opmerkingen: '',
      };
      return [...prev, newWall];
    });
  };

  const handleRemoveWall = (index: number) => {
    if (walls.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Kan niet verwijderen',
        description: 'Er moet minimaal één wand overblijven.',
      });
      return;
    }
    const newWalls = walls.filter((_, i) => i !== index);
    setWalls(newWalls);
  };

  const handleWallChange = (index: number, field: keyof Wall, value: string) => {
    setWalls((prev) => prev.map((wall, i) => (i === index ? { ...wall, [field]: value } : wall)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
    }
  };

  const isNextDisabled = saving || walls.some((wall) => !wall.lengte || !wall.hoogte);

  async function saveToFirestoreOrThrow() {
    // Validatie + mapping naar nette Firestore-structuur: "Wand 1", "Wand 2" etc.
    const mapped: SavedWall[] = walls.map((w, idx) => {
      const lengte = toIntOrNull(w.lengte);
      const hoogte = toIntOrNull(w.hoogte);
      const balkafstand = toIntOrNull(w.balkafstand) ?? 600;

      if (lengte === null || hoogte === null) {
        throw new Error('Lengte/hoogte ontbreekt of is ongeldig.');
      }

      return {
        wandNummer: idx + 1,
        lengteMm: lengte,
        hoogteMm: hoogte,
        balkafstandMm: balkafstand,
        opmerkingen: (w.opmerkingen || '').trim(),
      };
    });

    const ref = doc(db, 'quotes', quoteId);

    // Alles onder dezelfde quote doc, georganiseerd:
    // jobData -> wanden -> hsbWand -> wanden: [ ... ]
    await updateDoc(ref, {
      'jobData.wanden.hsbWand.wanden': mapped,
      'jobData.wanden.hsbWand.updatedAt': serverTimestamp(),
      // optioneel: stap-status (handig voor overzicht/voortgang)
      'jobData.wanden.hsbWand.isCompleted': true,
      updatedAt: serverTimestamp(),
    });
  }

  const handleSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (walls.some((wall) => !wall.lengte || !wall.hoogte)) {
      toast({
        variant: 'destructive',
        title: 'Ontbrekende gegevens',
        description: 'Vul a.u.b. de lengte en hoogte voor alle wanden in.',
      });
      return;
    }

    setSaving(true);

    try {
      // 1) localStorage bewaren (snelle UX)
      localStorage.setItem(`quote-${quoteId}-hsb-wand`, JSON.stringify(walls));

      // 2) Firestore bewaren (echte bron van waarheid)
      await saveToFirestoreOrThrow();

      // 3) Next step
      router.push(`/offertes/${quoteId}/klus/wanden/hsb-wand/materialen`);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Opslaan mislukt',
        description: e?.message || 'Er ging iets mis bij het opslaan in de database.',
      });
      setSaving(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="grid w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 py-3">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/wanden`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>

        <div className="text-center">
          <h1 className="font-semibold text-lg">HSB Wand</h1>
          <p className="text-xs text-muted-foreground">stap 4 van 6</p>
        </div>

        <div className="flex items-center justify-end">
          {loading ? <div className="h-4 bg-muted rounded w-32 animate-pulse"></div> : quote ? <p className="text-sm text-muted-foreground truncate"></p> : null}
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
                      <CardDescription>Specificeer de afmetingen en details voor deze wand.</CardDescription>
                    </div>

                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveWall(index)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2"
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Verwijder wand</span>
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`lengte-${index}`}>Lengte (mm) *</Label>
                        <Input
                          id={`lengte-${index}`}
                          type="number"
                          placeholder="Bijv. 5000"
                          required
                          value={wall.lengte}
                          onChange={(e) => handleWallChange(index, 'lengte', e.target.value)}
                          onKeyDown={handleKeyDown}
                          disabled={saving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`hoogte-${index}`}>Hoogte (mm) *</Label>
                        <Input
                          id={`hoogte-${index}`}
                          type="number"
                          placeholder="Bijv. 2600"
                          required
                          value={wall.hoogte}
                          onChange={(e) => handleWallChange(index, 'hoogte', e.target.value)}
                          onKeyDown={handleKeyDown}
                          disabled={saving}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`balkafstand-${index}`}>Balkafstand (h.o.h.)</Label>
                      <Input
                        id={`balkafstand-${index}`}
                        type="number"
                        placeholder="Bijv. 600"
                        value={wall.balkafstand}
                        onChange={(e) => handleWallChange(index, 'balkafstand', e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <p className="text-xs text-muted-foreground">Hart-op-hart afstand tussen de balken.</p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                      <p className="text-xs text-muted-foreground">Alleen invullen bij bijzondere situaties. Meestal kun je dit leeg laten.</p>
                      <Textarea
                        id={`opmerkingen-${index}`}
                        placeholder="Bijzondere details, alleen indien nodig…"
                        value={wall.opmerkingen}
                        onChange={(e) => handleWallChange(index, 'opmerkingen', e.target.value)}
                        disabled={saving}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button type="button" variant="outline" className="w-full mt-6" onClick={handleAddWall} disabled={saving}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Wand toevoegen
            </Button>

            <div className="mt-6 flex justify-between items-center">
              <Button variant="outline" asChild disabled={saving}>
                <Link href={`/offertes/${quoteId}/klus/wanden`}>Terug</Link>
              </Button>

              <Button
                type="submit"
                disabled={isNextDisabled}
                onClick={handleSubmit}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed"
              >
                {saving ? 'Opslaan…' : 'Volgende'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
