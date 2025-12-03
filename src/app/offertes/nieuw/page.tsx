import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { NewQuoteForm } from '@/components/new-quote-form-wrapper';
import { getClients } from '@/lib/data';

export default async function NewQuotePage() {
  const clients = await getClients();

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8">
          <Button asChild variant="outline" size="icon" className="h-7 w-7">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl">Nieuwe Offerte</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Stap 1: Offertedetails en Klant</CardTitle>
            <CardDescription>
              Geef de offerte een titel en kies of maak een klant aan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewQuoteForm clients={clients} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
