'use client';

import Link from 'next/link';
import type { AdminSystemStatus } from '@/lib/admin-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AdminOverviewClient({ status }: { status: AdminSystemStatus }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Versie</CardTitle></CardHeader>
          <CardContent>{status.appVersion}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Omgeving</CardTitle></CardHeader>
          <CardContent>{status.environment}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Firebase</CardTitle></CardHeader>
          <CardContent>{status.firebaseProjectId}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Controle</CardTitle></CardHeader>
          <CardContent>
            Stripe: {status.hasStripeSecret ? 'OK' : 'Mist'}
            <br />
            Supabase: {status.hasSupabase ? 'OK' : 'Mist'}
            <br />
            n8n secret: {status.hasN8nSecret ? 'OK' : 'Mist'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Snelkoppelingen</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <Link href="/admin/users" className="underline underline-offset-4">Gebruikers & bedrijven</Link>
          <Link href="/admin/subscriptions" className="underline underline-offset-4">Abonnementen</Link>
          <Link href="/admin/quotes" className="underline underline-offset-4">Offertes</Link>
          <Link href="/admin/feature-flags" className="underline underline-offset-4">Feature flags</Link>
        </CardContent>
      </Card>
    </div>
  );
}
