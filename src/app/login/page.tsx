
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  AuthError,
} from 'firebase/auth';
import Link from 'next/link';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { OfferteHulpIcon } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!auth) {
        setError('Authenticatie is nog niet beschikbaar. Probeer opnieuw.');
        return;
      }
    
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/landing');
    } catch (e) {
      const authError = e as AuthError;
      let errorMessage = 'Er is een onbekende fout opgetreden.';
    
      switch (authError.code) {
        case 'auth/invalid-email':
          errorMessage = 'Ongeldig emailadres formaat.';
          break;
    
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          errorMessage = 'Ongeldig emailadres of wachtwoord. Controleer uw gegevens.';
          break;
    
        default:
          errorMessage = 'Authenticatie mislukt. Probeer het opnieuw.';
      }
    
      setError(errorMessage);
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
                <OfferteHulpIcon className="h-12 w-12 text-primary" />
            </div>
          <CardTitle className="text-2xl">OfferteHulp</CardTitle>
          <CardDescription>Log in om toegang te krijgen tot uw dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
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
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Inlogfout</AlertTitle>
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="mt-6 flex flex-col gap-4">
          <Button
  variant="success"
  onClick={handleLogin}
  disabled={isLoading}
  className="w-full"
>
  {isLoading ? 'Inloggen...' : 'Inloggen'}
</Button>

            <p className="text-center text-sm text-muted-foreground">
              Nog geen account?{' '}
              <Link href="/register" className="underline text-primary hover:text-primary/80">
                Account aanmaken
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
