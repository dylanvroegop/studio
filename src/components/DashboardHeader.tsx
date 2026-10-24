'use client';

import { useMemo } from 'react';
import {
  Archive,
  BookOpen,
  Boxes,
  CalendarDays,
  Clock3,
  ClipboardList,
  FileText,
    LayoutDashboard,
    Landmark,
    MessageCircle,
    Receipt,
  ReceiptText,
  Sparkles,
  Settings,
  StickyNote,
  TrendingUp,
  Users,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { cn } from '@/lib/utils';

export function DashboardHeader({
  user,
  title,
  hideAccountOnMobile = false,
}: {
  user: User | null;
  title?: string;
  hideAccountOnMobile?: boolean;
}) {
  const pathname = usePathname();
  const titleIconMeta = useMemo(() => {
    if (pathname.startsWith('/dashboard')) {
      return {
        icon: LayoutDashboard,
        iconClassName: 'text-sky-400',
      };
    }
    if (pathname.startsWith('/offertes')) {
      return {
        icon: FileText,
        iconClassName: 'text-cyan-400',
      };
    }
    if (pathname.startsWith('/facturen')) {
      return {
        icon: ReceiptText,
        iconClassName: 'text-emerald-400',
      };
    }
    if (pathname.startsWith('/meerwerkbon')) {
      return {
        icon: FileText,
        iconClassName: 'text-amber-400',
      };
    }
    if (pathname.startsWith('/kosten')) {
      return {
        icon: Receipt,
        iconClassName: 'text-teal-400',
      };
    }
    if (pathname.startsWith('/bank-overzicht') || pathname.startsWith('/financieen')) {
      return {
        icon: Landmark,
        iconClassName: 'text-lime-400',
      };
    }
    if (pathname.startsWith('/winst')) {
      return {
        icon: TrendingUp,
        iconClassName: 'text-lime-400',
      };
    }
    if (pathname.startsWith('/planning')) {
      return {
        icon: CalendarDays,
        iconClassName: 'text-violet-400',
      };
    }
    if (pathname.startsWith('/materialen')) {
      return {
        icon: Boxes,
        iconClassName: 'text-orange-400',
      };
    }
    if (pathname.startsWith('/materiaallijsten') || pathname.startsWith('/boodschappenlijst')) {
      return {
        icon: ClipboardList,
        iconClassName: 'text-emerald-400',
      };
    }
    if (pathname.startsWith('/klanten')) {
      return {
        icon: Users,
        iconClassName: 'text-blue-400',
      };
    }
    if (pathname.startsWith('/urenregistratie')) {
      return {
        icon: Clock3,
        iconClassName: 'text-indigo-400',
      };
    }
    if (pathname.startsWith('/auto-berichten')) {
      return {
        icon: MessageCircle,
        iconClassName: 'text-emerald-400',
      };
    }
    if (pathname.startsWith('/notities')) {
      return {
        icon: StickyNote,
        iconClassName: 'text-rose-400',
      };
    }
    if (pathname.startsWith('/preparation-agent')) {
      return {
        icon: Sparkles,
        iconClassName: 'text-fuchsia-400',
      };
    }
    if (pathname.startsWith('/kennis')) {
      return {
        icon: BookOpen,
        iconClassName: 'text-lime-400',
      };
    }
    if (pathname.startsWith('/archief')) {
      return {
        icon: Archive,
        iconClassName: 'text-zinc-400',
      };
    }
    if (pathname.startsWith('/instellingen')) {
      return {
        icon: Settings,
        iconClassName: 'text-purple-400',
      };
    }
    return null;
  }, [pathname]);
  const TitleIcon = titleIconMeta?.icon;


  return (
    <header className="relative flex h-16 items-center justify-between border-b bg-background/95 px-3 pl-16 backdrop-blur-xl sm:h-20 sm:px-4 sm:pl-4 md:h-24 md:px-6">
      <div className="min-w-0 flex-1">
        {title && (
          <div className="flex min-w-0 items-center gap-2 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
            {TitleIcon && titleIconMeta && (
              <TitleIcon className={`h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${titleIconMeta.iconClassName}`} />
            )}
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-xl md:text-2xl">{title}</h1>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {user && (
          <>
            <Link
              href="/instellingen"
              aria-label="Instellingen"
              title="Instellingen"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/80 transition-colors hover:bg-accent',
                pathname.startsWith('/instellingen') && 'border-purple-400/40 bg-purple-400/10 text-purple-300',
                hideAccountOnMobile && 'hidden md:flex'
              )}
            >
              <Settings className="h-5 w-5" />
            </Link>

          </>
        )}
      </div>
    </header>
  );
}
