
'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewQuoteForm } from '@/components/new-quote-form-wrapper';
import { useUser } from '@/firebase';
import { useRouter, useParams } from 'next/navigation';

export default function EditQuotePage() {
  const router = useRouter();
  const params = useParams();
  const { user, isUserLoading } = useUser();
  const quoteId = params.id as string;

  if (isUserLoading || !user) {
     return (
          <div className="min-h-screen flex items-center justify-center p-4">
              <div className="p-8 text-center text-gray-500 flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Laden...
              </div>
          </div>
      );
  }

  return (
    <main className="flex flex-1 flex-col">
       <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={`/offertes/${quoteId}`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug naar offerte</span>
            </Link>
          </Button>
        </div>
        <h1 className="text-center font-semibold text-lg">Offerte Bewerken: Stap 1 van 6</h1>
        <div className="flex items-center justify-end"></div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <NewQuoteForm quoteId={quoteId} />
        </div>
      </div>
    </main>
  );
}
