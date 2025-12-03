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
      <DashboardHeader />
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
                        <Link href={`/offertes/${quote.id}`}>
                          <span className="sr-only">Bekijken</span>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
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
