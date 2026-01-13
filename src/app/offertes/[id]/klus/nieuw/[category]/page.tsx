'use client';

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, notFound } from 'next/navigation'; // Added notFound
import { ArrowLeft, Search, ChevronRight, Star } from 'lucide-react';
import { doc, updateDoc, onSnapshot, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getQuoteById } from '@/lib/data';
import type { Quote } from '@/lib/types';
import { useFirestore, useUser } from '@/firebase';
import { PersonalNotes } from '@/components/PersonalNotes';
import { JOB_REGISTRY, JobSubItem } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';

export default function GenericSubCategoryPage() {
  const params = useParams();
  const router = useRouter();

  const quoteId = params.id as string;
  const categorySlug = params.category as string; // e.g., "wanden", "vloeren"

  // 1. Validate Category from Registry
  const categoryConfig = JOB_REGISTRY[categorySlug];

  // If category doesn't exist in registry, show 404 (optional: or redirect back)
  if (!categoryConfig) {
    // You can also router.push back, but notFound() is safer for invalid URLs
    // notFound(); 
    // For now, let's just return null to prevent crashes if it renders
  }

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

  // 2. Fetch Quote
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

  // 3. Real-time Favorites Sync
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
  const slaKaartOpEnNavigeer = (item: JobSubItem) => {
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
              type: categorySlug, // ✅ Dynamic Type
              description: item.description,
            },
          });

          // ✅ Dynamic Route: /klus/{id}/{category}/{sub-slug}
          // Note: Next step is the Measurement Page
          router.push(`/offertes/${quoteId}/klus/${nieuweKlusId}/${categorySlug}/${item.slug}`);
        } catch (err) {
          console.error('Fout bij opslaan klussen.*.klusomschrijving:', err);
          klusAanmakenRef.current = false;
        }
      })();
    });
  };

  // 6. Filtering Logic
  // We use valid category items or empty array to avoid crashes if invalid category
  const activeItems = categoryConfig ? categoryConfig.items : [];

  const filteredItems = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return activeItems;
    return activeItems.filter(
      (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [zoekterm, activeItems]);

  const visibleFavorieten = useMemo(() => {
    return filteredItems.filter((c) => favorieten.includes(c.title));
  }, [filteredItems, favorieten]);

  const overigeItems = useMemo(() => {
    return filteredItems.filter((c) => !favorieten.includes(c.title));
  }, [filteredItems, favorieten]);

  if (!isMounted) return null;
  if (!categoryConfig) return <div className="p-10 text-center">Categorie niet gevonden.</div>;

  return (
    <main className="relative min-h-screen bg-background flex flex-col">
      {/* HEADER - DYNAMIC */}
      <WizardHeader
        title="Kies een klus"
        backLink={`/offertes/${quoteId}/klus/nieuw`}
        progress={25}
        quoteId={quoteId}
        rightContent={
          loading ? (
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
          ) : (
            <PersonalNotes quoteId={quoteId} />
          )
        }
      />

      {/* STICKY SEARCH */}
      <div className="bg-background pt-4 pb-3 px-4 sticky top-[73px] z-10 border-b shadow-sm max-w-5xl mx-auto w-full">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={zoekterm}
            onChange={(e) => setZoekterm(e.target.value)}
            placeholder={categoryConfig.searchPlaceholder}
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
              <h2 className="text-sm font-semibold text-foreground">Alle {categoryConfig.title.toLowerCase()}</h2>
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
              <h3 className="text-lg font-medium">Geen {categoryConfig.title.toLowerCase()} gevonden</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Probeer een andere zoekterm.
              </p>
            </div>
          )}
        </section>
      </div>


      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" asChild>
            <Link href={`/offertes/${quoteId}/klus/nieuw`}>Terug</Link>
          </Button>
        </div>
      </div>
    </main >
  );
}

/* ---------------------------------------------
  CARD COMPONENT (Identical to before)
--------------------------------------------- */

function KlusCard({
  item,
  isFav,
  onToggleFav,
  onClick,
  disabled
}: {
  item: JobSubItem;
  isFav: boolean;
  onToggleFav: (title: string) => void;
  onClick: (item: JobSubItem) => void;
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