'use client';

import { useState } from 'react';
import { generateWorkSummary } from '@/lib/quote-calculations';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface WorkDescriptionCardProps {
    werkbeschrijving: string[];
}

export function WorkDescriptionCard({ werkbeschrijving }: WorkDescriptionCardProps) {
    if (!werkbeschrijving || werkbeschrijving.length === 0) {
        return null;
    }

    return (
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <h3 className="font-semibold text-muted-foreground text-sm mb-4 flex items-center gap-2">
                <FileText size={14} />
                WERKBESCHRIJVING
            </h3>

            <div className="space-y-3">
                {werkbeschrijving.map((item, index) => (
                    <p key={index} className="text-foreground/80 text-sm leading-relaxed border-l-2 border-emerald-500/20 pl-4 py-0.5">
                        {item}
                    </p>
                ))}
            </div>
        </div>
    );
}
