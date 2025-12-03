'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type AuthError,
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);
  
  const auth = useAuth();
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!auth) {
        setError("Authenticatie service is niet beschikbaar.");
        setIsLoading(false);
        return;
    }

    try {
      const userCredential = isLoginView
        ? await signInWithEmailAndPassword(auth, email, password)
        : await createUserWithEmailAndPassword(auth, email, password);

      const idToken = await userCredential.user.getIdToken();

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        router.push('/');
        router.refresh(); 
      } else {
        setError('Sessie kon niet worden aangemaakt.');
      }
    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'Er is een onbekende fout opgetreden.';
      switch (authError.code) {
        case 'auth/invalid-email':
          errorMessage = 'Ongeldig e-mailadres.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Ongeldige e-mail of wachtwoord.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'Dit e-mailadres is al in gebruik.';
          break;
        case 'auth/weak-password':
            errorMessage = 'Wachtwoord moet minimaal 6 karakters lang zijn.';
            break;
        default:
          errorMessage = `Fout: ${authError.message}`;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tabs defaultValue="login" onValueChange={(value) => setIsLoginView(value === 'login')} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="login">Inloggen</TabsTrigger>
        <TabsTrigger value="signup">Registreren</TabsTrigger>
      </TabsList>
      <form onSubmit={handleAuth}>
        <TabsContent value="login">
          <Card>
            <CardHeader>
              <CardTitle>Inloggen</CardTitle>
              <CardDescription>
                Voer uw gegevens in om toegang te krijgen tot uw account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-login">Email</Label>
                <Input
                  id="email-login"
                  type="email"
                  placeholder="naam@voorbeeld.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-login">Wachtwoord</Label>
                <Input
                  id="password-login"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Bezig...' : 'Inloggen'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </form>
      <form onSubmit={handleAuth}>
        <TabsContent value="signup">
          <Card>
            <CardHeader>
              <CardTitle>Account aanmaken</CardTitle>
              <CardDescription>
                Voer uw e-mailadres en een wachtwoord in om een account aan te maken.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-signup">Email</Label>
                <Input
                  id="email-signup"
                  type="email"
                  placeholder="naam@voorbeeld.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-signup">Wachtwoord</Label>
                <Input
                  id="password-signup"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Bezig...' : 'Registreren'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </form>
    </Tabs>
  );
}
