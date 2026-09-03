'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { AutoMessagesTab } from '@/components/quote/AutoMessagesTab';
import { DashboardHeader } from '@/components/DashboardHeader';
import { useUser } from '@/firebase';

function LoadingPage() {
    return (
        <div className="app-shell min-h-screen bg-background">
            <AppNavigation />
            <DashboardHeader user={null} title="Berichten" />
            <main className="flex min-h-[60vh] items-center justify-center p-6">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Laden...
                </div>
            </main>
        </div>
    );
}

export default function AutoMessagesPage() {
    const router = useRouter();
    const { user, isUserLoading } = useUser();

    useEffect(() => {
        if (!isUserLoading && !user) router.push('/login');
    }, [isUserLoading, router, user]);

    if (isUserLoading || !user) return <LoadingPage />;

    return (
        <div className="app-shell min-h-screen bg-background">
            <AppNavigation />
            <DashboardHeader user={user} title="Berichten" />
            <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6">
                <AutoMessagesTab />
            </main>
        </div>
    );
}
