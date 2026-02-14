'use client';

import { cn } from '@/lib/utils';

const timeFormat = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface DevVersionBadgeProps {
  className?: string;
}

export function DevVersionBadge({ className }: DevVersionBadgeProps) {
  if (process.env.NODE_ENV !== 'development') return null;

  const stamp = timeFormat.format(new Date());

  return (
    <div className={cn('text-[11px] text-zinc-500', className)}>
      DEV build: {stamp}
    </div>
  );
}
