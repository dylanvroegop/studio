'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Boxes, Settings, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
    const pathname = usePathname();

    function isActive(path: string) {
        if (path === '/dashboard' && pathname === '/dashboard') return true;
        if (path !== '/dashboard' && pathname?.startsWith(path)) return true;
        return false;
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-zinc-900/80 backdrop-blur-md pb-safe pt-2">
            <div className="mx-auto flex max-w-md items-center justify-between px-6 py-2">
                <Link
                    href="/dashboard"
                    className={cn(
                        "flex flex-col items-center gap-1 p-2 transition-colors",
                        isActive('/dashboard') ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
                    )}
                >
                    <LayoutDashboard className="h-6 w-6" strokeWidth={isActive('/dashboard') ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">Dashboard</span>
                </Link>

                <Link
                    href="/klanten"
                    className={cn(
                        "flex flex-col items-center gap-1 p-2 transition-colors",
                        isActive('/klanten') ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
                    )}
                >
                    <Users className="h-6 w-6" strokeWidth={isActive('/klanten') ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">Klanten</span>
                </Link>

                <Link
                    href="/materialen"
                    className={cn(
                        "flex flex-col items-center gap-1 p-2 transition-colors",
                        isActive('/materialen') ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
                    )}
                >
                    <Boxes className="h-6 w-6" strokeWidth={isActive('/materialen') ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">Producten</span>
                </Link>

                <Link
                    href="/planning"
                    className={cn(
                        "flex flex-col items-center gap-1 p-2 transition-colors",
                        isActive('/planning') ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
                    )}
                >
                    <CalendarDays className="h-6 w-6" strokeWidth={isActive('/planning') ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">Planning</span>
                </Link>

                <Link
                    href="/instellingen"
                    className={cn(
                        "flex flex-col items-center gap-1 p-2 transition-colors",
                        isActive('/instellingen') ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
                    )}
                >
                    <Settings className="h-6 w-6" strokeWidth={isActive('/instellingen') ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">Instellingen</span>
                </Link>
            </div>
        </div>
    );
}
