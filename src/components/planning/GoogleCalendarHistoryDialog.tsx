'use client';

import { format, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { PlanningEntry } from '@/lib/types-planning';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface GoogleCalendarHistoryDialogProps {
    entry: PlanningEntry | null;
    onClose: () => void;
}

export function GoogleCalendarHistoryDialog({ entry, onClose }: GoogleCalendarHistoryDialogProps) {
    const start = entry?.startDate.toDate();
    const end = entry?.endDate.toDate();
    const dateLabel = start && end
        ? entry?.isAllDay
            ? `${format(start, 'EEEE d MMMM yyyy', { locale: nl })}${isSameDay(start, end) ? '' : ` – ${format(end, 'd MMMM yyyy', { locale: nl })}`} · Hele dag`
            : `${format(start, 'd MMMM yyyy HH:mm', { locale: nl })} – ${format(end, isSameDay(start, end) ? 'HH:mm' : 'd MMMM yyyy HH:mm', { locale: nl })}`
        : '';

    return (
        <Dialog open={Boolean(entry)} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{entry?.googleCalendarSummary || entry?.cache.projectTitle || 'Google Agenda'}</DialogTitle>
                    <DialogDescription>Google Agenda · historie · alleen-lezen</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                    <p>{dateLabel}</p>
                    {entry?.cache.projectAddress && <p>{entry.cache.projectAddress}</p>}
                    {entry?.notes && <p className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{entry.notes}</p>}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Sluiten</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
