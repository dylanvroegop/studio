'use client';

import { cn } from '@/lib/utils';
import type { InvoiceStatus } from '@/lib/types';

const LABELS: Record<InvoiceStatus, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  gedeeltelijk_betaald: 'Deelbetaald',
  betaald: 'Betaald',
  geannuleerd: 'Geannuleerd',
};

const STYLES: Record<InvoiceStatus, string> = {
  concept: 'bg-zinc-800 text-zinc-200 border border-zinc-700',
  verzonden: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  gedeeltelijk_betaald: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  betaald: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/25',
  geannuleerd: 'bg-red-500/10 text-red-300 border border-red-500/20',
};

export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        STYLES[status],
        className
      )}
    >
      {LABELS[status]}
    </span>
  );
}

