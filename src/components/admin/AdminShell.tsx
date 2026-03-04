'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CreditCard, FileText, ToggleLeft, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SupportModeToggle } from '@/components/admin/SupportModeToggle';

const navItems = [
  { href: '/admin', label: 'Overzicht', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Gebruikers', icon: Users },
  { href: '/admin/subscriptions', label: 'Abonnementen', icon: CreditCard },
  { href: '/admin/quotes', label: 'Offertes', icon: FileText },
  { href: '/admin/feature-flags', label: 'Feature flags', icon: ToggleLeft },
  { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/90 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Calvora Control Room
            </p>
            <h1 className="text-2xl font-semibold">Admin Panel</h1>
          </div>
          <SupportModeToggle />
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-border bg-card/60 p-4 lg:min-h-[calc(100vh-89px)] lg:border-b-0 lg:border-r">
          <nav className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
