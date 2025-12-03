import { createJobAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import type { JobCategory } from '@/lib/types';
import { CategoryCard } from '@/components/category-card';
import type { IconName } from '@/components/icons';

const categories: { name: JobCategory; description: string; icon: IconName }[] = [
    { name: "Wanden", description: "Binnen- en buitenwanden", icon: "wall" },
    { name: "Plafonds", description: "Verlaagde en afgewerkte plafonds", icon: "ceiling" },
    { name: "Vloeren", description: "Houten vloeren en ondervloeren", icon: "floor" },
    { name: "Dakrenovatie", description: "Complete dakvernieuwing", icon: "roof" },
    { name: "Boeiboorden", description: "Vervangen en bekleden", icon: "fascia" },
    { name: "Kozijnen", description: "Plaatsen en vervangen", icon: "frame" },
    { name: "Deuren", description: "Afhangen van binnen- en buitendeuren", icon: "door" },
    { name: "Gevelbekleding", description: "Hout, kunststof of composiet", icon: "siding" },
    { name: "Glas zetten", description: "Enkel, dubbel of triple glas", icon: "glass" },
    { name: "Afwerkingen", description: "Plinten, architraven en aftimmering", icon: "finishing" },
    { name: "Dakramen", description: "Plaatsen van Velux of andere merken", icon: "window" },
    { name: "Schutting / Tuinafscheiding", description: "Houten of composiet schuttingen", icon: "fence" },
    { name: "Overkapping / Pergola", description: "Houtconstructies voor in de tuin", icon: "pergola" },
    { name: "Overig / Maatwerk", description: "Specifiek timmerwerk", icon: "plus" },
];


export default function NewJobPage({ params }: { params: { id: string } }) {
    const quoteId = params.id;

    return (
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className="max-w-4xl mx-auto w-full">
                <div className="flex items-center gap-4 mb-8">
                    <Button asChild variant="outline" size="icon" className="h-7 w-7">
                        <Link href={`/offertes/${quoteId}`}>
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Terug</span>
                        </Link>
                    </Button>
                    <div>
                        <h1 className="font-semibold text-2xl">Nieuwe klus toevoegen</h1>
                        <p className="text-muted-foreground">Kies een categorie om te beginnen.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    {categories.map(category => {
                        const cardCategory = {name: category.name, description: category.description, iconName: category.icon};
                        return (
                             <CategoryCard key={category.name} quoteId={quoteId} category={cardCategory} />
                        )
                    })}
                </div>
            </div>
        </main>
    );
}
