'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useUser } from '@/firebase';

export function PendingCostImportPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isUserLoading || !user || pathname === '/kosten' || redirectedRef.current) return;
    let cancelled = false;

    const checkPendingImports = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/kosten/pending', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          data?: Array<{ id?: unknown }>;
        } | null;
        const pendingId = payload?.ok && Array.isArray(payload.data)
          ? String(payload.data[0]?.id || '').trim()
          : '';

        if (!cancelled && pendingId) {
          redirectedRef.current = true;
          router.push(`/kosten?pendingId=${encodeURIComponent(pendingId)}&open=1`);
        }
      } catch (error) {
        console.error('[PendingCostImportPrompt]', error);
      }
    };

    void checkPendingImports();
    return () => {
      cancelled = true;
    };
  }, [isUserLoading, pathname, router, user]);

  return null;
}
