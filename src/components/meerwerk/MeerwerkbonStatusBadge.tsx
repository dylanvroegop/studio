'use client';

import { cn } from '@/lib/utils';
import type { MeerwerkbonStatus } from '@/lib/types';

const LABELS: Record<MeerwerkbonStatus, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  akkoord: 'Akkoord',
  afgekeurd: 'Afgekeurd',
  gefactureerd: 'Gefactureerd',
  geannuleerd: 'Geannuleerd',
};

const STYLES: Record<MeerwerkbonStatus, string> = {
  concept: 'bg-zinc-800 text-zinc-200 border border-zinc-700',
  verzonden: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
  akkoord: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  afgekeurd: 'bg-red-500/10 text-red-300 border border-red-500/20',
  gefactureerd: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  geannuleerd: 'bg-zinc-700/20 text-zinc-300 border border-zinc-600',
};

export function MeerwerkbonStatusBadge({
  status,
  className,
}: {
  status: MeerwerkbonStatus;
  className?: string;
}) {
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
