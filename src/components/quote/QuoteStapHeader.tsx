'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Props = {
  titel: React.ReactNode;
  terugHref: string;

  // 0..100 (je kunt je oude mapping blijven gebruiken)
  progressValue: number;

  isPaginaLaden?: boolean;
  progressKleur?: string; // bijv. 'bg-primary' of 'bg-primary/65'
};

export function QuoteStapHeader({
  titel,
  terugHref,
  progressValue,
  isPaginaLaden = false,
  progressKleur = 'bg-primary',
}: Props) {
  const safeProgress = Number.isFinite(progressValue)
    ? Math.min(100, Math.max(0, progressValue))
    : 0;

  return (
    <header className="border-b bg-background/80 backdrop-blur-xl">
      <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl">
            <Link href={terugHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className="flex-1">
            <div className="text-sm font-semibold text-center">{titel}</div>

            {/* Alleen de progress bar */}
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-muted/40">
                <div
                  className={cn('h-full rounded-full transition-all', progressKleur)}
                  style={{ width: `${safeProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Rechter spacer (voor perfecte center align van titel) */}
          <div className="w-11">
            {isPaginaLaden ? (
              <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
