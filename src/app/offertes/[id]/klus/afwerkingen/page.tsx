'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Subcategory = {
  id: string;
  title: string;
  count: number;
};

const subcategories: Subcategory[] = [
  { id: 'vensterbanken', title: 'Vensterbanken & Dagkanten', count: 0 },
  { id: 'plinten', title: 'Plinten & Afwerklatten', count: 0 },
  { id: 'stucnaden', title: 'Muur- & Plafond Afwerking Stucnaden', count: 0 },
  { id: 'trap', title: 'Trap Afwerking', count: 0 },
  { id: 'koof', title: 'Koof / Omkasting Afwerking', count: 0 },
  { id: 'radiator', title: 'Radiator Omkastingen', count: 0 },
  { id: 'binnen', title: 'Diverse Houten Aftimmering Binnen', count: 0 },
  { id: 'overig', title: 'Overig Aftimmeren', count: 0 },
];

export default function AfwerkingenPage({ params }: { params: { id: string } }) {
  const quoteId = params.id;
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  const handleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
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
        <div className="max-w-2xl mx-auto w-full">
          <div className="text-center mb-8">
            <p className="text-muted-foreground">
              Selecteer één of meerdere categorieën afwerking. Voor elke gekozen categorie vult u in de volgende stap de specifieke details en materialen in.
            </p>
          </div>

          <div className="space-y-4">
            {subcategories.map((item) => {
              const isSelected = selected.includes(item.id);
              return (
                <Card
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    'cursor-pointer transition-all border-2',
                    isSelected ? 'border-primary bg-primary/5' : 'border-card hover:bg-muted/50'
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                       {isSelected ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/50" /> }
                       <CardTitle className="text-base font-medium">{item.title}</CardTitle>
                    </div>
                    <CardDescription>{item.count} werkzaamheden</CardDescription>
                  </CardHeader>
                </Card>
              );
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
