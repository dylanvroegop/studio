/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Badge } from "@/components/ui/badge";
import { Circle, Clock, CheckCircle2, Send, XCircle, AlertCircle, Loader2 } from "lucide-react";
export type Status = 'concept' | 'in_behandeling' | 'verzonden' | 'geaccepteerd' | 'afgewezen' | 'verlopen';

// Helper to check if a single job (klus) is complete
export function jobIsComplete(job: any): boolean {
    const selections = job?.materialen?.selections;
    const hasSelections =
        selections &&
        typeof selections === 'object' &&
        Object.keys(selections).length > 0;

    const presetLabel = job?.werkwijze?.presetLabel;
    const hasWerkwijzePreset =
        !!presetLabel && presetLabel.trim().toLowerCase() !== 'nieuw';

    return hasSelections || hasWerkwijzePreset;
}


// Determine the overall work status
type WorkStatus =
    | { type: 'no_jobs' }
    | { type: 'in_progress'; complete: number; total: number }
    | { type: 'ready'; total: number }
    | { type: 'calculating' }
    | { type: 'calculated' }
    | { type: 'sent'; status: Status };

export function getQuoteWorkStatus(quote: any): WorkStatus {
    const status = quote.status as Status;
    const amount = quote.totaalbedrag || quote.amount || 0;

    // If already sent/accepted/rejected, show that status
    if (status === 'verzonden' || status === 'geaccepteerd' || status === 'afgewezen' || status === 'verlopen') {
        return { type: 'sent', status };
    }

    // If currently being processed by n8n
    if (status === 'in_behandeling') {
        return { type: 'calculating' };
    }

    // If we have an amount and we're in concept, it means it's calculated but not yet sent
    if (status === 'concept' && amount > 0) {
        return { type: 'calculated' };
    }

    // Extract jobs from the quote
    const klussen = quote.klussen;
    if (!klussen || typeof klussen !== 'object') {
        return { type: 'no_jobs' };
    }

    const jobIds = Object.keys(klussen);
    if (jobIds.length === 0) {
        return { type: 'no_jobs' };
    }

    const total = jobIds.length;
    const complete = jobIds.filter(id => jobIsComplete(klussen[id])).length;

    if (complete === total) {
        return { type: 'ready', total };
    }

    return { type: 'in_progress', complete, total };
}

export function WorkStatusBadge({ quote }: { quote: any }) {
    const workStatus = getQuoteWorkStatus(quote);

    if (workStatus.type === 'no_jobs') {
        return (
            <Badge
                variant="outline"
                className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-zinc-800/50 text-zinc-400 border-zinc-700/50"
            >
                <Circle className="h-3 w-3" />
                Geen klussen
            </Badge>
        );
    }

    if (workStatus.type === 'in_progress') {
        return (
            <Badge
                variant="outline"
                className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20"
            >
                <Clock className="h-3 w-3" />
                {workStatus.complete}/{workStatus.total} klaar
            </Badge>
        );
    }

    if (workStatus.type === 'ready') {
        return (
            <Badge
                variant="outline"
                className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            >
                <CheckCircle2 className="h-3 w-3" />
                Klaar voor offerte
            </Badge>
        );
    }

    if (workStatus.type === 'calculating') {
        return (
            <Badge
                variant="outline"
                className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20"
            >
                <Loader2 className="h-3 w-3 animate-spin" />
                Wordt berekend
            </Badge>
        );
    }

    if (workStatus.type === 'calculated') {
        return (
            <Badge
                variant="outline"
                className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20"
            >
                <CheckCircle2 className="h-3 w-3" />
                Klaar om te versturen
            </Badge>
        );
    }

    // workStatus.type === 'sent'
    const sentStatusMap: Record<Status, { text: string; className: string; icon: React.ReactNode }> = {
        concept: { text: 'Concept', className: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/30', icon: <Circle className="h-3 w-3" /> },
        in_behandeling: { text: 'In bewerking', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock className="h-3 w-3" /> },
        verzonden: { text: 'Verzonden', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: <Send className="h-3 w-3" /> },
        geaccepteerd: { text: 'Geaccepteerd', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="h-3 w-3" /> },
        afgewezen: { text: 'Afgewezen', className: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <XCircle className="h-3 w-3" /> },
        verlopen: { text: 'Verlopen', className: 'bg-zinc-800 text-zinc-500 border-zinc-700', icon: <AlertCircle className="h-3 w-3" /> },
    };

    const { text, className, icon } = sentStatusMap[workStatus.status] || sentStatusMap.concept;

    return (
        <Badge
            variant="outline"
            className={`font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 ${className}`}
        >
            {icon}
            {text}
        </Badge>
    );
}
