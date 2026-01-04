'use client';

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, ChevronRight, Star } from 'lucide-react';
import { doc, updateDoc, onSnapshot, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getQuoteById } from '@/lib/data';
import type { JobCategory, Quote } from '@/lib/types';
import { useFirestore, useUser } from '@/firebase';
import { PersonalNotes } from '@/components/PersonalNotes';

/* ---------------------------------------------
  DATA (Wanden Options)
--------------------------------------------- */
type Subcategory = {
  name: JobCategory;
  title: string;
  description: string;
  slug: string;
  href: string; // Dynamic, built later
};

// Base options without the dynamic quoteId/href part
const WANDEN_OPTIONS = [
  {
    name: 'Wanden' as JobCategory,
    title: 'HSB Voorzetwand',
    description: 'Enkelzijdig bekleed',
    slug: 'hsb-voorzetwand',
  },
  {
    name: 'Wanden' as JobCategory,
    title: 'Metalstud Voorzetwand',
    description: 'Enkelzijdig bekleed',
    slug: 'metalstud-voorzetwand',
  },
  {
    name: 'Wanden' as JobCategory,
    title: 'HSB Tussenwand',
    description: 'Dubbelzijdig bekleed',
    slug: 'hsb-tussenwand',
  },
  {
    name: 'Wanden' as JobCategory,
    title: 'Metalstud Tussenwand',
    description: 'Dubbelzijdig bekleed',
    slug: 'metalstud-tussenwand',
  },
  {
    name: 'Wanden' as JobCategory,
    title: 'HSB Buitenwand',
    description: 'Binnen/Buitenzijde bekleed',
    slug: 'hsb-buitenwand',
  },
  {
    name: 'Wanden' as JobCategory,
    title: 'Overig Wanden',
    description: 'Afwijkende wandopbouw',
    slug: 'overig-wanden',
  },
];

export default function WandenPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  
  // ✅ Hooks
  const { user } = useUser();
  const firestore = useFirestore();
  const [isPending, startTransition] = useTransition();

  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  
  // Search & Favorites State
  const [zoekterm, setZoekterm] = useState('');
  const [favorieten, setFavorieten] = useState<string[]>([]);

  // ✅ HARD LOCK tegen dubbelklikken
  const klusAanmakenRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Fetch Quote
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

  // 2. Real-time Favorites Sync
  useEffect(() => {
    if (!user || !firestore) return;
    const userRef = doc(firestore, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const favs = data?.favoriteJobs;
        if (Array.isArray(favs)) setFavorieten(favs);
        else setFavorieten([]);
      }
    });
    return () => unsubscribe();
  }, [user, firestore]);

  // 3. Prepare Data with proper Hrefs (kept for reference, though logic uses item directly)
  const subcategories: Subcategory[] = useMemo(() => {
    return WANDEN_OPTIONS.map(opt => ({
      ...opt,
      href: `/offertes/${quoteId}/klus/wanden/${opt.slug}` // Just a placeholder, actual routing logic is below
    }));
  }, [quoteId]);

  // 4. Favorites Logic
  const isFavoriet = useCallback(
    (title: string) => favorieten.includes(title),
    [favorieten]
  );

  const toggleFavoriet = async (title: string) => {
    if (!user || !firestore) return;
    const isAlreadyFav = favorieten.includes(title);
    const userRef = doc(firestore, 'users', user.uid);

    // Optimistic Update
    setFavorieten((prev) =>
      isAlreadyFav ? prev.filter((x) => x !== title) : [...prev, title]
    );

    try {
      await setDoc(
        userRef,
        { favoriteJobs: isAlreadyFav ? arrayRemove(title) : arrayUnion(title) },
        { merge: true }
      );
    } catch (error) {
      console.error('Error saving favorite:', error);
      // Revert
      setFavorieten((prev) =>
        isAlreadyFav ? [...prev, title] : prev.filter((x) => x !== title)
      );
    }
  };

  // 5. THE CRITICAL LOGIC: Create ID -> Save -> Route
  const slaKaartOpEnNavigeer = (item: Subcategory) => {
    if (!quoteId || !firestore) return;

    // ✅ 1e klik wint. Alle volgende kliks negeren.
    if (klusAanmakenRef.current) return;

    klusAanmakenRef.current = true;

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
        }
      })();
    });
  };

  // 6. Filtering Logic
  const filteredItems = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return subcategories;
    return subcategories.filter(
      (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [zoekterm, subcategories]);

  const visibleFavorieten = useMemo(() => {
    return filteredItems.filter((c) => favorieten.includes(c.title));
  }, [filteredItems, favorieten]);

  const overigeItems = useMemo(() => {
    return filteredItems.filter((c) => !favorieten.includes(c.title));
  }, [filteredItems, favorieten]);

  if (!isMounted) return null;

  return (
    <main className="relative min-h-screen bg-background flex flex-col">
      {/* HEADER - WANDEN STYLE (Red Progress Bar) */}
      <header className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl shrink-0">
              <Link href={`/offertes/${quoteId}/klus/nieuw`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1">
              <div className="text-sm font-semibold text-center">Kies een klus</div>

              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted/40 mx-auto">
                  <div
                    className="h-full rounded-full bg-primary/65 transition-all"
                    style={{ width: '25%' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center shrink-0">
              {loading ? (
                <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
              ) : (
                <PersonalNotes quoteId={quoteId} />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* STICKY SEARCH */}
      <div className="bg-background pt-4 pb-3 px-4 sticky top-[73px] z-10 border-b shadow-sm max-w-5xl mx-auto w-full">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={zoekterm}
            onChange={(e) => setZoekterm(e.target.value)}
            placeholder="Zoek wandtype..."
            className="w-full h-11 rounded-xl border bg-secondary/30 px-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
          />
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="flex-1 px-4 py-4 max-w-5xl mx-auto w-full pb-24 space-y-6">
        
        {/* FAVORITES SECTION */}
        {visibleFavorieten.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Favorieten</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleFavorieten.map((item) => (
                <KlusCard
                  key={`fav-${item.slug}`}
                  item={item}
                  isFav={true}
                  onToggleFav={toggleFavoriet}
                  onClick={slaKaartOpEnNavigeer}
                  disabled={isPending || klusAanmakenRef.current}
                />
              ))}
            </div>
            <div className="mt-5 h-px bg-border/60" />
          </section>
        )}

        {/* ALL ITEMS SECTION */}
        <section>
          {visibleFavorieten.length > 0 && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Alle wanden</h2>
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overigeItems.map((item) => (
              <KlusCard
                key={item.slug}
                item={item}
                isFav={isFavoriet(item.title)}
                onToggleFav={toggleFavoriet}
                onClick={slaKaartOpEnNavigeer}
                disabled={isPending || klusAanmakenRef.current}
              />
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="mt-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted border border-border mb-4">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">Geen wanden gevonden</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Probeer een andere zoekterm.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ---------------------------------------------
  CARD COMPONENT (Identical to NewJobPage)
--------------------------------------------- */

function KlusCard({
  item,
  isFav,
  onToggleFav,
  onClick,
  disabled
}: {
  item: Subcategory;
  isFav: boolean;
  onToggleFav: (title: string) => void;
  onClick: (item: Subcategory) => void;
  disabled: boolean;
}) {
  const STAR_ZONE_W = 44; 

  return (
    <div
      className={cn(
        'relative flex items-center justify-between h-full rounded-xl border bg-card transition-all duration-200 overflow-hidden',
        'hover:border-emerald-600/50 hover:bg-secondary/20',
        'active:scale-[0.98]',
        // Disabled state
        disabled && 'opacity-60 pointer-events-none',
        'p-3 sm:p-4',
        'min-h-[64px] sm:min-h-[76px]'
      )}
    >
      {/* ⭐ STAR ZONE */}
      <button
        type="button"
        aria-label="Favoriet togglen"
        onClick={(e) => {
          e.stopPropagation(); 
          onToggleFav(item.title);
        }}
        className={cn(
          'absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center',
          'hover:bg-secondary/30 active:bg-secondary/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/25'
        )}
        style={{ width: STAR_ZONE_W }}
      >
        <Star
          className={cn(
            'h-4 w-4 transition-colors',
            isFav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/35'
          )}
        />
      </button>

      {/* CLICK OVERLAY (Triggers Creation Logic) */}
      <button
        type="button"
        onClick={() => onClick(item)}
        disabled={disabled}
        className="absolute inset-0 z-10 w-full h-full cursor-pointer"
        style={{ left: STAR_ZONE_W, width: `calc(100% - ${STAR_ZONE_W}px)` }}
        aria-label={`${item.title} selecteren`}
      />

      {/* CONTENT */}
      <div className="relative z-0 flex items-center justify-between w-full pointer-events-none">
        <div
          className="flex flex-col min-w-0 pr-2"
          style={{ paddingLeft: STAR_ZONE_W }}
        >
          <span className="text-[15px] font-medium text-foreground leading-tight">
            {item.title}
          </span>
          <span className="text-xs text-muted-foreground/85 mt-1 line-clamp-1 leading-snug">
            {item.description}
          </span>
        </div>

        <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition-colors shrink-0" />
      </div>
    </div>
  );
}