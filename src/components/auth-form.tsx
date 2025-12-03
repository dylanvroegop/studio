'use client';

import { useState } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  AuthError,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirebase } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const { app } = useFirebase();
  const auth = getAuth(app);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        // On successful sign up, switch to login view and inform user.
        setIsSignUp(false);
        setError('Account aangemaakt! U kunt nu inloggen.');
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await userCredential.user.getIdToken();
        
        // Set cookie for middleware to read
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ idToken }),
        });

        router.push('/');
      }
    } catch (err: unknown) {
      const authError = err as AuthError;
      switch (authError.code) {
        case 'auth/user-not-found':
          setError('Geen gebruiker gevonden met dit e-mailadres.');
          break;
        case 'auth/wrong-password':
          setError('Ongeldig wachtwoord. Probeer het opnieuw.');
          break;
        case 'auth/email-already-in-use':
          setError('Dit e-mailadres is al in gebruik.');
          break;
        case 'auth/invalid-email':
            setError('Ongeldig e-mailadres formaat.');
            break;
        case 'auth/weak-password':
            setError('Wachtwoord moet minimaal 6 karakters lang zijn.');
            break;
        default:
          setError('Er is een onbekende fout opgetreden.');
          break;
      }
    }
  };

  return (
    <form onSubmit={handleAuth} className="space-y-6">
      {error && (
        <Alert variant={error.includes('Account aangemaakt') ? 'default' : 'destructive'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{error.includes('Account aangemaakt') ? 'Succes' : 'Fout'}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">E-mailadres</Label>
        <Input
          id="email"
          type="email"
          placeholder="naam@voorbeeld.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Wachtwoord</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
        {isSignUp ? 'Account aanmaken' : 'Inloggen'}
      </Button>
      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError(null);
          }}
          className="text-sm text-muted-foreground hover:text-primary underline"
        >
          {isSignUp
            ? 'Heb je al een account? Log in'
            : 'Nieuw account aanmaken'}
        </button>
      </div>
    </form>
  );
}
