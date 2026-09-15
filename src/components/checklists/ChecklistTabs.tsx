'use client';

import Link from 'next/link';
import { CHECKLIST_CONFIG, type ChecklistKind } from '@/lib/checklist-config';
import { cn } from '@/lib/utils';

export function ChecklistTabs({ kind }: { kind: ChecklistKind }) {
  return (
    <nav aria-label="Lijsten" className="flex gap-1 rounded-lg bg-muted p-1">
      {(Object.keys(CHECKLIST_CONFIG) as ChecklistKind[]).map((key) => (
        <Link
          key={key}
          href={CHECKLIST_CONFIG[key].route}
          aria-current={kind === key ? 'page' : undefined}
          className={cn(
            'flex-1 rounded-md px-2 py-2 text-center text-sm font-medium',
            kind === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {CHECKLIST_CONFIG[key].title}
        </Link>
      ))}
    </nav>
  );
}
