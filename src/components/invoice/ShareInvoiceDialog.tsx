'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2, MessageCircle, Share2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import type { PDFInvoiceData } from '@/lib/generate-invoice-pdf';
import { getInvoicePdfBlob } from '@/lib/invoice-pdf-client';
import { stripDocumentLinksFromMessage } from '@/lib/whatsapp-message-preset';
import {
  canShareInvoiceFile,
  DEFAULT_INVOICE_MESSAGE,
  downloadInvoiceFile,
  initialInvoiceMessageTemplate,
  INVOICE_MESSAGE_STORAGE_KEY,
  invoiceShareFilename,
  invoiceWhatsAppUrl,
  resolveInvoiceMessage,
  sharePreparedInvoice,
  type InvoiceMessageContext,
} from '@/lib/invoice-sharing';

interface ShareInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  pdfData: PDFInvoiceData | null;
  accountTemplate?: string;
  accountReady: boolean;
  onTemplateSaved: (template: string) => void;
  canMarkSent: boolean;
  onMarkSent: () => Promise<boolean>;
}

export function ShareInvoiceDialog({
  open, onClose, invoiceId, pdfData, accountTemplate, accountReady, onTemplateSaved, canMarkSent, onMarkSent,
}: ShareInvoiceDialogProps): JSX.Element {
  const firestore = useFirestore();
  const { user } = useUser();
  const [prepared, setPrepared] = useState<{ signature: string; file: File | null; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState('');
  const [templateSource, setTemplateSource] = useState<'account' | 'browser' | 'default'>('default');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [shareFailed, setShareFailed] = useState(false);
  const initialized = useRef<string | null>(null);
  const sharingRef = useRef(false);
  const savingRef = useRef(false);
  const markingRef = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const pdfSignature = pdfData ? JSON.stringify(pdfData) : '';
  const preparedFile = prepared?.signature === pdfSignature ? prepared.file : null;
  const preparationError = prepared?.signature === pdfSignature ? prepared.error : null;
  const supportsShare = Boolean(preparedFile && typeof navigator !== 'undefined' && canShareInvoiceFile(navigator, preparedFile));

  const context = useMemo<InvoiceMessageContext | null>(() => pdfData ? {
    clientName: pdfData.klant.naam,
    invoiceType: pdfData.invoiceType === 'voorschot' ? 'voorschot' : 'eind',
    invoiceNumber: pdfData.invoiceNumberLabel,
    amount: pdfData.totals.totaalInclBtw,
    dueDate: pdfData.invoiceType === 'voorschot' ? 'direct' : pdfData.dueDate,
    companyName: pdfData.bedrijf.naam,
  } : null, [pdfData]);

  useEffect(() => {
    if (!pdfSignature || !pdfData) return;
    let cancelled = false;
    const data = pdfData;
    void getInvoicePdfBlob(data).then((blob) => {
      if (cancelled) return;
      const file = new File([blob], invoiceShareFilename(data.invoiceNumberLabel, data.klant.naam), { type: 'application/pdf' });
      setPrepared({ signature: pdfSignature, file, error: null });
    }).catch(() => {
      if (!cancelled) setPrepared({ signature: pdfSignature, file: null, error: 'PDF voorbereiden mislukt. Probeer het opnieuw.' });
    });
    return () => { cancelled = true; };
  }, [pdfData, pdfSignature, retry]);

  useEffect(() => {
    if (!open) {
      initialized.current = null;
      return;
    }
    const key = `${user?.uid || ''}:${invoiceId}:${JSON.stringify(context)}`;
    if (!accountReady || !context || initialized.current === key) return;
    let legacy: string | null = null;
    try { legacy = localStorage.getItem(INVOICE_MESSAGE_STORAGE_KEY); } catch { /* Accountinstelling werkt ook zonder browseropslag. */ }
    const initial = initialInvoiceMessageTemplate(accountTemplate, legacy);
    setTemplate(initial.template);
    setTemplateSource(initial.source);
    setMessage(resolveInvoiceMessage(initial.template, context));
    setPhone(pdfData?.klant.telefoon || '');
    setShareNotice('');
    setShareFailed(false);
    initialized.current = key;
  }, [open, accountReady, accountTemplate, context, invoiceId, pdfData?.klant.telefoon, user?.uid]);

  const changeTemplate = (value: string): void => {
    setTemplate(value);
    if (context) setMessage(resolveInvoiceMessage(value, context));
  };

  const saveTemplate = async (): Promise<void> => {
    if (!firestore || !user || !accountReady || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const cleaned = stripDocumentLinksFromMessage(template);
    try {
      await updateDoc(doc(firestore, 'users', user.uid), { 'settings.whatsappInvoiceMessage': cleaned });
      onTemplateSaved(cleaned);
      setTemplate(cleaned);
      setTemplateSource('account');
      toast({ title: 'Standaardbericht opgeslagen', description: 'Beschikbaar op je telefoon en computer.' });
    } catch {
      toast({ title: 'Opslaan mislukt', description: 'Je tekst staat nog in dit venster. Probeer opnieuw.', variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const copyMessage = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(stripDocumentLinksFromMessage(message));
      toast({ title: 'Bericht gekopieerd' });
    } catch {
      messageRef.current?.focus();
      messageRef.current?.select();
      toast({ title: 'Kopieer de geselecteerde tekst', description: 'Automatisch kopiëren is in deze browser niet beschikbaar.' });
    }
  };

  const shareInvoice = (): void => {
    if (!preparedFile || sharingRef.current) return;
    sharingRef.current = true;
    // De File is al gereed; de systeemdeelfunctie wordt direct door deze tik geopend.
    const pending = sharePreparedInvoice(navigator, preparedFile, message);
    setSharing(true);
    setShareFailed(false);
    setShareNotice('');
    void pending.then((result) => {
      if (result === 'shared') setShareNotice('Deelvenster afgerond. Controleer in WhatsApp of je de factuur hebt verstuurd.');
      if (result === 'cancelled') setShareNotice('Delen geannuleerd. De factuurstatus is niet gewijzigd.');
      if (result === 'unsupported') {
        setShareFailed(true);
        setShareNotice('Direct delen is niet beschikbaar. Download de PDF en open WhatsApp hieronder.');
      }
    }).catch(() => {
      setShareFailed(true);
      setShareNotice('Delen is niet gelukt. Probeer opnieuw of gebruik de download hieronder.');
    }).finally(() => {
      sharingRef.current = false;
      setSharing(false);
    });
  };

  const confirmSent = async (): Promise<void> => {
    if (markingRef.current) return;
    markingRef.current = true;
    setMarking(true);
    try { if (await onMarkSent()) onClose(); } finally {
      markingRef.current = false;
      setMarking(false);
    }
  };

  const whatsappUrl = invoiceWhatsAppUrl(phone, message);
  const ready = accountReady && Boolean(context);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !sharing && !marking) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Factuur delen</DialogTitle>
          <DialogDescription>{context ? `${context.clientName} · ${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(context.amount)}` : 'Factuur voorbereiden...'}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <p className="break-all text-xs text-muted-foreground">{preparedFile?.name || (context ? invoiceShareFilename(context.invoiceNumber, context.clientName) : '')}</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="invoice-share-message">Bericht</Label>
              <Button size="sm" variant="outline" onClick={copyMessage} disabled={!ready || !message.trim()}><Copy className="mr-1.5 h-3.5 w-3.5" /> Kopiëren</Button>
            </div>
            <Textarea id="invoice-share-message" ref={messageRef} rows={7} value={message} disabled={!ready || sharing} onChange={(event) => setMessage(event.target.value)} />
          </div>

          {preparationError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{preparationError}</p><Button size="sm" variant="outline" onClick={() => { setPrepared(null); setRetry((value) => value + 1); }}>Opnieuw proberen</Button></div> : !preparedFile ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> PDF voorbereiden...</p> : null}

          {(supportsShare || !preparedFile) && <Button className="w-full gap-2" variant="success" onClick={shareInvoice} disabled={!ready || !preparedFile || sharing}>
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {sharing ? 'Deelvenster geopend...' : 'Deel PDF en bericht'}
          </Button>}
          {supportsShare && <p className="text-xs text-muted-foreground">Kies WhatsApp en de klant. Neemt WhatsApp de tekst niet over? Gebruik ‘Kopiëren’.</p>}
          {shareNotice && <p role="status" className="text-sm">{shareNotice}</p>}

          <details open={Boolean(preparedFile && (!supportsShare || shareFailed))} className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm">Downloaden en WhatsApp openen</summary>
            <div className="space-y-3 pt-3">
              <Button variant="outline" className="w-full gap-2" disabled={!preparedFile || sharing} onClick={() => { if (preparedFile) downloadInvoiceFile(preparedFile); }}><Download className="h-4 w-4" /> Download PDF</Button>
              <div className="space-y-1.5"><Label htmlFor="invoice-share-phone">WhatsApp-nummer</Label><Input id="invoice-share-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+31 6 12345678" /></div>
              {whatsappUrl ? <Button asChild variant="outline" className="w-full gap-2"><a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp openen</a></Button> : <p className="text-xs text-muted-foreground">Vul een geldig WhatsApp-nummer in.</p>}
              <p className="text-xs text-muted-foreground">Voeg de gedownloade PDF zelf toe. Het bericht staat al klaar in WhatsApp.</p>
            </div>
          </details>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm">Standaardbericht aanpassen</summary>
            <div className="space-y-2 pt-3">
              {templateSource === 'browser' && <p className="text-xs text-muted-foreground">Je oude browsertekst is overgenomen. Sla deze op om hem op al je apparaten te gebruiken.</p>}
              <Label htmlFor="invoice-message-template">Standaardbericht</Label>
              <Textarea id="invoice-message-template" rows={7} value={template} disabled={!ready || saving || sharing} onChange={(event) => changeTemplate(event.target.value)} />
              <p className="text-xs leading-relaxed text-muted-foreground">{'{{naam}}, {{factuurtype}}, {{factuurnummer}}, {{bedrag}}, {{vervaldatum}}, {{bedrijfsnaam}}'}</p>
              <div className="flex flex-wrap justify-between gap-2"><Button size="sm" variant="ghost" disabled={!ready || saving || sharing} onClick={() => changeTemplate(DEFAULT_INVOICE_MESSAGE)}>Voorbeeld gebruiken</Button><Button size="sm" onClick={saveTemplate} disabled={!ready || saving || sharing}>{saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Standaard opslaan</Button></div>
            </div>
          </details>

          {canMarkSent && <Button variant="outline" className="w-full gap-2" disabled={sharing || marking} onClick={confirmSent}>{marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Ik heb de factuur verstuurd</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
