'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Link2,
  Loader2,
  Plus,
  Receipt,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Timestamp,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  PROJECT_COST_CATEGORY_LABELS,
  normalizeProjectCostCategory,
  roundEuro,
  type ProjectCostCategory,
  type ProjectCostLineItem,
  type ProjectCostRow,
} from '@/lib/project-costs';
import { cn } from '@/lib/utils';

type CostFilterMode = 'alle' | ProjectCostCategory;
type EntryMode = 'manual' | 'upload';

type QuoteOption = {
  id: string;
  offerteNummer: number | null;
  clientName: string;
  title: string;
  label: string;
  searchable: string;
};

type KostenFormState = {
  category: ProjectCostCategory;
  supplierName: string;
  description: string;
  offerteId: string;
  date: string;
  btwPercentage: number;
  amountExcl: number;
  manualOverride: boolean;
  receiptUrl: string;
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
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateLabel(value: string): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Onbekende datum';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  return null;
}

function getClientName(rawQuote: Record<string, unknown>): string {
  const klantInfo = (rawQuote.klantinformatie || {}) as Record<string, unknown>;
  const companyName = safeString(klantInfo.bedrijfsnaam);
  if (companyName) return companyName;
  const firstName = safeString(klantInfo.voornaam);
  const lastName = safeString(klantInfo.achternaam);
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Onbekende klant';
}

function getQuoteTitle(rawQuote: Record<string, unknown>): string {
  return (
    safeString(rawQuote.titel)
    || safeString(rawQuote.title)
    || safeString(rawQuote.werkomschrijving)
    || 'Project'
  );
}

function createDefaultFormState(): KostenFormState {
  return {
    category: 'materiaal',
    supplierName: '',
    description: '',
    offerteId: '',
    date: new Date().toISOString().slice(0, 10),
    btwPercentage: 21,
    amountExcl: 0,
    manualOverride: false,
    receiptUrl: '',
  };
}

function createEmptyLineItem(): ProjectCostLineItem {
  return {
    description: '',
    quantity: 1,
    unit: 'st',
    unit_price: 0,
    total_price: 0,
  };
}

function normalizeLineItem(item: ProjectCostLineItem): ProjectCostLineItem {
  const quantity = Math.max(0, safeNumber(item.quantity));
  const unitPrice = Math.max(0, safeNumber(item.unit_price));
  return {
    description: safeString(item.description),
    quantity,
    unit: safeString(item.unit) || 'st',
    unit_price: roundEuro(unitPrice),
    total_price: roundEuro(quantity * unitPrice),
  };
}

function categoryBadgeClass(category: ProjectCostCategory): string {
  if (category === 'materiaal') return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200';
  if (category === 'brandstof') return 'border-amber-500/30 bg-amber-500/15 text-amber-200';
  if (category === 'gereedschap') return 'border-blue-500/30 bg-blue-500/15 text-blue-200';
  return 'border-zinc-500/30 bg-zinc-500/15 text-zinc-200';
}

function parseOfferteReferenceToQuoteId(reference: string | null, quotes: QuoteOption[]): string {
  if (!reference) return '';
  const normalized = safeString(reference).toLowerCase();
  if (!normalized) return '';

  const exactById = quotes.find((quote) => quote.id.toLowerCase() === normalized);
  if (exactById) return exactById.id;

  const extractedNumber = normalized.match(/\d{2,}/)?.[0] || '';
  if (extractedNumber) {
    const number = Number(extractedNumber);
    if (Number.isFinite(number)) {
      const matchByNumber = quotes.find((quote) => quote.offerteNummer === number);
      if (matchByNumber) return matchByNumber.id;
    }
  }

  const fuzzy = quotes.find((quote) => quote.searchable.includes(normalized));
  return fuzzy?.id || '';
}

export default function KostenPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costs, setCosts] = useState<ProjectCostRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CostFilterMode>('alle');

  const [createOpen, setCreateOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('manual');
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quoteSearch, setQuoteSearch] = useState('');

  const [form, setForm] = useState<KostenFormState>(createDefaultFormState());
  const [lineItems, setLineItems] = useState<ProjectCostLineItem[]>([
    createEmptyLineItem(),
  ]);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const loadQuotes = useCallback(async (): Promise<QuoteOption[]> => {
    if (!user || !firestore) return [];
    const snapshot = await getDocs(
      query(collection(firestore, 'quotes'), where('userId', '==', user.uid))
    );

    const data = snapshot.docs
      .map((docSnap) => {
        const raw = docSnap.data() as Record<string, unknown>;
        const title = getQuoteTitle(raw);
        const clientName = getClientName(raw);
        const offerteNummer = Number.isFinite(Number(raw.offerteNummer))
          ? Number(raw.offerteNummer)
          : null;
        const label = offerteNummer
          ? `#${offerteNummer} • ${clientName} • ${title}`
          : `${clientName} • ${title}`;

        return {
          id: docSnap.id,
          offerteNummer,
          clientName,
          title,
          label,
          searchable: `${label} ${docSnap.id}`.toLowerCase(),
          updatedAtDate: toDate(raw.updatedAt) || toDate(raw.createdAt),
        };
      })
      .sort((a, b) => {
        const left = a.updatedAtDate?.getTime() || 0;
        const right = b.updatedAtDate?.getTime() || 0;
        return right - left;
      })
      .map((item) => ({
        id: item.id,
        offerteNummer: item.offerteNummer,
        clientName: item.clientName,
        title: item.title,
        label: item.label,
        searchable: item.searchable,
      }));

    return data;
  }, [firestore, user]);

  const loadCosts = useCallback(async (): Promise<ProjectCostRow[]> => {
    if (!user) return [];
    const token = await user.getIdToken();
    const response = await fetch('/api/kosten/list', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      data?: ProjectCostRow[];
    } | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }

    return payload.data
      .map((item) => ({
        ...item,
        category: normalizeProjectCostCategory(item.category),
      }))
      .sort((a, b) => {
        const left = new Date(a.date || a.created_at).getTime();
        const right = new Date(b.date || b.created_at).getTime();
          return right - left;
        });
  }, [user]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [quotesData, costsData] = await Promise.all([loadQuotes(), loadCosts()]);
        if (cancelled) return;
        setQuotes(quotesData);
        setCosts(costsData);
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : 'Kon kosten niet laden.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [loadCosts, loadQuotes, user, firestore]);

  const quoteById = useMemo(() => {
    return new Map(quotes.map((quote) => [quote.id, quote]));
  }, [quotes]);

  const filterOptions: Array<{ value: CostFilterMode; label: string }> = [
    { value: 'alle', label: 'Alle' },
    { value: 'materiaal', label: 'Materiaal' },
    { value: 'brandstof', label: 'Brandstof' },
    { value: 'gereedschap', label: 'Gereedschap' },
    { value: 'overig', label: 'Overig' },
  ];

  const filteredCosts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return costs
      .filter((cost) => (filter === 'alle' ? true : cost.category === filter))
      .filter((cost) => {
        if (!term) return true;
        const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
        const offerteNummer = quote?.offerteNummer ? String(quote.offerteNummer) : '';
        const target = `${cost.supplier_name} ${cost.description} ${offerteNummer} ${quote?.label || ''}`.toLowerCase();
        return target.includes(term);
      })
      .sort((a, b) => {
        const left = new Date(a.date || a.created_at).getTime();
        const right = new Date(b.date || b.created_at).getTime();
        return right - left;
      });
  }, [costs, filter, quoteById, search]);

  const filteredQuotesForPicker = useMemo(() => {
    const term = quoteSearch.trim().toLowerCase();
    if (!term) return quotes.slice(0, 40);
    return quotes.filter((quote) => quote.searchable.includes(term)).slice(0, 40);
  }, [quoteSearch, quotes]);

  const normalizedLineItems = useMemo(
    () => lineItems.map((item) => normalizeLineItem(item)),
    [lineItems]
  );

  const lineItemsTotal = useMemo(
    () => roundEuro(normalizedLineItems.reduce((sum, item) => sum + item.total_price, 0)),
    [normalizedLineItems]
  );

  const amountExcl = form.manualOverride ? roundEuro(form.amountExcl) : lineItemsTotal;
  const btwAmount = roundEuro((amountExcl * form.btwPercentage) / 100);
  const amountIncl = roundEuro(amountExcl + btwAmount);

  const resetForm = () => {
    setForm(createDefaultFormState());
    setLineItems([createEmptyLineItem()]);
    setQuoteSearch('');
    setSelectedFile(null);
    setEntryMode('manual');
    setDragActive(false);
  };

  const updateLineItem = (
    index: number,
    patch: Partial<ProjectCostLineItem>
  ) => {
    setLineItems((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index
          ? {
            ...item,
            ...patch,
          }
          : item
      )
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, createEmptyLineItem()]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      return next.length > 0 ? next : [createEmptyLineItem()];
    });
  };

  const handleSave = async () => {
    if (!user) return;
    if (!safeString(form.supplierName)) {
      toast({
        title: 'Leverancier ontbreekt',
        description: 'Vul een leverancier in voordat je opslaat.',
        variant: 'destructive',
      });
      return;
    }

    const payloadLineItems = normalizedLineItems.filter(
      (item) => item.description || item.total_price > 0
    );

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          offerte_id: form.offerteId || null,
          category: form.category,
          supplier_name: form.supplierName,
          description: form.description || form.supplierName,
          line_items: payloadLineItems,
          amount_excl_btw: amountExcl,
          manual_amount_override: form.manualOverride,
          btw_percentage: form.btwPercentage,
          date: form.date,
          receipt_url: form.receiptUrl || null,
          status: 'confirmed',
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: ProjectCostRow;
      } | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      setCosts((prev) => {
        const next = [payload.data!, ...prev];
        return next.sort((a, b) => {
          const left = new Date(a.date || a.created_at).getTime();
          const right = new Date(b.date || b.created_at).getTime();
          return right - left;
        });
      });

      toast({
        title: 'Kost opgeslagen',
        description: `${safeString(form.supplierName)} is toegevoegd.`,
      });

      setCreateOpen(false);
      resetForm();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Kon kost niet opslaan.';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async () => {
    if (!user || !selectedFile) return;
    setExtracting(true);

    try {
      const token = await user.getIdToken();
      const body = new FormData();
      body.append('file', selectedFile);

      const response = await fetch('/api/kosten/extract', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: {
          supplier_name?: string;
          description?: string;
          line_items?: ProjectCostLineItem[];
          amount_excl_btw?: number;
          btw_percentage?: number;
          btw_amount?: number;
          amount_incl_btw?: number;
          date?: string;
          offerte_reference?: string | null;
          suggested_category?: ProjectCostCategory;
          receipt_url?: string;
        };
      } | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const extracted = payload.data;
      const extractedLineItems = Array.isArray(extracted.line_items) && extracted.line_items.length > 0
        ? extracted.line_items.map((item) => normalizeLineItem(item))
        : [createEmptyLineItem()];
      const matchedOfferteId = parseOfferteReferenceToQuoteId(
        extracted.offerte_reference || null,
        quotes
      );

      setLineItems(extractedLineItems);
      setForm((prev) => ({
        ...prev,
        category: normalizeProjectCostCategory(extracted.suggested_category || prev.category),
        supplierName: safeString(extracted.supplier_name) || prev.supplierName,
        description: safeString(extracted.description) || prev.description,
        offerteId: matchedOfferteId || prev.offerteId,
        date: safeString(extracted.date) || prev.date,
        btwPercentage: safeNumber(extracted.btw_percentage) || prev.btwPercentage,
        amountExcl: roundEuro(safeNumber(extracted.amount_excl_btw)),
        manualOverride: false,
        receiptUrl: safeString(extracted.receipt_url) || prev.receiptUrl,
      }));
      setEntryMode('manual');

      toast({
        title: 'Gegevens herkend',
        description: 'Controleer de gegevens en sla daarna op.',
      });
    } catch (extractError) {
      const message = extractError instanceof Error ? extractError.message : 'Kon bon niet uitlezen.';
      toast({
        title: 'Extractie mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  };

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Kosten" />

      <main className="flex flex-col items-center p-4 pb-24 md:px-6 md:pb-10 md:pt-6">
        <div className="w-full max-w-5xl space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-5">
              {error ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Zoek op leverancier, omschrijving of offertennummer..."
                    className="pl-9"
                  />
                </div>

                <Dialog
                  open={createOpen}
                  onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) resetForm();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button type="button" className="h-10 shrink-0 gap-2 px-4 hidden sm:inline-flex">
                      <Plus className="h-4 w-4" />
                      Nieuwe kost
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0">
                    <div className="flex max-h-[90vh] flex-col">
                      <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle>Nieuwe kost</DialogTitle>
                        <DialogDescription>
                          Voeg handmatig kosten toe of upload een bon/factuur om automatisch in te vullen.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex-1 overflow-y-auto px-6 pb-6">
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant={entryMode === 'manual' ? 'default' : 'outline'}
                              className="h-9 rounded-full px-4"
                              onClick={() => setEntryMode('manual')}
                            >
                              Handmatig
                            </Button>
                            <Button
                              type="button"
                              variant={entryMode === 'upload' ? 'default' : 'outline'}
                              className="h-9 rounded-full px-4"
                              onClick={() => setEntryMode('upload')}
                            >
                              Upload + AI
                            </Button>
                          </div>

                          {entryMode === 'upload' ? (
                            <Card className="border-border/70 bg-card/50">
                              <CardContent className="space-y-4 pt-5">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className={cn(
                                    'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                                    dragActive
                                      ? 'border-emerald-400 bg-emerald-500/10'
                                      : 'border-border/70 bg-background/40 hover:border-emerald-500/40 hover:bg-emerald-500/5'
                                  )}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragActive(true);
                                  }}
                                  onDragLeave={() => setDragActive(false)}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    setDragActive(false);
                                    const file = event.dataTransfer.files?.[0];
                                    if (file) setSelectedFile(file);
                                  }}
                                  onClick={() => fileInputRef.current?.click()}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      fileInputRef.current?.click();
                                    }
                                  }}
                                >
                                  <UploadCloud className="mx-auto h-8 w-8 text-emerald-400" />
                                  <p className="mt-3 text-sm font-medium">Sleep je bon/factuur hierheen</p>
                                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, WEBP</p>
                                </div>

                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  className="hidden"
                                  accept="application/pdf,image/*"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0] || null;
                                    setSelectedFile(file);
                                  }}
                                />

                                {selectedFile ? (
                                  <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                                    <div className="font-medium text-foreground">{selectedFile.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                  </div>
                                ) : null}

                                <Button
                                  type="button"
                                  className="h-10 gap-2"
                                  disabled={!selectedFile || extracting}
                                  onClick={() => void handleExtract()}
                                >
                                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                  {extracting ? 'Bezig met uitlezen...' : 'Upload en herken gegevens'}
                                </Button>
                              </CardContent>
                            </Card>
                          ) : null}

                          <Card className="border-border/70 bg-card/55">
                            <CardContent className="space-y-5 pt-5">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Categorie</Label>
                                  <Select
                                    value={form.category}
                                    onValueChange={(value) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        category: normalizeProjectCostCategory(value),
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Kies categorie" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="materiaal">Materiaal</SelectItem>
                                      <SelectItem value="brandstof">Brandstof</SelectItem>
                                      <SelectItem value="gereedschap">Gereedschap</SelectItem>
                                      <SelectItem value="overig">Overig</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Datum</Label>
                                  <Input
                                    type="date"
                                    value={form.date}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        date: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>Leverancier</Label>
                                <Input
                                  value={form.supplierName}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      supplierName: event.target.value,
                                    }))
                                  }
                                  placeholder="Bijv. PontMeyer, Shell, Toolstation..."
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Omschrijving</Label>
                                <Textarea
                                  value={form.description}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      description: event.target.value,
                                    }))
                                  }
                                  placeholder="Korte toelichting op deze kost..."
                                  className="min-h-[70px]"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Koppel aan offerte</Label>
                                <Input
                                  value={quoteSearch}
                                  onChange={(event) => setQuoteSearch(event.target.value)}
                                  placeholder="Zoek offerte op klant, titel of nummer..."
                                />
                                <Select
                                  value={form.offerteId || 'none'}
                                  onValueChange={(value) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      offerteId: value === 'none' ? '' : value,
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Niet gekoppeld" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Niet gekoppeld</SelectItem>
                                    {filteredQuotesForPicker.map((quote) => (
                                      <SelectItem key={quote.id} value={quote.id}>
                                        {quote.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label>Regels</Label>
                                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                                    <Plus className="h-4 w-4" />
                                    Regel toevoegen
                                  </Button>
                                </div>

                                <div className="space-y-3">
                                  {lineItems.map((item, index) => (
                                    <div
                                      key={`line-item-${index}`}
                                      className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-3"
                                    >
                                      <Input
                                        value={item.description}
                                        onChange={(event) =>
                                          updateLineItem(index, { description: event.target.value })
                                        }
                                        placeholder="Omschrijving"
                                      />

                                      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={item.quantity}
                                          onChange={(event) =>
                                            updateLineItem(index, {
                                              quantity: safeNumber(event.target.value),
                                            })
                                          }
                                          placeholder="Aantal"
                                        />
                                        <Input
                                          value={item.unit}
                                          onChange={(event) =>
                                            updateLineItem(index, { unit: event.target.value })
                                          }
                                          placeholder="Eenheid"
                                        />
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={item.unit_price}
                                          onChange={(event) =>
                                            updateLineItem(index, {
                                              unit_price: safeNumber(event.target.value),
                                            })
                                          }
                                          placeholder="Prijs/stuk"
                                        />
                                        <Input
                                          value={formatCurrency(normalizeLineItem(item).total_price)}
                                          disabled
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="h-10"
                                          onClick={() => removeLineItem(index)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>BTW %</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={form.btwPercentage}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        btwPercentage: safeNumber(event.target.value),
                                      }))
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Ontvangen bon (URL)</Label>
                                  <Input
                                    value={form.receiptUrl}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        receiptUrl: event.target.value,
                                      }))
                                    }
                                    placeholder="https://..."
                                  />
                                </div>
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.manualOverride}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setForm((prev) => ({
                                      ...prev,
                                      manualOverride: checked,
                                      amountExcl: checked ? lineItemsTotal : prev.amountExcl,
                                    }));
                                  }}
                                />
                                Bedrag excl. BTW handmatig overschrijven
                              </label>

                              <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 bg-background/40 p-4 md:grid-cols-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Excl. BTW</p>
                                  {form.manualOverride ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={form.amountExcl}
                                      onChange={(event) =>
                                        setForm((prev) => ({
                                          ...prev,
                                          amountExcl: safeNumber(event.target.value),
                                        }))
                                      }
                                    />
                                  ) : (
                                    <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(lineItemsTotal)}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">BTW</p>
                                  <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(btwAmount)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Incl. BTW</p>
                                  <p className="mt-1 text-sm font-semibold text-emerald-300">{formatCurrency(amountIncl)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Regels</p>
                                  <p className="mt-1 text-sm font-semibold text-foreground">{normalizedLineItems.length}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>

                      <DialogFooter className="border-t border-border/70 px-6 py-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setCreateOpen(false);
                            resetForm();
                          }}
                          disabled={saving}
                        >
                          Annuleren
                        </Button>
                        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {saving ? 'Opslaan...' : 'Opslaan'}
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {filterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={filter === option.value ? 'default' : 'ghost'}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      'h-9 rounded-full px-4 transition-all duration-200',
                      filter === option.value
                        ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                        : 'border border-border/70 bg-transparent text-muted-foreground hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-200'
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {filteredCosts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="font-semibold">Geen kosten gevonden</div>
                <div className="text-sm text-muted-foreground">
                  Voeg je eerste leverancierkost toe om winst per project te volgen.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200 dark:hover:text-emerald-100"
                  onClick={() => setCreateOpen(true)}
                >
                  Nieuwe kost
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredCosts.map((cost) => {
                const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
                const linkedLabel = quote
                  ? (quote.offerteNummer ? `Offerte #${quote.offerteNummer}` : quote.label)
                  : 'Niet gekoppeld';

                return (
                  <div
                    key={cost.id}
                    className="group rounded-xl border border-l-4 border-border/80 border-l-emerald-500/70 bg-card/75 px-4 py-3 shadow-sm transition-all duration-200 hover:bg-card hover:border-border hover:shadow-md sm:px-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-foreground sm:text-lg">
                          {cost.supplier_name || 'Onbekende leverancier'}
                        </div>
                        <div className="mt-0.5 truncate text-sm text-muted-foreground">
                          {cost.description || '—'}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline" className={categoryBadgeClass(cost.category)}>
                            {PROJECT_COST_CATEGORY_LABELS[cost.category]}
                          </Badge>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Link2 className="h-3.5 w-3.5" />
                            {linkedLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDateLabel(cost.date)}
                          </span>
                          {cost.receipt_url ? (
                            <a
                              href={cost.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              Bon
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Incl. BTW</div>
                        <div className="text-2xl font-bold tabular-nums text-emerald-300">
                          {formatCurrency(cost.amount_incl_btw || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Button
        type="button"
        className="fixed bottom-5 right-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg shadow-emerald-900/30 sm:hidden"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Nieuwe kost
      </Button>
    </div>
  );
}
