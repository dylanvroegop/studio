'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/quote-calculations';
import { defaultQuoteMessage, resolveQuoteMessage } from '@/lib/quote-sharing';
import { stripDocumentLinksFromMessage, whatsappPresetKey } from '@/lib/whatsapp-message-preset';
import type { QuoteSendOption } from './SendQuoteWhatsAppModal';
import { QuoteShareActions } from './QuoteShareActions';

interface ShareQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  clientName: string;
  firstName: string;
  phone: string;
  companyName: string;
  language: 'nl' | 'en';
  accountReady: boolean;
  accountTemplate?: string;
  onTemplateSaved: (template: string) => void;
  quoteSelection: { currentId: string; options: QuoteSendOption[]; loading: boolean; error: string | null };
  prepareFiles: (ids: string[]) => Promise<File[]>;
  markSent: (ids?: string[]) => Promise<void> | void;
  translate?: (source: string) => Promise<string>;
}

export function ShareQuoteDialog(props: ShareQuoteDialogProps): JSX.Element {
  const { open, onClose, clientName, firstName, companyName, language, accountReady, accountTemplate, onTemplateSaved, quoteSelection, prepareFiles, markSent } = props;
  const firestore = useFirestore();
  const { user } = useUser();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [template, setTemplate] = useState('');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [legacySource, setLegacySource] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const savingRef = useRef(false);
  const translateRef = useRef(props.translate);
  translateRef.current = props.translate;
  const initialTemplateRef = useRef(accountTemplate);
  initialTemplateRef.current = accountTemplate;
  const ids = selectedIds.filter((id) => quoteSelection.options.some((option) => option.id === id));
  const chosen = quoteSelection.options.filter((option) => ids.includes(option.id));
  const numbers = chosen.map((option) => option.number).join(', ');
  const context = { name: clientName, firstName: firstName || clientName, numbers, companyName };
  const contextKey = JSON.stringify(context);
  const blocked = !ready || quoteSelection.loading || Boolean(quoteSelection.error) || !ids.length;

  useEffect(() => {
    if (open) {
      setSelectedIds([quoteSelection.currentId]);
      setPhone(props.phone);
    }
  }, [open, quoteSelection.currentId, props.phone]);

  useEffect(() => {
    if (!open || !accountReady) { setReady(false); return; }
    let cancelled = false;
    setReady(false);
    setError('');
    void (async () => {
      const account = initialTemplateRef.current;
      let initial = account;
      let legacy = false;
      if (typeof initial !== 'string') {
        let saved: string | null = null;
        let dutch: string | null = null;
        try {
          saved = localStorage.getItem(whatsappPresetKey('whatsapp_message_preset_v1', language));
          dutch = localStorage.getItem('whatsapp_message_preset_v1');
        } catch { /* Gebruik de accountinstelling of het voorbeeld. */ }
        initial = saved?.trim() ? saved : undefined;
        if (!initial && language === 'en' && dutch?.trim()) {
          if (!translateRef.current) throw new Error('Bericht vertalen is niet beschikbaar.');
          initial = await translateRef.current(dutch);
        }
        legacy = Boolean(initial);
        initial ??= defaultQuoteMessage(language);
      }
      if (!cancelled) {
        setTemplate(stripDocumentLinksFromMessage(initial));
        setLegacySource(legacy);
        setReady(true);
      }
    })().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Bericht laden mislukt.');
    });
    return () => { cancelled = true; };
  }, [open, accountReady, language, quoteSelection.currentId, retry]);

  useEffect(() => {
    if (ready) setMessage(resolveQuoteMessage(template, JSON.parse(contextKey)));
  }, [template, contextKey, ready]);

  const saveTemplate = async (): Promise<void> => {
    if (!firestore || !user || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const cleaned = stripDocumentLinksFromMessage(template);
    try {
      await updateDoc(doc(firestore, 'users', user.uid), {
        [language === 'en' ? 'settings.whatsappQuoteMessageEn' : 'settings.whatsappQuoteMessage']: cleaned,
      });
      onTemplateSaved(cleaned);
      setTemplate(cleaned);
      setLegacySource(false);
      toast({ title: 'Standaardbericht opgeslagen', description: 'Beschikbaar op je telefoon en computer.' });
    } catch {
      toast({ title: 'Opslaan mislukt', description: 'Je tekst staat nog in dit venster. Probeer opnieuw.', variant: 'destructive' });
    } finally { savingRef.current = false; setSaving(false); }
  };

  const copyMessage = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(stripDocumentLinksFromMessage(message));
      toast({ title: 'Bericht gekopieerd' });
    } catch {
      messageRef.current?.focus();
      messageRef.current?.select();
      toast({ title: 'Kopieer de geselecteerde tekst' });
    }
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Offerte delen</DialogTitle>
        <DialogDescription>{clientName}{chosen.length && chosen.every((option) => option.price !== null) ? ` · ${formatCurrency(chosen.reduce((total, option) => total + (option.price || 0), 0))}` : ''}</DialogDescription>
      </DialogHeader>
      {quoteSelection.options.length > 1 && <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-sm">Offertes selecteren ({ids.length})</summary>
        <fieldset disabled={busy || saving} className="max-h-40 space-y-1 overflow-y-auto pt-3">
          {quoteSelection.options.map((option) => <label key={option.id} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
            <Checkbox checked={ids.includes(option.id)} onCheckedChange={(checked) => setSelectedIds((previous) => checked ? [...new Set([...previous, option.id])] : previous.filter((id) => id !== option.id))} />
            <span className="min-w-0 flex-1 truncate">{option.number} · {option.title}</span>
            <span className="shrink-0">{option.price === null ? '—' : formatCurrency(option.price)}</span>
          </label>)}
        </fieldset>
      </details>}
      {quoteSelection.loading && <p role="status" className="text-sm text-muted-foreground">Offertes laden...</p>}
      {quoteSelection.error && <p role="alert" className="text-sm text-destructive">{quoteSelection.error}</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Opnieuw proberen</Button></div>}
      <QuoteShareActions open={open} selectedIds={ids} blocked={blocked} message={stripDocumentLinksFromMessage(message)} phone={phone}
        onPhoneChange={setPhone} prepareFiles={prepareFiles} markSent={markSent} onClose={onClose} onBusyChange={setBusy}
        messageEditor={<div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="quote-share-message">Bericht</Label>
            <Button size="sm" variant="outline" onClick={() => void copyMessage()} disabled={!ready || !message.trim()}><Copy className="mr-1.5 h-3.5 w-3.5" />Kopiëren</Button>
          </div>
          <Textarea id="quote-share-message" ref={messageRef} rows={7} value={message} disabled={!ready || busy} onChange={(event) => setMessage(event.target.value)} />
        </div>}
        templateEditor={<details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-sm">Standaardbericht aanpassen</summary>
          <div className="space-y-2 pt-3">
            {legacySource && <p className="text-xs text-muted-foreground">Je oude browsertekst is overgenomen. Sla deze op om hem op al je apparaten te gebruiken.</p>}
            <Label htmlFor="quote-message-template">Standaardbericht{language === 'en' ? ' (English)' : ''}</Label>
            <Textarea id="quote-message-template" rows={7} value={template} disabled={!ready || saving || busy} onChange={(event) => setTemplate(event.target.value)} />
            <p className="text-xs text-muted-foreground">{'{{naam}}, {{voornaam}}, {{offertenummer}}, {{bedrijfsnaam}}'}</p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button size="sm" variant="ghost" disabled={!ready || saving || busy} onClick={() => setTemplate(defaultQuoteMessage(language))}>Voorbeeld gebruiken</Button>
              <Button size="sm" disabled={!ready || saving || busy} onClick={() => void saveTemplate()}>{saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Standaard opslaan</Button>
            </div>
          </div>
        </details>}
      />
    </DialogContent>
  </Dialog>;
}
