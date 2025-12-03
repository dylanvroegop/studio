'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Quote } from "@/lib/types";
import { getQuotes, getClientById } from "@/lib/data";
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { DashboardHeader } from "@/components/dashboard-header";
import { Skeleton } from '@/components/ui/skeleton';

function StatusBadge({ status }: { status: Quote["status"] }) {
  const variant: "default" | "secondary" | "destructive" =
    status === "verzonden"
      ? "default"
      : status === "in_behandeling"
      ? "secondary"
      : "destructive";
  const text =
    status === "concept"
      ? "Concept"
      : status === "in_behandeling"
      ? "In behandeling"
      : "Verzonden";
  
  if (status === 'verzonden') {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">{text}</Badge>
  }
  if (status === 'in_behandeling') {
    return <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30">{text}</Badge>
  }
    return <Badge variant="outline" className="text-muted-foreground">{text}</Badge>
}

function DashboardSkeleton() {
    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader user={null} />
            <main className="flex flex-1 flex-col justify-center items-center gap-4 p-4 md:gap-8 md:p-6">
                <div className="text-center p-8 text-gray-500 flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading user data...
                </div>
            </main>
        </div>
    )
}


export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        fetchQuotes();
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const fetchQuotes = async () => {
      const quotesData = await getQuotes();
      setQuotes(quotesData);
  }

  if (loading) {
    return <DashboardSkeleton />;
  }
  
  if (!user) {
    // This state will be brief as the useEffect will redirect.
    return <DashboardSkeleton />;
  }


  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader user={user} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center">
          <h1 className="font-semibold text-2xl md:text-3xl">Offertes</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recente Offertes</CardTitle>
            <CardDescription>
              Een overzicht van uw meest recente offertes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>
                    <span className="sr-only">Acties</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                    <QuoteRow key={quote.id} quote={quote} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function QuoteRow({ quote }: { quote: Quote }) {
    const [clientName, setClientName] = useState('Laden...');
    
    useEffect(() => {
        const fetchClient = async () => {
            const client = await getClientById(quote.clientId);
            setClientName(client?.naam || 'Onbekend');
        }
        fetchClient();
    }, [quote.clientId]);

    return (
        <TableRow>
            <TableCell className="font-medium">{quote.titel}</TableCell>
            <TableCell>{clientName}</TableCell>
            <TableCell>
                <StatusBadge status={quote.status} />
            </TableCell>
            <TableCell>{format(new Date(quote.createdAt), 'd MMM yyyy', { locale: nl })}</TableCell>
            <TableCell>
                <Link href={`/offertes/${quote.id}`}>
                <span className="sr-only">Bekijken</span>
                <ArrowUpRight className="h-4 w-4" />
                </Link>
            </TableCell>
        </TableRow>
    )
}
