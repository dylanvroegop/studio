
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { supabase } from '@/lib/supabase';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { DashboardHeader } from '@/components/dashboard-header';

type Material = {
  row_id: string;
  subsectie: string; // Changed from categorie
  materiaalnaam: string;
  prijs: number | string | null; // Allow for mixed types from DB
  eenheid: string;
  leverancier: string;
  gebruikerid: string; // Changed from user_id
};

function parsePriceToNumber(raw: unknown): number | null {
  if (raw == null) return null;

  if (typeof raw === "number") {
    return Number.isNaN(raw) ? null : raw;
  }

  if (typeof raw !== "string") return null;

  let value = raw.trim();

  // Remove euro sign and any spaces
  value = value.replace(/€/g, "").replace(/\s+/g, "");

  // Remove any characters that are not digit, dot or comma
  value = value.replace(/[^0-9.,-]/g, "");

  if (!value) return null;

  // If there is both '.' and ',', treat '.' as thousands separator and ',' as decimal
  const hasDot = value.includes(".");
  const hasComma = value.includes(",");

  if (hasDot && hasComma) {
    // Remove all dots, use comma as decimal separator
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // Only comma → decimal separator
    value = value.replace(",", ".");
  }
  // Only dot → already decimal, do nothing

  const num = parseFloat(value);
  return Number.isNaN(num) ? null : num;
}


function PageSkeleton() {
    return (
        <div className="flex flex-col min-h-screen">
             <DashboardHeader user={null} />
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
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

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
                    .from('materialen')
                    .select('*')
                    .eq('gebruikerid', user.uid) // Changed from user_id
                    .order('volgorde', { ascending: true }); // Changed from lijst_volgorde

                if (error) {
                    console.error('Fout bij het ophalen van Supabase:', error);
                    setError(`Fout bij het laden van materialen: prijslijst nog niet verwerkt.`);
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

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, supplierFilter, categoryFilter]);


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
        
        if (categoryFilter !== 'all') {
            result = result.filter(m => m.subsectie === categoryFilter); // Changed from categorie
        }

        return result;
    }, [search, supplierFilter, categoryFilter, materials]);

    const totalPages = Math.ceil(filteredMaterials.length / itemsPerPage);
    const paginatedMaterials = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return filteredMaterials.slice(start, end);
    }, [currentPage, filteredMaterials, itemsPerPage]);
    
    const uniqueSuppliers = useMemo(() => {
        return [...new Set(materials.map(m => m.leverancier).filter(Boolean).sort())];
    }, [materials]);

    const uniqueCategories = useMemo(() => {
        return [...new Set(materials.map(m => m.subsectie).filter(Boolean).sort())]; // Changed from categorie
    }, [materials]);

    if (isUserLoading || (!user && !error)) {
        return <PageSkeleton />;
    }

    return (
        <div className="flex flex-col min-h-screen">
             <DashboardHeader user={user} />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <Button asChild variant="outline" size="icon" className="h-8 w-8">
                        <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Terug</span>
                        </Link>
                    </Button>
                    <div>
                        <h1 className="font-semibold text-2xl md:text-3xl">Materialen & Prijzen</h1>
                        <p className="text-muted-foreground">Doorzoek uw materiaalbibliotheek.</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Alle materialen</CardTitle>
                        <div className="mt-4 flex flex-col md:flex-row gap-2">
                             <Input 
                                placeholder="Zoek op materiaalnaam..." 
                                className="max-w-xs"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                                    <SelectTrigger className="w-full md:w-[200px]">
                                        <SelectValue placeholder="Leverancier" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Alle leveranciers</SelectItem>
                                        {uniqueSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="w-full md:w-[200px]">
                                        <SelectValue placeholder="Categorie" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Alle categorieën</SelectItem>
                                        {uniqueCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
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
                                        <TableHead>Materiaalnaam</TableHead>
                                        <TableHead className="text-right">Prijs</TableHead>
                                        <TableHead>Eenheid</TableHead>
                                        <TableHead>Categorie</TableHead>
                                        <TableHead>Leverancier</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedMaterials.length > 0 ? paginatedMaterials.map(material => {
                                        const prijsNumber = parsePriceToNumber(material.prijs);
                                        const prijsLabel =
                                          prijsNumber == null
                                            ? "—"
                                            : new Intl.NumberFormat("nl-NL", {
                                                style: "currency",
                                                currency: "EUR",
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              }).format(prijsNumber);

                                        return (
                                            <TableRow key={material.row_id}>
                                                <TableCell className="font-medium">{material.materiaalnaam}</TableCell>
                                                <TableCell className="text-right">{prijsLabel}</TableCell>
                                                <TableCell>{material.eenheid}</TableCell>
                                                <TableCell>{material.subsectie || '—'}</TableCell>
                                                <TableCell>{material.leverancier || '—'}</TableCell>
                                            </TableRow>
                                        )
                                    }) : (
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
                     {totalPages > 1 && (
                        <CardFooter className="flex items-center justify-center pt-6">
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Vorige
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    Pagina {currentPage} van {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Volgende
                                </Button>
                            </div>
                        </CardFooter>
                    )}
                </Card>
            </main>
        </div>
    );
}
