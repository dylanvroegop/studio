'use client';

import { AuthForm } from '@/components/auth-form';
import { Hammer } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center justify-center gap-2">
          <Hammer className="h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Welkom bij OfferteHulp
          </h1>
          <p className="text-sm text-muted-foreground">
            Log in om door te gaan
          </p>
        </div>
        <AuthForm />
      </div>
    </div>
  );
}
