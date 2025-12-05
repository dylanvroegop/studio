'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser, setDocumentNonBlocking } from '@/firebase';
import { createUserWithEmailAndPassword, AuthError } from 'firebase/auth';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Hammer, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [bedrijfsnaam, setBedrijfsnaam] = useState('');
  const [kvkNummer, setKvkNummer] = useState('');
  const [btwNummer, setBtwNummer] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [rol, setRol] = useState('');
  const [offertesPerMaand, setOffertesPerMaand] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordConfirmError, setPasswordConfirmError] = useState<string | null>(null);
  
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const validatePasswords = () => {
    if (password && passwordConfirm && password !== passwordConfirm) {
      setPasswordConfirmError('De wachtwoorden komen niet overeen.');
    } else {
      setPasswordConfirmError(null);
    }
  };

  useEffect(() => {
    validatePasswords();
  }, [password, passwordConfirm]);
  
  const handleRegister = async () => {
    setError(null);
    validatePasswords();

    if (password !== passwordConfirm) {
      // The inline error is already shown, no need for a general alert.
      return;
    }
    if (!termsAccepted) {
      setError('U moet akkoord gaan met de algemene voorwaarden.');
      return;
    }
    if (!rol || !offertesPerMaand) {
        setError('Vul alstublieft alle bedrijfsgegevens in.');
        return;
    }

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      const businessData = {
        email: newUser.email,
        bedrijfsnaam,
        kvkNummer,
        btwNummer,
        telefoon,
        rol,
        offertesPerMaand,
        createdAt: serverTimestamp(),
      };
      
      const businessDocRef = doc(firestore, 'businesses', newUser.uid);
      setDocumentNonBlocking(businessDocRef, businessData, { merge: true });

      router.push('/dashboard');

    } catch (e) {
      const authError = e as AuthError;
      let errorMessage = 'Er is een onbekende fout opgetreden.';
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
        default:
          errorMessage = `Registratie mislukt. Probeer het opnieuw.`;
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
                  Laden...
              </div>
          </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Hammer className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Account aanmaken</CardTitle>
          <CardDescription>Maak een bedrijfsaccount om offertes te maken en beheren.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            
            {/* Accountgegevens */}
            <div className="space-y-4">
                <h3 className="font-medium text-lg">Accountgegevens</h3>
                <div className="space-y-2">
                    <Label htmlFor="email">E-mailadres</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">Wachtwoord</Label>
                        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="passwordConfirm">Wachtwoord herhalen</Label>
                        <Input id="passwordConfirm" type="password" required value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} disabled={isLoading} />
                        {passwordConfirmError && <p className="text-sm text-destructive mt-1">{passwordConfirmError}</p>}
                    </div>
                </div>
            </div>

            <Separator />

            {/* Bedrijfsgegevens */}
            <div className="space-y-4">
                 <h3 className="font-medium text-lg">Bedrijfsgegevens</h3>
                 <div className="space-y-2">
                    <Label htmlFor="bedrijfsnaam">Bedrijfsnaam</Label>
                    <Input id="bedrijfsnaam" required value={bedrijfsnaam} onChange={(e) => setBedrijfsnaam(e.target.value)} disabled={isLoading} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="kvk">KVK-nummer</Label>
                        <Input id="kvk" required value={kvkNummer} onChange={(e) => setKvkNummer(e.target.value)} disabled={isLoading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="btw">BTW-nummer (optioneel)</Label>
                        <Input id="btw" value={btwNummer} onChange={(e) => setBtwNummer(e.target.value)} disabled={isLoading} />
                    </div>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="telefoon">Telefoonnummer (optioneel)</Label>
                    <Input id="telefoon" type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} disabled={isLoading} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="rol">Rol / type bedrijf</Label>
                         <Select onValueChange={setRol} value={rol} required>
                            <SelectTrigger id="rol"><SelectValue placeholder="Kies uw rol" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="aannemer">Aannemer</SelectItem>
                                <SelectItem value="timmerman">Timmerman</SelectItem>
                                <SelectItem value="bouwbedrijf">Bouwbedrijf</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="offertes">Aantal offertes per maand</Label>
                        <Select onValueChange={setOffertesPerMaand} value={offertesPerMaand} required>
                            <SelectTrigger id="offertes"><SelectValue placeholder="Kies een aantal" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0-10">0–10</SelectItem>
                                <SelectItem value="10-30">10–30</SelectItem>
                                <SelectItem value="30+">30+</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <Separator />
            
            <div className="items-top flex space-x-2">
                <Checkbox id="terms" checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked as boolean)} />
                <div className="grid gap-1.5 leading-none">
                    <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                    Ik ga akkoord met de <a href="#" className="underline">algemene voorwaarden</a> en <a href="#" className="underline">privacyverklaring</a>.
                    </label>
                </div>
            </div>

            {error && (
               <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Registratiefout</AlertTitle>
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="mt-6 flex flex-col gap-4">
            <Button onClick={handleRegister} disabled={isLoading} className="w-full">
              {isLoading ? 'Account aanmaken...' : 'Account aanmaken'}
            </Button>
             <p className="text-center text-sm text-muted-foreground">
              Heb je al een account?{' '}
              <Link href="/login" className="underline text-primary hover:text-primary/80">
                Inloggen
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
