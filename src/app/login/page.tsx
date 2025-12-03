import { AuthForm } from '@/components/auth-form';
import { Hammer } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center items-center gap-3">
          <Hammer className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">OfferteHulp</h1>
        </div>
        <AuthForm />
      </div>
    </div>
  );
}
