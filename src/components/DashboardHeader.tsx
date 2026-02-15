'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import Image from 'next/image';
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

        const data = userSnap.data() as any;
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
  const showBrandLogo = pathname === '/dashboard';

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
    <header className="flex h-20 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-xl md:h-24 sm:bg-transparent sm:px-6">
      {/* Left: Logo */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Logo removed and moved to sidebar */}
      </div>

      {/* Center: Title */}
      {title && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        </div>
      )}

      {/* Right: Logout */}
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
