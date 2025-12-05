'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { supabase } from '@/lib/supabase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, HardHat, Loader2 } from 'lucide-react';

type Material = {
  row_id: string;
  categorie: string;
  materiaalnaam: string;
  prijs: string;
  eenheid: string;
  leverancier: string;
  user_id: string;
};

function PageSkeleton() {
    return (
        <div className="flex flex-col min-h-screen">
             <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 backdrop-blur-xl">
                 <div className="flex items-center gap-2 flex-1">
                    <HardHat className="w-7 h-7 text-primary" />
                    <span className="text-lg font-semibold">OfferteHulp</span>
                 </div>
            </header>
            <main className="flex flex-1 flex-col justify-center items-center gap-4 p-4 md:gap-8 md:p-6">
                <div className="text-center p-8 text-gray-500 flex items-center">
                    <Loader2 className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary" />
                    Pagina laden...
                </div>
            </main>
        </div>
    )
}


export default function MaterialenPage() {
    const { user, isUserLoading } = useUser();
    const router = useRouter();

    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [search, setSearch] = useState('');
    const [supplierFilter, setSupplierFilter] = useState<string>('all');

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    useEffect(() => {
        if (user?.uid) {
            const fetchMaterials = async () => {
                setIsLoading(true);
                setError(null);

                const { data, error } = await supabase
                    .from('materialen_duplicate')
                    .select('*')
                    .eq('user_id', user.uid);

                if (error) {
                    console.error('Fout bij het ophalen van Supabase:', error);
                    setError(`Fout bij het laden van materialen: ${error.message}`);
                    setMaterials([]);
                } else {
                    setMaterials(data as Material[] || []);
                }
                setIsLoading(false);
            };

            fetchMaterials();
        } else if (!isUserLoading) {
            // Not logged in, stop loading
            setIsLoading(false);
        }
    }, [user]);

    const filteredMaterials = useMemo(() => {
        let result = materials;

        if (search) {
            const lowercasedSearch = search.toLowerCase();
            result = result.filter(m =>
                m.materiaalnaam.toLowerCase().includes(lowercasedSearch)
            );
        }

        if (supplierFilter !== 'all') {
            result = result.filter(m => m.leverancier === supplierFilter);
        }

        return result;
    }, [search, supplierFilter, materials]);
    
    const uniqueSuppliers = useMemo(() => {
        return [...new Set(materials.map(m => m.leverancier).filter(Boolean).sort())];
    }, [materials]);

    if (isUserLoading || (!user && !error)) {
        return <PageSkeleton />;
    }

    return (
        <div className="flex flex-col min-h-screen">
             <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 backdrop-blur-xl">
                <Button asChild variant="outline" size="icon" className="h-8 w-8">
                    <Link href="/">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Terug</span>
                    </Link>
                </Button>
                <div className="flex items-center gap-2 flex-1">
                    <HardHat className="w-7 h-7 text-primary" />
                    <span className="text-lg font-semibold">OfferteHulp</span>
                </div>
            </header>
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <div>
                    <h1 className="font-semibold text-2xl md:text-3xl">Materialen & prijzen</h1>
                    <p className="text-muted-foreground">Doorzoek uw materiaalbibliotheek.</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Alle materialen</CardTitle>
                        <CardDescription>
                            Gedownload van uw Supabase database.
                        </CardDescription>
                        <div className="mt-4 flex flex-col md:flex-row gap-2">
                             <Input 
                                placeholder="Zoek op materiaalnaam..." 
                                className="max-w-xs"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                                <SelectTrigger className="w-full md:w-[200px]">
                                    <SelectValue placeholder="Leverancier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Alle leveranciers</SelectItem>
                                    {uniqueSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                                <span>Materialen laden...</span>
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 text-destructive">
                                {error}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Leverancier</TableHead>
                                        <TableHead>Materiaalnaam</TableHead>
                                        <TableHead>Categorie</TableHead>
                                        <TableHead>Eenheid</TableHead>
                                        <TableHead className="text-right">Prijs</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMaterials.length > 0 ? filteredMaterials.map(material => (
                                        <TableRow key={material.row_id}>
                                            <TableCell>{material.leverancier || '—'}</TableCell>
                                            <TableCell className="font-medium">{material.materiaalnaam}</TableCell>
                                            <TableCell>{material.categorie || '—'}</TableCell>
                                            <TableCell>{material.eenheid}</TableCell>
                                            <TableCell className="text-right">{material.prijs}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                Geen materialen gevonden.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
