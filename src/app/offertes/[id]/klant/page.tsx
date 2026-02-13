
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NewQuoteForm } from '@/components/new-quote-form-wrapper';
import { useUser } from '@/firebase';
import { WizardHeader } from '@/components/WizardHeader';

function PaginaLaden() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="rounded-3xl border bg-card/50 p-8 text-center text-muted-foreground shadow-sm backdrop-blur-xl flex items-center">
                <svg
                    className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
                Laden...
            </div>
        </div>
    );
}

export default function QuoteClientPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { user, isUserLoading } = useUser();

    useEffect(() => {
        if (!isUserLoading && !user) router.push('/login');
    }, [user, isUserLoading, router]);

    if (isUserLoading || !user) return <PaginaLaden />;

    return (
        <main className="relative min-h-screen bg-background">
            <style jsx global>{`
        /* RADIO — outer + inner dot */
        .oh-cta-green [role='radio'][data-state='checked'] {
          border-color: hsl(142 71% 45%) !important;
          color: hsl(142 71% 45%) !important;
        }

        /* SWITCH */
        .oh-cta-green button[role='switch'][data-state='checked'] {
          background-color: hsl(142 71% 45%) !important;
        }
      `}</style>

            {/* ambience - cleaner, less busy */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-background" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-background to-background" />
            </div>

            <WizardHeader
                title="Klantinformatie"
                backLink="/dashboard"
                progress={10}
            />

            {/* Content */}
            <div className="px-4 py-8 sm:px-6 md:py-12">
                <div className="mx-auto w-full max-w-4xl">
                    <div className="rounded-2xl border border-white/5 bg-card/40 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="oh-cta-green p-6 sm:p-10">
                            <NewQuoteForm quoteId={params.id} backHref="/offertes" />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
