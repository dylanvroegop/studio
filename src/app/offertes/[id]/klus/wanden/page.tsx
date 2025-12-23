'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { JobCategory, Quote } from '@/lib/types';
import { JobIcon, type IconName } from '@/components/icons';
import { getQuoteById } from '@/lib/data';

import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

type Subcategory = {
  name: JobCategory;
  title: string;
  description: string;
  icon: IconName;
  href: string;
  slug: string;
};

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

export default function WandenPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  const firestore = useFirestore();

  const [isMounted, setIsMounted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ✅ HARD LOCK tegen dubbelklikken (maakt 2+ klusId's onmogelijk)
  const klusAanmakenRef = useRef(false);
  const [isKlusAanmaken, setIsKlusAanmaken] = useState(false);

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

  // Zelfde progress-bar als hoofd pagina
  const progressValue = (2 / 6) * 100;

  const subcategories: Subcategory[] = useMemo(
    () => [
      {
        name: 'Wanden',
        title: 'HSB Voorzetwand',
        description: 'Enkelzijdig bekleed',
        icon: 'wall',
        slug: 'hsb-voorzetwand',
        href: `/offertes/${quoteId}/klus/wanden/hsb-wand`,
      },
      {
        name: 'Wanden',
        title: 'Metalstud Voorzetwand',
        description: 'Enkelzijdig bekleed',
        icon: 'wall',
        slug: 'metalstud-voorzetwand',
        href: `/offertes/${quoteId}/klus/wanden/metalstud-wand`,
      },
      {
        name: 'Wanden',
        title: 'HSB Tussenwand',
        description: 'Dubbelzijdig bekleed',
        icon: 'wall',
        slug: 'hsb-tussenwand',
        href: `/offertes/${quoteId}/klus/wanden/hsb-tussenwand`,
      },
      {
        name: 'Wanden',
        title: 'Metalstud Tussenwand',
        description: 'Dubbelzijdig bekleed',
        icon: 'wall',
        slug: 'metalstud-tussenwand',
        href: `/offertes/${quoteId}/klus/wanden/metalstud-tussenwand`,
      },
      {
        name: 'Wanden',
        title: 'HSB Buitenwand',
        description: 'Binnen/Buitenzijde bekleed',
        icon: 'wall',
        slug: 'hsb-buitenwand',
        href: `/offertes/${quoteId}/klus/wanden/hsb-buitenwand`,
      },
      {
        name: 'Wanden',
        title: 'Overig Wanden',
        description: 'Afwijkende wandopbouw',
        icon: 'plus',
        slug: 'overig-wanden',
        href: `/offertes/${quoteId}/klus/wanden/overig-wanden`,
      },
    ],
    [quoteId]
  );

  const slaKaartOpEnNavigeer = (item: Subcategory) => {
    if (!quoteId || !firestore) return;

    // ✅ 1e klik wint. Alle volgende kliks negeren.
    if (klusAanmakenRef.current) return;

    klusAanmakenRef.current = true;
    setIsKlusAanmaken(true);

    startTransition(() => {
      (async () => {
        try {
          const quoteRef = doc(firestore, 'quotes', quoteId);

          const nieuweKlusId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

          await updateDoc(quoteRef, {
            [`klussen.${nieuweKlusId}.klusomschrijving`]: {
              title: item.title,
              type: 'wanden',
              description: item.description,
            },
          });

          // ✅ Belangrijk: we blijven qua “stap” op Klus
          router.push(`/offertes/${quoteId}/klus/${nieuweKlusId}/wanden/${item.slug}`);
        } catch (err) {
          console.error('Fout bij opslaan klussen.*.klusomschrijving:', err);
          // Alleen bij fout unlocken zodat user opnieuw kan proberen
          klusAanmakenRef.current = false;
          setIsKlusAanmaken(false);
        }
      })();
    });
  };

  if (!isMounted) return null;

  const disabled = isPending || isKlusAanmaken;

  return (
    <main className="relative min-h-screen bg-background">
      {/* Header = exact zoals hoofd klus pagina, maar ZONDER zoekbalk */}
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-9 w-9 rounded-xl">
              <Link href={`/offertes/${quoteId}/klus/nieuw`}>
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

            {/* Zelfde “rechterkolom” als hoofd pagina (alleen voor uitlijning) */}
            <div className="w-9">
              {loading ? <div className="h-9 w-9 animate-pulse rounded-xl bg-muted/30" /> : quote ? null : null}
            </div>
          </div>
        </div>
      </header>

      {/* Content = exact hetzelfde frame als hoofd klus pagina */}
      <div className="px-4 py-6 max-w-5xl mx-auto">
        <div className="rounded-3xl border bg-card/50 p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subcategories.map((item) => (
              <div
                key={item.slug}
                className={cn('relative rounded-2xl', selectedSlug === item.slug && 'ring-2 ring-primary/25')}
                onPointerDown={() => setSelectedSlug(item.slug)}
                onPointerUp={() => setSelectedSlug(null)}
                onPointerCancel={() => setSelectedSlug(null)}
              >
                {/* Kaart = dezelfde look/feel als hoofd kaart (hoogte, padding, border, hover) */}
                <button
                  type="button"
                  onClick={() => slaKaartOpEnNavigeer(item)}
                  disabled={disabled}
                  className={cn(
                    'group relative h-[112px] w-full overflow-hidden rounded-2xl border text-left transition-all',
                    'bg-[#121212]/80 hover:bg-[#141414]/90',
                    'border-primary/15 hover:border-primary/30',
                    'shadow-sm hover:shadow-lg hover:shadow-primary/10',
                    'active:scale-[0.99]',
                    disabled && 'pointer-events-none opacity-70'
                  )}
                >
                  <div className="flex h-full items-center gap-4 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/8 ring-1 ring-primary/15">
                      <JobIcon name={item.icon} className="h-6 w-6 text-primary" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-base font-semibold text-foreground">{item.title}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</div>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="absolute -inset-24 bg-[radial-gradient(700px_circle_at_0%_0%,rgba(255,0,0,0.10),transparent_45%)]" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
