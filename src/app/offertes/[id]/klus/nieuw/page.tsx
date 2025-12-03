import { createJobAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import type { JobCategory } from '@/lib/types';
import { WallIcon, CeilingIcon, FloorIcon, RoofIcon, FrameIcon } from '@/components/icons';
import { CategoryCard } from '@/components/category-card';

const categories: { name: JobCategory; description: string; icon: React.ElementType }[] = [
    { name: "Wanden", description: "Binnen- en buitenwanden", icon: WallIcon },
    { name: "Plafonds", description: "Verlaagde en afgewerkte plafonds", icon: CeilingIcon },
    { name: "Vloeren", description: "Houten vloeren en ondervloeren", icon: FloorIcon },
    { name: "Daken", description: "Dakconstructies en -bedekking", icon: RoofIcon },
    { name: "Kozijnen / Deuren", description: "Stellen en afhangen", icon: FrameIcon },
    { name: "Overig / Maatwerk", description: "Specifiek timmerwerk", icon: PlusCircle },
]

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
                    {categories.map(category => (
                        <CategoryCard key={category.name} quoteId={quoteId} category={category} />
                    ))}
                </div>
            </div>
        </main>
    );
}
