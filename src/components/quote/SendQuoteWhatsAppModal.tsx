'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle } from 'lucide-react';
import { type KlantInformatie } from '@/lib/quote-calculations';
import { toast } from '@/hooks/use-toast';

interface SendQuoteWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  klantInfo: KlantInformatie | null;
  clientName: string;
  quoteId?: string;
  quotePdfUrl: string;
  documentUrl?: string;
  requireDocumentUrl?: boolean;
  documentLabel?: string;
  documentLinkToken?: string;
  storageKey?: string;
  missingLinkTitle?: string;
  missingLinkDescription?: string;
  successDescription?: string;
  onDownloadOfficialPdf?: () => Promise<void> | void;
  onMarkAsSent?: () => Promise<void> | void;
}

function normalizePhoneForWhatsApp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length === 10) {
    digits = `31${digits.slice(1)}`;
  }

  return digits;
}

function buildWhatsAppUrl(phone: string, message: string, useWebApp: boolean): string {
  const normalizedPhone = normalizePhoneForWhatsApp(phone);
  const encodedMessage = encodeURIComponent(message);
  return useWebApp
    ? `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedMessage}`
    : `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
}

const FIRST_NAME_TOKEN = '{{voornaam}}';
const QUOTE_URL_TOKEN = '{{offerte_link}}';
const WHATSAPP_PRESET_STORAGE_KEY = 'whatsapp_message_preset_v1';

export function SendQuoteWhatsAppModal({
  isOpen,
  onClose,
  klantInfo,
  clientName,
  quoteId,
  quotePdfUrl,
  documentUrl,
  requireDocumentUrl = true,
  documentLabel = 'offerte',
  documentLinkToken = QUOTE_URL_TOKEN,
  storageKey = WHATSAPP_PRESET_STORAGE_KEY,
  missingLinkTitle = 'Geen offertelink beschikbaar',
  missingLinkDescription = 'Er kon geen actuele link voor deze offerte worden opgebouwd.',
  successDescription = 'De officiële PDF is gedownload. Voeg deze handmatig toe in WhatsApp en verstuur.',
  onDownloadOfficialPdf,
  onMarkAsSent,
}: SendQuoteWhatsAppModalProps) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(''); // editable after prefill
  const [manualFirstName, setManualFirstName] = useState('');
  const [quoteUrl, setQuoteUrl] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasInitializedForOpenRef = useRef(false);
  const isLaunchingWhatsAppRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasInitializedForOpenRef.current = false;
      isLaunchingWhatsAppRef.current = false;
      return;
    }

    if (!klantInfo || hasInitializedForOpenRef.current) return;

    hasInitializedForOpenRef.current = true;
    setPhone(klantInfo.telefoonnummer || '');
    const trimmedProvidedUrl = (quotePdfUrl || '').trim();
    const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const origin = isLocalhost ? 'https://app.calvora.nl' : (typeof window !== 'undefined' ? window.location.origin : 'https://app.calvora.nl');
    const fallbackUrl = quoteId ? `${origin}/view/${quoteId}` : '';
    // A persisted PDF URL can point to an older generated document. Prefer the
    // live quote route so WhatsApp never shares a stale PDF alongside the current one.
    const resolvedQuoteUrl = documentUrl?.trim() || fallbackUrl || trimmedProvidedUrl;
    setQuoteUrl(resolvedQuoteUrl);

    const guessedFirstName = String(
      klantInfo.voornaam || clientName.split(' ').filter(Boolean)[0] || 'klant'
    ).trim();
    setManualFirstName(guessedFirstName);

    try {
      const savedPreset = localStorage.getItem(storageKey) || '';
      setMessage(savedPreset);
    } catch {
      setMessage('');
    }
  }, [isOpen, klantInfo, clientName, quotePdfUrl, quoteId, documentUrl, storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      localStorage.setItem(storageKey, message);
    } catch {
      // Ignore storage failures and keep editing behavior intact.
    }
  }, [isOpen, message, storageKey]);

  const handleSendViaWhatsApp = async () => {
    if (isOpening || isLaunchingWhatsAppRef.current) return;
    isLaunchingWhatsAppRef.current = true;

    const trimmedPhone = phone.trim();
    const normalizedPhone = normalizePhoneForWhatsApp(trimmedPhone);
    const trimmedQuoteUrl = quoteUrl.trim();

    if (!trimmedPhone || normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      toast({
        title: 'Telefoonnummer ongeldig',
        description: 'Vul een geldig WhatsApp-nummer in (bijv. +31 6...).',
        variant: 'destructive',
      });
      isLaunchingWhatsAppRef.current = false;
      return;
    }

    if (requireDocumentUrl && !trimmedQuoteUrl) {
      toast({
        title: missingLinkTitle,
        description: missingLinkDescription,
        variant: 'destructive',
      });
      isLaunchingWhatsAppRef.current = false;
      return;
    }

    setIsOpening(true);
    const popup = window.open('about:blank', '_blank');
    try {
      const template = message.trim();
      if (!template) {
        toast({
          title: 'Geen bericht ingevuld',
          description: 'Vul eerst je eigen berichtpreset in.',
          variant: 'destructive',
        });
        return;
      }

      const nameValue = manualFirstName.trim() || 'klant';
      const outgoingMessage = template
        .replaceAll(FIRST_NAME_TOKEN, nameValue)
        .replaceAll(documentLinkToken, trimmedQuoteUrl)
        .replaceAll(QUOTE_URL_TOKEN, trimmedQuoteUrl);

      if (onDownloadOfficialPdf) {
        await Promise.resolve(onDownloadOfficialPdf());
      }

      if (onMarkAsSent) {
        try {
          await Promise.resolve(onMarkAsSent());
        } catch (error) {
          console.error('Error marking quote as sent:', error);
          toast({
            title: 'Status bijwerken mislukt',
            description: "Kon offerte niet op 'Verzonden' zetten. Probeer het opnieuw.",
            variant: 'destructive',
          });
          return;
        }
      }

      const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const waUrl = buildWhatsAppUrl(normalizedPhone, outgoingMessage, !isMobileDevice);
      if (popup && !popup.closed) {
        popup.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank');
      }

      toast({
        title: 'WhatsApp geopend',
        description: successDescription,
        duration: 5000,
      });

      onClose();
    } catch (error) {
      if (popup && !popup.closed) {
        popup.close();
      }
      console.error('Error sending WhatsApp quote:', error);
      const message = error instanceof Error ? error.message : 'Kon niet versturen via WhatsApp.';
      toast({
        title: 'Versturen mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsOpening(false);
      isLaunchingWhatsAppRef.current = false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            Versturen via WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp-phone" className="text-zinc-400">Klant WhatsApp nummer</Label>
            <Input
              id="whatsapp-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Bijv. +31 6 12345678"
              className="bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp-first-name" className="text-zinc-400">Voornaam in bericht</Label>
            <Input
              id="whatsapp-first-name"
              value={manualFirstName}
              onChange={(event) => setManualFirstName(event.target.value)}
              placeholder="Bijv. Sjoerd"
              className="bg-zinc-800 border-zinc-700 text-zinc-200"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-zinc-400">WhatsApp bericht</Label>
              <div
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', FIRST_NAME_TOKEN);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 active:cursor-grabbing"
                title="Sleep {{voornaam}} naar het bericht"
              >
                Sleep token: {FIRST_NAME_TOKEN}
              </div>
              <div
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', documentLinkToken);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 active:cursor-grabbing"
                title={`Sleep ${documentLinkToken} naar het bericht`}
              >
                Sleep token: {documentLinkToken}
              </div>
            </div>
            <Textarea
              ref={messageTextareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.getData('text/plain');
                if (dropped !== FIRST_NAME_TOKEN && dropped !== documentLinkToken) return;
                const textarea = messageTextareaRef.current;
                if (!textarea) {
                  setMessage((prev) => `${prev}${prev ? ' ' : ''}${dropped}`);
                  return;
                }
                const start = textarea.selectionStart ?? message.length;
                const end = textarea.selectionEnd ?? message.length;
                const next = `${message.slice(0, start)}${dropped}${message.slice(end)}`;
                setMessage(next);
                requestAnimationFrame(() => {
                  textarea.focus();
                  const caret = start + dropped.length;
                  textarea.setSelectionRange(caret, caret);
                });
              }}
              placeholder="Typ je eigen berichtpreset. Dit wordt automatisch bewaard."
              className="min-h-[120px] bg-zinc-800 border-zinc-700 text-zinc-200"
            />
            <p className="text-xs text-zinc-500">
              Dit bericht is jouw {documentLabel}-preset en wordt automatisch opgeslagen. Gebruik tokens om naam/link overal te plaatsen.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="success"
            onClick={handleSendViaWhatsApp}
            disabled={isOpening || !normalizePhoneForWhatsApp(phone) || (requireDocumentUrl && !quoteUrl.trim())}
            className="w-full py-6 rounded-xl flex items-center justify-center gap-2"
          >
            {isOpening ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
            <div className="flex flex-col items-start leading-tight">
              <span>{isOpening ? 'WhatsApp openen...' : 'Verstuur via WhatsApp'}</span>
              <span className="text-[10px] opacity-80 font-normal">Download officiële PDF + open WhatsApp (handmatig bijvoegen)</span>
            </div>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
