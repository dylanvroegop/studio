'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Boxes,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  StickyNote,
  TrendingUp,
  Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, User } from 'firebase/auth';
import { useAuth, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function DashboardHeader({ user, title }: { user: User | null; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const [profileLogoUrl, setProfileLogoUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');

  useEffect(() => {
    let isCancelled = false;

    const loadProfile = async () => {
      if (!user || !firestore) {
        setProfileLogoUrl(null);
        setProfileName('');
        return;
      }

      try {
        const userSnap = await getDoc(doc(firestore, 'users', user.uid));
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
        setProfileLogoUrl(settings.logoUrl || data.logoUrl || null);
        setProfileName(settings.contactNaam || settings.bedrijfsnaam || user.displayName || '');
      } catch (err) {
        if (!isCancelled) {
          setProfileLogoUrl(null);
          setProfileName(user?.displayName || '');
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
    if (pathname.startsWith('/notities')) {
      return {
        icon: StickyNote,
        iconClassName: 'text-rose-400',
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full border border-border bg-background/80 px-1 py-1 hover:bg-accent transition-colors"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  {profileLogoUrl && <AvatarImage src={profileLogoUrl} alt="Gebruikerslogo" className="object-cover" />}
                  <AvatarFallback className="bg-zinc-500 text-white font-semibold">
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
        )}
      </div>
    </header>
  );
}
