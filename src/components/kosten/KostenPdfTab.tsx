'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, Link2, Loader2, Receipt, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useUser } from '@/firebase';
import {
  PROJECT_COST_CATEGORY_LABELS,
  type ProjectCostReceiptFile,
  type ProjectCostRow,
} from '@/lib/project-costs';
import { cn } from '@/lib/utils';

type QuoteLookup = {
  offerteNummer: number | null;
  label: string;
  clientName?: string;
};

interface KostenPdfTabProps {
  costs: ProjectCostRow[];
  quoteById: Map<string, QuoteLookup>;
  onOpenCost: (cost: ProjectCostRow) => void;
}

interface PdfItem {
  costs: ProjectCostRow[];
  file: ProjectCostReceiptFile;
  key: string;
  sourceDate?: string;
}

interface ArchivedPdfRecord {
  id: string;
  linked_cost_ids?: string[];
  bucket?: string;
  storage_path?: string;
  original_filename?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  metadata?: Record<string, unknown>;
  received_at?: string;
  archived_at?: string;
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

function isPdfFile(file: ProjectCostReceiptFile): boolean {
  return safeString(file.content_type).toLowerCase() === 'application/pdf'
    || safeString(file.filename).toLowerCase().endsWith('.pdf')
    || safeString(file.path).toLowerCase().endsWith('.pdf');
}

function pdfDocumentNumber(file: ProjectCostReceiptFile): string {
  const filename = safeString(file.filename).toLowerCase();
  const fullInvoice = filename.match(/\b\d{4}vf\d+\b/i)?.[0];
  if (fullInvoice) return fullInvoice.toLowerCase();

  const labelledNumber = filename.match(/\b(?:bon|factuur)[_ -]?(\d{5,})\b/i)?.[1];
  if (labelledNumber) return labelledNumber;

  const prefixedNumber = filename.match(/\b(?:pf-f|i)(\d{6,})\b/i)?.[0];
  return prefixedNumber?.toLowerCase() || '';
}

function collectPdfItems(costs: ProjectCostRow[]): PdfItem[] {
  const uniqueItems = new Map<string, PdfItem>();

  costs.forEach((cost) => {
    const files = Array.isArray(cost.receipt_files) ? cost.receipt_files : [];
    files.filter(isPdfFile).forEach((file, index) => {
      const archiveId = safeString(file.archive_id);
      const documentNumber = pdfDocumentNumber(file);
      const identity = documentNumber
        ? `document:${documentNumber}`
        : archiveId
        ? `archive:${archiveId}`
        : safeString(file.path)
          ? `path:${safeString(file.path)}`
          : safeString(file.url)
            ? `url:${safeString(file.url)}`
            : `cost:${cost.id}:${index}`;

      const existing = uniqueItems.get(identity);
      if (existing) {
        if (!existing.costs.some((linkedCost) => linkedCost.id === cost.id)) {
          existing.costs.push(cost);
        }
        if (archiveId && !safeString(existing.file.archive_id)) {
          existing.file = file;
          existing.key = `archive:${archiveId}`;
        }
      } else {
        uniqueItems.set(identity, { costs: [cost], file, key: identity });
      }
    });
  });

  return Array.from(uniqueItems.values()).sort((left, right) => {
    const leftCost = left.costs[0];
    const rightCost = right.costs[0];
    const leftTime = new Date(leftCost.date || leftCost.created_at).getTime();
    const rightTime = new Date(rightCost.date || rightCost.created_at).getTime();
    return rightTime - leftTime;
  });
}

function sumCostAmount(item: PdfItem, field: 'amount_excl_btw' | 'btw_amount' | 'amount_incl_btw'): number {
  return item.costs.reduce((sum, cost) => sum + (Number(cost[field]) || 0), 0);
}

export function KostenPdfTab({ costs, quoteById, onOpenCost }: KostenPdfTabProps) {
  const { user } = useUser();
  const [archivedPdfs, setArchivedPdfs] = useState<ArchivedPdfRecord[]>([]);
  const [search, setSearch] = useState('');
  const pdfItems = useMemo(() => {
    const items = collectPdfItems(costs);
    const knownArchiveIds = new Set(items.map((item) => safeString(item.file.archive_id)).filter(Boolean));

    archivedPdfs.forEach((archive) => {
      const archiveId = safeString(archive.id);
      if (!archiveId || knownArchiveIds.has(archiveId)) return;
      items.push({
        key: `archive:${archiveId}`,
        costs: [],
        sourceDate: safeString(archive.metadata?.source_email_ts)
          || safeString(archive.received_at)
          || safeString(archive.archived_at),
        file: {
          url: '',
          path: safeString(archive.storage_path) || null,
          archive_id: archiveId,
          bucket: safeString(archive.bucket) || null,
          filename: safeString(archive.original_filename) || 'Factuur.pdf',
          content_type: safeString(archive.content_type) || 'application/pdf',
          size_bytes: Number(archive.size_bytes) || 0,
          sha256: safeString(archive.sha256) || null,
          uploaded_at: safeString(archive.archived_at) || safeString(archive.received_at),
        },
      });
    });

    return items.sort((left, right) => {
      const leftCost = left.costs[0];
      const rightCost = right.costs[0];
      const leftTime = new Date(leftCost?.date || left.sourceDate || left.file.uploaded_at).getTime();
      const rightTime = new Date(rightCost?.date || right.sourceDate || right.file.uploaded_at).getTime();
      return rightTime - leftTime;
    });
  }, [archivedPdfs, costs]);
  const [selectedKey, setSelectedKey] = useState('');
  const [archiveUrls, setArchiveUrls] = useState<Record<string, string>>({});
  const [loadingArchiveId, setLoadingArchiveId] = useState('');
  const [failedArchiveId, setFailedArchiveId] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  const filteredPdfItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('nl-NL');
    if (!term) return pdfItems;

    return pdfItems.filter((item) => {
      const costText = item.costs.flatMap((cost) => {
        const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
        return [
          cost.supplier_name,
          cost.description,
          cost.supplier_invoice_number,
          cost.supplier_order_number,
          cost.source_filename,
          cost.date,
          cost.amount_excl_btw,
          cost.btw_amount,
          cost.amount_incl_btw,
          PROJECT_COST_CATEGORY_LABELS[cost.category],
          quote?.offerteNummer,
          quote?.label,
          quote?.clientName,
          ...cost.line_items.flatMap((line) => [line.description, line.total_price, line.total_incl_btw]),
        ];
      });
      const searchable = [
        item.file.filename,
        item.file.path,
        item.sourceDate,
        ...costText,
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(' ')
        .toLocaleLowerCase('nl-NL');
      return searchable.includes(term);
    });
  }, [pdfItems, quoteById, search]);

  useEffect(() => {
    if (!user) {
      setArchivedPdfs([]);
      return;
    }
    let cancelled = false;

    const loadArchive = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/kosten/documents', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: ArchivedPdfRecord[];
        } | null;
        if (!cancelled && response.ok && payload?.ok && Array.isArray(payload.data)) {
          setArchivedPdfs(payload.data);
        }
      } catch {
        if (!cancelled) setArchivedPdfs([]);
      }
    };

    void loadArchive();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const selectedItem = filteredPdfItems.find((item) => item.key === selectedKey) || filteredPdfItems[0] || null;
  const selectedArchiveId = safeString(selectedItem?.file.archive_id);
  const selectedUrl = selectedItem
    ? (selectedArchiveId ? archiveUrls[selectedArchiveId] || '' : safeString(selectedItem.file.url))
    : '';

  useEffect(() => {
    if (filteredPdfItems.length === 0) {
      setSelectedKey('');
      return;
    }
    if (!filteredPdfItems.some((item) => item.key === selectedKey)) {
      setSelectedKey(filteredPdfItems[0].key);
    }
  }, [filteredPdfItems, selectedKey]);

  useEffect(() => {
    if (!user || !selectedArchiveId || archiveUrls[selectedArchiveId]) return;
    let cancelled = false;

    const loadSignedUrl = async () => {
      setLoadingArchiveId(selectedArchiveId);
      setFailedArchiveId('');
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/kosten/documents/${encodeURIComponent(selectedArchiveId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: { url?: string };
          message?: string;
        } | null;
        const url = payload?.ok ? safeString(payload.data?.url) : '';
        if (!response.ok || !url) throw new Error(payload?.message || 'PDF kon niet worden geopend.');
        if (!cancelled) {
          setArchiveUrls((previous) => ({ ...previous, [selectedArchiveId]: url }));
        }
      } catch {
        if (!cancelled) setFailedArchiveId(selectedArchiveId);
      } finally {
        if (!cancelled) setLoadingArchiveId('');
      }
    };

    void loadSignedUrl();
    return () => {
      cancelled = true;
    };
  }, [archiveUrls, retryVersion, selectedArchiveId, user]);

  if (pdfItems.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 p-8 text-center">
          <FileText className="mx-auto h-9 w-9 text-muted-foreground" />
          <div className="font-semibold">Geen PDF-bestanden gevonden</div>
          <div className="text-sm text-muted-foreground">
            Nieuwe PDF-facturen uit de e-mailworkflow verschijnen hier automatisch.
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedCost = selectedItem?.costs[0] || null;
  const selectedQuotes = selectedItem
    ? Array.from(new Map(selectedItem.costs
      .map((cost) => (cost.offerte_id ? quoteById.get(cost.offerte_id) : null))
      .filter((quote): quote is QuoteLookup => Boolean(quote))
      .map((quote) => [quote.offerteNummer || quote.label, quote])).values())
    : [];
  const selectedQuoteLabel = selectedQuotes.length > 1
    ? `${selectedQuotes.length} offertes`
    : selectedQuotes[0]
      ? (selectedQuotes[0].offerteNummer ? `Offerte #${selectedQuotes[0].offerteNummer}` : selectedQuotes[0].label)
      : 'Niet gekoppeld';

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-xl border border-border bg-card/50 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="border-b border-border lg:border-b-0 lg:border-r">
        <div className="border-b border-border bg-muted/25 px-4 py-3">
          <div className="text-sm font-semibold text-foreground">PDF-bestanden</div>
          <div className="text-xs text-muted-foreground">
            {search.trim() ? `${filteredPdfItems.length} van ${pdfItems.length}` : pdfItems.length} {pdfItems.length === 1 ? 'bestand' : 'bestanden'}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Zoek leverancier, factuurnummer, klant..."
              className="h-9 pl-9"
              aria-label="Zoek in PDF-facturen"
            />
          </div>
        </div>

        <div className="max-h-[420px] divide-y divide-border/70 overflow-y-auto lg:max-h-[680px]">
          {filteredPdfItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Geen PDF-facturen gevonden voor “{search.trim()}”.
            </div>
          ) : filteredPdfItems.map((item) => {
            const primaryCost = item.costs[0];
            const linkedQuotes = Array.from(new Map(item.costs
              .map((cost) => (cost.offerte_id ? quoteById.get(cost.offerte_id) : null))
              .filter((quote): quote is QuoteLookup => Boolean(quote))
              .map((quote) => [quote.offerteNummer || quote.label, quote])).values());
            const isSelected = item.key === selectedItem?.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedKey(item.key)}
                className={cn(
                  'w-full px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70',
                  isSelected && 'bg-emerald-500/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 rounded-md border border-border bg-background/50 p-2 text-muted-foreground',
                    isSelected && 'border-emerald-500/40 text-emerald-300'
                  )}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {primaryCost?.supplier_name || 'Niet gekoppeld'}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {primaryCost?.supplier_invoice_number || item.file.filename || 'Factuur'}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{formatDateLabel(primaryCost?.date || item.sourceDate || item.file.uploaded_at)}</span>
                      {primaryCost ? (
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatCurrency(sumCostAmount(item, 'amount_incl_btw'))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Nog niet gekoppeld</span>
                      )}
                    </div>
                    {linkedQuotes.length > 1 ? (
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{linkedQuotes.length} offertes</div>
                    ) : linkedQuotes[0]?.clientName ? (
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{linkedQuotes[0].clientName}</div>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-col bg-background/20">
        {selectedItem ? (
          <>
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {selectedItem.file.filename || selectedCost?.source_filename || 'Factuur.pdf'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {selectedCost ? <Badge variant="outline">{PROJECT_COST_CATEGORY_LABELS[selectedCost.category]}</Badge> : null}
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateLabel(selectedCost?.date || selectedItem.sourceDate || selectedItem.file.uploaded_at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" />
                    {selectedQuoteLabel}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Totaal factuur</div>
                  <div className="font-semibold tabular-nums text-foreground">
                    {selectedCost ? formatCurrency(sumCostAmount(selectedItem, 'amount_incl_btw')) : 'Niet gekoppeld'}
                  </div>
                </div>
                {selectedCost ? (
                  <Button type="button" variant="outline" onClick={() => onOpenCost(selectedCost)}>
                    <Receipt className="mr-2 h-4 w-4" />
                    Open kost
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-[560px] flex-1 items-center justify-center p-3 sm:p-4">
              {selectedUrl ? (
                <iframe
                  key={selectedUrl}
                  src={selectedUrl}
                  title={`PDF ${selectedItem.file.filename || selectedCost?.supplier_name || ''}`}
                  className="h-[72vh] min-h-[540px] w-full rounded-lg border border-border bg-white"
                />
              ) : loadingArchiveId === selectedArchiveId ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  PDF laden...
                </div>
              ) : failedArchiveId === selectedArchiveId ? (
                <div className="space-y-3 text-center">
                  <div className="text-sm font-medium text-foreground">PDF kon niet worden geladen</div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFailedArchiveId('');
                      setRetryVersion((current) => current + 1);
                    }}
                  >
                    Opnieuw proberen
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Geen geldige PDF-link beschikbaar.</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-[560px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Pas je zoekopdracht aan om een PDF-factuur te openen.
          </div>
        )}
      </div>
    </div>
  );
}
