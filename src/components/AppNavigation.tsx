'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getIdTokenResult } from 'firebase/auth';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { Menu, X, FileText, Receipt, ReceiptText, CalendarDays, Boxes, Users, Clock3, ClipboardList } from 'lucide-react';
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

const APP_NAV_WIDTH_STORAGE_KEY = 'app_navigation_width';
const APP_NAV_DEFAULT_WIDTH = 15.84 * 16;
const APP_NAV_MIN_WIDTH = 220;
const APP_NAV_MAX_WIDTH = 440;

function clampNavigationWidth(width: number): number {
    return Math.min(APP_NAV_MAX_WIDTH, Math.max(APP_NAV_MIN_WIDTH, width));
}

const BASE_NAV_ITEMS: NavigationItem[] = [
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
        label: 'Finance',
        icon: Receipt,
        iconColorClass: 'text-teal-400',
        iconColorClassActive: 'text-teal-300',
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
        label: 'Arbeidsuren',
        icon: Clock3,
        iconColorClass: 'text-indigo-400',
        iconColorClassActive: 'text-indigo-300',
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
    const [isHoveringDesktopNav, setIsHoveringDesktopNav] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [desktopNavWidth, setDesktopNavWidth] = useState(APP_NAV_DEFAULT_WIDTH);
    const [isResizingNav, setIsResizingNav] = useState(false);
    const resizeStartRef = useRef({ startX: 0, startWidth: APP_NAV_DEFAULT_WIDTH });

    useEffect(() => {
        if (hideNavigation) return;
        const savedState = window.localStorage.getItem('app_navigation_open');
        const savedWidth = Number(window.localStorage.getItem(APP_NAV_WIDTH_STORAGE_KEY));
        setMenuOpen(savedState === 'true');
        if (Number.isFinite(savedWidth) && savedWidth > 0) {
            setDesktopNavWidth(clampNavigationWidth(savedWidth));
        }
        setIsReady(true);
    }, [hideNavigation]);

    useEffect(() => {
        const rootElement = document.documentElement;
        if (hideNavigation) {
            rootElement.style.removeProperty('--app-nav-width');
            return;
        }
        rootElement.style.setProperty('--app-nav-width', `${desktopNavWidth}px`);
    }, [desktopNavWidth, hideNavigation]);

    useEffect(() => {
        if (!hideNavigation && isReady) {
            window.localStorage.setItem(APP_NAV_WIDTH_STORAGE_KEY, String(Math.round(desktopNavWidth)));
        }
    }, [desktopNavWidth, hideNavigation, isReady]);

    useEffect(() => {
        if (hideNavigation) return;
        const rootElement = document.documentElement;
        rootElement.classList.toggle('app-nav-open', menuOpen);
        return () => rootElement.classList.remove('app-nav-open');
    }, [menuOpen, hideNavigation]);

    useEffect(() => {
        if (hideNavigation) return;
        const rootElement = document.documentElement;
        rootElement.classList.toggle('app-nav-resizing', isResizingNav);
        return () => rootElement.classList.remove('app-nav-resizing');
    }, [isResizingNav, hideNavigation]);

    useEffect(() => {
        if (!isResizingNav) return;

        const handlePointerMove = (event: PointerEvent) => {
            const nextWidth = resizeStartRef.current.startWidth + event.clientX - resizeStartRef.current.startX;
            setDesktopNavWidth(clampNavigationWidth(nextWidth));
        };
        const stopResizing = () => setIsResizingNav(false);

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', stopResizing);
        document.addEventListener('pointercancel', stopResizing);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', stopResizing);
            document.removeEventListener('pointercancel', stopResizing);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizingNav]);

    useEffect(() => {
        if (hideNavigation || !isMobile) return;
        setMenuOpen(false);
        setIsHoveringDesktopNav(false);
    }, [pathname, hideNavigation, isMobile]);

    const handleMenuOpenChange = (open: boolean) => {
        setMenuOpen(open);
        if (open) {
            setIsHoveringDesktopNav(false);
        }
        window.localStorage.setItem('app_navigation_open', String(open));
    };

    const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!menuOpen) return;
        event.preventDefault();
        resizeStartRef.current = {
            startX: event.clientX,
            startWidth: desktopNavWidth,
        };
        setIsResizingNav(true);
    };

    const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!menuOpen) return;

        let nextWidth: number | null = null;
        if (event.key === 'ArrowRight') nextWidth = desktopNavWidth + 16;
        if (event.key === 'ArrowLeft') nextWidth = desktopNavWidth - 16;
        if (event.key === 'Home') nextWidth = APP_NAV_MIN_WIDTH;
        if (event.key === 'End') nextWidth = APP_NAV_MAX_WIDTH;

        if (nextWidth !== null) {
            event.preventDefault();
            setDesktopNavWidth(clampNavigationWidth(nextWidth));
        }
    };

    if (hideNavigation) {
        return null;
    }

    const desktopNavVisible = menuOpen || isHoveringDesktopNav;

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
                        {!desktopNavVisible && (
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

                    {!menuOpen && (
                        <div
                            className="fixed inset-y-0 left-0 z-[65] w-5"
                            aria-hidden="true"
                            onMouseEnter={() => setIsHoveringDesktopNav(true)}
                        />
                    )}

                    <aside
                        className={cn(
                            'fixed inset-y-0 left-0 z-[70] transform transition-transform duration-200 ease-out pointer-events-auto',
                            desktopNavVisible ? 'translate-x-0' : '-translate-x-full',
                            !menuOpen && 'shadow-2xl'
                        )}
                        style={{ width: 'var(--app-nav-width, 15.84rem)' }}
                        onMouseEnter={() => !menuOpen && setIsHoveringDesktopNav(true)}
                        onMouseLeave={() => !menuOpen && setIsHoveringDesktopNav(false)}
                    >
                        {isReady && (
                            <NavigationContent
                                pathname={pathname}
                                onClose={() => {
                                    setIsHoveringDesktopNav(false);
                                    handleMenuOpenChange(false);
                                }}
                            />
                        )}
                        <div
                            className={cn(
                                'group/resize absolute inset-y-0 -right-1.5 z-[75] hidden w-3 cursor-col-resize touch-none items-center justify-center md:flex',
                                !menuOpen && 'pointer-events-none'
                            )}
                            role="separator"
                            aria-label="Zijbalkbreedte aanpassen"
                            aria-orientation="vertical"
                            aria-valuemin={APP_NAV_MIN_WIDTH}
                            aria-valuemax={APP_NAV_MAX_WIDTH}
                            aria-valuenow={Math.round(desktopNavWidth)}
                            tabIndex={menuOpen ? 0 : -1}
                            onPointerDown={handleResizePointerDown}
                            onKeyDown={handleResizeKeyDown}
                        >
                            <span className="h-full w-px bg-transparent transition-colors group-hover/resize:bg-emerald-500/60 group-focus/resize:bg-emerald-500/60" />
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}
