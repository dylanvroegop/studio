
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import dynamic from 'next/dynamic';

function LandingPageSkeleton() {
    return (
        <div className="flex flex-col min-h-screen">
            <main className="flex flex-1 flex-col justify-center items-center gap-4 p-4 md:gap-8 md:p-6">
                <div className="text-center p-8 text-gray-500 flex items-center">
                    <svg className="animate-spin mr-3 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticatie controleren...
                </div>
            </main>
        </div>
    )
}

function LandingPageContent() {
    const { user, isUserLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (isUserLoading) {
            return; // Wacht tot de authenticatiestatus bekend is
        }
        if (user) {
            router.push('/dashboard');
        } else {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    return <LandingPageSkeleton />;
}

const NoSsrLandingPage = dynamic(() => Promise.resolve(LandingPageContent), {
    ssr: false,
    loading: () => <LandingPageSkeleton />,
});

export default function RootPage() {
    return <NoSsrLandingPage />;
}
