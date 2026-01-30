/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
'use client';

import React from 'react';
import { VisualizerController } from "@/components/visualizers/VisualizerController";
import { Job } from "@/lib/types";

export function JobPreview({ job }: { job: Job }) {
    // 1. Get the first item from maatwerk (most jobs have at least one)
    const maatwerk = (job.maatwerk && !Array.isArray(job.maatwerk)) ? (job.maatwerk as any).items : job.maatwerk;
    const firstItem = Array.isArray(maatwerk) ? maatwerk[0] : null;

    if (!firstItem) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-50/50 dark:bg-zinc-900/50 border border-dashed rounded-lg">
                <span className="text-xs text-muted-foreground">Geen tekening</span>
            </div>
        );
    }

    // 2. Extract slugs from meta (saved by wizard) or infer
    const meta = (job as any).meta;
    const categorySlug = meta?.type || 'onbekend';
    const jobSlug = meta?.slug || 'onbekend';

    return (
        <div className="w-full h-full min-h-[160px] relative bg-white dark:bg-zinc-950 rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <VisualizerController
                category={categorySlug}
                slug={jobSlug}
                item={firstItem}
                fields={[]} // Empty fields for read-only mode
                fitContainer={true}
                className="w-full h-full pointer-events-none"
            />
            {/* Optional: Add badge for item count if > 1 */}
            {Array.isArray(maatwerk) && maatwerk.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    +{maatwerk.length - 1}
                </div>
            )}
        </div>
    );
}
