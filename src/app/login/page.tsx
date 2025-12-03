'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  AuthError,
} from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Hammer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  const handleAuthAction = async (isLogin: boolean) => {
    setIsLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        toast({ title: 'Success', description: 'Logged in successfully.' });
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        toast({ title: 'Success', description: 'Account created successfully.' });
      }
      // The useUser effect will handle the redirect.
    } catch (error) {
      const authError = error as AuthError;
      let errorMessage = 'An unknown error occurred.';
      switch (authError.code) {
        case 'auth/invalid-email':
          errorMessage = 'Ongeldig emailadres formaat.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Wachtwoord moet minimaal 6 tekens lang zijn.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'Dit emailadres is al geregistreerd. Probeer in te loggen.';
          break;
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          errorMessage = 'Ongeldig emailadres of wachtwoord. Controleer uw gegevens of maak een nieuw account aan.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Email/Password sign-in is niet ingeschakeld in uw Firebase Console.';
          break;
        case 'auth/invalid-api-key':
        case 'auth/network-request-failed':
             errorMessage = 'Verbinding met Firebase mislukt. Controleer uw API-sleutel en netwerkverbinding.'
             break;
        default:
          errorMessage = `Authenticatie mislukt: ${authError.message}`;
      }
      toast({
        variant: 'destructive',
        title: 'Authenticatie Fout',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isUserLoading || user) {
      return (
          <div className="min-h-screen flex items-center justify-center p-4">
              <div className="p-8 text-center text-gray-500 flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticatie controleren...
              </div>
          </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
            <div className="mx-auto mb-4">
                <Hammer className="h-12 w-12 text-primary" />
            </div>
          <CardTitle className="text-2xl">OfferteHulp</CardTitle>
          <CardDescription>Log in om toegang te krijgen tot uw dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => handleAuthAction(true)} disabled={isLoading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {isLoading ? 'Inloggen...' : 'Log In'}
            </Button>
            <Button onClick={() => handleAuthAction(false)} disabled={isLoading} variant="outline" className="w-full">
              {isLoading ? 'Account aanmaken...' : 'Account aanmaken'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
