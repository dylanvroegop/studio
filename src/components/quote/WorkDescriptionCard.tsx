'use client';

import { useState } from 'react';
import { generateWorkSummary } from '@/lib/quote-calculations';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface WorkDescriptionCardProps {
    werkbeschrijving: string[];
}

export function WorkDescriptionCard({ werkbeschrijving }: WorkDescriptionCardProps) {
    const [expanded, setExpanded] = useState(false);

    if (!werkbeschrijving || werkbeschrijving.length === 0) {
        return null;
    }

    const summary = generateWorkSummary(werkbeschrijving, 300);

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <h3 className="font-semibold text-zinc-400 text-sm mb-4 flex items-center gap-2">
                <FileText size={14} />
                WERKBESCHRIJVING
            </h3>

            {expanded ? (
                <div className="space-y-2">
                    {werkbeschrijving.map((item, index) => (
                        <p key={index} className="text-zinc-300 text-sm leading-relaxed">
                            • {item}
                        </p>
                    ))}
                </div>
            ) : (
                <p className="text-zinc-300 text-sm leading-relaxed">
                    {summary}
                </p>
            )}

            <button
                onClick={() => setExpanded(!expanded)}
                className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1"
            >
                {expanded ? (
                    <>
                        <ChevronUp size={16} />
                        Minder tonen
                    </>
                ) : (
                    <>
                        <ChevronDown size={16} />
                        Volledige beschrijving tonen ({werkbeschrijving.length} stappen)
                    </>
                )}
            </button>
        </div>
    );
}
