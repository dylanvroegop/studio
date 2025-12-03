'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Hammer, PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function DashboardHeader() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 backdrop-blur-xl">
      <div className="flex items-center gap-2 flex-1">
        <Hammer className="w-7 h-7 text-primary" />
        <span className="text-lg font-semibold">OfferteHulp</span>
      </div>
      <div className="flex items-center gap-2">
         <Button
          asChild
          size="sm"
          className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Link href="/offertes/nieuw">
            Nieuwe offerte
            <PlusCircle className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
