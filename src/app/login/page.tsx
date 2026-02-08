/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */

'use client';
import Image from 'next/image';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  AuthError,
} from 'firebase/auth';
import Link from 'next/link';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
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
      router.push('/dashboard');
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

  const handleResetPassword = async () => {
    if (!email) {
      setError('Vul uw e-mailadres in om een reset-link te ontvangen.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!auth) {
        setError('Authenticatie is nog niet beschikbaar. Probeer opnieuw.');
        return;
      }
      auth.languageCode = 'nl';
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
    } catch (e) {
      const authError = e as AuthError;
      let errorMessage = 'Er is een fout opgetreden bij het versturen van de reset-link.';

      if (authError.code === 'auth/user-not-found') {
        errorMessage = 'Er is geen account gevonden met dit emailadres.';
      } else if (authError.code === 'auth/invalid-email') {
        errorMessage = 'Ongeldig emailadres formaat.';
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
          <div className="mx-auto mb-4 flex justify-center">
            <Image
              src="/logo_final.png"
              alt="OfferteHulp"
              width={800}
              height={224}
              priority
              className="h-56 w-auto object-contain"
              unoptimized
            />
          </div>
          <CardTitle className="text-xl">
            {isResetMode ? 'Wachtwoord vergeten?' : 'Inloggen'}
          </CardTitle>
          <CardDescription>
            {isResetMode
              ? 'Vul uw e-mailadres in om een reset-link te ontvangen.'
              : 'Log in om toegang te krijgen tot uw dashboard'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetEmailSent ? (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-600 border border-emerald-500 text-white shadow-lg animate-in fade-in zoom-in-95 duration-500">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                  <p className="font-bold text-lg tracking-tight text-white">Check je inbox!</p>
                </div>
                <p className="text-sm leading-relaxed text-emerald-50 opacity-90">
                  Er is een e-mail met instructies verstuurd naar <span className="font-bold text-white underline decoration-emerald-300 underline-offset-4">{email}</span>.
                  Geen mail ontvangen? Check je spam-folder.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 transition-all font-semibold shadow-sm"
                onClick={() => {
                  setIsResetMode(false);
                  setResetEmailSent(false);
                }}
              >
                Terug naar inloggen
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="bijv. info@bedrijf.nl"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                {!isResetMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Wachtwoord</Label>
                      <button
                        onClick={() => {
                          setIsResetMode(true);
                          setError(null);
                        }}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        Wachtwoord vergeten?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{isResetMode ? 'Fout' : 'Inlogfout'}</AlertTitle>
                    <AlertDescription>
                      {error}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="mt-6 flex flex-col gap-4">
                <Button
                  variant="success"
                  onClick={isResetMode ? handleResetPassword : handleLogin}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading
                    ? (isResetMode ? 'Versturen...' : 'Inloggen...')
                    : (isResetMode ? 'Reset-link versturen' : 'Inloggen')}
                </Button>

                {isResetMode ? (
                  <button
                    onClick={() => {
                      setIsResetMode(false);
                      setError(null);
                    }}
                    className="text-center text-sm text-muted-foreground hover:underline"
                  >
                    Terug naar inloggen
                  </button>
                ) : (
                  <p className="text-center text-sm text-muted-foreground">
                    Nog geen account?{' '}
                    <Link href="/register" className="underline text-primary hover:text-primary/80">
                      Account aanmaken
                    </Link>
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
