'use client';

import { useEffect, useState } from 'react';
import { Calendar, Link2Off, Loader2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function GoogleCalendarSettingsCard() {
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);

  const loadStatus = async () => {
    const idToken = await getAuth().currentUser?.getIdToken();
    if (!idToken) return;

    const response = await fetch('/api/google-calendar/status', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return;

    const data = await response.json() as { connected?: boolean; reconnectRequired?: boolean };
    setConnected(data.connected === true);
    setReconnectRequired(data.reconnectRequired === true);
  };

  useEffect(() => {
    loadStatus().catch(() => null);
  }, []);

  const connect = async () => {
    setIsBusy(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Niet ingelogd');

      const response = await fetch('/api/google-calendar/connect-url', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error('Kon connect URL niet ophalen');

      const data = await response.json() as { url?: string };
      if (!data.url) throw new Error('Ongeldige connect URL');
      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Calendar koppelen mislukt';
      toast({ variant: 'destructive', title: 'Fout', description: message });
      setIsBusy(false);
    }
  };

  const disconnect = async () => {
    setIsBusy(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Niet ingelogd');

      const response = await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error('Ontkoppelen mislukt');

      setConnected(false);
      setReconnectRequired(false);
      toast({ title: 'Google Calendar ontkoppeld' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Calendar ontkoppelen mislukt';
      toast({ variant: 'destructive', title: 'Fout', description: message });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Calendar Sync</CardTitle>
        <CardDescription>
          Planning-items gaan automatisch naar Google Calendar. Gebruik 'Google verversen' in Planning om gewijzigde datums en tijden terug te halen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Status: {connected ? 'Gekoppeld' : reconnectRequired ? 'Opnieuw koppelen vereist' : 'Niet gekoppeld'}
        </p>
        {reconnectRequired ? (
          <p className="text-sm text-amber-500">
            Google heeft de eerdere toegang ingetrokken of laten verlopen. Koppel opnieuw om synchronisatie te herstellen.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={connect} disabled={isBusy || connected}>
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
            {reconnectRequired ? 'Opnieuw koppelen' : 'Koppelen'}
          </Button>
          <Button type="button" variant="outline" onClick={disconnect} disabled={isBusy || !connected}>
            <Link2Off className="mr-2 h-4 w-4" />
            Ontkoppelen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
