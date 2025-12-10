
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { JobCategory, Quote } from '@/lib/types';
import { JobIcon, type IconName } from '@/components/icons';
import { getQuoteById } from '@/lib/data';

type Subcategory = {
  name: JobCategory;
  description: string;
  icon: IconName;
  href?: string;
};

export default function KozijnenPage() {
  const params = useParams();
  const quoteId = params.id as string;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

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

  const subcategories: Subcategory[] = [
    { name: 'Kozijnen', description: 'Compleet nieuw binnen kozijn – Hout', icon: 'frame', href: `/offertes/${quoteId}/klus/kozijnen/compleet-nieuw-binnen-kozijn-hout` },
    { name: 'Kozijnen', description: 'Compleet nieuw binnen kozijn – Staal', icon: 'frame', href: `/offertes/${quoteId}/klus/kozijnen/compleet-nieuw-binnen-kozijn-staal` },
    { name: 'Kozijnen', description: 'Compleet nieuw buiten kozijn – Hout', icon: 'frame', href: `/offertes/${quoteId}/klus/kozijnen/compleet-nieuw-buiten-kozijn-hout` },
    { name: 'Kozijnen', description: 'Compleet nieuw buiten kozijn – Kunststof', icon: 'frame', href: `/offertes/${quoteId}/klus/kozijnen/compleet-nieuw-buiten-kozijn-kunststof` },
    { name: 'Kozijnen', description: 'Zelfgemaakte Kozijnen', icon: 'frame', href: `/offertes/${quoteId}/klus/kozijnen/zelfgemaakte-kozijnen` },
    { name: 'Kozijnen', description: 'Overig Kozijnen', icon: 'plus', href: `/offertes/${quoteId}/klus/kozijnen/overig-kozijnen` },
  ];

  const renderCardContent = (item: Subcategory) => (
      <div
        className={cn(
          "group h-[110px] cursor-pointer text-left transition-all duration-200 rounded-xl bg-[#131313] border shadow-soft-sm hover:scale-[1.02] active:scale-[0.98]",
          "border-[rgba(255,0,0,0.2)]",
          "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
        )}
      >
        <div className="w-full h-full text-left p-0">
            <div className="p-4 flex items-center gap-4 h-full">
                <JobIcon name={item.icon} className="w-6 h-6 text-primary flex-shrink-0" />
                <div className="flex flex-col">
                <h3 className="font-semibold text-base text-white">{item.description}</h3>
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}/klus/nieuw`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <div className="text-center">
            <h1 className="font-semibold text-lg">Kozijnen:</h1>
            <p className="text-xs text-muted-foreground">stap 3 van 6</p>
        </div>
        <div className="flex items-center justify-end">
            {loading ? (
                <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
            ) : quote ? (
                <p className="text-sm text-muted-foreground truncate"></p>
            ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {subcategories.map((item) => {
              if (item.href) {
                return (
                  <Link key={item.description} href={item.href} className="h-full">
                    {renderCardContent(item)}
                  </Link>
                );
              }
              return (
                     <div key={item.description} className="h-full">
                        {renderCardContent(item)}
                    </div>
              )
            })}
          </div>

        </div>
      </div>
    </main>
  );
}
