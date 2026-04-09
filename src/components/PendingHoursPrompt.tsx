'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useUser } from '@/firebase';
import type { PendingHourPrompt } from '@/lib/time-entries';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  const normalized = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${normalized} uur`;
}

function distributeBySuggestedHours(
  totalHours: number,
  segments: Array<{ suggestedHours: number }>
): number[] {
  const safeTotal = Math.max(0, totalHours);
  const base = segments.map((segment) => Math.max(0, Number(segment.suggestedHours) || 0));
  const sum = base.reduce((acc, value) => acc + value, 0);
  if (segments.length === 0) return [];
  if (sum <= 0) {
    const even = Number((safeTotal / segments.length).toFixed(2));
    return segments.map((_segment, index) => {
      if (index < segments.length - 1) return even;
      const consumed = even * (segments.length - 1);
      return Number((safeTotal - consumed).toFixed(2));
    });
  }

  const scaled = base.map((value) => Number(((safeTotal * value) / sum).toFixed(2)));
  const scaledSum = scaled.reduce((acc, value) => acc + value, 0);
  const diff = Number((safeTotal - scaledSum).toFixed(2));
  if (Math.abs(diff) > 0.001) {
    scaled[scaled.length - 1] = Number((scaled[scaled.length - 1] + diff).toFixed(2));
  }
  return scaled;
}

function distributeEvenly(totalValue: number, count: number): number[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount <= 0) return [];
  const safeTotal = Math.max(0, totalValue);
  const base = Number((safeTotal / safeCount).toFixed(2));
  const output = new Array<number>(safeCount).fill(base);
  const consumed = Number((base * safeCount).toFixed(2));
  const diff = Number((safeTotal - consumed).toFixed(2));
  if (Math.abs(diff) > 0.001) {
    output[output.length - 1] = Number((output[output.length - 1] + diff).toFixed(2));
  }
  return output;
}

export function PendingHoursPrompt() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [items, setItems] = useState<PendingHourPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const [workedHours, setWorkedHours] = useState('');
  const [workedDays, setWorkedDays] = useState('');
  const [quotedHours, setQuotedHours] = useState('');
  const [note, setNote] = useState('');
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const currentItem = useMemo(() => items[0] || null, [items]);

  const loadPending = useCallback(async (options?: { manual?: boolean }) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/uren/pending', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; items?: PendingHourPrompt[]; message?: string } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
        throw new Error(payload?.message || 'Kon openstaande uren niet laden.');
      }
      setItems(payload.items);
      if (options?.manual && payload.items.length === 0) {
        setManualOpen(false);
        toast({
          title: 'Geen openstaande uren',
          description: 'Er zijn nu geen prompts om te tonen.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Urenprompt laden mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (isUserLoading || !user || dismissedForSession) return;
    if (!pathname || pathname.startsWith('/login')) return;
    void loadPending();
  }, [dismissedForSession, isUserLoading, loadPending, pathname, user]);

  useEffect(() => {
    const onManualOpen = () => {
      if (!user || isUserLoading) return;
      setDismissedForSession(false);
      setManualOpen(true);
      void loadPending({ manual: true });
    };

    window.addEventListener('pending-hours:open', onManualOpen);
    return () => window.removeEventListener('pending-hours:open', onManualOpen);
  }, [isUserLoading, loadPending, user]);

  useEffect(() => {
    if (!currentItem) return;
    setWorkedHours(String(currentItem.suggestedHours));
    setWorkedDays(String(currentItem.pendingDaysCount || (currentItem.pendingDates || []).length || 1));
    setQuotedHours('');
    setNote('');
    setAdjustMode(false);
  }, [currentItem]);

  const removeCurrentItem = () => {
    setItems((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) setManualOpen(false);
      return next;
    });
  };

  const closeForSession = () => {
    setManualOpen(false);
    setDismissedForSession(true);
  };

  const withUserToken = async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    if (!user) throw new Error('Niet ingelogd.');
    const token = await user.getIdToken();
    return fn(token);
  };

  const submitPromptAction = async (action: 'later' | 'not_worked') => {
    if (!currentItem) return;
    if (action === 'later') {
      closeForSession();
      return;
    }
    setIsSubmitting(true);
    try {
      await withUserToken(async (token) => {
        const response = await fetch('/api/uren/pending/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            promptKey: currentItem.promptKey,
            quoteId: currentItem.quoteId,
            workDate: currentItem.endWorkDate || currentItem.workDate,
            action,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || 'Kon actie niet opslaan.');
        }
      });
      removeCurrentItem();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEntry = async (source: 'login_prompt_confirm' | 'login_prompt_adjust') => {
    if (!currentItem) return;
    const parsedWorked = Number(workedHours);
    const parsedWorkedDays = Number(workedDays);
    const parsedQuoted = quotedHours.trim() ? Number(quotedHours) : null;
    if (!Number.isFinite(parsedWorked) || parsedWorked <= 0 || parsedWorked > 500) {
      toast({ title: 'Werkelijke uren zijn ongeldig', variant: 'destructive' });
      return;
    }
    if (parsedQuoted !== null && (!Number.isFinite(parsedQuoted) || parsedQuoted < 0 || parsedQuoted > 500)) {
      toast({ title: 'Geoffreerde uren zijn ongeldig', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(parsedWorkedDays) || parsedWorkedDays <= 0 || parsedWorkedDays > 31) {
      toast({ title: 'Werkelijke dagen zijn ongeldig', variant: 'destructive' });
      return;
    }

    const pendingDates = (currentItem.pendingDates || []).length > 0
      ? (currentItem.pendingDates || [])
      : [{ workDate: currentItem.workDate, suggestedHours: currentItem.suggestedHours }];
    const workedDistribution = distributeBySuggestedHours(parsedWorked, pendingDates.map((segment) => ({ suggestedHours: segment.suggestedHours })));
    const workedDaysDistribution = distributeEvenly(parsedWorkedDays, pendingDates.length);
    const quotedDistribution = parsedQuoted === null
      ? null
      : distributeBySuggestedHours(parsedQuoted, pendingDates.map((segment) => ({ suggestedHours: segment.suggestedHours })));

    setIsSubmitting(true);
    try {
      await withUserToken(async (token) => {
        for (let index = 0; index < pendingDates.length; index += 1) {
          const segment = pendingDates[index];
          const response = await fetch('/api/uren/entries', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              quoteId: currentItem.quoteId,
              workDate: segment.workDate,
              workedHours: workedDistribution[index],
              workedDays: workedDaysDistribution[index],
              quotedHours: quotedDistribution ? quotedDistribution[index] : null,
              note: note.trim() || null,
              source,
              promptKey: segment.dayPromptKey || currentItem.promptKey,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.message || 'Kon uren niet opslaan.');
          }
        }
      });

      removeCurrentItem();
      toast({
        title: 'Uren opgeslagen',
        description: `${formatHours(parsedWorked)} en ${parsedWorkedDays.toFixed(2).replace(/\.?0+$/, '')} dagen op ${currentItem.quoteLabel}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || isUserLoading || (!manualOpen && dismissedForSession) || !pathname || pathname.startsWith('/login')) {
    return null;
  }

  const isOpen = Boolean(currentItem) && !isLoading && (manualOpen || !dismissedForSession);
  if (!isOpen) return null;

  const sourceRefPreview = (currentItem.plannedEntryRefs || []).slice(0, 3).join(', ');
  const sourceRefRestCount = Math.max(0, (currentItem.plannedEntryRefs || []).length - 3);
  const rangeText = currentItem.endWorkDate && currentItem.endWorkDate !== currentItem.workDate
    ? `${currentItem.workDate} t/m ${currentItem.endWorkDate}`
    : currentItem.workDate;
  const planningTypeLabel = currentItem.planningType === 'werkbespreking'
    ? 'Werkbespreking'
    : currentItem.planningType === 'mixed'
      ? 'Gemengd (klus + werkbespreking)'
      : 'Klus';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeForSession();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Openstaande uren</DialogTitle>
          <DialogDescription>
            Je hebt openstaande uren op <strong>{currentItem.quoteLabel}</strong> van {rangeText}. Wil je {formatHours(currentItem.suggestedHours)} registreren voor dit project?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground space-y-1">
          <div><strong className="text-foreground">Quote ID:</strong> {currentItem.quoteId}</div>
          <div><strong className="text-foreground">Offerte nr:</strong> {currentItem.quoteNumber || 'onbekend'}</div>
          <div><strong className="text-foreground">Klant:</strong> {currentItem.clientName || 'onbekend'}</div>
          <div><strong className="text-foreground">Project:</strong> {currentItem.projectTitle || 'onbekend'}</div>
          <div><strong className="text-foreground">Type:</strong> {planningTypeLabel}</div>
          <div><strong className="text-foreground">Open dagen:</strong> {currentItem.pendingDaysCount || (currentItem.pendingDates || []).length || 1}</div>
          <div><strong className="text-foreground">Prompt key:</strong> {currentItem.promptKey}</div>
          <div>
            <strong className="text-foreground">Planning refs:</strong>{' '}
            {sourceRefPreview || 'geen'}
            {sourceRefRestCount > 0 ? ` (+${sourceRefRestCount})` : ''}
          </div>
        </div>

        {adjustMode ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="worked-hours">Werkelijk gewerkt (uur)</Label>
              <Input
                id="worked-hours"
                type="number"
                step="0.25"
                value={workedHours}
                onChange={(event) => setWorkedHours(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worked-days">Werkelijk gewerkt (dagen)</Label>
              <Input
                id="worked-days"
                type="number"
                step="0.25"
                value={workedDays}
                onChange={(event) => setWorkedDays(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quoted-hours">Geoffreerd (optioneel)</Label>
              <Input
                id="quoted-hours"
                type="number"
                step="0.25"
                value={quotedHours}
                onChange={(event) => setQuotedHours(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours-note">Notitie (optioneel)</Label>
              <Input
                id="hours-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Bijv. Meerwerk door extra afwerking"
                disabled={isSubmitting}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void submitPromptAction('later')} disabled={isSubmitting}>
              Later
            </Button>
            <Button variant="outline" onClick={() => void submitPromptAction('not_worked')} disabled={isSubmitting}>
              Niet gewerkt
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {!adjustMode ? (
              <>
                <Button variant="outline" onClick={() => setAdjustMode(true)} disabled={isSubmitting}>
                  Pas aan
                </Button>
                <Button onClick={() => void saveEntry('login_prompt_confirm')} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ja, opslaan'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAdjustMode(false)} disabled={isSubmitting}>
                  Terug
                </Button>
                <Button onClick={() => void saveEntry('login_prompt_adjust')} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Opslaan'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
