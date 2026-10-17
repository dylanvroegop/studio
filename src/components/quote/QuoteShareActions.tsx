'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Loader2, MessageCircle, Share2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { invoiceWhatsAppUrl, downloadInvoiceFile } from '@/lib/invoice-sharing';
import { prepareQuotePdfDownload } from '@/lib/quote-pdf-download';
import { stripDocumentLinksFromMessage } from '@/lib/whatsapp-message-preset';

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
  messageEditor?: ReactNode;
  templateEditor?: ReactNode;
  onPhoneChange?: (phone: string) => void;
}

export function QuoteShareActions({ open, selectedIds, blocked, message, phone, prepareFiles, markSent, onClose, onBusyChange, messageEditor, templateEditor, onPhoneChange }: QuoteShareActionsProps): JSX.Element {
  const selectionKey = JSON.stringify(selectedIds);
  const prepareRef = useRef(prepareFiles);
  prepareRef.current = prepareFiles;
  const [prepared, setPrepared] = useState<{ key: string; files: File[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shareFailed, setShareFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const busyRef = useRef(false);
  const files = prepared?.key === selectionKey ? prepared.files : null;

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsDesktop(!mobile);
  }, []);

  useEffect(() => {
    setPrepared(null);
    setError('');
    setNotice('');
    setShareFailed(false);
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
  const mobileWhatsAppUrl = invoiceWhatsAppUrl(phone, message);
  const webParams = new URLSearchParams({ text: stripDocumentLinksFromMessage(message) });
  if (mobileWhatsAppUrl) webParams.set('phone', new URL(mobileWhatsAppUrl).pathname.slice(1));
  const whatsappUrl = isDesktop ? `https://web.whatsapp.com/send?${webParams.toString()}` : mobileWhatsAppUrl;
  const setWorking = (value: boolean): void => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange(value);
  };

  const share = (): void => {
    if (!files || blocked || busyRef.current) return;
    if (isDesktop && whatsappUrl) {
      // Open de webpagina direct vanuit de klik, vóór de asynchrone download.
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setNotice('Voeg de gedownloade PDF toe in WhatsApp Web.' + (files.length > 1 ? ' Pak hiervoor eerst de ZIP uit.' : ''));
      void download();
      return;
    }
    setWorking(true);
    setShareFailed(false);
    // De bestanden zijn al gereed: open de deelfunctie rechtstreeks vanuit de tik.
    try {
      const pending = navigator.share({ files, ...(message.trim() ? { text: message } : {}) });
      void pending.then(() => setNotice('Controleer in WhatsApp of je de offerte hebt verstuurd.'))
        .catch((reason: unknown) => {
          const cancelled = reason instanceof Error && reason.name === 'AbortError';
          setShareFailed(!cancelled);
          setNotice(cancelled ? 'Delen geannuleerd. De status is niet gewijzigd.' : 'Delen mislukt. Probeer opnieuw of download de PDF hieronder.');
        })
        .finally(() => setWorking(false));
    } catch {
      setShareFailed(true);
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
    {files && <p className="break-all text-xs text-muted-foreground">{files.map((file) => file.name).join(', ')}</p>}
    {messageEditor}
    {error ? <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Opnieuw proberen</Button>
    </div> : !files && !blocked ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> PDF voorbereiden...</p> : null}
    {(isDesktop || canShare || !files) && <Button variant="success" className="min-h-11 w-full gap-2" disabled={!files || busy || blocked} onClick={share}><Share2 className="h-4 w-4" />Deel PDF en bericht</Button>}
    {isDesktop ? <p className="text-xs text-muted-foreground">Downloadt de PDF en opent WhatsApp Web met je bericht. Voeg de PDF daar zelf toe.{files && files.length > 1 ? ' Pak hiervoor eerst de ZIP uit.' : ''}</p> : canShare && <p className="text-xs text-muted-foreground">Kies WhatsApp en de klant. Neemt WhatsApp de tekst niet over? Gebruik ‘Kopiëren’.</p>}
    {!messageEditor && <Button variant="outline" className="min-h-11 w-full gap-2" disabled={busy || blocked || !message.trim()} onClick={() => {
      void navigator.clipboard.writeText(message).then(() => setNotice('Bericht gekopieerd.')).catch(() => setNotice('Kopiëren mislukt. Selecteer en kopieer het bericht hierboven.'));
    }}><Copy className="h-4 w-4" />Bericht kopiëren</Button>}
    <details open={Boolean(files && ((!isDesktop && !canShare) || shareFailed))} className="rounded-md border px-3 py-2">
      <summary className="cursor-pointer text-sm">Downloaden en WhatsApp openen</summary>
      <div className="space-y-3 pt-3">
        <Button variant="outline" className="min-h-11 w-full gap-2" disabled={!files || busy || blocked} onClick={() => void download()}><Download className="h-4 w-4" />{files && files.length > 1 ? 'Download PDF’s als ZIP' : 'Download PDF'}</Button>
        {onPhoneChange && <div className="space-y-1.5"><Label htmlFor="quote-share-phone">WhatsApp-nummer</Label><Input id="quote-share-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => onPhoneChange(event.target.value)} placeholder="+31 6 12345678" /></div>}
        {whatsappUrl && <Button asChild variant="outline" className="min-h-11 w-full"><a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" />{isDesktop ? 'WhatsApp Web openen' : 'WhatsApp openen'}</a></Button>}
        <p className="text-xs text-muted-foreground">Voeg de gedownloade PDF zelf toe.{files && files.length > 1 ? ' Pak hiervoor eerst de ZIP uit.' : ''}</p>
      </div>
    </details>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {templateEditor}
    {markSent && <Button variant="outline" className="min-h-11 w-full" disabled={!files || busy || blocked} onClick={() => void confirmSent()}><Check className="mr-2 h-4 w-4" />Ik heb {selectedIds.length > 1 ? 'de offertes' : 'de offerte'} verstuurd</Button>}
  </div>;
}
