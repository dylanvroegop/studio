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

export default function IsolatiewerkenPage() {
  const params = useParams();
  const quoteId = params.id as string;
  const [selected, setSelected] = useState<string[]>([]);
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
    { name: 'Isolatiewerken', description: 'Dak isoleren (buitenzijde)', icon: 'roof', href: `/offertes/${quoteId}/klus/isolatiewerken/dak-isoleren` },
    { name: 'Isolatiewerken', description: 'Dak isoleren (binnenzijde)', icon: 'roof', href: `/offertes/${quoteId}/klus/isolatiewerken/dak-isoleren-binnenzijde` },
    { name: 'Isolatiewerken', description: 'Wand isoleren (buitenzijde)', icon: 'wall' },
    { name: 'Isolatiewerken', description: 'Wand isoleren (binnenzijde)', icon: 'wall' },
    { name: 'Isolatiewerken', description: 'Vloer isoleren', icon: 'floor' },
    { name: 'Isolatiewerken', description: 'Overig Isolatiewerk', icon: 'plus' },
  ];

  const handleSelect = (description: string) => {
    setSelected((prev) =>
      prev.includes(description)
        ? prev.filter((item) => item !== description)
        : [...prev, description]
    );
  };
  
    const renderCardContent = (item: Subcategory) => (
      <div
        className={cn(
          "group h-[110px] cursor-pointer text-left transition-all duration-200 rounded-xl bg-[#131313] border shadow-soft-sm hover:scale-[1.02] active:scale-[0.98]",
          selected.includes(item.description) ? "border-primary/80 bg-[#1c1c1c]" : "border-[rgba(255,0,0,0.2)]",
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
        <h1 className="text-center font-semibold text-lg">Isolatiewerken: stap 3 van 6</h1>
        <div className="flex items-center justify-end">
            {loading ? (
                <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
            ) : quote ? (
                <p className="text-sm text-muted-foreground truncate">Offerte voor: {quote.clientName}</p>
            ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-center mb-8">
            <p className="text-muted-foreground">
              Kies het type isolatiewerk.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {subcategories.map((item) => {
                if(item.href) {
                     return (
                        <Link key={item.description} href={item.href} className="h-full">
                            {renderCardContent(item)}
                        </Link>
                    )
                }
                return (
                     <div key={item.description} onClick={() => handleSelect(item.description)} className="h-full">
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
