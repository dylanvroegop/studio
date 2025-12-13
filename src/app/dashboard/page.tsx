
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuth, useFirestore, useUser, addDocumentNonBlocking } from '@/firebase';
import type { Quote } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, HardHat, FilePen, Send, Clock, Copy, PlusCircle, CircleDollarSign, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { format, subDays, isBefore } from 'date-fns';
import { nl } from 'date-fns/locale';
import { DashboardHeader } from '@/components/dashboard-header';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Status = Quote['status'];
type SortOption = 'createdAt_desc' | 'createdAt_asc' | 'amount_desc' | 'amount_asc';


function formatCurrency(amount?: number) {
    if (amount === undefined || amount === null) return '—';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function StatusBadge({ status }: { status: Status }) {
    const statusMap: Record<Status, { text: string; className: string }> = {
      concept: { text: "Concept", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
      in_behandeling: { text: "In behandeling", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
      verzonden: { text: "Verzonden", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
      geaccepteerd: { text: "Geaccepteerd", className: "bg-green-500/20 text-green-400 border-green-500/30" },
      afgewezen: { text: "Afgewezen", className: "bg-red-500/20 text-red-400 border-red-500/30" },
      verlopen: { text: "Verlopen", className: "bg-zinc-700 text-zinc-400 border-zinc-600" },
    };
    const { text, className } = statusMap[status] || statusMap.concept;
    return <Badge variant="outline" className={`hover:${className} ${className}`}>{text}</Badge>;
}

function DashboardSkeleton() {
    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader user={null} />
            <main className="flex flex-1 flex-col justify-center items-center gap-4 p-4 md:gap-8 md:p-6">
                <div className="text-center p-8 text-gray-500 flex items-center">
                    <svg className="animate-spin mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Dashboard laden...
                </div>
            </main>
        </div>
    )
}

function StatCard({ title, value, subtext, icon, className = '' }: { title: string; value: string | number; subtext: string; icon: React.ReactNode; className?: string; }) {
    return (
        <Card className="bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${className}`}>{value}</div>
                <p className="text-xs text-muted-foreground">{subtext}</p>
            </CardContent>
        </Card>
    );
}

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filteredQuotes, setFilteredQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [sortOption, setSortOption] = useState<SortOption>('createdAt_desc');
  const router = useRouter();

  // Handle user auth state
  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  // Fetch quotes from Firestore for the logged-in user
  useEffect(() => {
    if (!user || !firestore) return;
    
    setLoading(true);
    const quotesRef = collection(firestore, 'quotes');
    const q = query(quotesRef, where('userId', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const quotesData: Quote[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote));
        
        // Ensure date fields are valid Date objects for sorting
        quotesData.forEach(quote => {
            if (quote.createdAt?.seconds) {
                quote.createdAt = new Date(quote.createdAt.seconds * 1000);
            }
            if (quote.sentAt?.seconds) {
                quote.sentAt = new Date(quote.sentAt.seconds * 1000);
            }
        });
        
        setQuotes(quotesData);
        setLoading(false);
    }, (error) => {
        console.error("Fout bij ophalen offertes:", error);
        setLoading(false);
    });
    
    return () => unsubscribe();

  }, [user, firestore]);

  // Client-side filtering and sorting
  useEffect(() => {
    let result = quotes;

    // Search filter
    if (search) {
      result = result.filter(quote =>
        quote.title.toLowerCase().includes(search.toLowerCase()) ||
        (quote.clientName && quote.clientName.toLowerCase().includes(search.toLowerCase()))
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(quote => quote.status === statusFilter);
    }

    // Sorting
    result.sort((a, b) => {
        switch (sortOption) {
            case 'createdAt_asc':
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            case 'amount_desc':
                return (b.amount || 0) - (b.amount || 0);
            case 'amount_asc':
                return (a.amount || 0) - (a.amount || 0);
            case 'createdAt_desc':
            default:
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
    });

    setFilteredQuotes(result);
  }, [search, statusFilter, sortOption, quotes]);

  const handleDuplicate = async (quote: Quote) => {
    if (!user || !firestore) return;
    const { id, createdAt, sentAt, status, ...quoteData } = quote;
    try {
        const newDocRef = await addDocumentNonBlocking(collection(firestore, 'quotes'), {
            ...quoteData,
            userId: user.uid,
            status: 'concept',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            title: `${quote.title} (Kopie)`
        });
        if (newDocRef) {
          router.push(`/offertes/${newDocRef.id}`);
        }
    } catch (error) {
        console.error("Fout bij dupliceren offerte:", error);
    }
  }

  // Calculate stats for the stat cards
  const thirtyDaysAgo = subDays(new Date(), 30);
  const openStandCount = quotes.filter(q => q.status === 'concept' || q.status === 'in_behandeling').length;
  const verzondenCount = quotes.filter(q => q.status === 'verzonden').length;
  const geaccepteerd30dSum = quotes
    .filter(q => q.status === 'geaccepteerd' && new Date(q.createdAt) >= thirtyDaysAgo)
    .reduce((sum, q) => sum + (q.amount || 0), 0);

  const fiveDaysAgo = subDays(new Date(), 5);
  const followUps = quotes.filter(q =>
    q.status === 'verzonden' &&
    q.sentAt &&
    isBefore(new Date(q.sentAt as Date), fiveDaysAgo) &&
    q.status !== 'geaccepteerd' &&
    q.status !== 'afgewezen'
  );


  if (isUserLoading || !user) {
    return <DashboardSkeleton />;
  }

  return (
    <TooltipProvider>
    <div className="flex flex-col min-h-screen">
      <DashboardHeader user={user} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                 <Button asChild variant="outline" size="icon">
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Terug</span>
                  </Link>
                </Button>
                <h1 className="font-semibold text-2xl md:text-3xl">Dashboard</h1>
            </div>
        </div>
        
        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Openstaand" value={openStandCount} subtext="Concept + in behandeling" icon={<FilePen className="h-4 w-4 text-muted-foreground" />}/>
            <StatCard title="Verzonden" value={verzondenCount} subtext="Wacht op reactie" icon={<Send className="h-4 w-4 text-muted-foreground" />}/>
            <StatCard title="Geaccepteerd (30d)" value={formatCurrency(geaccepteerd30dSum)} subtext="Totaalbedrag laatste 30 dagen" icon={<CircleDollarSign className="h-4 w-4 text-muted-foreground" />} className="text-green-400" />
            <StatCard title="Opvolgen vandaag" value={followUps.length} subtext="Offertes om achteraan te bellen" icon={<Clock className="h-4 w-4 text-muted-foreground" />} className={followUps.length > 0 ? 'text-orange-400' : ''}/>
        </div>
        
        {/* Follow-up Section */}
        {followUps.length > 0 && (
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-orange-400 w-5 h-5"/> Vandaag te doen</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-3">
                        {followUps.map(quote => (
                            <li key={quote.id}>
                                <Link href={`/offertes/${quote.id}`} className="flex items-center justify-between p-3 -m-3 rounded-lg hover:bg-muted/50 transition-colors">
                                    <div>
                                        <span className="font-medium">{quote.clientName}</span> – offerte "{quote.title}"
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                        {quote.sentAt ? format(new Date(quote.sentAt as Date), 'd MMM yyyy', { locale: nl }) : ''}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </CardContent>
             </Card>
        )}

        {/* Main Quote Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recente Offertes</CardTitle>
            <div className="mt-4 flex flex-col md:flex-row gap-2">
                <Input 
                    placeholder="Zoek op titel of klant..." 
                    className="max-w-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex gap-2">
                     <Select value={statusFilter} onValueChange={(value: Status | 'all') => setStatusFilter(value)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Alle statussen" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle statussen</SelectItem>
                            <SelectItem value="concept">Concept</SelectItem>
                            <SelectItem value="in_behandeling">In behandeling</SelectItem>
                            <SelectItem value="verzonden">Verzonden</SelectItem>
                            <SelectItem value="geaccepteerd">Geaccepteerd</SelectItem>
                            <SelectItem value="afgewezen">Afgewezen</SelectItem>
                            <SelectItem value="verlopen">Verlopen</SelectItem>
                        </SelectContent>
                    </Select>
                     <Select value={sortOption} onValueChange={(value: SortOption) => setSortOption(value)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Sorteren op" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="createdAt_desc">Datum (nieuwste eerst)</SelectItem>
                            <SelectItem value="createdAt_asc">Datum (oudste eerst)</SelectItem>
                            <SelectItem value="amount_desc">Hoogste bedrag</SelectItem>
                            <SelectItem value="amount_asc">Laagste bedrag</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
          </CardHeader>
          <CardContent>
             {loading ? (
                 <div className="space-y-4">
                     {[...Array(5)].map((_, i) => (
                         <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                     ))}
                 </div>
             ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Klant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead className="text-center">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.length > 0 ? filteredQuotes.map((quote) => (
                        <TableRow key={quote.id}>
                            <TableCell className="font-medium">{quote.title}</TableCell>
                            <TableCell>{quote.clientName}</TableCell>
                            <TableCell>
                                <StatusBadge status={quote.status} />
                            </TableCell>
                            <TableCell>{format(new Date(quote.createdAt), 'd MMM yyyy', { locale: nl })}</TableCell>
                            <TableCell className="text-right">{formatCurrency(quote.amount)}</TableCell>
                            <TableCell className="text-center">
                               <div className="flex items-center justify-center gap-2">
                                 <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button asChild variant="ghost" size="icon">
                                            <Link href={`/offertes/${quote.id}`}>
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Openen</p></TooltipContent>
                                 </Tooltip>
                                 <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => handleDuplicate(quote)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Dupliceren</p></TooltipContent>
                                 </Tooltip>
                               </div>
                            </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center h-24">Geen offertes gevonden.</TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                </Table>
             )}
          </CardContent>
        </Card>
      </main>
    </div>
    </TooltipProvider>
  );
}

    

    
