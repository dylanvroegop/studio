'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invoiceWhatsAppUrl, downloadInvoiceFile } from '@/lib/invoice-sharing';
import { prepareQuotePdfDownload } from '@/lib/quote-pdf-download';

interface QuoteShareActionsProps {
  open: boolean;
  selectedIds: string[];
  blocked: boolean;
  message: string;
  phone: string;
  prepareFiles: (ids: string[]) => Promise<File[]>;
  markSent?: (ids?: string[]) => Promise<void> | void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

export function QuoteShareActions({ open, selectedIds, blocked, message, phone, prepareFiles, markSent, onClose, onBusyChange }: QuoteShareActionsProps): JSX.Element {
  const selectionKey = JSON.stringify(selectedIds);
  const prepareRef = useRef(prepareFiles);
  prepareRef.current = prepareFiles;
  const [prepared, setPrepared] = useState<{ key: string; files: File[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const files = prepared?.key === selectionKey ? prepared.files : null;

  useEffect(() => {
    setPrepared(null);
    setError('');
    setNotice('');
    if (!open || blocked) return;
    let cancelled = false;
    void prepareRef.current(JSON.parse(selectionKey) as string[]).then((result) => {
      if (!cancelled) setPrepared({ key: selectionKey, files: result });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF voorbereiden mislukt.');
    });
    return () => { cancelled = true; };
  }, [open, blocked, selectionKey, retry]);

  let canShare = false;
  try { canShare = Boolean(files?.length && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && navigator.canShare?.({ files })); } catch { /* Download blijft beschikbaar. */ }
  const whatsappUrl = invoiceWhatsAppUrl(phone, message);
  const setWorking = (value: boolean): void => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange(value);
  };

  const share = (): void => {
    if (!files || blocked || busyRef.current) return;
    setWorking(true);
    // De bestanden zijn al gereed: open de deelfunctie rechtstreeks vanuit de tik.
    try {
      const pending = navigator.share({ files, ...(message.trim() ? { text: message } : {}) });
      void pending.then(() => setNotice('Controleer in WhatsApp of je de offerte hebt verstuurd.'))
        .catch((reason: unknown) => setNotice(reason instanceof Error && reason.name === 'AbortError'
          ? 'Delen geannuleerd. De status is niet gewijzigd.'
          : 'Delen mislukt. Probeer opnieuw of download de PDF hieronder.'))
        .finally(() => setWorking(false));
    } catch {
      setNotice('Delen mislukt. Download de PDF hieronder.');
      setWorking(false);
    }
  };

  const download = async (): Promise<void> => {
    if (!files || busyRef.current) return;
    setWorking(true);
    try {
      const result = await prepareQuotePdfDownload(files.map((file) => ({ fileName: file.name, blob: file })), 'Offertes.zip');
      downloadInvoiceFile(new File([result.blob], result.fileName, { type: result.blob.type }));
    } catch { setNotice('Download mislukt. Probeer opnieuw.'); }
    finally { setWorking(false); }
  };

  const confirmSent = async (): Promise<void> => {
    if (!markSent || busyRef.current || blocked) return;
    setWorking(true);
    try { await markSent(selectedIds); onClose(); }
    catch { setNotice('Status bijwerken mislukt. Probeer opnieuw.'); }
    finally { setWorking(false); }
  };

  return <div className="min-w-0 space-y-3">
    {error ? <div role="alert" className="space-y-2 text-sm text-red-400">
      <p>{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Opnieuw proberen</Button>
    </div> : !files && !blocked ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> PDF voorbereiden...</p> : null}
    {canShare && <Button variant="success" className="min-h-11 w-full gap-2" disabled={busy || blocked} onClick={share}><Share2 className="h-4 w-4" />Deel PDF en bericht</Button>}
    {canShare && <p className="text-xs text-zinc-400">Kies WhatsApp en de klant. Wordt de tekst niet meegenomen? Gebruik ‘Bericht kopiëren’.</p>}
    <Button variant="outline" className="min-h-11 w-full gap-2" disabled={busy || blocked || !message.trim()} onClick={() => {
      void navigator.clipboard.writeText(message).then(() => setNotice('Bericht gekopieerd.')).catch(() => setNotice('Kopiëren mislukt. Selecteer en kopieer het bericht hierboven.'));
    }}><Copy className="h-4 w-4" />Bericht kopiëren</Button>
    <details open={Boolean(files && !canShare)} className="rounded-md border border-zinc-700 px-3 py-2">
      <summary className="cursor-pointer text-sm">Downloaden en WhatsApp openen</summary>
      <div className="space-y-3 pt-3">
        <Button variant="outline" className="min-h-11 w-full gap-2" disabled={!files || busy || blocked} onClick={() => void download()}><Download className="h-4 w-4" />{files && files.length > 1 ? 'Download PDF’s als ZIP' : 'Download PDF'}</Button>
        {whatsappUrl && <Button asChild variant="outline" className="min-h-11 w-full"><a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp openen</a></Button>}
        <p className="text-xs text-zinc-400">Voeg de gedownloade PDF zelf toe.{files && files.length > 1 ? ' Pak hiervoor eerst de ZIP uit.' : ''}</p>
      </div>
    </details>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {markSent && <Button variant="outline" className="min-h-11 w-full" disabled={!files || busy || blocked} onClick={() => void confirmSent()}>Ik heb {selectedIds.length > 1 ? 'de offertes' : 'de offerte'} verstuurd</Button>}
  </div>;
}
