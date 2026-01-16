'use client';

import { useEffect, useMemo, useState, useCallback, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Search, ArrowLeft, ChevronRight, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getQuoteById } from '@/lib/data';
import type { JobCategory, Quote } from '@/lib/types';
import { PersonalNotes } from '@/components/PersonalNotes';
import { JOB_REGISTRY } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';

// ✅ Firebase imports
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot, setDoc, arrayUnion, arrayRemove, updateDoc } from 'firebase/firestore';

/* ---------------------------------------------
  DATA
--------------------------------------------- */

type CategoryItem = {
  name: JobCategory;
  description: string;
  slug: string; // ✅ Added strict slug for routing
};


// We define slugs manually to ensure they match valid URLs and the Registry keys
const categories: CategoryItem[] = [
  { name: 'Wanden', description: 'HSB, Metal Stud & Cinewalls', slug: 'wanden' },
  { name: 'Plafonds', description: 'Houten & Metal Stud plafonds', slug: 'plafonds' },
  { name: 'Vloeren & Vlieringen', description: 'Vloeropbouw, vlieringen & afwerkvloeren', slug: 'vloeren' },

  { name: 'Deuren', description: 'Afhangen van binnen- en buitendeuren', slug: 'deuren' },
  { name: 'Kozijnen', description: 'Hout/Kunststof kozijnen', slug: 'kozijnen' },
  { name: 'Dakrenovatie', description: 'Dakbedekking, pannen & boeiboorden', slug: 'dakrenovatie' },
  { name: 'Boeiboorden', description: 'Hout of kunststof boeiboorden vervangen', slug: 'boeiboorden' },

  { name: 'Gevelbekleding', description: 'Hout, Keralit of kunststof bekleding', slug: 'gevelbekleding' },
  { name: 'Dakkapellen', description: 'Plaatsen (prefab/maatwerk) en renovatie', slug: 'dakkapellen' },

  { name: 'Schutting', description: 'Hout, beton of composiet tuinafscheiding', slug: 'schutting' },
  { name: 'Overkapping & Houtbouw', description: 'Veranda\'s, schuren & tuinhuizen', slug: 'overkapping' },

  { name: 'Afwerkingen', description: 'Plinten, vensterbanken & betimmering', slug: 'afwerkingen' },
  { name: 'Glas zetten', description: 'Isolatieglas (HR++)', slug: 'glas-zetten' },

  { name: 'Trappen', description: 'Traprenovatie, nieuwe trappen & vlizotrappen', slug: 'trappen' },
  { name: 'Houtrotreparatie', description: 'Herstel met epoxy of inzetstukken', slug: 'houtrotreparatie' },

  { name: 'Inbouwkasten', description: 'Inbouwkasten', slug: 'interieur' },
  { name: 'Meubels Op Maat', description: 'Meubels op maat', slug: 'MEUBELS_OP_MAAT' },
  { name: 'Keukens', description: 'Montage en renovatie van keukens', slug: 'keukens' },
  { name: 'Dakramen / Lichtkoepel', description: 'Velux dakramen & lichtkoepels', slug: 'dakramen' },
  { name: 'Sloopwerk & Logistiek', description: 'Sloopwerk, afvoer en bescherming', slug: 'sloopwerk' },
  { name: 'Constructief', description: 'Stalen balken & Stempelwerk', slug: 'constructief' },
  { name: 'Beveiliging', description: 'Politiekeurmerk Veilig Wonen', slug: 'beveiliging' },
  { name: 'Isolatiewerken', description: 'Zolder- en vloerisolatie', slug: 'isolatie' },
];

export default function NewJobPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;

  // ✅ Hooks voor User & DB
  const { user } = useUser();
  const firestore = useFirestore();
  const [isPending, startTransition] = useTransition();
  const creatingJobRef = useRef(false);

  const [isMounted, setIsMounted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  const [zoekterm, setZoekterm] = useState('');
  const [favorieten, setFavorieten] = useState<string[]>([]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Haal Quote op
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

  // 2. Real-time luisteren naar favorieten in Firestore
  useEffect(() => {
    if (!user || !firestore) return;

    const userRef = doc(firestore, 'users', user.uid);

    // Luister naar wijzigingen in het user document
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const favs = data?.favoriteJobs;
        if (Array.isArray(favs)) {
          setFavorieten(favs);
        } else {
          setFavorieten([]);
        }
      }
    });

    return () => unsubscribe();
  }, [user, firestore]);

  const isFavoriet = useCallback(
    (naam: string) => favorieten.includes(naam),
    [favorieten]
  );

  // 3. Toggle functie met Firestore write
  const toggleFavoriet = async (naam: string) => {
    if (!user || !firestore) return;

    const isAlreadyFav = favorieten.includes(naam);
    const userRef = doc(firestore, 'users', user.uid);

    // Optimistische UI update
    setFavorieten((prev) =>
      isAlreadyFav ? prev.filter((x) => x !== naam) : [...prev, naam]
    );

    try {
      await setDoc(
        userRef,
        {
          favoriteJobs: isAlreadyFav ? arrayRemove(naam) : arrayUnion(naam),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Fout bij opslaan favoriet:', error);
      // Revert bij fout
      setFavorieten((prev) =>
        isAlreadyFav ? [...prev, naam] : prev.filter((x) => x !== naam)
      );
    }
  };

  const filteredCategories = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return categories;

    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [zoekterm]);

  const favorietCategories = useMemo(() => {
    if (!favorieten.length) return [];

    // We match favorites by name, then retrieve the full object (including slug)
    const byName = new Map<string, CategoryItem>(
      categories.map((c) => [c.name, c])
    );

    return favorieten
      .map((naam) => byName.get(naam))
      .filter((c): c is CategoryItem => Boolean(c));
  }, [favorieten]);

  const visibleFavorieten = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return favorietCategories;
    return favorietCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [zoekterm, favorietCategories]);

  const overigeCategories = useMemo(() => {
    const favSet = new Set(favorieten);
    return filteredCategories.filter((c) => !favSet.has(c.name));
  }, [filteredCategories, favorieten]);

  // ✅ Handle category click - create job immediately if only 1 item
  const handleCategoryClick = useCallback((category: CategoryItem) => {
    if (!quoteId || !firestore || creatingJobRef.current) return;

    const categoryData = JOB_REGISTRY[category.slug];
    const hasOnlyOneItem = categoryData?.items?.length === 1;

    if (hasOnlyOneItem && categoryData?.items?.[0]) {
      // Auto-create job for single-item categories
      creatingJobRef.current = true;
      const singleItem = categoryData.items[0];

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
                title: singleItem.title,
                type: category.slug,
                description: singleItem.description,
              },
            });

            router.push(`/offertes/${quoteId}/klus/${nieuweKlusId}/${category.slug}/${singleItem.slug}`);
          } catch (err) {
            console.error('Error creating job:', err);
            creatingJobRef.current = false;
          }
        })();
      });
    } else {
      // Navigate to selection page for multi-item categories
      router.push(`/offertes/${quoteId}/klus/nieuw/${category.slug}`);
    }
  }, [quoteId, firestore, router, startTransition]);

  if (!isMounted) return null;

  return (
    <main className="relative min-h-screen bg-background flex flex-col">
      {/* HEADER */}
      <WizardHeader
        title="Kies een klus"
        backLink={`/offertes/${quoteId}/edit`}
        progress={20}
        quoteId={quoteId}
        rightContent={
          loading ? (
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
          ) : (
            <PersonalNotes quoteId={quoteId} context="Klus keuze" />
          )
        }
      />

      {/* STICKY SEARCH */}
      <div className="bg-background pt-4 pb-3 px-4 max-w-5xl mx-auto w-full">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={zoekterm}
            onChange={(e) => setZoekterm(e.target.value)}
            placeholder="Zoek (bijv. dak, wand, kozijn, isolatie)…"
            className="w-full h-11 rounded-xl border bg-secondary/30 px-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
          />
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 px-4 py-4 max-w-5xl mx-auto w-full pb-24 space-y-6">

        {/* FAVORIETEN */}
        {visibleFavorieten.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Favorieten</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleFavorieten.map((category) => (
                <KlusCard
                  key={`fav-${category.name}`}
                  quoteId={quoteId}
                  category={category}
                  isFav
                  onToggleFav={toggleFavoriet}
                  onClick={handleCategoryClick}
                  disabled={isPending || creatingJobRef.current}
                />
              ))}
            </div>

            <div className="mt-5 h-px bg-border/60" />
          </section>
        )}

        {/* ALLE KLUSSEN */}
        <section>
          {visibleFavorieten.length > 0 && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Alle klussen</h2>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overigeCategories.map((category) => (
              <KlusCard
                key={category.name}
                quoteId={quoteId}
                category={category}
                isFav={isFavoriet(category.name)}
                onToggleFav={toggleFavoriet}
                onClick={handleCategoryClick}
                disabled={isPending || creatingJobRef.current}
              />
            ))}
          </div>

          {filteredCategories.length === 0 && (
            <div className="mt-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted border border-border mb-4">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">Geen klussen gevonden</h3>
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
            <Link href={`/offertes/${quoteId}/edit`}>Terug</Link>
          </Button>
        </div>
      </div>
    </main >
  );
}

/* ---------------------------------------------
  CARD COMPONENT
--------------------------------------------- */

function KlusCard({
  quoteId,
  category,
  isFav,
  onToggleFav,
  onClick,
  disabled,
}: {
  quoteId: string;
  category: CategoryItem;
  isFav: boolean;
  onToggleFav: (naam: string) => void;
  onClick: (category: CategoryItem) => void;
  disabled: boolean;
}) {
  const STAR_ZONE_W = 44;

  return (
    <div
      className={cn(
        'relative flex items-center justify-between h-full rounded-xl border bg-card transition-all duration-200 overflow-hidden',
        'hover:border-emerald-600/50 hover:bg-secondary/20',
        'active:scale-[0.98]',
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
          onToggleFav(category.name);
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

      {/* CLICK OVERLAY */}
      <button
        type="button"
        onClick={() => onClick(category)}
        disabled={disabled}
        className="absolute inset-0 z-10 cursor-pointer"
        style={{ left: STAR_ZONE_W, width: `calc(100% - ${STAR_ZONE_W}px)` }}
        aria-label={`${category.name} openen`}
      />

      {/* CONTENT */}
      <div className="relative z-0 flex items-center justify-between w-full pointer-events-none">
        <div
          className="flex flex-col min-w-0 pr-2"
          style={{ paddingLeft: STAR_ZONE_W }}
        >
          <span className="text-[15px] font-medium text-foreground leading-tight">
            {category.name}
          </span>
          <span className="text-xs text-muted-foreground/85 mt-1 line-clamp-1 leading-snug">
            {category.description}
          </span>
        </div>

        <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition-colors shrink-0" />
      </div>
    </div>
  );
}