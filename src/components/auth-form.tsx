'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  type AuthError,
} from 'firebase/auth';
import { useAuth } from '@/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function AuthForm() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
        setError("Authenticatie service is niet beschikbaar. Probeer later opnieuw.");
        return;
    };

    setIsLoading(true);
    setError(null);

    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
      
      const idToken = await userCredential.user.getIdToken();

      await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      router.push('/');
      router.refresh();

    } catch (err: unknown) {
      const authError = err as AuthError;
      let errorMessage = 'An unknown error occurred.';
      switch (authError.code) {
        case 'auth/invalid-email':
          errorMessage = 'Ongeldig e-mailadres formaat.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Wachtwoord moet minimaal 6 karakters lang zijn.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'Dit e-mailadres is al geregistreerd. Probeer in te loggen.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Ongeldig e-mailadres of wachtwoord.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'E-mail/wachtwoord authenticatie is niet ingeschakeld.';
          break;
        default:
          errorMessage = `Authenticatie mislukt: ${authError.message}`;
      }
      setError(errorMessage);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSignUp ? 'Nieuw account aanmaken' : 'Inloggen'}</CardTitle>
        <CardDescription>
          {isSignUp
            ? 'Voer uw gegevens in om een account aan te maken.'
            : 'Voer uw e-mailadres en wachtwoord in om in te loggen.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAuthAction} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mailadres</Label>
            <Input
              id="email"
              type="email"
              placeholder="naam@voorbeeld.nl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Wachtwoord</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Bezig...' : isSignUp ? 'Account aanmaken' : 'Inloggen'}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          {isSignUp ? 'Heeft u al een account?' : 'Nog geen account?'}
          <Button
            variant="link"
            className="pl-1"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            disabled={isLoading}
          >
            {isSignUp ? 'Log hier in' : 'Maak een account aan'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
