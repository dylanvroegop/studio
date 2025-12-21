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
import { Progress } from '@/components/ui/progress';

import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

type WandForm = {
  lengte: string;
  hoogte: string;
  balkafstand: string;
  opmerkingen: string;
};

type OpgeslagenWand = {
  wandNummer: number;
  lengteMm: number;
  hoogteMm: number;
  balkafstandMm: number;
  opmerkingen: string;
};

const standaardWand: WandForm = {
  lengte: '',
  hoogte: '',
  balkafstand: '600',
  opmerkingen: '',
};

function toIntOrNull(waarde: string): number | null {
  if (!waarde) return null;
  const n = Number(waarde);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export default function HsbWandPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [wanden, setWanden] = useState<WandForm[]>([standaardWand]);

  const opslagSleutel = `quote-${quoteId}-klus-${klusId}-hsb-wand`;

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

  // 2) Prefill: Firestore = bron van waarheid, anders localStorage fallback
  useEffect(() => {
    async function prefill() {
      if (!quoteId || !klusId || !firestore) return;

      // Firestore proberen
      try {
        const ref = doc(firestore, 'quotes', quoteId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as any;

          // ✅ LEES UIT DEZELFDE PLEK ALS WAAR JE OPSLAAT
          const saved = data?.klussen?.[klusId]?.maatwerk as OpgeslagenWand[] | undefined;

          if (Array.isArray(saved) && saved.length > 0) {
            const mapped: WandForm[] = saved.map((w) => ({
              lengte: String(w?.lengteMm ?? ''),
              hoogte: String(w?.hoogteMm ?? ''),
              balkafstand: String(w?.balkafstandMm ?? '600'),
              opmerkingen: String(w?.opmerkingen ?? ''),
            }));

            setWanden(mapped);
            localStorage.setItem(opslagSleutel, JSON.stringify(mapped));
            return;
          }
        }
      } catch (e) {
        console.error('Prefill Firestore mislukt:', e);
      }

      // localStorage fallback (ook klusId-scoped)
      const savedWalls = localStorage.getItem(opslagSleutel);
      if (savedWalls) {
        try {
          const parsedWalls = JSON.parse(savedWalls);
          if (Array.isArray(parsedWalls) && parsedWalls.length > 0) {
            setWanden(parsedWalls);
          }
        } catch (e) {
          console.error('Failed to parse walls from localStorage', e);
        }
      }
    }

    prefill();
  }, [quoteId, klusId, firestore]); // ✅ klusId toegevoegd

  const handleAddWall = () => {
    setWanden((prev) => {
      const last = prev[prev.length - 1];
      const nieuweWand: WandForm = {
        lengte: '',
        hoogte: '',
        balkafstand: last ? last.balkafstand : '600',
        opmerkingen: '',
      };
      return [...prev, nieuweWand];
    });
  };

  const handleRemoveWall = (index: number) => {
    if (wanden.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Kan niet verwijderen',
        description: 'Er moet minimaal één wand overblijven.',
      });
      return;
    }
    setWanden((prev) => prev.filter((_, i) => i !== index));
  };

  const handleWallChange = (index: number, field: keyof WandForm, value: string) => {
    setWanden((prev) => prev.map((wand, i) => (i === index ? { ...wand, [field]: value } : wand)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') e.preventDefault();
  };

  const isNextDisabled = saving || wanden.some((w) => !w.lengte || !w.hoogte);

  async function saveToFirestoreOrThrow() {
    if (!firestore) throw new Error('Firestore ontbreekt.');
    if (!quoteId) throw new Error('quoteId ontbreekt.');
    if (!klusId) throw new Error('klusId ontbreekt in de URL.');

    const mapped: OpgeslagenWand[] = wanden.map((w, idx) => {
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

    const ref = doc(firestore, 'quotes', quoteId);

    // ✅ Alleen deze subpath updaten (geen overwrites van andere job-data)
    await updateDoc(ref, {
      [`klussen.${klusId}.maatwerk`]: mapped,
      [`klussen.${klusId}.updatedAt`]: new Date(),
    });
  }

  const handleSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (wanden.some((w) => !w.lengte || !w.hoogte)) {
      toast({
        variant: 'destructive',
        title: 'Ontbrekende gegevens',
        description: 'Vul a.u.b. de lengte en hoogte voor alle wanden in.',
      });
      return;
    }

    setSaving(true);

    try {
      localStorage.setItem(opslagSleutel, JSON.stringify(wanden));
      await saveToFirestoreOrThrow();

      router.push(`/offertes/${quoteId}/klus/${klusId}/wanden/hsb-voorzetwand/materialen`);
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

  const progressValue = (4 / 6) * 100;

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-auto w-full grid-cols-3 items-center border-b bg-background/95 px-4 pt-3 pb-2 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>

        <div className="text-center flex flex-col items-center">
          <h1 className="font-semibold text-lg">HSB Wand</h1>
          <Progress value={progressValue} className="h-1 w-1/2 mt-1" />
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
              {wanden.map((wand, index) => (
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
                          value={wand.lengte}
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
                          value={wand.hoogte}
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
                        value={wand.balkafstand}
                        onChange={(e) => handleWallChange(index, 'balkafstand', e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <p className="text-xs text-muted-foreground">Hart-op-hart afstand tussen de balken.</p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <Label htmlFor={`opmerkingen-${index}`}>Extra opmerkingen (optioneel)</Label>
                      <p className="text-xs text-muted-foreground">
                        Alleen invullen bij bijzondere situaties. Meestal kun je dit leeg laten.
                      </p>
                      <Textarea
                        id={`opmerkingen-${index}`}
                        placeholder="Bijzondere details, alleen indien nodig…"
                        value={wand.opmerkingen}
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
                <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden`}>Terug</Link>
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
