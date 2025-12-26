'use client';

import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOut, User } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { OfferteHulpIcon } from '@/components/icons';

export function DashboardHeader({ user }: { user: User | null }) {
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur-xl sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 sm:pt-8">
      <div className="flex items-center gap-2 flex-1">
        <OfferteHulpIcon className="w-7 h-7 text-primary" />
        <span className="text-lg font-semibold">OfferteHulp</span>
      </div>
      <div className="flex items-center gap-2">
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
