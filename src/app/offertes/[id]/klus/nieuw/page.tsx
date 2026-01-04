'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Search, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getQuoteById } from '@/lib/data';
import type { JobCategory, Quote } from '@/lib/types';
import { JobIcon, type IconName } from '@/components/icons';
import { PersonalNotes } from '@/components/PersonalNotes';

const categories: { name: JobCategory; description: string; icon: IconName }[] = [
  { name: 'Wanden', description: 'Binnen- en buitenwanden', icon: 'wall' },
  { name: 'Plafonds', description: 'Plafonds met een houten of metalstud frame', icon: 'ceiling' },
  { name: 'Vloeren', description: 'Houten vloeren en ondervloeren', icon: 'floor' },
  { name: 'Dakrenovatie', description: 'Complete dakvernieuwing', icon: 'roof' },
  { name: 'Isolatiewerken', description: 'Isoleren van wanden, daken, vloeren', icon: 'wall' },
  { name: 'Boeiboorden', description: 'Vervangen en bekleden', icon: 'fascia' },
  { name: 'Kozijnen', description: 'Plaatsen en vervangen', icon: 'frame' },
  { name: 'Deuren', description: 'Afhangen van binnen- en buitendeuren', icon: 'door' },
  { name: 'Gevelbekleding', description: 'Hout, kunststof of composiet', icon: 'siding' },
  { name: 'Glas zetten', description: 'Enkel, dubbel of triple glas', icon: 'glass' },
  { name: 'Afwerkingen', description: 'Plinten, architraven en aftimmering', icon: 'finishing' },
  { name: 'Dakramen / Lichtkoepel', description: 'Plaatsen van Velux of andere merken', icon: 'window' },
  { name: 'Schutting / Tuinafscheiding', description: 'Houten of composiet schuttingen', icon: 'fence' },
  { name: 'Overkapping / Pergola', description: 'Houtconstructies voor in de tuin', icon: 'pergola' },
  { name: 'Overige werkzaamheden', description: 'Specifiek timmerwerk', icon: 'plus' },
];

export default function NewJobPage() {
  const params = useParams();

  const [isMounted, setIsMounted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  const [zoekterm, setZoekterm] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const quoteId = isMounted ? (params.id as string) : '';

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

  const filteredCategories = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [zoekterm]);

  if (!isMounted) return null;

  return (
    <main className="relative min-h-screen bg-background">
      {/* INLINE HEADER with notes button */}
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl">
              <Link href={`/offertes/${quoteId}/edit`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1">
              <div className="text-sm font-semibold text-center">Kies een klus</div>

              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary/65 transition-all"
                    style={{ width: '25%' }}
                  />
                </div>
              </div>
            </div>

            {/* Notes button in header */}
            <div className="flex items-center justify-center">
              {loading ? (
                <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
              ) : (
                <PersonalNotes quoteId={quoteId} />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Zoekbalk los onder header */}
      <div className="px-4 pt-4 max-w-5xl mx-auto">
        <div className="flex justify-end">
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={zoekterm}
              onChange={(e) => setZoekterm(e.target.value)}
              placeholder="Zoek klus…"
              className="w-full rounded-2xl border bg-background/20 px-9 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-5xl mx-auto pb-24">
        <div className="rounded-3xl border bg-card/50 p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCategories.map((category) => (
              <div
                key={category.name}
                className={cn('relative rounded-2xl', selectedName === category.name && 'ring-2 ring-primary/25')}
                onPointerDown={() => setSelectedName(category.name)}
                onPointerUp={() => setSelectedName(null)}
                onPointerCancel={() => setSelectedName(null)}
              >
                <Link
                  href={`/offertes/${quoteId}/klus/${category.name.toLowerCase()}`}
                  className={cn(
                    'group relative block h-[112px] w-full overflow-hidden rounded-2xl border text-left transition-all',
                    'bg-[#121212]/80 hover:bg-[#141414]/90',
                    'border-primary/15 hover:border-primary/30',
                    'shadow-sm hover:shadow-lg hover:shadow-primary/10',
                    'active:scale-[0.99]'
                  )}
                >
                  <div className="flex h-full items-center gap-4 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/8 ring-1 ring-primary/15">
                      <JobIcon name={category.icon} className="h-6 w-6 text-primary" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-base font-semibold text-foreground">{category.name}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{category.description}</div>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="absolute -inset-24 bg-[radial-gradient(700px_circle_at_0%_0%,rgba(255,0,0,0.10),transparent_45%)]" />
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {filteredCategories.length === 0 && (
            <div className="mt-6 rounded-2xl border bg-background/20 p-4 text-sm text-muted-foreground">
              Geen resultaten.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}