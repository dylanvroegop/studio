import { createJobAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import type { JobCategory } from '@/lib/types';
import { WallIcon, CeilingIcon, FloorIcon, RoofIcon, FrameIcon } from '@/components/icons';

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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {categories.map(category => {
                        const createJobWithCategory = createJobAction.bind(null, quoteId, category.name, `Nieuwe klus: ${category.name}`);
                        return (
                            <form action={createJobWithCategory} key={category.name}>
                                <Card className="h-full hover:border-primary transition-colors duration-200 group">
                                    <button type="submit" className="w-full h-full text-left">
                                        <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                            <category.icon className="w-12 h-12 mb-4 text-primary group-hover:scale-110 transition-transform" />
                                            <h3 className="font-semibold text-lg">{category.name}</h3>
                                            <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                                        </CardContent>
                                    </button>
                                </Card>
                            </form>
                        )
                    })}
                </div>
            </div>
        </main>
    );
}
