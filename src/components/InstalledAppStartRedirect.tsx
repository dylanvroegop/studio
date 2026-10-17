'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function InstalledAppStartRedirect() {
  const router = useRouter();

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Bestaande beginschermiconen kunnen nog het oude startadres bewaren.
    // Alleen bij het laden corrigeren; navigatie en diepe links blijven werken.
    if (standalone && window.location.pathname.replace(/\/$/, '') === '/dashboard') {
      router.replace('/offertes');
    }
  }, [router]);

  return null;
}
