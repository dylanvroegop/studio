'use client';

import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { PlusCircle, LayoutDashboard, Hammer } from 'lucide-react';
import { useEffect } from 'react';
import { DashboardHeader } from '@/components/dashboard-header';

function LandingPageSkeleton() {
    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader user={null} />
            <main className="flex flex-1 flex-col justify-center items-center gap-4 p-4 md:gap-8 md:p-6">
                <div className="text-center p-8 text-gray-500 flex items-center">
                    <svg className="animate-spin mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Even geduld a.u.b...
                </div>
            </main>
        </div>
    )
}

export default function LandingPage() {
    const { user, isUserLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    if (isUserLoading || !user) {
        return <LandingPageSkeleton />;
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader user={user} />
            <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:gap-8 md:p-6">
                <div className="text-center mb-8">
                    <h1 className="font-semibold text-2xl md:text-3xl">Welkom bij OfferteHulp</h1>
                    <p className="text-muted-foreground">Wat wilt u doen?</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 max-w-2xl w-full">
                    <Card className="hover:bg-muted/50 transition-colors w-full cursor-pointer">
                        <Link href="/offertes/nieuw" className="block p-6 h-full">
                            <CardHeader className="p-0">
                                <div className="flex items-center gap-4 mb-2">
                                    <PlusCircle className="h-8 w-8 text-primary flex-shrink-0" />
                                    <CardTitle className="text-lg">Nieuwe offerte aanmaken</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <CardDescription>Start een nieuwe offerte voor een klant en voeg klussen toe.</CardDescription>
                            </CardContent>
                        </Link>
                    </Card>
                     <Card className="hover:bg-muted/50 transition-colors w-full cursor-pointer">
                        <Link href="/dashboard" className="block p-6 h-full">
                            <CardHeader className="p-0">
                                <div className="flex items-center gap-4 mb-2">
                                    <LayoutDashboard className="h-8 w-8 text-primary flex-shrink-0" />
                                    <CardTitle className="text-lg">Naar Dashboard</CardTitle>
                                </div>
                             </CardHeader>
                            <CardContent className="p-0">
                                <CardDescription>Bekijk en beheer uw bestaande offertes en materialen.</CardDescription>
                            </CardContent>
                        </Link>
                    </Card>
                </div>
            </main>
        </div>
    );
}