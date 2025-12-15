
'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { JobCategory, Quote } from '@/lib/types';
import { JobIcon, type IconName } from '@/components/icons';
import { getQuoteById } from '@/lib/data';
import { Progress } from '@/components/ui/progress';

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

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

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

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

  const subcategories: Subcategory[] = useMemo(
    () => [
      { name: 'Wanden', title: 'HSB Voorzetwand', description: 'Enkelzijdig bekleed', icon: 'wall', slug: 'hsb-voorzetwand', href: `/offertes/${quoteId}/klus/wanden/hsb-wand` },
      { name: 'Wanden', title: 'Metalstud Voorzetwand', description: 'Enkelzijdig bekleed', icon: 'wall', slug: 'metalstud-voorzetwand', href: `/offertes/${quoteId}/klus/wanden/metalstud-wand` },
      { name: 'Wanden', title: 'HSB Tussenwand', description: 'Dubbelzijdig bekleed', icon: 'wall', slug: 'hsb-tussenwand', href: `/offertes/${quoteId}/klus/wanden/hsb-tussenwand` },
      { name: 'Wanden', title: 'Metalstud Tussenwand', description: 'Dubbelzijdig bekleed', icon: 'wall', slug: 'metalstud-tussenwand', href: `/offertes/${quoteId}/klus/wanden/metalstud-tussenwand` },
      { name: 'Wanden', title: 'HSB Buitenwand', description: 'Binnen/Buitenzijde bekleed', icon: 'wall', slug: 'hsb-buitenwand', href: `/offertes/${quoteId}/klus/wanden/hsb-buitenwand` },
      { name: 'Wanden', title: 'Overig Wanden', description: 'Afwijkende wandopbouw', icon: 'plus', slug: 'overig-wanden', href: `/offertes/${quoteId}/klus/wanden/overig-wanden` },
    ],
    [quoteId]
  );

  const slaKaartOpEnNavigeer = (item: Subcategory) => {
    if (!quoteId) return;

    startTransition(() => {
      (async () => {
        try {
          const quoteRef = doc(firestore, 'quotes', quoteId);

          await updateDoc(quoteRef, {
            'jobCards.wanden': {
              title: item.title,
              description: item.description,
              slug: item.slug,
              updatedAt: serverTimestamp(),
            },
            updatedAt: serverTimestamp(),
          });

          router.push(item.href);
        } catch (err) {
          console.error('Fout bij opslaan jobCards.wanden:', err);
        }
      })();
    });
  };

  const renderCardContent = (item: Subcategory) => (
    <div
      className={cn(
        'group h-[110px] cursor-pointer text-left transition-all duration-200 rounded-xl bg-[#131313] border shadow-soft-sm hover:scale-[1.02] active:scale-[0.98]',
        'border-[rgba(255,0,0,0.2)]',
        'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10',
        isPending && 'opacity-70'
      )}
    >
      <div className="w-full h-full text-left p-0">
        <div className="p-4 flex items-center gap-4 h-full">
          <JobIcon name={item.icon} className="w-6 h-6 text-primary flex-shrink-0" />
          <div className="flex flex-col">
            <h3 className="font-semibold text-base text-white">{item.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const progressValue = (3 / 6) * 100;

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-auto w-full grid-cols-3 items-center border-b bg-background/95 px-4 pt-3 pb-2 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/nieuw`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>

        <div className="text-center flex flex-col items-center">
          <h1 className="font-semibold text-lg">Wanden</h1>
          <Progress value={progressValue} className="h-1 w-1/2 mt-1" />
        </div>

        <div className="flex items-center justify-end">
          {loading ? <div className="h-4 bg-muted rounded w-32 animate-pulse" /> : quote ? <p className="text-sm text-muted-foreground truncate" /> : null}
        </div>
      </header>

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {subcategories.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => slaKaartOpEnNavigeer(item)}
                className="h-full text-left"
                disabled={isPending}
              >
                {renderCardContent(item)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
