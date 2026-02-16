'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { WebsiteBuildRequestForm } from '@/components/WebsiteBuildRequestForm';
import { useUser } from '@/firebase';

function PageSkeleton() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Website laten maken" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function WebsiteLatenMakenPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  if (isUserLoading || !user) return <PageSkeleton />;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Website laten maken" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <WebsiteBuildRequestForm className="max-w-5xl" />
      </main>
    </div>
  );
}
