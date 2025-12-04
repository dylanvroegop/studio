'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CategoryCard } from '@/components/category-card';
import type { JobCategory } from '@/lib/types';
import { JobIcon, type IconName } from '@/components/icons';

type Subcategory = {
  name: JobCategory;
  description: string;
  icon: IconName;
};

const subcategories: Subcategory[] = [
  { name: 'Afwerkingen', description: 'Vensterbanken & dagkanten', icon: 'finishing' },
  { name: 'Afwerkingen', description: 'Plinten en afwerklatten', icon: 'finishing' },
  { name: 'Afwerkingen', description: 'Afwerking stucnaden', icon: 'wall' },
  { name: 'Afwerkingen', description: 'Aftimmering van trappen', icon: 'finishing' },
  { name: 'Afwerkingen', description: 'Omkastingen en koven', icon: 'siding' },
  { name: 'Afwerkingen', description: 'Omkastingen voor radiatoren', icon: 'siding' },
  { name: 'Afwerkingen', description: 'Diverse houten aftimmering', icon: 'door' },
  { name: 'Afwerkingen', description: 'Specifiek aftimmerwerk', icon: 'plus' },
];

export default function AfwerkingenPage() {
  const params = useParams();
  const quoteId = params.id as string;
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  const handleSelect = (description: string) => {
    setSelected((prev) =>
      prev.includes(description)
        ? prev.filter((item) => item !== description)
        : [...prev, description]
    );
  };

  const handleNext = () => {
    // Navigate to the next step, passing selected subcategories
    // The router.push will be implemented when the next step page is created.
    console.log('Selected subcategories:', selected);
    // router.push(`/offertes/${quoteId}/klus/afwerkingen/details?items=${selected.join(',')}`);
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur-sm shadow-sm">
        <Button asChild variant="outline" size="icon" className="h-8 w-8">
          <Link href={`/offertes/${quoteId}/klus/nieuw`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Terug</span>
          </Link>
        </Button>
        <h1 className="flex-1 text-center font-semibold text-lg -ml-8">Afwerkingen: stap 3 van 4</h1>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-center mb-8">
            <p className="text-muted-foreground">
              Selecteer één of meerdere categorieën afwerking. Voor elke gekozen categorie vult u in de volgende stap de specifieke details en materialen in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {subcategories.map((item) => {
                const cardCategory = {name: item.name, description: item.description, iconName: item.icon};
                // We need a custom implementation here because CategoryCard is tied to server actions
                // which we don't want to use for this multiple-selection-step.
                return (
                     <div key={item.description} onClick={() => handleSelect(item.description)} className="h-full">
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
                    </div>
                )
            })}
          </div>

          <div className="mt-8">
            <Button
              onClick={handleNext}
              disabled={selected.length === 0}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              size="lg"
            >
              Volgende
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
