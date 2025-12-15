
'use client';
import { createJobAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { JobCategory, Quote } from '@/lib/types';
import { CategoryCard } from '@/components/category-card';
import type { IconName } from '@/components/icons';
import { useEffect, useState } from 'react';
import { getQuoteById } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useParams } from 'next/navigation';
import { Progress } from '@/components/ui/progress';

const categories: { name: JobCategory; description: string; icon: IconName }[] = [
    { name: "Wanden", description: "Binnen- en buitenwanden", icon: "wall" },
    { name: "Plafonds", description: "Plafonds met een houten of metalstud frame", icon: "ceiling" },
    { name: "Vloeren", description: "Houten vloeren en ondervloeren", icon: "floor" },
    { name: "Dakrenovatie", description: "Complete dakvernieuwing", icon: "roof" },
    { name: "Isolatiewerken", description: "Isoleren van wanden, daken, vloeren", icon: "wall" },
    { name: "Boeiboorden", description: "Vervangen en bekleden", icon: "fascia" },
    { name: "Kozijnen", description: "Plaatsen en vervangen", icon: "frame" },
    { name: "Deuren", description: "Afhangen van binnen- en buitendeuren", icon: "door" },
    { name: "Gevelbekleding", description: "Hout, kunststof of composiet", icon: "siding" },
    { name: "Glas zetten", description: "Enkel, dubbel of triple glas", icon: "glass" },
    { name: "Afwerkingen", description: "Plinten, architraven en aftimmering", icon: "finishing" },
    { name: "Dakramen / Lichtkoepel", description: "Plaatsen van Velux of andere merken", icon: "window" },
    { name: "Schutting / Tuinafscheiding", description: "Houten of composiet schuttingen", icon: "fence" },
    { name: "Overkapping / Pergola", description: "Houtconstructies voor in de tuin", icon: "pergola" },
    { name: "Overige werkzaamheden", description: "Specifiek timmerwerk", icon: "plus" },
];


export default function NewJobPage() {
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

    const updatedCategories = categories.map(category => {
        if (category.name === "Dakramen") {
            return { ...category, name: "Dakramen / Lichtkoepel" as JobCategory };
        }
        return category;
    });

    const progressValue = (2 / 6) * 100;

    return (
        <main className="flex flex-1 flex-col">
            <header className="sticky top-0 z-10 grid h-auto w-full grid-cols-3 items-center border-b bg-background/95 px-4 pt-3 pb-2 backdrop-blur-sm sm:px-6">
                <div className="flex items-center justify-start">
                    <Button asChild variant="outline" size="icon" className="h-8 w-8">
                        <Link href={`/offertes/${quoteId}/edit`}>
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Terug</span>
                        </Link>
                    </Button>
                </div>
                <div className="text-center flex flex-col items-center">
                    <h1 className="font-semibold text-lg">Kies een klus</h1>
                    <Progress value={progressValue} className="h-1 w-1/2 mt-1" />
                </div>
                <div className="flex items-center justify-end">
                    {loading ? (
                         <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
                    ) : quote ? (
                        <p className="text-sm text-muted-foreground truncate"></p>
                    ) : null}
                </div>
            </header>

            <div className="flex-1 p-4 md:p-6">
                <div className="mx-auto max-w-4xl w-full">
                    <div className="text-center mb-8">
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                        {updatedCategories.map(category => {
                            const cardCategory = {name: category.name, description: category.description, iconName: category.icon};
                            return (
                                <CategoryCard key={category.name} quoteId={quoteId} category={cardCategory} />
                            )
                        })}
                    </div>
                </div>
            </div>
        </main>
    );
}
