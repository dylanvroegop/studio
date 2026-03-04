'use client';

import { useState } from 'react';
import type { AdminSubscriptionRow } from '@/lib/admin-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function AdminSubscriptionsClient({ initialRows }: { initialRows: AdminSubscriptionRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/subscriptions?q=${encodeURIComponent(query)}`, {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (response.ok) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op bedrijf, e-mail of Stripe ID"
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? 'Zoeken...' : 'Zoeken'}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Geen resultaten.</p>}
          {rows.map((row) => (
            <div key={row.uid} className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">{row.companyName || row.email || row.uid}</div>
              <div>Plan: {row.plan || '—'}</div>
              <div>Status: {row.paymentStatus || '—'}{row.failedPayment ? ' (failed)' : ''}</div>
              <div>Vervaldatum: {row.renewalDate || '—'}</div>
              <div>Stripe customer: {row.stripeCustomerId || '—'}</div>
              <div>Stripe subscription: {row.stripeSubscriptionId || '—'}</div>
              {row.stripeDashboardUrl && (
                <a
                  href={row.stripeDashboardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4"
                >
                  Open in Stripe
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
