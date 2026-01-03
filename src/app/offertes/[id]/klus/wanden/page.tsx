'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { JobCategory, Quote } from '@/lib/types';
import { JobIcon, type IconName } from '@/components/icons';
import { getQuoteById } from '@/lib/data';
import { useFirestore } from '@/firebase';
import { PersonalNotes } from '@/components/PersonalNotes';

type Subcategory = {
  name: JobCategory;
  title: string;
  description: string;
  icon: IconName;
  href: string;
  slug: string;
};

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

  // Progress bar: jij bepaalt deze. Voor "Klus" stap was eerder ~33%.
  const progressValue = 33.3333;

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

          router.push(`/offertes/${quoteId}/klus/${nieuweKlusId}/wanden/${item.slug}`);
        } catch (err) {
          console.error('Fout bij opslaan klussen.*.klusomschrijving:', err);
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
      {/* INLINE HEADER (geen component) */}
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl">
              <Link href={`/offertes/${quoteId}/klus/nieuw`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1">
              <div className="text-sm font-semibold text-center">Kies een klus</div>

              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary/65 transition-all"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>
            </div>

            {/* rechter spacer zodat titel écht gecentreerd blijft */}
            <div className="w-11">
              {loading ? <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" /> : null}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-6 max-w-5xl mx-auto pb-24">
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

      {/* Personal Notes floating button */}
      {quoteId && <PersonalNotes quoteId={quoteId} />}
    </main>
  );
}