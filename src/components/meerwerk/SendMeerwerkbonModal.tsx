'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

interface SendMeerwerkbonModalProps {
  isOpen: boolean;
  onClose: () => void;
  klantEmail: string;
  klantAanhef: string;
  meerwerkbonNummer: string;
  totaalInclBtw: number;
  bedrijfsnaam: string;
  onDownloadPDF: () => Promise<void> | void;
}

export function SendMeerwerkbonModal({
  isOpen,
  onClose,
  klantEmail,
  klantAanhef,
  meerwerkbonNummer,
  totaalInclBtw,
  bedrijfsnaam,
  onDownloadPDF,
}: SendMeerwerkbonModalProps) {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(klantEmail || '');
    setSubject(`Meerwerkbon ${meerwerkbonNummer}`);

    const bedrag = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(totaalInclBtw || 0);
    setBody(
      `Beste ${klantAanhef || 'klant'},\n\n` +
      `In de bijlage vindt u meerwerkbon ${meerwerkbonNummer}.\n` +
      `Totaalbedrag: ${bedrag}\n\n` +
      `Wilt u deze meerwerkbon controleren en ondertekend retourneren?\n\n` +
      `Met vriendelijke groet,\n\n${bedrijfsnaam || ''}`
    );
  }, [isOpen, klantEmail, klantAanhef, meerwerkbonNummer, totaalInclBtw, bedrijfsnaam]);

  const handleDownloadAndOpenEmail = async () => {
    if (isSending) return;
    const trimmedEmail = email.trim();
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

    if (!emailIsValid) {
      toast({
        title: 'E-mailadres ongeldig',
        description: 'Vul een geldig e-mailadres in voordat je verstuurt.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      try {
        await Promise.resolve(onDownloadPDF());
      } catch (error) {
        console.error('Error downloading PDF before mailto:', error);
        toast({
          title: 'PDF downloaden mislukt',
          description: 'De e-mail is niet geopend. Probeer het opnieuw.',
          variant: 'destructive',
        });
        return;
      }

      const encodedSubject = encodeURIComponent(subject);
      const encodedBody = encodeURIComponent(body);
      window.location.href = `mailto:${encodeURIComponent(trimmedEmail)}?subject=${encodedSubject}&body=${encodedBody}`;

      toast({
        title: 'E-mail geopend',
        description: 'Vergeet niet de gedownloade PDF als bijlage toe te voegen.',
        duration: 5000,
      });

      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Mail className="w-5 h-5 text-emerald-400" />
            Meerwerkbon versturen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-400">Klant e-mailadres</Label>
            <Input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@voorbeeld.nl"
              className="bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject" className="text-zinc-400">Onderwerp</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body" className="text-zinc-400">E-mail bericht</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Typ hier uw bericht aan de klant..."
              className="min-h-[150px] bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="success"
            onClick={handleDownloadAndOpenEmail}
            disabled={isSending}
            className="w-full py-6 rounded-xl flex items-center justify-center gap-2"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <div className="flex flex-col items-start leading-tight">
              <span>{isSending ? 'PDF downloaden...' : 'Download PDF en open e-mail'}</span>
              <span className="text-[10px] opacity-80 font-normal">Voeg de PDF handmatig toe in je mail-app</span>
            </div>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
