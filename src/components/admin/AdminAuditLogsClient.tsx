'use client';

import type { AdminAuditLogEntry } from '@/lib/admin-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AdminAuditLogsClient({ rows }: { rows: AdminAuditLogEntry[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Audit logs</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nog geen logs.</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="font-medium">{row.action || '—'}</div>
            <div>Actor: {row.actorEmail || row.actorUserId || '—'}</div>
            <div>Target: {row.targetType || '—'} / {row.targetId || '—'}</div>
            <div>Tijd: {row.createdAt || '—'}</div>
            <div>Supportmodus: {row.supportMode ? 'ja' : 'nee'}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
