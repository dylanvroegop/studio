'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useUser } from '@/firebase';

const DeferredAuthSessionSync = dynamic(
  () => import('@/components/AuthSessionSync').then((mod) => mod.AuthSessionSync),
  { ssr: false }
);

const DeferredBusinessProfileGate = dynamic(
  () => import('@/components/BusinessProfileGate').then((mod) => mod.BusinessProfileGate),
  { ssr: false }
);

const DeferredGpsWorkSessionPrompt = dynamic(
  () => import('@/components/GpsWorkSessionPrompt').then((mod) => mod.GpsWorkSessionPrompt),
  { ssr: false }
);

const PUBLIC_PATH_PREFIXES = [
  '/',
  '/login',
  '/register',
  '/support',
  '/view',
  '/website-laten-maken',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
  );
}

export function DeferredAuthGuards() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!pathname || isUserLoading || !user || isPublicPath(pathname)) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 160);

    const w = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let idleId: number | null = null;
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(() => {
        if (!cancelled) setIsReady(true);
      });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      if (idleId !== null && typeof w.cancelIdleCallback === 'function') {
        w.cancelIdleCallback(idleId);
      }
    };
  }, [isUserLoading, pathname, user]);

  if (!isReady) return null;

  return (
    <>
      <DeferredAuthSessionSync />
      <DeferredBusinessProfileGate />
      <DeferredGpsWorkSessionPrompt />
    </>
  );
}
