import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary">OfferteHulp</h1>
          <p className="text-muted-foreground mt-2">
            Log in om offertes te maken
          </p>
        </div>
        <AuthForm />
      </div>
    </main>
  );
}
