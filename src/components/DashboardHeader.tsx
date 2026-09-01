'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Boxes,
  CalendarDays,
  ChevronDown,
  Clock3,
  ClipboardList,
  FileText,
    LayoutDashboard,
    Landmark,
    LogOut,
    MessageCircle,
    Receipt,
  ReceiptText,
  Sparkles,
  Settings,
  StickyNote,
  TrendingUp,
  Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, User } from 'firebase/auth';
import { useAuth, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DashboardProfileCache {
  logoUrl: string | null;
  name: string;
}

const PROFILE_CACHE_PREFIX = 'dashboard-profile:';

function getProfileCacheKey(userId: string): string {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function readProfileCache(userId: string): DashboardProfileCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getProfileCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardProfileCache;
    if (!parsed || typeof parsed !== 'object') return null;
    const logoUrl = typeof parsed.logoUrl === 'string' && parsed.logoUrl.trim().length > 0 ? parsed.logoUrl : null;
    const name = typeof parsed.name === 'string' ? parsed.name : '';
    return { logoUrl, name };
  } catch {
    return null;
  }
}

function writeProfileCache(userId: string, cache: DashboardProfileCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getProfileCacheKey(userId), JSON.stringify(cache));
  } catch {
    // Ignore localStorage failures.
  }
}

function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withRetryToken(url: string, retryCount: number): string {
  if (retryCount <= 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}avatar_retry=${retryCount}`;
}

export function DashboardHeader({
  user,
  title,
  hideAccountOnMobile = false,
}: {
  user: User | null;
  title?: string;
  hideAccountOnMobile?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const [profileLogoUrl, setProfileLogoUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [avatarRetryCount, setAvatarRetryCount] = useState(0);
  const latestResolvedLogoRef = useRef<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadProfile = async () => {
      if (!user || !firestore) {
        setProfileLogoUrl(null);
        setProfileName('');
        latestResolvedLogoRef.current = null;
        return;
      }

      const cachedProfile = readProfileCache(user.uid);
      if (cachedProfile) {
        setProfileLogoUrl(cachedProfile.logoUrl);
        setProfileName(cachedProfile.name || user.displayName || '');
        latestResolvedLogoRef.current = cachedProfile.logoUrl;
      } else {
        setProfileName(user.displayName || '');
      }

      try {
        let userSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            userSnap = await getDoc(doc(firestore, 'users', user.uid));
            break;
          } catch (err) {
            lastError = err;
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
            }
          }
        }
        if (!userSnap) throw lastError || new Error('Kon gebruikersprofiel niet laden');
        if (!userSnap.exists() || isCancelled) return;

        const data = userSnap.data() as {
          settings?: {
            logoUrl?: string;
            contactNaam?: string;
            bedrijfsnaam?: string;
          };
          logoUrl?: string;
        };
        const settings = data?.settings || {};
        const resolvedLogo = normalizeLogoUrl(settings.logoUrl) || normalizeLogoUrl(data.logoUrl);
        const resolvedName = settings.contactNaam || settings.bedrijfsnaam || user.displayName || '';
        setProfileLogoUrl(resolvedLogo);
        setProfileName(resolvedName);
        latestResolvedLogoRef.current = resolvedLogo;
        setAvatarRetryCount(0);
        writeProfileCache(user.uid, {
          logoUrl: resolvedLogo,
          name: resolvedName,
        });
      } catch {
        if (!isCancelled) {
          const fallbackCache = readProfileCache(user.uid);
          setProfileLogoUrl(fallbackCache?.logoUrl || null);
          setProfileName(fallbackCache?.name || user?.displayName || '');
          latestResolvedLogoRef.current = fallbackCache?.logoUrl || null;
        }
      }
    };

    loadProfile();
    return () => {
      isCancelled = true;
    };
  }, [user, firestore]);

  const fallbackInitial = useMemo(() => {
    const base = profileName || user?.displayName || user?.email || 'U';
    return base.trim().charAt(0).toUpperCase() || 'U';
  }, [profileName, user?.displayName, user?.email]);
  const avatarSrc = useMemo(() => {
    if (!profileLogoUrl) return null;
    return withRetryToken(profileLogoUrl, avatarRetryCount);
  }, [profileLogoUrl, avatarRetryCount]);

  const handleAvatarImageError = () => {
    const originalLogo = latestResolvedLogoRef.current || profileLogoUrl;
    if (!originalLogo) return;
    if (avatarRetryCount < 2) {
      setAvatarRetryCount((prev) => prev + 1);
      return;
    }
    setProfileLogoUrl(null);
  };
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
    if (pathname.startsWith('/materiaallijsten')) {
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

  const handleLogout = async () => {
    if (!auth) {
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Authenticatie is nog niet beschikbaar.',
      });
      return;
    }

    try {
      await fetch('/api/auth/session', {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => null);
      await signOut(auth);
      toast({ title: 'Succes', description: 'U bent uitgelogd.' });
      router.push('/login');
    } catch (error) {
      console.error('Logout fout:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Uitloggen mislukt.',
      });
    }
  };

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1 rounded-full border border-border bg-background/80 px-1 py-1 hover:bg-accent transition-colors',
                    hideAccountOnMobile && 'hidden md:flex'
                  )}
                  aria-label="Account menu"
                >
                  <Avatar className="h-9 w-9">
                    {avatarSrc && (
                      <AvatarImage
                        src={avatarSrc}
                        alt="Gebruikerslogo"
                        className="object-cover"
                        onLoadingStatusChange={(status) => {
                          if (status === 'loaded') {
                            setAvatarRetryCount(0);
                          }
                          if (status === 'error') {
                            handleAvatarImageError();
                          }
                        }}
                      />
                    )}
                    <AvatarFallback delayMs={500} className="bg-zinc-500 text-white font-semibold">
                      {fallbackInitial}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="h-4 w-4" />
                  Uitloggen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}
