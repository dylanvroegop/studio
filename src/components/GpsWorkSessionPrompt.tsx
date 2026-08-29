'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Loader2, MapPin, Navigation, ShoppingCart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

interface CandidateQuote {
  id: string;
  quoteNumber: string;
  clientName: string;
  projectTitle: string;
  quoteAmount?: number;
  quoteDate?: string;
  status?: string;
}

interface SupplierVisit {
  name?: string;
  address?: string;
  minutes?: number;
}

interface PendingSession {
  id: string;
  work_date: string;
  address_label: string;
  candidate_quotes: CandidateQuote[];
  start_at: string;
  end_at: string;
  onsite_minutes: number;
  outbound_travel_minutes: number;
  return_travel_minutes: number;
  supplier_travel_minutes: number;
  supplier_stop_minutes: number;
  supplier_visits: SupplierVisit[];
}

function duration(minutes: number): string {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return hours > 0 ? `${hours}u ${remainder}m` : `${remainder}m`;
}

function time(value: string): string {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function date(value: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function shortDate(value?: string): string {
  if (!value) return 'Datum onbekend';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function statusLabel(value?: string): string {
  const status = String(value || '').toLowerCase();
  if (status === 'geaccepteerd' || status === 'accepted') return 'Geaccepteerd';
  if (status === 'verzonden' || status === 'sent') return 'Verzonden';
  if (status === 'concept') return 'Concept';
  return value || 'Status onbekend';
}

function currency(value?: number): string {
  if (!Number.isFinite(value) || Number(value) <= 0) return 'Bedrag onbekend';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(value));
}

function BreakdownRow({ icon, label, value, checked, onCheckedChange, optional = false }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  optional?: boolean;
}) {
  if (value <= 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
      <div className="text-emerald-300">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {optional ? <div className="text-xs text-muted-foreground">Meetellen als gewerkte tijd</div> : null}
      </div>
      <div className="font-semibold tabular-nums">{duration(value)}</div>
      {optional ? (
        <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange?.(value === true)} aria-label={`${label} meetellen`} />
      ) : null}
    </div>
  );
}

export function GpsWorkSessionPrompt() {
  const { user } = useUser();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closedForSession, setClosedForSession] = useState(false);
  const [quoteId, setQuoteId] = useState('');
  const [includeOutbound, setIncludeOutbound] = useState(true);
  const [includeReturn, setIncludeReturn] = useState(true);
  const [includeSupplier, setIncludeSupplier] = useState(true);
  const current = items[0] || null;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    void user.getIdToken().then(async (token) => {
      const response = await fetch('/api/tracking/work-sessions', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: PendingSession[]; autoConfirmed?: number; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'GPS-werkdagen konden niet worden geladen.');
      if (!cancelled) {
        setItems(Array.isArray(payload.data) ? payload.data : []);
        if (Number(payload.autoConfirmed || 0) > 0) window.dispatchEvent(new Event('gps-work-hours:updated'));
      }
    }).catch((error) => {
      if (!cancelled) console.warn('[gps-work-session]', error);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const candidates = current?.candidate_quotes || [];
    setQuoteId(candidates.length === 1 ? candidates[0].id : '');
    setIncludeOutbound(true);
    setIncludeReturn(true);
    setIncludeSupplier(true);
  }, [current]);

  const total = useMemo(() => {
    if (!current) return 0;
    return Number(current.onsite_minutes || 0)
      + (includeOutbound ? Number(current.outbound_travel_minutes || 0) : 0)
      + (includeReturn ? Number(current.return_travel_minutes || 0) : 0)
      + (includeSupplier ? Number(current.supplier_travel_minutes || 0) + Number(current.supplier_stop_minutes || 0) : 0);
  }, [current, includeOutbound, includeReturn, includeSupplier]);

  const submit = async (action: 'confirm' | 'dismiss') => {
    if (!user || !current || submitting) return;
    if (action === 'confirm' && !quoteId) {
      toast({ title: 'Kies eerst de juiste offerte', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/tracking/work-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: current.id, action, quoteId, includeOutbound, includeReturn, includeSupplier }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Opslaan mislukt.');
      setItems((previous) => previous.slice(1));
      if (action === 'confirm') {
        window.dispatchEvent(new Event('gps-work-hours:updated'));
        toast({ title: 'Werkdag gekoppeld', description: `${duration(total)} is aan de gekozen offerte toegevoegd.` });
      }
    } catch (error) {
      toast({ title: 'GPS-werkdag opslaan mislukt', description: error instanceof Error ? error.message : 'Onbekende fout', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || loading || !current || closedForSession) return null;
  const supplierNames = Array.from(new Set((current.supplier_visits || []).map((visit) => visit.name).filter(Boolean)));
  const candidates = current.candidate_quotes || [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setClosedForSession(true); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>GPS-werkdag controleren</DialogTitle>
          <DialogDescription>
            {date(current.work_date)} · {time(current.start_at)}–{time(current.end_at)} · {current.address_label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Aan welke offerte hoort deze werkdag?</Label>
            <div className="space-y-2" role="radiogroup" aria-label="Kies de juiste offerte">
              {candidates.map((quote) => {
                const selected = quoteId === quote.id;
                return (
                  <button
                    key={quote.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-emerald-400/70 bg-emerald-500/15' : 'border-border/70 bg-background/40 hover:border-emerald-500/40 hover:bg-muted/40'}`}
                    onClick={() => setQuoteId(quote.id)}
                  >
                    <div className={`mt-0.5 rounded-lg p-2 ${selected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-muted/60 text-muted-foreground'}`}>
                      {selected ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium text-muted-foreground">Offerte #{quote.quoteNumber || 'onbekend'}</span>
                          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">{statusLabel(quote.status)}</span>
                        </div>
                        <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-300">{currency(quote.quoteAmount)}</span>
                      </div>
                      <div className="mt-0.5 font-medium text-foreground">{quote.clientName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{quote.projectTitle || 'Geen klustitel'} · gemaakt {shortDate(quote.quoteDate)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {candidates.length > 1 ? <p className="text-xs text-amber-300">Er staan meerdere offertes op dit adres. Calvora kiest daarom niet automatisch.</p> : null}
          </div>

          <div className="space-y-2">
            <BreakdownRow icon={<MapPin className="h-4 w-4" />} label="Op locatie" value={current.onsite_minutes} />
            <BreakdownRow icon={<Navigation className="h-4 w-4" />} label="Heenreis" value={current.outbound_travel_minutes} checked={includeOutbound} onCheckedChange={setIncludeOutbound} optional />
            <BreakdownRow icon={<ShoppingCart className="h-4 w-4" />} label="Materiaalrit en leverancier" value={Number(current.supplier_travel_minutes || 0) + Number(current.supplier_stop_minutes || 0)} checked={includeSupplier} onCheckedChange={setIncludeSupplier} optional />
            <BreakdownRow icon={<Navigation className="h-4 w-4 rotate-180" />} label="Terugreis" value={current.return_travel_minutes} checked={includeReturn} onCheckedChange={setIncludeReturn} optional />
          </div>

          {supplierNames.length > 0 ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm">
              <div className="font-medium text-amber-200">Leverancier herkend</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {supplierNames.join(', ')} · rijden {duration(current.supplier_travel_minutes)} · binnen {duration(current.supplier_stop_minutes)}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center gap-2 font-medium text-emerald-100"><Clock3 className="h-4 w-4" />Totaal voor deze klus</div>
            <div className="text-lg font-bold tabular-nums text-emerald-300">{duration(total)}</div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" disabled={submitting} onClick={() => void submit('dismiss')}>Niet gewerkt</Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => setClosedForSession(true)}>Later</Button>
            <Button disabled={submitting || !quoteId} onClick={() => void submit('confirm')}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Uren koppelen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
