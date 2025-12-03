import { Button } from "@/components/ui/button";
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
import { PlusCircle, ArrowUpRight, Hammer } from "lucide-react";
import type { Quote } from "@/lib/types";
import { getQuotes, getClientById } from "@/lib/data";
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

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

export default async function Dashboard() {
  const quotes = await getQuotes();

  return (
    <div className="flex flex-col min-h-screen">
       <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-2">
            <Hammer className="w-7 h-7 text-primary" />
            <span className="text-lg font-semibold">OfferteHulp</span>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center">
          <h1 className="font-semibold text-2xl md:text-3xl">Offertes</h1>
          <Button asChild size="sm" className="ml-auto gap-1 bg-accent text-accent-foreground hover:bg-accent/90">
            <Link href="/offertes/nieuw">
              Nieuwe offerte
              <PlusCircle className="h-4 w-4" />
            </Link>
          </Button>
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
                {quotes.map(async (quote) => {
                  const client = await getClientById(quote.clientId);
                  return (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.titel}</TableCell>
                      <TableCell>{client?.naam || 'Onbekend'}</TableCell>
                      <TableCell>
                        <StatusBadge status={quote.status} />
                      </TableCell>
                      <TableCell>{format(new Date(quote.createdAt), 'd MMM yyyy', { locale: nl })}</TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/offertes/${quote.id}`}>
                            <ArrowUpRight className="h-4 w-4" />
                            <span className="sr-only">Bekijken</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
