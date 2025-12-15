
'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewQuoteForm } from '@/components/new-quote-form-wrapper';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';

export default function NewQuotePage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

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

  const progressValue = (1 / 6) * 100;

  return (
    <main className="flex flex-1 flex-col">
       <header className="sticky top-0 z-10 grid h-auto w-full grid-cols-3 items-center border-b bg-background/95 px-4 pt-3 pb-2 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <div className="text-center flex flex-col items-center">
            <h1 className="font-semibold text-lg">Nieuwe Offerte</h1>
            <Progress value={progressValue} className="h-1 w-1/2 mt-1" />
        </div>
        <div className="flex items-center justify-end"></div>
      </header>
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <NewQuoteForm />
        </div>
      </div>
    </main>
  );
}
