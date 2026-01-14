'use client';

import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signOut, User } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export function DashboardHeader({ user, title }: { user: User | null; title?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();

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
        <Image
          src="/logo_final.png"
          alt="OfferteHulp Logo"
          width={500}
          height={128}
          className="h-14 w-auto object-contain md:h-20"
          priority
          unoptimized
        />
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
          <Button onClick={handleLogout} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Uitloggen
          </Button>
        )}
      </div>
    </header>
  );
}
