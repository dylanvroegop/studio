'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Menu, LayoutDashboard, FileText, ReceiptText, CalendarDays, Boxes, Users, Settings, Clock3, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

interface NavigationItem {
    href: string;
    label: string;
    icon: LucideIcon;
}

const navItems: NavigationItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/offertes', label: 'Alle Offertes', icon: FileText },
    { href: '/facturen', label: 'Facturen', icon: ReceiptText },
    { href: '/planning', label: 'Planning', icon: CalendarDays },
    { href: '/materialen', label: 'Producten beheren', icon: Boxes },
    { href: '/klanten', label: 'Klanten beheren', icon: Users },
    { href: '/urenregistratie', label: 'Urenregistratie', icon: Clock3 },
    { href: '/instellingen', label: 'Instellingen', icon: Settings },
];

function isActivePath(pathname: string, href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
}

function NavigationContent({ pathname, onNavigate, onClose }: { pathname: string; onNavigate?: () => void; onClose?: () => void }) {
    return (
        <div className="flex h-full flex-col border-r border-border bg-card/95 backdrop-blur-sm">
            <div className="border-b border-border px-6 py-6">
                {onClose && (
                    <Button
                        variant="outline"
                        size="icon"
                        className="absolute right-4 top-4 h-11 w-11 rounded-xl shrink-0 border-border bg-background/90 shadow-lg backdrop-blur-sm"
                        onClick={onClose}
                        aria-label="Navigatie sluiten"
                    >
                        <Menu className="h-4 w-4" />
                    </Button>
                )}
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Navigatie</h2>
            </div>

            <div className="px-4 py-5">
                <Button asChild variant="success" className="w-full justify-start font-semibold" onClick={onNavigate}>
                    <Link href="/offertes/nieuw">
                        <Plus className="h-4 w-4" />
                        Nieuwe klus toevoegen
                    </Link>
                </Button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 pb-6">
                <p className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Algemeen
                </p>
                <div className="space-y-1">
                    {navItems.map((item) => {
                        const active = isActivePath(pathname, item.href);
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavigate}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                                    active
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : 'text-zinc-300 hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

export function AppNavigation() {
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const hideNavigation = pathname === '/login' || pathname === '/';
    const [menuOpen, setMenuOpen] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (hideNavigation) return;
        const savedState = window.localStorage.getItem('app_navigation_open');
        setMenuOpen(savedState === 'true');
        setIsReady(true);
    }, [hideNavigation]);

    useEffect(() => {
        if (hideNavigation) return;
        const rootElement = document.documentElement;
        rootElement.classList.toggle('app-nav-open', menuOpen);
        return () => rootElement.classList.remove('app-nav-open');
    }, [menuOpen, hideNavigation]);

    const handleMenuOpenChange = (open: boolean) => {
        setMenuOpen(open);
        window.localStorage.setItem('app_navigation_open', String(open));
    };

    if (hideNavigation) {
        return null;
    }

    return (
        <>
            {isMobile ? (
                <div className="fixed left-4 top-4 z-50">
                    <Sheet open={menuOpen} onOpenChange={handleMenuOpenChange}>
                        <SheetTrigger asChild>
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-xl shrink-0 border-border bg-background/90 shadow-lg backdrop-blur-sm"
                                aria-label="Open navigatie"
                            >
                                <Menu className="h-4 w-4" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[300px] p-0 sm:w-[350px]">
                            <SheetHeader className="sr-only">
                                <SheetTitle>Navigatie</SheetTitle>
                                <SheetDescription>Navigatiemenu van de applicatie.</SheetDescription>
                            </SheetHeader>
                            {isReady && <NavigationContent pathname={pathname} />}
                        </SheetContent>
                    </Sheet>
                </div>
            ) : (
                <>
                    <div className="fixed left-4 top-4 z-50">
                        {!menuOpen && (
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-xl shrink-0 border-border bg-background/90 shadow-lg backdrop-blur-sm"
                                aria-label="Open navigatie"
                                onClick={() => handleMenuOpenChange(true)}
                            >
                                <Menu className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <aside
                        className={cn(
                            'fixed inset-y-0 left-0 z-40 w-[15.84rem] transform transition-transform duration-200 ease-out',
                            menuOpen ? 'translate-x-0' : '-translate-x-full'
                        )}
                    >
                        {isReady && (
                            <NavigationContent
                                pathname={pathname}
                                onClose={() => handleMenuOpenChange(false)}
                            />
                        )}
                    </aside>
                </>
            )}
        </>
    );
}
