'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Globe, Laptop2, Megaphone, MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SupportNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tooltip?: string;
}

const supportNavItems: SupportNavItem[] = [
  { href: '/feedback', label: 'Feedback', icon: MessageCircle },
  { href: '/prijs-import-aanvragen', label: 'Prijs import aanvragen', icon: Globe },
  {
    href: '/website-laten-maken',
    label: 'Website laten maken',
    icon: Laptop2,
    tooltip: 'Website laten maken voor vakbedrijven',
  },
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
            title={item.tooltip || undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors',
              active
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-zinc-400 hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="font-medium truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
