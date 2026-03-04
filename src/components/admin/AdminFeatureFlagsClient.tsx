'use client';

import { useState } from 'react';
import type { FeatureFlagRecord } from '@/lib/feature-flags';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAdminSupportMode } from '@/components/admin/SupportModeToggle';

export function AdminFeatureFlagsClient({ initialRows }: { initialRows: FeatureFlagRecord[] }) {
  const [rows, setRows] = useState(initialRows);
  const [supportMode] = useAdminSupportMode();

  const toggleFlag = async (key: string, enabled: boolean) => {
    const response = await fetch('/api/admin/feature-flags', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ key, enabled, supportMode }),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.row) {
      setRows((prev) => prev.map((row) => (row.key === key ? payload.row : row)));
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Feature flags</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="font-medium">{row.key}</div>
              <div className="text-sm text-muted-foreground">{row.description}</div>
            </div>
            <Switch
              checked={row.enabled}
              disabled={supportMode}
              onCheckedChange={(checked) => toggleFlag(row.key, checked)}
            />
          </div>
        ))}
        {supportMode && (
          <p className="text-xs text-muted-foreground">
            Supportmodus staat aan: feature flags kunnen niet worden aangepast.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
