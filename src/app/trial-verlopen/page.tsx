'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Loader2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function TrialVerlopenPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);

  const handleBackToLogin = async () => {
    setIsLoggingOut(true);
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.warn('Logout failed on trial page:', error);
    } finally {
      router.replace('/login');
      setIsLoggingOut(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const token = await user.getIdToken(true);
      const response = await fetch('/api/onboarding/demo-trial/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (response.ok) {
        router.replace('/dashboard');
        return;
      }

      if (response.status === 402) {
        toast({
          title: 'Abonnement nog niet actief',
          description: 'Na succesvolle betaling kan activatie enkele seconden duren.',
        });
        return;
      }

      toast({
        variant: 'destructive',
        title: 'Statuscontrole mislukt',
        description: 'Probeer het opnieuw over een paar seconden.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Statuscontrole mislukt',
        description: 'Controleer uw verbinding en probeer opnieuw.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const pricingUrl = user
    ? `https://calvora.nl/prijzen?uid=${encodeURIComponent(user.uid)}`
    : 'https://calvora.nl/prijzen';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Clock3 className="h-6 w-6 text-amber-500" />
            Demo verlopen
          </CardTitle>
          <CardDescription>
            Uw proefperiode van 7 dagen is afgelopen. Bekijk de abonnementen om door te gaan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            variant="outline"
            onClick={handleRefreshStatus}
            disabled={isRefreshing || !user}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Status controleren...
              </>
            ) : (
              'Ik heb betaald, controleer opnieuw'
            )}
          </Button>
          <Button asChild className="w-full" variant="success">
            <Link href={pricingUrl} target="_blank" rel="noopener noreferrer">
              Bekijk prijzen op calvora.nl
            </Link>
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={handleBackToLogin}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uitloggen...
              </>
            ) : (
              'Terug naar login'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
