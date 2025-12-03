import { getFullQuoteDetails } from "@/lib/data";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, PlusCircle, Send, FileText, User, MapPin } from "lucide-react";
import type { Job } from "@/lib/types";
import { submitQuoteAction } from "@/lib/actions";

function JobCard({ job, quoteId }: { job: Job, quoteId: string }) {
    return (
        <div className="p-4 bg-card rounded-lg border flex items-center justify-between">
            <div>
                <p className="font-semibold">{job.omschrijvingKlant}</p>
                <p className="text-sm text-muted-foreground">{job.categorie}</p>
            </div>
            <Button asChild variant="outline" size="sm">
                <Link href={`/offertes/${quoteId}/klus/${job.id}/bewerken`}>Bewerken</Link>
            </Button>
        </div>
    )
}

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const quoteId = params.id;
  const quoteData = await getFullQuoteDetails(quoteId);

  if (!quoteData) {
    notFound();
  }

  const { quote, client, jobs } = quoteData;
  const submitQuoteActionWithId = submitQuoteAction.bind(null, quote.id);

  const canSubmit = quote.status === 'concept' && jobs.length > 0;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-4">
          <Button asChild variant="outline" size="icon" className="h-7 w-7">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl truncate">{quote.titel}</h1>
        </div>

        <div className="grid gap-8">
            <Card>
                <CardHeader>
                    <CardTitle>Klantgegevens</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-3">
                        <User className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-1" />
                        <div>
                            <p className="font-semibold">{client?.naam}</p>
                            <p className="text-muted-foreground">{client?.email}</p>
                            <p className="text-muted-foreground">{client?.telefoon}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-1" />
                        <div>
                            <p className="font-semibold">{client?.adres}</p>
                            <p className="text-muted-foreground">{client?.postcode} {client?.plaats}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Klussen</CardTitle>
                        <CardDescription>
                            Overzicht van alle klussen binnen deze offerte.
                        </CardDescription>
                    </div>
                     <Button asChild size="sm" className="gap-1">
                        <Link href={`/offertes/${quote.id}/klus/nieuw`}>
                            Klus toevoegen
                            <PlusCircle className="h-4 w-4" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {jobs.length > 0 ? (
                        jobs.map(job => <JobCard key={job.id} job={job} quoteId={quote.id} />)
                    ) : (
                        <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">Nog geen klussen</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Voeg de eerste klus toe aan deze offerte.</p>
                            <Button asChild size="sm" className="mt-4">
                                <Link href={`/offertes/${quote.id}/klus/nieuw`}>Klus toevoegen</Link>
                            </Button>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                     <form action={submitQuoteActionWithId} className="w-full">
                        <Button 
                            className="w-full bg-accent text-accent-foreground hover:bg-accent/90" 
                            disabled={!canSubmit}
                            aria-disabled={!canSubmit}
                        >
                            <Send className="mr-2 h-4 w-4" />
                            Offerte laten opstellen
                        </Button>
                        {!canSubmit && (
                             <p className="text-xs text-center text-muted-foreground mt-2">
                               {quote.status !== 'concept' ? 'Offerte is al in behandeling of verzonden.' : 'Voeg minimaal één klus toe om de offerte op te stellen.'}
                            </p>
                        )}
                    </form>
                </CardFooter>
            </Card>
        </div>
      </div>
    </main>
  );
}
