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
import { Loader2, MessageCircle, Sparkles, Download } from 'lucide-react';
import { type KlantInformatie, generateWorkSummary } from '@/lib/quote-calculations';
import { toast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { reportOperationalError } from '@/lib/report-operational-error';
import type { QuoteAttachmentOptions } from '@/components/quote/SendQuoteModal';

interface SendQuoteWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  klantInfo: KlantInformatie | null;
  offerteNummer: string;
  werkbeschrijving: any;
  onDownloadPDF: (options: QuoteAttachmentOptions) => Promise<void> | void;
  totaalInclBtw: number;
  geldigTot: string;
  bedrijfsnaam: string;
  afzenderNaam: string;
  korteTitel?: string;
  korteBeschrijving?: string;
  onMarkAsSent?: () => Promise<void> | void;
  onCreateShareableOffertePdfLink?: () => Promise<string | null>;
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

export function SendQuoteWhatsAppModal({
  isOpen,
  onClose,
  klantInfo,
  offerteNummer,
  werkbeschrijving,
  onDownloadPDF,
  totaalInclBtw,
  geldigTot,
  bedrijfsnaam,
  afzenderNaam,
  korteTitel,
  korteBeschrijving,
  onMarkAsSent,
  onCreateShareableOffertePdfLink,
}: SendQuoteWhatsAppModalProps) {
  const { user } = useUser();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const hasInitializedForOpenRef = useRef(false);
  const isLaunchingWhatsAppRef = useRef(false);
  const [attachments, setAttachments] = useState<QuoteAttachmentOptions>({
    includeOfferte: true,
    includeTekeningen: true,
    includeWerkbeschrijving: true,
  });

  useEffect(() => {
    if (!isOpen) {
      hasInitializedForOpenRef.current = false;
      isLaunchingWhatsAppRef.current = false;
      return;
    }

    if (!klantInfo || hasInitializedForOpenRef.current) return;

    hasInitializedForOpenRef.current = true;
    setPhone(klantInfo.telefoonnummer || '');
    setAttachments({
      includeOfferte: true,
      includeTekeningen: true,
      includeWerkbeschrijving: true,
    });

    const shortDesc = generateWorkSummary(werkbeschrijving, 40);
    setMessage(
      `Beste ${klantInfo.voornaam || klantInfo.bedrijfsnaam || 'klant'},\n\n` +
        `Hierbij stuur ik je offerte #${offerteNummer}${shortDesc ? ` (${shortDesc})` : ''}.\n` +
        `In de bijlage vind je de PDF.\n\n` +
        `Met vriendelijke groet,\n${afzenderNaam || bedrijfsnaam || ''}`
    );
  }, [isOpen, klantInfo, offerteNummer, werkbeschrijving, afzenderNaam, bedrijfsnaam]);

  const handleGenerateMessage = async () => {
    if (!klantInfo) return;
    if (!user) {
      toast({
        title: 'Niet ingelogd',
        description: 'Log opnieuw in en probeer daarna nogmaals.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/generate-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          klantNaam: `${klantInfo.voornaam} ${klantInfo.achternaam}`.trim(),
          klantVoornaam: klantInfo.voornaam,
          offerteNummer,
          korteTitel: korteTitel || '',
          korteBeschrijving: korteBeschrijving || '',
          totaalInclBtw,
          geldigTot,
          bedrijfsnaam,
          afzenderNaam,
        }),
      });

      if (!response.ok) {
        const apiError = await response
          .json()
          .then((payload) => {
            if (!payload || typeof payload !== 'object') return null;
            const candidate = payload as { error?: unknown; message?: unknown };
            if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
            if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
            return null;
          })
          .catch(() => null);
        throw new Error(apiError || `Generation failed (${response.status})`);
      }

      const data = await response.json();
      if (data?.body && typeof data.body === 'string') {
        setMessage(data.body);
        toast({
          title: 'Tekst gegenereerd',
          description: 'De WhatsApp-tekst is aangepast.',
        });
      } else {
        throw new Error('No valid content in response');
      }
    } catch (error) {
      console.error('Error generating WhatsApp text:', error);
      const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren van WhatsApp-tekst.';
      void reportOperationalError({
        source: 'send_quote_generate_whatsapp_text',
        title: 'Fout bij genereren',
        message,
        context: {
          offerteNummer,
        },
      });
      toast({
        title: 'Fout bij genereren',
        description: 'Kon tekst niet genereren, probeer opnieuw.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAndOpenWhatsApp = async () => {
    if (isOpening || isLaunchingWhatsAppRef.current) return;
    isLaunchingWhatsAppRef.current = true;

    const trimmedPhone = phone.trim();
    const normalizedPhone = normalizePhoneForWhatsApp(trimmedPhone);
    const selectedAttachmentCount = [attachments.includeOfferte, attachments.includeTekeningen, attachments.includeWerkbeschrijving]
      .filter(Boolean)
      .length;

    if (trimmedPhone && (normalizedPhone.length < 8 || normalizedPhone.length > 15)) {
      toast({
        title: 'Telefoonnummer ongeldig',
        description: 'Vul een geldig WhatsApp-nummer in (bijv. +31 6...).',
        variant: 'destructive',
      });
      isLaunchingWhatsAppRef.current = false;
      return;
    }

    if (selectedAttachmentCount === 0) {
      toast({
        title: 'Kies minimaal één PDF',
        description: 'Selecteer offerte, tekeningen en/of werkbeschrijving.',
        variant: 'destructive',
      });
      isLaunchingWhatsAppRef.current = false;
      return;
    }

    setIsOpening(true);
    try {
      try {
        await Promise.resolve(onDownloadPDF(attachments));
      } catch (error) {
        console.error('Error downloading PDF before WhatsApp:', error);
        toast({
          title: 'PDF downloaden mislukt',
          description: 'WhatsApp is niet geopend. Probeer het opnieuw.',
          variant: 'destructive',
        });
        return;
      }

      let shareablePdfLink: string | null = null;
      if (attachments.includeOfferte && onCreateShareableOffertePdfLink) {
        try {
          shareablePdfLink = await onCreateShareableOffertePdfLink();
        } catch (error) {
          console.error('Error creating shareable offerte PDF link:', error);
        }
      }

      if (onMarkAsSent) {
        try {
          await Promise.resolve(onMarkAsSent());
        } catch (error) {
          console.error("Error marking quote as sent from WhatsApp flow:", error);
          toast({
            title: 'Status bijwerken mislukt',
            description: "Kon offerte niet op 'Verstuurd' zetten. Probeer het opnieuw.",
            variant: 'destructive',
          });
          return;
        }
      }

      const messageWithLink = shareablePdfLink
        ? `${message.trim()}\n\nOfferte PDF link:\n${shareablePdfLink}`
        : message.trim();
      const encodedText = encodeURIComponent(messageWithLink);
      const waUrl = normalizedPhone
        ? `https://wa.me/${normalizedPhone}?text=${encodedText}`
        : `https://wa.me/?text=${encodedText}`;

      const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.href = waUrl;
      }

      toast({
        title: 'WhatsApp geopend',
        description:
          shareablePdfLink
            ? 'Bericht bevat nu ook een directe PDF-link voor de klant.'
            : selectedAttachmentCount === 1
              ? 'Vergeet niet de gedownloade PDF handmatig toe te voegen in WhatsApp.'
              : `Vergeet niet ${selectedAttachmentCount} gedownloade PDF's handmatig toe te voegen in WhatsApp.`,
        duration: 5000,
      });

      onClose();
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
            <Label className="text-zinc-400">PDF bijlagen (losse bestanden)</Label>
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-3 space-y-2">
              <label className="flex items-center justify-between gap-3 text-sm text-zinc-200 cursor-pointer">
                <span>Offerte (hoofdbestand)</span>
                <input
                  type="checkbox"
                  checked={attachments.includeOfferte}
                  onChange={(e) => setAttachments((prev) => ({ ...prev, includeOfferte: e.target.checked }))}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-zinc-200 cursor-pointer">
                <span>Tekeningen (aparte PDF)</span>
                <input
                  type="checkbox"
                  checked={attachments.includeTekeningen}
                  onChange={(e) => setAttachments((prev) => ({ ...prev, includeTekeningen: e.target.checked }))}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-zinc-200 cursor-pointer">
                <span>Werkbeschrijving (aparte PDF)</span>
                <input
                  type="checkbox"
                  checked={attachments.includeWerkbeschrijving}
                  onChange={(e) => setAttachments((prev) => ({ ...prev, includeWerkbeschrijving: e.target.checked }))}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="whatsapp-body" className="text-zinc-400">WhatsApp bericht</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateMessage}
                disabled={isGenerating || isOpening}
                className="h-7 text-xs gap-1 text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Genereren...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    Genereer tekst
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="whatsapp-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Typ hier je WhatsApp-bericht..."
              className="min-h-[150px] bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="success"
            onClick={handleDownloadAndOpenWhatsApp}
            disabled={isOpening || isGenerating}
            className="w-full py-6 rounded-xl flex items-center justify-center gap-2"
          >
            {isOpening ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <div className="flex flex-col items-start leading-tight">
              <span>{isOpening ? 'PDF(s) downloaden...' : 'Download PDF(s) en open WhatsApp'}</span>
              <span className="text-[10px] opacity-80 font-normal">Voeg de bestanden handmatig toe in WhatsApp</span>
            </div>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
