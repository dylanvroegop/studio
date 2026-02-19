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
  concept: 'bg-muted text-foreground border border-border',
  verzonden: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20',
  akkoord: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
  afgekeurd: 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20',
  gefactureerd: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20',
  geannuleerd: 'bg-muted text-muted-foreground border border-border',
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
