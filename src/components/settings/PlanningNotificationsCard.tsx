'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { disablePushToken, ensurePushPermissionAndToken, savePushToken, setupForegroundNotificationListener } from '@/lib/notifications';

const STORAGE_KEY = 'offertehulp.pushToken';

export function PlanningNotificationsCard() {
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY) || '';
    setToken(existing);

    let dispose: (() => void) | null = null;
    setupForegroundNotificationListener((title, body) => {
      toast({ title, description: body });
    }).then((unsub) => {
      dispose = unsub;
    }).catch(() => {
      // ignore unsupported environments
    });

    return () => {
      if (dispose) dispose();
    };
  }, [toast]);

  const enableNotifications = async () => {
    setIsBusy(true);
    try {
      const nextToken = await ensurePushPermissionAndToken();
      await savePushToken(nextToken);
      window.localStorage.setItem(STORAGE_KEY, nextToken);
      setToken(nextToken);
      toast({ title: 'Notificaties ingeschakeld', description: 'Je ontvangt nu planning herinneringen op dit apparaat.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kon notificaties niet inschakelen';
      toast({ variant: 'destructive', title: 'Fout', description: message });
    } finally {
      setIsBusy(false);
    }
  };

  const disableNotifications = async () => {
    if (!token) return;
    setIsBusy(true);
    try {
      await disablePushToken(token);
      window.localStorage.removeItem(STORAGE_KEY);
      setToken('');
      toast({ title: 'Notificaties uitgeschakeld', description: 'Planning herinneringen zijn uitgezet op dit apparaat.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kon notificaties niet uitschakelen';
      toast({ variant: 'destructive', title: 'Fout', description: message });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>iPhone Push Notificaties</CardTitle>
        <CardDescription>
          Voor iPhone: open deze app via Safari en kies "Zet op beginscherm". Activeer daarna notificaties hieronder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Status: {token ? 'Ingeschakeld op dit apparaat' : 'Uitgeschakeld'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={enableNotifications} disabled={isBusy || !!token}>
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Inschakelen
          </Button>
          <Button type="button" variant="outline" onClick={disableNotifications} disabled={isBusy || !token}>
            <BellOff className="mr-2 h-4 w-4" />
            Uitschakelen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
