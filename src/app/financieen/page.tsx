'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FinancieenPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/kosten?tab=overview');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Financiën wordt geladen...
    </div>
  );
}
