
import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WizardHeaderProps {
    title: string;
    backLink: string;
    progress: number;
    rightContent?: React.ReactNode;
}

export function WizardHeader({
    title,
    backLink,
    progress,
    rightContent,
}: WizardHeaderProps) {
    return (
        <header className="border-b bg-background">
            <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
                <div className="flex items-center gap-3">
                    <Button
                        asChild
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-xl shrink-0"
                    >
                        <Link href={backLink}>
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>

                    <div className="flex-1">
                        <div className="text-sm font-semibold text-center">{title}</div>

                        <div className="mt-3">
                            <div className="h-1.5 rounded-full bg-muted/40 mx-auto">
                                <div
                                    className="h-full rounded-full bg-emerald-600/65 transition-all"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center shrink-0">
                        {rightContent}
                    </div>
                </div>
            </div>
        </header>
    );
}
