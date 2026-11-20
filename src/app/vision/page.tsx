'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { VisionDashboard } from '@/components/vision/VisionDashboard';

export default function VisionPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!isUserLoading && !user) router.replace('/login');
  }, [user, isUserLoading, router]);
  if (!user) return <main className="p-6 text-sm">Sessie controleren…</main>;
  return <VisionDashboard key={user.uid} user={user} />;
}
