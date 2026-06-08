'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getIdTokenResult } from 'firebase/auth';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { Menu, X, LayoutDashboard, FileText, Receipt, ReceiptText, CalendarDays, Boxes, Users, Settings, Clock3, Plus, StickyNote, Landmark, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { SupportSidePanel } from '@/components/SupportSidePanel';
import { useUser } from '@/firebase';

interface NavigationItem {
    href: string;
    label: string;
    icon: LucideIcon;
    iconColorClass?: string;
    iconColorClassActive?: string;
}

const BASE_NAV_ITEMS: NavigationItem[] = [
    {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        iconColorClass: 'text-sky-400',
        iconColorClassActive: 'text-sky-300',
    },
    {
        href: '/offertes',
        label: 'Offertes',
        icon: FileText,
        iconColorClass: 'text-cyan-400',
        iconColorClassActive: 'text-cyan-300',
    },
    {
        href: '/facturen',
        label: 'Facturen',
        icon: ReceiptText,
        iconColorClass: 'text-emerald-400',
        iconColorClassActive: 'text-emerald-300',
    },
    {
        href: '/meerwerkbon',
        label: 'Meerwerkbon',
        icon: FileText,
        iconColorClass: 'text-amber-400',
        iconColorClassActive: 'text-amber-300',
    },
    {
        href: '/kosten',
        label: 'Kosten',
        icon: Receipt,
        iconColorClass: 'text-teal-400',
        iconColorClassActive: 'text-teal-300',
    },
    {
        href: '/bank-overzicht',
        label: 'Bank Overzicht',
        icon: Landmark,
        iconColorClass: 'text-lime-400',
        iconColorClassActive: 'text-lime-300',
    },
    {
        href: '/planning',
        label: 'Planning',
        icon: CalendarDays,
        iconColorClass: 'text-violet-400',
        iconColorClassActive: 'text-violet-300',
    },
    {
        href: '/materialen',
        label: 'Producten',
        icon: Boxes,
        iconColorClass: 'text-orange-400',
        iconColorClassActive: 'text-orange-300',
    },
    {
        href: '/materiaallijsten',
        label: 'Materiaallijsten',
        icon: ClipboardList,
        iconColorClass: 'text-emerald-400',
        iconColorClassActive: 'text-emerald-300',
    },
    {
        href: '/klanten',
        label: 'Klanten',
        icon: Users,
        iconColorClass: 'text-blue-400',
        iconColorClassActive: 'text-blue-300',
    },
    {
        href: '/urenregistratie',
        label: 'Urenregistratie',
        icon: Clock3,
        iconColorClass: 'text-indigo-400',
        iconColorClassActive: 'text-indigo-300',
    },
    {
        href: '/notities',
        label: 'Notities',
        icon: StickyNote,
        iconColorClass: 'text-rose-400',
        iconColorClassActive: 'text-rose-300',
    },
    {
        href: '/instellingen',
        label: 'Instellingen',
        icon: Settings,
        iconColorClass: 'text-purple-400',
        iconColorClassActive: 'text-purple-300',
    },
];

function isActivePath(pathname: string, href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/offertes/nieuw') return pathname === '/offertes/nieuw';
    if (href === '/offertes') return pathname.startsWith('/offertes') && !pathname.startsWith('/offertes/nieuw');
    return pathname.startsWith(href);
}

function NavigationContent({ pathname, onNavigate, onClose }: { pathname: string; onNavigate?: () => void; onClose?: () => void }) {
    const { user, isUserLoading } = useUser();
    const [isDeveloperAccess, setIsDeveloperAccess] = useState(false);

    useEffect(() => {
        let cancelled = false;

        if (!user || isUserLoading) {
            setIsDeveloperAccess(false);
            return;
        }

        const resolveClaims = async () => {
            try {
                const token = await getIdTokenResult(user, false);
                const allowed = token.claims.dev === true || token.claims.admin === true;
                if (!cancelled) setIsDeveloperAccess(allowed);
            } catch {
                if (!cancelled) setIsDeveloperAccess(false);
            }
        };

        resolveClaims();
        return () => {
            cancelled = true;
        };
    }, [isUserLoading, user]);

    const navItems: NavigationItem[] = BASE_NAV_ITEMS;

    return (
        <div className="flex h-full flex-col border-r border-border bg-card/95 backdrop-blur-sm">
            <div className="border-b border-border px-6 py-4">
                {onClose && (
                    <Button
                        variant="outline"
                        size="icon"
                        className="absolute right-3 top-3 h-8 w-8 rounded-lg shrink-0 border-border bg-background/90 shadow-lg backdrop-blur-sm"
                        onClick={onClose}
                        aria-label="Navigatie sluiten"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
                <div className="flex items-center">
                    <Image
                        src="/logo_calvora_clean.svg"
                        alt="Calvora Logo"
                        width={200}
                        height={60}
                        className="h-10 w-auto object-contain"
                        priority
                    />
                </div>
                <Button
                    asChild
                    className="mt-3 h-10 w-full justify-start rounded-lg bg-emerald-500 text-white hover:bg-emerald-400"
                >
                    <Link href="/offertes/nieuw" onClick={onNavigate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nieuwe calculatie
                    </Link>
                </Button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 pb-6">
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
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <Icon
                                    className={cn(
                                        'h-4 w-4',
                                        item.iconColorClass,
                                        active && item.iconColorClassActive
                                    )}
                                    strokeWidth={active ? 2.5 : 2}
                                />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {!isDeveloperAccess && (
                <div className="border-t border-border px-4 py-3">
                    <SupportSidePanel />
                </div>
            )}
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

    useEffect(() => {
        if (hideNavigation || !isMobile) return;
        setMenuOpen(false);
    }, [pathname, hideNavigation, isMobile]);

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
                <div className="fixed left-3 top-3 z-[80]">
                    <Sheet open={menuOpen} onOpenChange={handleMenuOpenChange}>
                        {!menuOpen && (
                            <SheetTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-9 w-9 rounded-lg shrink-0 border-border bg-background/90 shadow-lg backdrop-blur-sm"
                                    aria-label="Open navigatie"
                                >
                                    <Menu className="h-4 w-4" />
                                </Button>
                            </SheetTrigger>
                        )}
                        <SheetContent side="left" className="w-[85vw] max-w-[350px] p-0">
                            <SheetHeader className="sr-only">
                                <SheetTitle>Navigatie</SheetTitle>
                                <SheetDescription>Navigatiemenu van de applicatie.</SheetDescription>
                            </SheetHeader>
                            {isReady && (
                                <NavigationContent
                                    pathname={pathname}
                                    onNavigate={() => handleMenuOpenChange(false)}
                                />
                            )}
                        </SheetContent>
                    </Sheet>
                </div>
            ) : (
                <>
                    <div className="fixed left-4 top-4 z-[80]">
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
                            'fixed inset-y-0 left-0 z-[70] w-[15.84rem] transform transition-transform duration-200 ease-out pointer-events-auto',
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
