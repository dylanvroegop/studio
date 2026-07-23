'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, Link2, Receipt } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  PROJECT_COST_CATEGORY_LABELS,
  type ProjectCostReceiptFile,
  type ProjectCostRow,
} from '@/lib/project-costs';
import { useUser } from '@/firebase';

type QuoteLookup = {
  offerteNummer: number | null;
  label: string;
};

interface KostenGalleryTabProps {
  costs: ProjectCostRow[];
  quoteById: Map<string, QuoteLookup>;
  onOpenCost: (cost: ProjectCostRow) => void;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function isImageFile(file: ProjectCostReceiptFile): boolean {
  return safeString(file.content_type).toLowerCase().startsWith('image/');
}

export function KostenGalleryTab({ costs, quoteById, onOpenCost }: KostenGalleryTabProps) {
  const { user } = useUser();
  const [archiveUrls, setArchiveUrls] = useState<Record<string, string>>({});
  const galleryItems = costs.flatMap((cost) => {
    const files = Array.isArray(cost.receipt_files) ? cost.receipt_files : [];
    return files.map((file, index) => ({
      cost,
      file,
      key: `${cost.id}-${safeString(file.path) || safeString(file.url) || index}`,
      index,
    }));
  });

  const archiveIds = useMemo(() => Array.from(new Set(galleryItems
    .map(({ file }) => safeString(file.archive_id))
    .filter(Boolean))), [galleryItems]);
  const archiveIdsKey = archiveIds.join('|');

  useEffect(() => {
    const requestedArchiveIds = archiveIdsKey.split('|').filter(Boolean);
    if (!user || requestedArchiveIds.length === 0) return;
    let cancelled = false;

    const loadArchiveUrls = async () => {
      const token = await user.getIdToken();
      const entries = await Promise.all(requestedArchiveIds.map(async (archiveId) => {
        const response = await fetch(`/api/kosten/documents/${encodeURIComponent(archiveId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: { url?: string };
        } | null;
        const url = payload?.ok ? safeString(payload.data?.url) : '';
        return url ? [archiveId, url] as const : null;
      }));

      if (cancelled) return;
      setArchiveUrls((previous) => ({
        ...previous,
        ...Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))),
      }));
    };

    void loadArchiveUrls().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [archiveIdsKey, user]);

  if (galleryItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <div className="font-semibold">Geen bonnen gevonden</div>
          <div className="text-sm text-muted-foreground">
            Upload eerst een bon in Kosten. Daarna verschijnen ze automatisch in deze galerij.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {galleryItems.map(({ cost, file, key }) => {
        const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
        const linkedLabel = quote
          ? (quote.offerteNummer ? `Offerte #${quote.offerteNummer}` : quote.label)
          : 'Niet gekoppeld';
        const archiveId = safeString(file.archive_id);
        const fileUrl = (archiveId && archiveUrls[archiveId]) || file.url;

        return (
          <Card key={key} className="overflow-hidden border-border/70 bg-card/80">
            <a
              href={fileUrl || undefined}
              target="_blank"
              rel="noreferrer"
              className="block h-44 w-full bg-muted/40"
              aria-label={`Open origineel document ${file.filename || ''}`}
            >
              {isImageFile(file) && fileUrl ? (
                <img
                  src={fileUrl}
                  alt={file.filename || `Bon van ${cost.supplier_name}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <FileText className="h-10 w-10" />
                  <div className="text-xs">{fileUrl ? 'Open origineel document' : 'Documentlink laden...'}</div>
                </div>
              )}
            </a>

            <CardContent className="space-y-3 p-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{cost.supplier_name || 'Onbekende leverancier'}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{cost.description || 'Geen omschrijving'}</div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{PROJECT_COST_CATEGORY_LABELS[cost.category]}</Badge>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDateLabel(cost.date)}
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  {linkedLabel}
                </span>
                {archiveId ? (
                  <span className="text-emerald-300">Origineel gearchiveerd</span>
                ) : null}
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={() => onOpenCost(cost)}>
                <Receipt className="mr-2 h-4 w-4" />
                Open kost
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
