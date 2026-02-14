'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Globe, Megaphone, MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SupportNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const supportNavItems: SupportNavItem[] = [
  { href: '/feedback', label: 'Feedback', icon: MessageCircle },
  { href: '/prijs-import-aanvragen', label: 'Prijs import aanvragen', icon: Globe },
  { href: '/nieuw', label: 'Nieuw', icon: Megaphone },
];

export function SupportSidePanel() {
  const pathname = usePathname();

  return (
    <div className="space-y-0.5">
      {supportNavItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors',
              active
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-zinc-400 hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
