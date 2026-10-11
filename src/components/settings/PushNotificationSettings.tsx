'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { applicationServerKey, disableDevicePush, PUSH_OWNER_KEY, pushRegistration, pushRequest, supportsPush } from '@/lib/push-client';

export function PushNotificationSettings(): JSX.Element {
  const { user } = useUser();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [key, setKey] = useState('');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState('Meldingen voorbereiden…');
  const [busy, setBusy] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setRegistration(null);
    setKey('');
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (ios && !standalone) {
      setUnsupported(true);
      setStatus('Je gebruikt Calvora nu in Safari. Kies in Safari Delen → Zet op beginscherm. Staat ‘Open als webapp’ erbij? Zet die aan. Open daarna Calvora via het nieuwe icoon op je beginscherm en schakel hier meldingen in.');
      return;
    }
    if (!supportsPush()) {
      setUnsupported(true);
      setStatus('Deze browser ondersteunt geen pushmeldingen. Gebruik op een iPhone iOS 16.4 of nieuwer en open Calvora vanaf je beginscherm.');
      return;
    }
    setUnsupported(false);
    setStatus('Meldingen voorbereiden…');
    void (async () => {
      const [worker, config] = await Promise.all([pushRegistration(), pushRequest(user, 'subscription')]);
      const owner = localStorage.getItem(PUSH_OWNER_KEY);
      if (owner && owner !== user.uid) await disableDevicePush();
      const existing = await worker.pushManager.getSubscription();
      if (existing && localStorage.getItem(PUSH_OWNER_KEY) === user.uid) {
        await pushRequest(user, 'subscription', 'POST', existing.toJSON());
      }
      if (cancelled) return;
      setRegistration(worker);
      setKey(String(config.publicKey));
      const registered = existing && localStorage.getItem(PUSH_OWNER_KEY) === user.uid ? existing : null;
      setSubscription(registered);
      setStatus(Notification.permission === 'denied'
        ? 'Meldingen zijn geblokkeerd. Sta meldingen voor Calvora toe in de instellingen van je telefoon of browser en open deze pagina opnieuw.'
        : registered ? 'Meldingen staan aan op dit apparaat.' : 'Meldingen staan uit op dit apparaat.');
    })().catch(error => { if (!cancelled) setStatus(error.message || 'Meldingen voorbereiden mislukt.'); });
    return () => { cancelled = true; };
  }, [user, reload]);

  const enable = async (): Promise<void> => {
    if (!registration || !key || !user) return;
    setBusy(true);
    try {
      // Direct vanuit de tik: geen fetch/token-refresh vóór subscribe (vereist op iPhone).
      const current = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) });
      await pushRequest(user, 'subscription', 'POST', current.toJSON());
      localStorage.setItem(PUSH_OWNER_KEY, user.uid);
      setSubscription(current);
      setStatus('Meldingen staan aan op dit apparaat. Stuur een testmelding om dit te controleren.');
    } catch (error) {
      setStatus(Notification.permission === 'denied'
        ? 'Geen toestemming voor meldingen. Sta meldingen voor Calvora toe in de instellingen van je telefoon of browser.'
        : error instanceof Error ? error.message : 'Inschakelen mislukt. Probeer het opnieuw.');
    } finally { setBusy(false); }
  };

  const disable = async (): Promise<void> => {
    setBusy(true);
    try {
      await disableDevicePush(user);
      setSubscription(null);
      setStatus('Meldingen staan uit op dit apparaat.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Uitschakelen mislukt.'); }
    finally { setBusy(false); }
  };

  const test = async (): Promise<void> => {
    if (!user || !subscription) return;
    setBusy(true);
    try {
      await pushRequest(user, 'test', 'POST', { endpoint: subscription.endpoint });
      setStatus('Testmelding aangeboden aan dit apparaat. Test je op een computer? Dan gaat deze melding naar die computer, niet naar je telefoon. Geen melding? Controleer Focus / Niet storen en je meldingsinstellingen.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Testmelding mislukt.'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Meldingen op dit apparaat</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Ontvang meldingen op je telefoon, ook als Calvora gesloten is. Tik op een melding om de bijbehorende pagina te openen.</p>
        <p role="status" aria-live="polite" className="text-sm">{status}</p>
        {!unsupported && <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !registration || !key} onClick={enable}>{subscription ? 'Opnieuw verbinden' : 'Meldingen inschakelen'}</Button>
          {subscription && <>
            <Button variant="outline" disabled={busy} onClick={test}>Testmelding sturen</Button>
            <Button variant="outline" disabled={busy} onClick={disable}>Uitschakelen</Button>
          </>}
          {!registration && <Button variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>Opnieuw proberen</Button>}
        </div>}
        <p className="text-xs text-muted-foreground">Je stelt dit per apparaat in. Bij uitloggen worden meldingen op dit apparaat uitgeschakeld. De eerste keer vraagt je telefoon om toestemming.</p>
      </CardContent>
    </Card>
  );
}
