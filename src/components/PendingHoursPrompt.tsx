'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const AUTO_OPEN_PATH_PREFIXES = ['/dashboard', '/urenregistratie'];

function canAutoOpenForPath(pathname: string): boolean {
  return AUTO_OPEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

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

function parseDecimalInput(value: string): number {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return Number.NaN;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function nearlyEqual(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) <= epsilon;
}

function getDefaultSnoozeUntil(hours = 8): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function getDefaultWorkedDays(item: PendingHourPrompt): number {
  return item.pendingDaysCount || (item.pendingDates || []).length || 1;
}

function getDayPromptKeys(item: PendingHourPrompt): string[] {
  const fromSegments = (item.pendingDates || [])
    .map((segment) => String(segment.dayPromptKey || '').trim())
    .filter(Boolean);
  if (fromSegments.length > 0) return fromSegments;
  return item.promptKey ? [item.promptKey] : [];
}

function isResolvedByLocalState(item: PendingHourPrompt, resolvedPromptKeys: Set<string>): boolean {
  if (resolvedPromptKeys.has(item.promptKey)) return true;
  const dayKeys = getDayPromptKeys(item);
  return dayKeys.length > 0 && dayKeys.every((key) => resolvedPromptKeys.has(key));
}

export function PendingHoursPrompt() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [items, setItems] = useState<PendingHourPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workedHours, setWorkedHours] = useState('');
  const [workedDays, setWorkedDays] = useState('');
  const [quotedHours, setQuotedHours] = useState('');
  const [note, setNote] = useState('');
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const submitLockRef = useRef(false);
  const resolvedPromptKeysRef = useRef<Set<string>>(new Set());

  const currentItem = useMemo(() => items[0] || null, [items]);

  const loadPending = useCallback(async (options?: { manual?: boolean }) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/uren/pending${options?.manual ? '?debug=1' : ''}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        items?: PendingHourPrompt[];
        message?: string;
        debug?: {
          uid?: string;
          envUserMatches?: boolean;
          gpsItems?: number;
          planningItems?: number;
          totalItems?: number;
        };
      } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
        throw new Error(payload?.message || 'Kon openstaande uren niet laden.');
      }
      const filteredItems = payload.items.filter((item) => !isResolvedByLocalState(item, resolvedPromptKeysRef.current));
      setItems(filteredItems);
      if (options?.manual && filteredItems.length === 0) {
        setManualOpen(false);
        toast({
          title: 'Geen openstaande uren',
          description: payload.debug
            ? `Debug: gps=${payload.debug.gpsItems ?? 0}, planning=${payload.debug.planningItems ?? 0}, uidMatch=${payload.debug.envUserMatches ? 'ja' : 'nee'}`
            : 'Er zijn nu geen prompts om te tonen.',
        });
      }
      return filteredItems;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Urenprompt laden mislukt',
        description: message,
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (isUserLoading || !user || dismissedForSession) return;
    if (!pathname || pathname.startsWith('/login')) return;
    if (!canAutoOpenForPath(pathname)) return;
    void loadPending();
  }, [dismissedForSession, isUserLoading, loadPending, pathname, user]);

  useEffect(() => {
    const onManualOpen = () => {
      if (!user || isUserLoading) return;
      setDismissedForSession(false);
      setManualOpen(true);
      resolvedPromptKeysRef.current.clear();
      void loadPending({ manual: true });
    };

    window.addEventListener('pending-hours:open', onManualOpen);
    return () => window.removeEventListener('pending-hours:open', onManualOpen);
  }, [isUserLoading, loadPending, user]);

  useEffect(() => {
    if (user) return;
    resolvedPromptKeysRef.current.clear();
    submitLockRef.current = false;
  }, [user]);

  useEffect(() => {
    if (!currentItem) return;
    setWorkedHours(String(currentItem.suggestedHours));
    setWorkedDays(String(getDefaultWorkedDays(currentItem)));
    setQuotedHours('');
    setNote('');
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
    if (!currentItem || submitLockRef.current) return;
    submitLockRef.current = true;
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
            snoozeUntil: action === 'later' ? getDefaultSnoozeUntil(8) : null,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || 'Kon actie niet opslaan.');
        }
      });
      resolvedPromptKeysRef.current.add(currentItem.promptKey);
      getDayPromptKeys(currentItem).forEach((key) => resolvedPromptKeysRef.current.add(key));
      removeCurrentItem();
      await loadPending();
      if (action === 'later') {
        toast({
          title: 'Later herinneren ingeschakeld',
          description: 'Deze urenprompt verschijnt later opnieuw.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const saveEntry = async () => {
    if (!currentItem || submitLockRef.current) return;
    const parsedWorked = parseDecimalInput(workedHours);
    const parsedWorkedDays = parseDecimalInput(workedDays);
    const parsedQuoted = quotedHours.trim() ? parseDecimalInput(quotedHours) : null;
    const trimmedNote = note.trim();
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

    const isGpsPrompt = currentItem.promptSource === 'gps_tracking';
    const isConfirmFlow = (
      parsedQuoted === null
      && !trimmedNote
      && nearlyEqual(parsedWorked, currentItem.suggestedHours)
      && nearlyEqual(parsedWorkedDays, getDefaultWorkedDays(currentItem))
    );
    const source = isGpsPrompt
      ? (isConfirmFlow ? 'gps_tracking_confirm' : 'gps_tracking_adjust')
      : (isConfirmFlow ? 'login_prompt_confirm' : 'login_prompt_adjust');

    submitLockRef.current = true;
    const pendingDates = (currentItem.pendingDates || []).length > 0
      ? (currentItem.pendingDates || [])
      : [{ workDate: currentItem.workDate, suggestedHours: currentItem.suggestedHours }];
    const workedDistribution = distributeBySuggestedHours(parsedWorked, pendingDates.map((segment) => ({ suggestedHours: segment.suggestedHours })));
    const workedDaysDistribution = distributeEvenly(parsedWorkedDays, pendingDates.length);
    const quotedDistribution = parsedQuoted === null
      ? null
      : distributeBySuggestedHours(parsedQuoted, pendingDates.map((segment) => ({ suggestedHours: segment.suggestedHours })));
    const invalidWorkedDayIndex = workedDistribution.findIndex((value) => !Number.isFinite(value) || value <= 0 || value > 24);
    if (invalidWorkedDayIndex >= 0) {
      const failingDate = pendingDates[invalidWorkedDayIndex]?.workDate || 'onbekende dag';
      toast({
        title: 'Werkelijke uren zijn ongeldig',
        description: `Voor ${failingDate} moet het aantal uren tussen 0 en 24 liggen.`,
        variant: 'destructive',
      });
      submitLockRef.current = false;
      return;
    }
    if (quotedDistribution) {
      const invalidQuotedDayIndex = quotedDistribution.findIndex((value) => !Number.isFinite(value) || value < 0 || value > 24);
      if (invalidQuotedDayIndex >= 0) {
        const failingDate = pendingDates[invalidQuotedDayIndex]?.workDate || 'onbekende dag';
        toast({
          title: 'Geoffreerde uren zijn ongeldig',
          description: `Voor ${failingDate} moet geoffreerd tussen 0 en 24 uur liggen.`,
          variant: 'destructive',
        });
        submitLockRef.current = false;
        return;
      }
    }

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
              note: trimmedNote || null,
              source,
              startTime: currentItem.startTime || null,
              endTime: currentItem.endTime || null,
              exactMinutes: Math.max(0, Math.round(workedDistribution[index] * 60)),
              roundingRule: isGpsPrompt ? 'GPS-tracking voorstel' : null,
              promptKey: segment.dayPromptKey || currentItem.promptKey,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.message || 'Kon uren niet opslaan.');
          }
        }
      });

      resolvedPromptKeysRef.current.add(currentItem.promptKey);
      pendingDates
        .map((segment) => String(segment.dayPromptKey || '').trim() || currentItem.promptKey)
        .filter(Boolean)
        .forEach((key) => resolvedPromptKeysRef.current.add(key));
      removeCurrentItem();
      await loadPending();
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
      submitLockRef.current = false;
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
  const planningTypeLabel = currentItem.promptSource === 'gps_tracking'
    ? 'GPS-tracking'
    : currentItem.planningType === 'werkbespreking'
    ? 'Werkbespreking'
    : currentItem.planningType === 'mixed'
      ? 'Gemengd (klus + werkbespreking)'
      : 'Klus';
  const timeWindowText = currentItem.startTime && currentItem.endTime
    ? `${currentItem.startTime} - ${currentItem.endTime}`
    : null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          if (currentItem) {
            void submitPromptAction('later');
            return;
          }
          closeForSession();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Openstaande uren</DialogTitle>
          <DialogDescription>
            Je hebt openstaande uren op <strong>{currentItem.quoteLabel}</strong> van {rangeText}. Controleer de voorgestelde {formatHours(currentItem.suggestedHours)} en pas direct aan waar nodig.
            {currentItem.promptSource === 'gps_tracking' ? ' Dit voorstel komt uit Traccar GPS-data.' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground space-y-1">
          <div><strong className="text-foreground">Quote ID:</strong> {currentItem.quoteId}</div>
          <div><strong className="text-foreground">Offerte nr:</strong> {currentItem.quoteNumber || 'onbekend'}</div>
          <div><strong className="text-foreground">Klant:</strong> {currentItem.clientName || 'onbekend'}</div>
          <div><strong className="text-foreground">Project:</strong> {currentItem.projectTitle || 'onbekend'}</div>
          <div><strong className="text-foreground">Type:</strong> {planningTypeLabel}</div>
          {timeWindowText ? <div><strong className="text-foreground">GPS-tijd:</strong> {timeWindowText}</div> : null}
          {typeof currentItem.matchedDistanceM === 'number' ? (
            <div><strong className="text-foreground">Afstand tot project:</strong> {Math.round(currentItem.matchedDistanceM)} meter</div>
          ) : null}
          {typeof currentItem.gpsPointCount === 'number' ? (
            <div><strong className="text-foreground">GPS-punten:</strong> {currentItem.gpsPointCount}</div>
          ) : null}
          <div><strong className="text-foreground">Open dagen:</strong> {currentItem.pendingDaysCount || (currentItem.pendingDates || []).length || 1}</div>
          <div><strong className="text-foreground">Prompt key:</strong> {currentItem.promptKey}</div>
          <div>
            <strong className="text-foreground">Planning refs:</strong>{' '}
            {sourceRefPreview || 'geen'}
            {sourceRefRestCount > 0 ? ` (+${sourceRefRestCount})` : ''}
          </div>
        </div>

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
            <Button onClick={() => void saveEntry()} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Opslaan'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
