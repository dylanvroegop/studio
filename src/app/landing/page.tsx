
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FilePlus, ClipboardList, LayoutDashboard, HardHat, Building } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard-header';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const menuItems = [
    {
        title: 'Nieuwe Offerte',
        description: 'Start met een nieuwe offerte voor een klant.',
        icon: FilePlus,
        href: '/offertes/nieuw',
        color: 'text-accent',
    },
    {
        title: 'Dashboard',
        description: 'Bekijk recente offertes en statistieken.',
        icon: LayoutDashboard,
        href: '/dashboard',
        color: 'text-primary',
    },
    {
        title: 'Materiaalbibliotheek',
        description: 'Beheer en doorzoek uw materialen en prijzen.',
        icon: ClipboardList,
        href: '/materialen',
        color: 'text-green-400',
    }
];

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
                    Pagina laden...
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
            <main className="flex-1 p-6 md:p-10">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center md:text-left mb-10">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Welkom terug</h1>
                        <p className="text-muted-foreground mt-2">Kies waar je wilt beginnen.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link href={item.href} key={item.title} className="group">
                                    <Card className="h-full bg-card/50 hover:bg-card hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10">
                                        <CardHeader>
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-lg bg-primary/10 ${item.color}`}>
                                                    <Icon className="w-6 h-6" />
                                                </div>
                                                <CardTitle className="text-lg">{item.title}</CardTitle>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-muted-foreground">{item.description}</p>
                                        </CardContent>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
}
