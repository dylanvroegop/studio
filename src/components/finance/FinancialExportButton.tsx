'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

export function FinancialExportButton() {
  const { user } = useUser();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  async function download() {
    if (!user) return;
    setPending(true);
    try {
      const response = await fetch('/api/bank/financial-export', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Financiële export mislukt. Probeer opnieuw.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `financieel-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      toast({ title: 'Export mislukt', description: error instanceof Error ? error.message : 'Probeer opnieuw.', variant: 'destructive' });
    } finally { setPending(false); }
  }
  return <Button variant="outline" className="gap-2" disabled={!user || pending} onClick={() => void download()}>
    <Download className="h-4 w-4" />{pending ? 'Exporteren...' : 'Financiële export'}
  </Button>;
}
