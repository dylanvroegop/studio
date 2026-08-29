'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  normalizeProjectCostCategory,
  roundEuro,
  type ProjectCostCategory,
  type ProjectCostLineItem,
  type ProjectCostReceiptFile,
} from '@/lib/project-costs';
import { invoiceImpliesAccepted } from '@/lib/quote-status';
import type { InvoiceStatus } from '@/lib/types';

type PendingCostImport = {
  id: string;
  supplier_name?: string;
  description?: string;
  line_items?: ProjectCostLineItem[];
  amount_excl_btw?: number;
  btw_percentage?: number;
  manual_amount_override?: boolean;
  date?: string;
  offerte_id?: string | null;
  suggested_category?: ProjectCostCategory;
  receipt_url?: string;
  receipt_files?: ProjectCostReceiptFile[];
};

type PendingCostForm = {
  category: ProjectCostCategory;
  supplierName: string;
  description: string;
  offerteId: string;
  date: string;
  btwPercentage: number;
  amountExcl: number;
  manualOverride: boolean;
  receiptUrl: string;
  receiptFiles: ProjectCostReceiptFile[];
};

type QuoteOption = {
  id: string;
  label: string;
};

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getQuoteAmount(raw: Record<string, unknown>): number | null {
  const totals = raw.totals && typeof raw.totals === 'object'
    ? raw.totals as Record<string, unknown>
    : {};
  const candidates = [raw.totaalbedrag, raw.amount, raw.totaalInclBtw, totals.totaalInclBtw];
  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100;
  }
  return null;
}

function normalizeLineItem(item: ProjectCostLineItem): ProjectCostLineItem {
  const quantity = safeNumber(item.quantity);
  const unitPrice = roundEuro(safeNumber(item.unit_price));
  const explicitTotal = roundEuro(safeNumber(item.total_price));
  const explicitTotalIncl = roundEuro(safeNumber(item.total_incl_btw));
  return {
    description: safeString(item.description),
    quantity,
    unit: safeString(item.unit) || 'st',
    unit_price: unitPrice,
    total_price: explicitTotal !== 0 ? explicitTotal : roundEuro(quantity * unitPrice),
    ...(explicitTotalIncl !== 0 ? { total_incl_btw: explicitTotalIncl } : {}),
    ...(item.btw_percentage !== undefined
      ? { btw_percentage: roundEuro(safeNumber(item.btw_percentage)) }
      : {}),
    category: normalizeProjectCostCategory(item.category || 'materiaal'),
    offerte_id: safeString(item.offerte_id) || null,
  };
}

function hasLineItemContent(item: ProjectCostLineItem): boolean {
  const normalized = normalizeLineItem(item);
  return Boolean(
    normalized.description
    || normalized.quantity !== 1
    || normalized.unit !== 'st'
    || normalized.unit_price !== 0
    || normalized.total_price !== 0
    || normalized.total_incl_btw !== undefined
  );
}

function createForm(pending: PendingCostImport): PendingCostForm {
  return {
    category: normalizeProjectCostCategory(pending.suggested_category || 'materiaal'),
    supplierName: safeString(pending.supplier_name),
    description: safeString(pending.description),
    offerteId: safeString(pending.offerte_id),
    date: safeString(pending.date) || new Date().toISOString().slice(0, 10),
    btwPercentage: safeNumber(pending.btw_percentage) || 21,
    amountExcl: roundEuro(safeNumber(pending.amount_excl_btw)),
    manualOverride: pending.manual_amount_override === true,
    receiptUrl: safeString(pending.receipt_url),
    receiptFiles: Array.isArray(pending.receipt_files) ? pending.receipt_files : [],
  };
}

function createManualForm(offerteId = ''): PendingCostForm {
  return {
    category: 'materiaal',
    supplierName: '',
    description: '',
    offerteId,
    date: new Date().toISOString().slice(0, 10),
    btwPercentage: 21,
    amountExcl: 0,
    manualOverride: false,
    receiptUrl: '',
    receiptFiles: [],
  };
}

function getQuoteLabel(raw: Record<string, unknown>): string {
  const klantInfo = (raw.klantinformatie || {}) as Record<string, unknown>;
  const company = safeString(klantInfo.bedrijfsnaam);
  const name = `${safeString(klantInfo.voornaam)} ${safeString(klantInfo.achternaam)}`.trim();
  const client = company || name || safeString(raw.klantNaam) || 'Onbekende klant';
  const title = safeString(raw.titel) || safeString(raw.title) || safeString(raw.werkomschrijving) || 'Project';
  const number = safeNumber(raw.offerteNummer);
  const amount = getQuoteAmount(raw);
  const amountLabel = amount !== null ? formatCurrency(amount) : 'Bedrag onbekend';
  return number
    ? `#${number} • ${amountLabel} • ${client} • ${title}`
    : `${amountLabel} • ${client} • ${title}`;
}

export function PendingCostImportPrompt() {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [pending, setPending] = useState<PendingCostImport | null>(null);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PendingCostForm | null>(null);
  const [lineItems, setLineItems] = useState<ProjectCostLineItem[]>([]);

  useEffect(() => {
    if (isUserLoading || !user || pathname === '/kosten') return;
    let cancelled = false;

    const loadPending = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/kosten/pending', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          data?: Array<PendingCostImport & { id?: unknown }>;
        } | null;
        const next = payload?.ok && Array.isArray(payload.data) ? payload.data[0] : null;
        if (!cancelled && next && safeString(next.id)) {
          const normalizedPending = { ...next, id: safeString(next.id) };
          const normalizedLineItems = Array.isArray(next.line_items)
            ? next.line_items.map(normalizeLineItem).filter(hasLineItemContent)
            : [];
          const nextForm = createForm(normalizedPending);
          if (normalizedLineItems.length === 0 && nextForm.amountExcl !== 0) {
            nextForm.manualOverride = true;
          }
          setPending(normalizedPending);
          setForm(nextForm);
          setLineItems(normalizedLineItems);
          setOpen(true);
        }
      } catch (error) {
        console.error('[PendingCostImportPrompt]', error);
      }
    };

    void loadPending();
    return () => {
      cancelled = true;
    };
  }, [isUserLoading, pathname, user]);

  useEffect(() => {
    if (!user || !firestore || pathname === '/kosten') return;
    let cancelled = false;

    const loadQuotes = async () => {
      try {
        const [snapshot, invoicesSnapshot] = await Promise.all([
          getDocs(query(collection(firestore, 'quotes'), where('userId', '==', user.uid))),
          getDocs(query(collection(firestore, 'invoices'), where('userId', '==', user.uid))),
        ]);
        if (cancelled) return;

        const acceptedQuoteIdsFromInvoices = new Set<string>();
        invoicesSnapshot.docs.forEach((invoiceSnap) => {
          const invoice = invoiceSnap.data() as {
            quoteId?: unknown;
            status?: InvoiceStatus | string;
            archived?: boolean;
          };
          const quoteId = safeString(invoice.quoteId);
          if (!quoteId || invoice.archived || !invoiceImpliesAccepted(invoice.status)) return;
          acceptedQuoteIdsFromInvoices.add(quoteId);
        });

        const nextQuotes = snapshot.docs
          .map((docSnap) => {
            const raw = docSnap.data() as Record<string, unknown>;
            if (raw.archived === true || raw.isCalculationTest === true) return null;
            if (raw.status !== 'geaccepteerd' && !acceptedQuoteIdsFromInvoices.has(docSnap.id)) return null;
            return { id: docSnap.id, label: getQuoteLabel(raw) };
          })
          .filter((quote): quote is QuoteOption => quote !== null)
          .sort((left, right) => left.label.localeCompare(right.label, 'nl'));
        setQuotes(nextQuotes);
      } catch (error) {
        console.error('[PendingCostImportPrompt] offertes laden mislukt', error);
      }
    };

    void loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [firestore, pathname, user]);

  useEffect(() => {
    const handleOpenCostDialog = (event: Event) => {
      const detail = (event as CustomEvent<{ offerteId?: unknown }>).detail;
      setPending(null);
      setForm(createManualForm(safeString(detail?.offerteId)));
      setLineItems([]);
      setOpen(true);
    };

    window.addEventListener('calvora:open-cost-dialog', handleOpenCostDialog);
    return () => window.removeEventListener('calvora:open-cost-dialog', handleOpenCostDialog);
  }, []);

  const normalizedLineItems = useMemo(
    () => lineItems.map(normalizeLineItem),
    [lineItems]
  );
  const lineItemsTotal = useMemo(
    () => roundEuro(normalizedLineItems.reduce((sum, item) => sum + item.total_price, 0)),
    [normalizedLineItems]
  );
  const amountExcl = form?.manualOverride ? roundEuro(form.amountExcl) : lineItemsTotal;
  const amountIncl = roundEuro(amountExcl * (1 + (form?.btwPercentage || 0) / 100));
  const btwAmount = roundEuro(amountIncl - amountExcl);

  const updateLineItem = (index: number, patch: Partial<ProjectCostLineItem>) => {
    setLineItems((previous) => previous.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      const next = { ...item, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'quantity')
        || Object.prototype.hasOwnProperty.call(patch, 'unit_price')) {
        next.total_price = roundEuro(safeNumber(next.quantity) * safeNumber(next.unit_price));
      }
      return next;
    }));
  };

  const addLineItem = () => {
    setLineItems((previous) => [
      ...previous,
      {
        description: '',
        quantity: 1,
        unit: 'st',
        unit_price: 0,
        total_price: 0,
        category: form?.category || 'materiaal',
        offerte_id: form?.offerteId || null,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  };

  const dismissPending = async () => {
    if (!pending || !user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/kosten/pending', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: pending.id }),
      });
    } catch (error) {
      console.error('[PendingCostImportPrompt] pending kost sluiten mislukt', error);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    setOpen(false);
    void dismissPending();
    setPending(null);
  };

  const handleSave = async () => {
    if (!user || !form) return;
    if (!form.supplierName.trim()) {
      toast({
        title: 'Leverancier ontbreekt',
        description: 'Vul een leverancier in voordat je opslaat.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const normalizedReceiptUrl = safeString(form.receiptUrl) || null;
      const response = await fetch('/api/kosten/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(pending ? { pending_import_id: pending.id } : {}),
          offerte_id: form.offerteId || null,
          category: form.category,
          supplier_name: form.supplierName,
          description: form.description || form.supplierName,
          line_items: normalizedLineItems,
          amount_excl_btw: amountExcl,
          amount_incl_btw: amountIncl,
          btw_amount: btwAmount,
          manual_amount_override: form.manualOverride,
          btw_percentage: form.btwPercentage,
          date: form.date,
          receipt_url: normalizedReceiptUrl,
          receipt_files: form.receiptFiles,
          status: 'confirmed',
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || `HTTP ${response.status}`);

      setOpen(false);
      setPending(null);
      toast({
        title: 'Kost opgeslagen',
        description: `${form.supplierName} is toegevoegd.`,
      });
    } catch (error) {
      toast({
        title: 'Opslaan mislukt',
        description: error instanceof Error ? error.message : 'Kon kost niet opslaan.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Nieuwe kost</DialogTitle>
            <DialogDescription>
              Controleer de herkende gegevens en sla de kost op. Je blijft op de huidige pagina.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <Card className="border-border/70 bg-card/55">
              <CardContent className="space-y-5 pt-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Categorie</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) => setForm((previous) => previous ? {
                        ...previous,
                        category: normalizeProjectCostCategory(value),
                      } : previous)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="materiaal">Materiaal</SelectItem>
                        <SelectItem value="autokosten">Autokosten</SelectItem>
                        <SelectItem value="boetes">Boetes</SelectItem>
                        <SelectItem value="schulden">Schulden</SelectItem>
                        <SelectItem value="afval">Afval</SelectItem>
                        <SelectItem value="brandstof">Benzine</SelectItem>
                        <SelectItem value="gereedschap">Gereedschap</SelectItem>
                        <SelectItem value="eigen_verbruik">Eigen verbruik</SelectItem>
                        <SelectItem value="hotel">Hotel</SelectItem>
                        <SelectItem value="telefoon">Telefoon</SelectItem>
                        <SelectItem value="leadkosten">Leadkosten</SelectItem>
                        <SelectItem value="overig">Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Datum</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm((previous) => previous ? { ...previous, date: event.target.value } : previous)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Leverancier</Label>
                  <Input
                    value={form.supplierName}
                    onChange={(event) => setForm((previous) => previous ? { ...previous, supplierName: event.target.value } : previous)}
                    placeholder="Bijv. PontMeyer, Shell, Toolstation..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Omschrijving</Label>
                  <Input
                    value={form.description}
                    onChange={(event) => setForm((previous) => previous ? { ...previous, description: event.target.value } : previous)}
                    placeholder="Korte toelichting op deze kost..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Koppel aan offerte</Label>
                  <Select
                    value={form.offerteId || 'none'}
                    onValueChange={(value) => setForm((previous) => previous ? {
                      ...previous,
                      offerteId: value === 'none' ? '' : value,
                    } : previous)}
                  >
                    <SelectTrigger><SelectValue placeholder="Niet gekoppeld" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Niet gekoppeld</SelectItem>
                      {quotes.map((quote) => <SelectItem key={quote.id} value={quote.id}>{quote.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Regels</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="h-4 w-4" /> Regel toevoegen
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {normalizedLineItems.map((item, index) => (
                      <div key={`pending-line-${index}`} className="space-y-3 rounded-lg border border-border/70 bg-background/40 p-3">
                        <Input
                          value={item.description}
                          onChange={(event) => updateLineItem(index, { description: event.target.value })}
                          placeholder="Omschrijving"
                        />
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Aantal</p>
                            <Input type="number" step="0.01" value={item.quantity} onChange={(event) => updateLineItem(index, { quantity: safeNumber(event.target.value) })} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Eenheid</p>
                            <Input value={item.unit} onChange={(event) => updateLineItem(index, { unit: event.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Prijs/stuk (excl.)</p>
                            <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateLineItem(index, { unit_price: safeNumber(event.target.value) })} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Actie</p>
                            <Button type="button" variant="outline" className="h-10 w-full" onClick={() => removeLineItem(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>BTW %</Label>
                    <Input type="number" min="0" step="0.1" value={form.btwPercentage} onChange={(event) => setForm((previous) => previous ? { ...previous, btwPercentage: safeNumber(event.target.value) } : previous)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ontvangen bon (URL)</Label>
                    <Input value={form.receiptUrl} onChange={(event) => setForm((previous) => previous ? { ...previous, receiptUrl: event.target.value } : previous)} placeholder="https://..." />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.manualOverride}
                    onChange={(event) => setForm((previous) => previous ? { ...previous, manualOverride: event.target.checked } : previous)}
                  />
                  Bedrag excl. BTW handmatig overschrijven
                </label>
                {form.manualOverride ? (
                  <div className="space-y-2">
                    <Label>Bedrag excl. BTW</Label>
                    <Input type="number" min="0" step="0.01" value={form.amountExcl} onChange={(event) => setForm((previous) => previous ? { ...previous, amountExcl: safeNumber(event.target.value) } : previous)} />
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 bg-background/40 p-4 md:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Excl. BTW</p><p className="mt-1 text-sm font-semibold">€ {amountExcl.toFixed(2).replace('.', ',')}</p></div>
                  <div><p className="text-xs text-muted-foreground">BTW</p><p className="mt-1 text-sm font-semibold">€ {btwAmount.toFixed(2).replace('.', ',')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Incl. BTW</p><p className="mt-1 text-sm font-semibold text-emerald-300">€ {amountIncl.toFixed(2).replace('.', ',')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Regels</p><p className="mt-1 text-sm font-semibold">{normalizedLineItems.length}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Annuleren</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>Opslaan</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
