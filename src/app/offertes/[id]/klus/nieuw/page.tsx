'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Search, ArrowLeft, ChevronRight, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getQuoteById } from '@/lib/data';
import type { JobCategory, Quote } from '@/lib/types';
import { PersonalNotes } from '@/components/PersonalNotes';

// ✅ Firebase imports
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

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
  
  { name: 'Dakkapellen', description: 'Plaatsen (prefab/maatwerk) en renovatie', slug: 'dakkapellen' },
  { name: 'Dakrenovatie', description: 'Dakbedekking, pannen & boeiboorden', slug: 'dakrenovatie' },
  { name: 'Gevelbekleding', description: 'Hout, Keralit of kunststof bekleding', slug: 'gevelbekleding' },
  
  { name: 'Schutting', description: 'Hout, beton of composiet tuinafscheiding', slug: 'schutting' },
  { name: 'Overkapping & Houtbouw', description: 'Veranda\'s, schuren & tuinhuizen', slug: 'overkapping' },
  
  { name: 'Afwerkingen', description: 'Plinten, vensterbanken & betimmering', slug: 'afwerkingen' },
  { name: 'Glas zetten', description: 'Isolatieglas (HR++) & enkel glas', slug: 'glas-zetten' },
  
  { name: 'Trappen', description: 'Traprenovatie, nieuwe trappen & vlizotrappen', slug: 'trappen' },
  { name: 'Houtrotreparatie', description: 'Herstel met epoxy of inzetstukken', slug: 'houtrotreparatie' },
  
  { name: 'Interieur & Kasten', description: 'Inbouwkasten, ensuite & meubels op maat', slug: 'interieur' },
  { name: 'Keukens', description: 'Montage en renovatie van keukens', slug: 'keukens' },
  { name: 'Dakramen / Lichtkoepel', description: 'Velux dakramen & lichtkoepels', slug: 'dakramen' },
];

export default function NewJobPage() {
  const params = useParams();
  const quoteId = params.id as string;

  // ✅ Hooks voor User & DB
  const { user } = useUser();
  const firestore = useFirestore();

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

  if (!isMounted) return null;

  return (
    <main className="relative min-h-screen bg-background flex flex-col">
      {/* HEADER */}
      <header className="border-b bg-background">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl shrink-0"
            >
              <Link href={`/offertes/${quoteId}/edit`}>
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
    </main>
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
}: {
  quoteId: string;
  category: CategoryItem;
  isFav: boolean;
  onToggleFav: (naam: string) => void;
}) {
  // ✅ ROUTING FIX: Use the clean slug, not the raw name
  const href = `/offertes/${quoteId}/klus/nieuw/${category.slug}`;

  const STAR_ZONE_W = 44; 

  return (
    <div
      className={cn(
        'relative flex items-center justify-between h-full rounded-xl border bg-card transition-all duration-200 overflow-hidden',
        'hover:border-emerald-600/50 hover:bg-secondary/20',
        'active:scale-[0.98]',
        'p-3 sm:p-4',
        'min-h-[64px] sm:min-h-[76px]'
      )}
    >
      {/* ⭐ STAR ZONE */}
      <button
        type="button"
        aria-label="Favoriet togglen"
        onClick={() => onToggleFav(category.name)}
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

      {/* LINK OVERLAY */}
      <Link
        href={href}
        className="absolute inset-0 z-10"
        style={{ left: STAR_ZONE_W }}
        aria-label={`${category.name} openen`}
      />

      {/* CONTENT */}
      <div className="relative z-15 flex items-center justify-between w-full">
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