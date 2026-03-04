'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ADMIN_SUPPORT_MODE_KEY = 'calvora.admin.supportMode';

export function readSupportMode(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.sessionStorage.getItem(ADMIN_SUPPORT_MODE_KEY);
  if (raw === 'off') return false;
  return true;
}

export function useAdminSupportMode(): [boolean, (value: boolean) => void] {
  const [supportMode, setSupportMode] = useState(true);

  useEffect(() => {
    setSupportMode(readSupportMode());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(ADMIN_SUPPORT_MODE_KEY, supportMode ? 'on' : 'off');
    window.dispatchEvent(new CustomEvent('calvora-admin-support-mode', { detail: supportMode }));
  }, [supportMode]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setSupportMode(customEvent.detail !== false);
    };

    window.addEventListener('calvora-admin-support-mode', onChange as EventListener);
    return () => window.removeEventListener('calvora-admin-support-mode', onChange as EventListener);
  }, []);

  return [supportMode, setSupportMode];
}

export function SupportModeToggle() {
  const [supportMode, setSupportMode] = useAdminSupportMode();

  return (
    <Button
      type="button"
      variant={supportMode ? 'outline' : 'destructive'}
      onClick={() => setSupportMode(!supportMode)}
      className="gap-2"
    >
      {supportMode ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
      {supportMode ? 'Supportmodus: alleen lezen' : 'Actiemodus: wijzigingen toegestaan'}
    </Button>
  );
}
