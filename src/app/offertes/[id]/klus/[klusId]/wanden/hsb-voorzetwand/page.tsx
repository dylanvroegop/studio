'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { cn } from '@/lib/utils';

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

function StapPunt({
  index,
  label,
  actief,
  klaar,
}: {
  index: number;
  label: string;
  actief?: boolean;
  klaar?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 transition-colors',
          actief
            ? 'bg-primary/10 ring-primary/25 text-primary'
            : klaar
              ? 'bg-primary/10 ring-primary/20 text-primary'
              : 'bg-muted/35 ring-border text-muted-foreground'
        )}
      >
        {klaar ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{index}</span>}
      </div>
      <div
        className={cn(
          'truncate text-xs',
          actief ? 'text-foreground/85' : klaar ? 'text-foreground/70' : 'text-muted-foreground'
        )}
      >
        {label}
      </div>
    </div>
  );
}

export default function HsbWandPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;

  const [isMounted, setIsMounted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [wanden, setWanden] = useState<WandForm[]>([standaardWand]);

  const [isPending, startTransition] = useTransition();

  const opslagSleutel = `quote-${quoteId}-klus-${klusId}-hsb-wand`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  useEffect(() => {
    async function prefill() {
      if (!quoteId || !klusId || !firestore) return;

      try {
        const ref = doc(firestore, 'quotes', quoteId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as any;
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

      const savedWalls = localStorage.getItem(opslagSleutel);
      if (savedWalls) {
        try {
          const parsedWalls = JSON.parse(savedWalls);
          if (Array.isArray(parsedWalls) && parsedWalls.length > 0) setWanden(parsedWalls);
        } catch (e) {
          console.error('Failed to parse walls from localStorage', e);
        }
      }
    }

    prefill();
  }, [quoteId, klusId, firestore, opslagSleutel]);

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

  const disabledAll = saving || isPending;
  const isNextDisabled = disabledAll || wanden.some((w) => !w.lengte || !w.hoogte);

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

  // 1=Klant, 2=Klus, 3=Maten, 4=Materialen
  const progressValue = (3 / 6) * 100;

  if (!isMounted) return null;

  return (
    <main className="relative min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-9 w-9 rounded-xl">
              <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1 text-center">
              <div className="text-sm font-semibold">HSB Wand</div>

              <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-primary/65 transition-all"
                  style={{ width: `${progressValue}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StapPunt index={1} label="Klant" klaar />
                <StapPunt index={2} label="Klus" klaar />
                <StapPunt index={3} label="Maten" actief />
                <StapPunt index={4} label="Materialen" />
              </div>
            </div>

            <div className="w-9">
              {loading ? <div className="h-9 w-9 animate-pulse rounded-xl bg-muted/30" /> : quote ? null : null}
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 max-w-5xl mx-auto">
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
                        disabled={disabledAll}
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
                          disabled={disabledAll}
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
                          disabled={disabledAll}
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
                        disabled={disabledAll}
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
                        disabled={disabledAll}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Wand toevoegen = neutraal, groen alleen op hover */}
            <Button
              type="button"
              variant="outline"
              onClick={handleAddWall}
              disabled={disabledAll}
              className={cn(
                'w-full mt-6 rounded-xl transition-colors',
                'hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
              )}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Wand toevoegen
            </Button>

            <div className="mt-6 flex justify-between items-center">
              <Button variant="outline" asChild disabled={disabledAll}>
                <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden`}>Terug</Link>
              </Button>

              {/* ✅ Volgende = altijd groen */}
              <Button
                type="submit"
                disabled={isNextDisabled}
                onClick={handleSubmit}
                className={cn(
                  'rounded-xl text-white',
                  'bg-emerald-600 hover:bg-emerald-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
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
