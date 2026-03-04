'use client';

import { useState } from 'react';
import type { AdminUserRow } from '@/lib/admin-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function AdminUsersClient({ initialRows }: { initialRows: AdminUserRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
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
          placeholder="Zoek op e-mail of bedrijfsnaam"
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? 'Zoeken...' : 'Zoeken'}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Gebruikers & bedrijven</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Geen resultaten.</p>}
          {rows.map((row) => (
            <div key={row.uid} className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">{row.companyName || row.email || row.uid}</div>
              <div className="text-muted-foreground">UID: {row.uid}</div>
              <div>E-mail: {row.email || '—'}</div>
              <div>Aangemaakt: {row.createdAt || '—'}</div>
              <div>Laatste login: {row.lastLogin || '—'}</div>
              <div>Status: {row.status || '—'}</div>
              <div>Plan: {row.plan || '—'}</div>
              <div>Gebruik: {row.usageSummary || '—'}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
