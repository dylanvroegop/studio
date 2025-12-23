'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CategoryCard } from '@/components/category-card';
import { getQuoteById } from '@/lib/data';
import type { JobCategory, Quote } from '@/lib/types';
import type { IconName } from '@/components/icons';
import { cn } from '@/lib/utils';

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

  const progressValue = (2 / 6) * 100;

  const filteredCategories = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [zoekterm]);

  if (!isMounted) return null;

  return (
    <main className="relative min-h-screen bg-background">
      {/* Header (scrolls away) */}
      <header className="border-b bg-background/80 backdrop-blur-xl">
      <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-9 w-9 rounded-xl">
              <Link href={`/offertes/${quoteId}/edit`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1 text-center">
              <div className="text-sm font-semibold">Kies een klus</div>

              <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-primary/65 transition-all"
                  style={{ width: `${progressValue}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StapPunt index={1} label="Klant" klaar />
                <StapPunt index={2} label="Klus" actief />
                <StapPunt index={3} label="Maten" />
                <StapPunt index={4} label="Materialen" />
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-end">
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
      </header>

      {/* Content */}
      <div className="px-4 py-6 max-w-5xl mx-auto">
        <div className="rounded-3xl border bg-card/50 p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCategories.map((category) => (
              <div
                key={category.name}
                className={cn(
                  'relative rounded-2xl',
                  selectedName === category.name && 'ring-2 ring-primary/25'
                )}
                onPointerDown={() => setSelectedName(category.name)}
                onPointerUp={() => setSelectedName(null)}
                onPointerCancel={() => setSelectedName(null)}
              >
                <CategoryCard
                  quoteId={quoteId}
                  category={{
                    name: category.name,
                    description: category.description,
                    iconName: category.icon,
                  }}
                />
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
