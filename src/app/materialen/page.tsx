
'use client';

import { useState, useEffect, useMemo, ChangeEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { useUser, useFirestore, useCollection } from '@/firebase';
import { uploadPrijsbestandNaarN8n } from '@/lib/n8n';
import type { Material } from '@/lib/types';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Upload, File, Loader2, HardHat } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

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
                    <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Pagina laden...
                </div>
            </main>
        </div>
    )
}

export default function MaterialenPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const materialsQuery = useMemo(() => {
        if (!user) return null;
        return query(collection(firestore, 'materials'), where('userId', '==', user.uid));
    }, [user, firestore]);
    
    const { data: materials, isLoading: materialsLoading, error } = useCollection<Material>(materialsQuery);

    const [search, setSearch] = useState('');
    const [supplierFilter, setSupplierFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const materialsPerPage = 25;

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    const processedMaterials = useMemo(() => {
        return (materials || []).map(m => {
            const data = m as any;
            let updatedAtDate: Date;
            if (data.updatedAt instanceof Timestamp) {
                updatedAtDate = data.updatedAt.toDate();
            } else if (data.updatedAt instanceof Date) {
                updatedAtDate = data.updatedAt;
            } else if (typeof data.updatedAt === 'string') {
                updatedAtDate = new Date(data.updatedAt);
            } else {
                updatedAtDate = new Date(0); // Invalid date as fallback
            }

            return {
                ...m,
                updatedAt: updatedAtDate,
            } as Material & { id: string, updatedAt: Date };
        });
    }, [materials]);

    const filteredMaterials = useMemo(() => {
        let result = processedMaterials;

        if (search) {
            const lowercasedSearch = search.toLowerCase();
            result = result.filter(m =>
                (m.materiaalnaam && m.materiaalnaam.toLowerCase().includes(lowercasedSearch))
            );
        }

        if (supplierFilter !== 'all') {
            result = result.filter(m => m.leverancier === supplierFilter);
        }

        return result.sort((a, b) => {
             const dateA = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
             const dateB = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
             return dateB - dateA; // Sort descending
        });
    }, [search, supplierFilter, processedMaterials]);
    
    const paginatedMaterials = useMemo(() => {
        const startIndex = (currentPage - 1) * materialsPerPage;
        return filteredMaterials.slice(startIndex, startIndex + materialsPerPage);
    }, [filteredMaterials, currentPage]);

    const pageCount = Math.ceil(filteredMaterials.length / materialsPerPage);
    const uniqueSuppliers = useMemo(() => [...new Set(processedMaterials.map(m => m.leverancier).filter(Boolean).sort())], [processedMaterials]);

    if (isUserLoading || (!materialsLoading && !user)) {
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
                    <p className="text-muted-foreground">Upload een prijslijst voor een specifieke leverancier.</p>
                </div>

                {user && <CsvUploadSection user={user} />}

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
                            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                                <SelectTrigger className="w-[200px]">
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
                        {materialsLoading ? (
                            <div className="space-y-2">
                                {[...Array(10)].map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />)}
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 text-destructive">
                                Fout bij het laden van materialen: {error.message}
                            </div>
                        ) : (
                            <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Leverancier</TableHead>
                                            <TableHead>Materiaalnaam</TableHead>
                                            <TableHead>Categorie</TableHead>
                                            <TableHead>Eenheid</TableHead>
                                            <TableHead className="text-right">Prijs</TableHead>
                                            <TableHead className="text-right">Laatst bijgewerkt</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedMaterials.length > 0 ? paginatedMaterials.map(material => (
                                            <TableRow key={material.id}>
                                                <TableCell>{material.leverancier || '—'}</TableCell>
                                                <TableCell className="font-medium">{material.materiaalnaam}</TableCell>
                                                <TableCell>{material.categorie || '—'}</TableCell>
                                                <TableCell>{material.eenheid}</TableCell>
                                                <TableCell className="text-right">{material.prijs}</TableCell>
                                                <TableCell className="text-right">
                                                    {material.updatedAt instanceof Date && !isNaN(material.updatedAt.getTime()) && material.updatedAt.getTime() > 0
                                                      ? format(material.updatedAt, 'd MMM yyyy', { locale: nl })
                                                      : '—'
                                                    }
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">
                                                    Geen materialen gevonden. Upload een CSV om te beginnen.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                {pageCount > 1 && (
                                     <div className="flex items-center justify-end space-x-2 py-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            Vorige
                                        </Button>
                                        <span className="text-sm text-muted-foreground">Pagina {currentPage} van {pageCount}</span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))}
                                            disabled={currentPage === pageCount}
                                        >
                                            Volgende
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}

function CsvUploadSection({ user }: { user: User }) {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
                 toast({
                    variant: 'destructive',
                    title: 'Bestand te groot',
                    description: 'Selecteer a.u.b. een bestand kleiner dan 10MB.',
                });
                setFile(null);
            } else {
                setFile(selectedFile);
            }
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast({
                variant: 'destructive',
                title: 'Geen bestand geselecteerd',
                description: 'Kies een bestand om te uploaden.',
            });
            return;
        }
        
        // De bestandsnaam (zonder extensie) wordt gebruikt als leveranciersnaam.
        const supplierName = file.name.split('.').slice(0, -1).join('.') || 'onbekend';

        setIsUploading(true);
        try {
            await uploadPrijsbestandNaarN8n(file, user.uid, supplierName);
            
            toast({
                title: 'Upload succesvol',
                description: `Het bestand '${file.name}' wordt verwerkt. De materialenlijst wordt binnen enkele ogenblikken bijgewerkt.`,
            });
            
            // Reset file input after successful upload
            setFile(null); 
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

        } catch (error) {
            console.error("Upload Error:", error);
            const errorMessage = error instanceof Error ? error.message : 'Er is een onbekende fout opgetreden bij het uploaden.';
            toast({
                variant: 'destructive',
                title: 'Upload Mislukt',
                description: errorMessage,
            });
        } finally {
            setIsUploading(false);
        }
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Prijslijst uploaden</CardTitle>
                <CardDescription>
                    Kies een prijslijst (.csv of .pdf) om te uploaden. De bestandsnaam wordt gebruikt als naam voor de leverancier.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="flex flex-col sm:flex-row items-center gap-4">
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".csv,.pdf"
                        className="hidden"
                        id="file-upload-input"
                    />
                    <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        {file ? 'Ander bestand kiezen' : 'Bestand kiezen'}
                    </Button>
                </div>

                 {file && (
                    <div className="mt-4 flex items-center justify-start p-2 border rounded-md bg-muted/50 text-sm">
                        <File className="h-5 w-5 text-muted-foreground mr-2 flex-shrink-0" />
                        <span className="font-medium truncate">{file.name}</span>
                    </div>
                )}

                <div>
                    <Button 
                        onClick={handleUpload} 
                        disabled={isUploading || !file} 
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                        {isUploading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {isUploading ? 'Bezig met uploaden...' : `Bestand uploaden`}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

    