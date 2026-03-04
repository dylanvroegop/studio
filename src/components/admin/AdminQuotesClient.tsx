'use client';

import { useState } from 'react';
import type { AdminQuoteRow } from '@/lib/admin-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAdminSupportMode } from '@/components/admin/SupportModeToggle';

export function AdminQuotesClient({ initialRows }: { initialRows: AdminQuoteRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionState, setActionState] = useState<Record<string, string>>({});
  const [supportMode] = useAdminSupportMode();

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/quotes?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      }
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (quoteId: string, action: 'regenerate-pdf' | 'rebuild-data-json') => {
    setActionState((prev) => ({ ...prev, [quoteId]: action }));
    try {
      const response = await fetch(`/api/admin/quotes/${encodeURIComponent(quoteId)}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ supportMode }),
      });
      if (response.ok) {
        await handleSearch();
      }
    } finally {
      setActionState((prev) => ({ ...prev, [quoteId]: '' }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op quoteId, klant of bedrijf"
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? 'Zoeken...' : 'Zoeken'}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Offertes / projecten</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Geen resultaten.</p>}
          {rows.map((row) => (
            <div key={row.quoteId} className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">{row.quoteId}</div>
              <div>Klant: {row.customerName || '—'}</div>
              <div>Bedrijf: {row.companyName || '—'}</div>
              <div>Status: {row.status || '—'}</div>
              <div>Updated: {row.updatedAt || '—'}</div>
              <div>Supabase calc: {row.hasSupabaseCalculation ? (row.supabaseStatus || 'ja') : 'nee'}</div>
              <div className="mt-2 rounded bg-muted/40 p-2 text-xs">
                Input: {JSON.stringify(row.quotePreview)}
              </div>
              {row.generatedOutputPreview && (
                <div className="mt-2 rounded bg-muted/40 p-2 text-xs">
                  Output: {JSON.stringify(row.generatedOutputPreview).slice(0, 400)}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => runAction(row.quoteId, 'rebuild-data-json')}
                  disabled={supportMode || Boolean(actionState[row.quoteId])}
                >
                  Rebuild data_json
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(row.quoteId, 'regenerate-pdf')}
                  disabled={supportMode || Boolean(actionState[row.quoteId])}
                >
                  Regenerate PDF
                </Button>
              </div>
              {supportMode && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Supportmodus staat aan: mutaties zijn uitgeschakeld.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
