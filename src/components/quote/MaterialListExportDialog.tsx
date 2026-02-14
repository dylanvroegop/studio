'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Download, Loader2, Mail, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MaterialListExportItem,
  MaterialListExportMeta,
  buildDefaultMaterialListFileName,
  buildMaterialListEmailBody,
  buildMaterialListText,
  generateMaterialListPDF,
  sanitizeMaterialListFilename,
} from '@/lib/material-list-export';
import type { LeverancierContact } from '@/lib/types-settings';

interface MaterialListExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  items: MaterialListExportItem[];
  meta?: MaterialListExportMeta;
  suppliers: LeverancierContact[];
  defaultSupplierId?: string;
}

export function MaterialListExportDialog({
  isOpen,
  onClose,
  items,
  meta,
  suppliers,
  defaultSupplierId,
}: MaterialListExportDialogProps) {
  const { toast } = useToast();
  const [includePrices, setIncludePrices] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fileName, setFileName] = useState('');
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [isPdfBusy, setIsPdfBusy] = useState(false);

  const hasSuppliers = suppliers.length > 0;
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId],
  );

  const selectedSupplierDisplayName = useMemo(() => {
    if (!selectedSupplier) return '';
    const contactName = String(selectedSupplier.contactNaam || '').trim();
    const supplierName = String(selectedSupplier.naam || '').trim();
    return contactName || supplierName;
  }, [selectedSupplier]);

  const hasValidSelectedSupplier = !!(
    selectedSupplier
    && String(selectedSupplier.naam || '').trim()
    && String(selectedSupplier.email || '').trim()
  );

  const defaultSubject = useMemo(() => {
    const offerteNummer = String(meta?.offerteNummer || '').trim();
    const klusTitel = String(meta?.klusTitel || '').trim();
    const parts = [
      'Materiaallijst',
      offerteNummer ? `Offerte #${offerteNummer}` : '',
      klusTitel || '',
    ].filter(Boolean);
    return parts.join(' - ');
  }, [meta?.offerteNummer, meta?.klusTitel]);

  const defaultFileName = useMemo(
    () => buildDefaultMaterialListFileName(meta),
    [meta],
  );

  const generatedBody = useMemo(
    () => buildMaterialListEmailBody(items, { includePrices, meta, greetingName: selectedSupplierDisplayName }),
    [items, includePrices, meta, selectedSupplierDisplayName],
  );

  const plainListText = useMemo(
    () => buildMaterialListText(items, { includePrices, meta }),
    [items, includePrices, meta],
  );

  useEffect(() => {
    if (!isOpen) return;

    const resolvedDefaultSupplierId = defaultSupplierId && suppliers.some((supplier) => supplier.id === defaultSupplierId)
      ? defaultSupplierId
      : suppliers[0]?.id || '';
    const initialSupplier = suppliers.find((supplier) => supplier.id === resolvedDefaultSupplierId) || null;

    setIncludePrices(false);
    setSelectedSupplierId(resolvedDefaultSupplierId);
    setEmail(String(initialSupplier?.email || '').trim());
    setSubject(defaultSubject);
    setBody(buildMaterialListEmailBody(items, {
      includePrices: false,
      meta,
      greetingName: String(initialSupplier?.contactNaam || initialSupplier?.naam || '').trim(),
    }));
    setFileName(defaultFileName);
    setSubjectTouched(false);
    setBodyTouched(false);
    setEmailTouched(false);

    if (!suppliers.length) {
      toast({
        variant: 'destructive',
        title: 'Geen leverancier ingesteld',
        description: 'Stel eerst een leverancier in via Instellingen voordat je e-mail gebruikt.',
      });
    }
  }, [isOpen, defaultSupplierId, suppliers, defaultSubject, defaultFileName, items, meta, toast]);

  useEffect(() => {
    if (!isOpen) return;
    if (!subjectTouched) {
      setSubject(defaultSubject);
    }
    if (!bodyTouched) {
      setBody(generatedBody);
    }
  }, [isOpen, subjectTouched, bodyTouched, defaultSubject, generatedBody]);

  useEffect(() => {
    if (!isOpen || emailTouched) return;
    setEmail(String(selectedSupplier?.email || '').trim());
  }, [isOpen, emailTouched, selectedSupplier]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(plainListText);
      toast({
        title: 'Gekopieerd',
        description: includePrices
          ? 'Materiaallijst met prijzen staat op je klembord.'
          : 'Materiaallijst zonder prijzen staat op je klembord.',
      });
    } catch (error) {
      console.error('Kopieren mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Kopieren mislukt',
        description: 'Kon de materiaallijst niet naar je klembord kopieren.',
      });
    }
  };

  const handleOpenMail = (): void => {
    if (!hasSuppliers) {
      toast({
        variant: 'destructive',
        title: 'Geen leverancier gekozen',
        description: 'Voeg eerst een leverancier toe in Instellingen.',
      });
      return;
    }

    if (!hasValidSelectedSupplier) {
      toast({
        variant: 'destructive',
        title: 'Leverancier onvolledig',
        description: 'Vul naam en e-mailadres van de leverancier in via Instellingen.',
      });
      return;
    }

    if (!email.trim()) {
      toast({
        variant: 'destructive',
        title: 'E-mailadres ontbreekt',
        description: 'Vul een e-mailadres in om de e-mail te openen.',
      });
      return;
    }

    const encodedSubject = encodeURIComponent(subject || defaultSubject || 'Materiaallijst');
    const encodedBody = encodeURIComponent(body || generatedBody);
    const recipient = encodeURIComponent(email.trim());
    window.location.href = `mailto:${recipient}?subject=${encodedSubject}&body=${encodedBody}`;
    toast({
      title: 'E-mail geopend',
      description: 'Controleer ontvanger en inhoud in je mail-app.',
    });
  };

  const handleDownloadPdf = async (): Promise<void> => {
    if (!items.length) {
      toast({
        variant: 'destructive',
        title: 'Geen materialen',
        description: 'Er zijn nog geen materialen geselecteerd om te exporteren.',
      });
      return;
    }

    setIsPdfBusy(true);
    try {
      const blob = await generateMaterialListPDF({
        items,
        includePrices,
        meta,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = sanitizeMaterialListFilename(fileName || defaultFileName);
      link.href = url;
      link.download = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast({
        title: 'PDF gedownload',
        description: 'De materiaallijst is als PDF opgeslagen.',
      });
    } catch (error) {
      console.error('PDF genereren mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'PDF mislukt',
        description: 'Kon de materiaallijst-PDF niet maken.',
      });
    } finally {
      setIsPdfBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Materiaallijst delen</DialogTitle>
          <DialogDescription>
            Kies of je prijzen wilt tonen en deel de lijst via kopieren, e-mail of PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {!hasSuppliers && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Nog geen leverancier ingesteld</p>
                  <p className="text-destructive/90">
                    Voeg een of meerdere leveranciers toe in{' '}
                    <Link href="/instellingen" className="underline underline-offset-2 font-medium">
                      Instellingen
                    </Link>
                    . Daarna kun je hier direct kiezen.
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasSuppliers && (
            <div className="space-y-2">
              <Label htmlFor="supplier-select">Leverancier</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger id="supplier-select">
                  <SelectValue placeholder="Kies leverancier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => {
                    const supplierName = String(supplier.naam || '').trim() || 'Naam ontbreekt';
                    const contactName = String(supplier.contactNaam || '').trim();
                    const emailValue = String(supplier.email || '').trim();
                    const label = contactName
                      ? `${supplierName} - ${contactName}`
                      : supplierName;
                    return (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {emailValue ? `${label} (${emailValue})` : label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {hasSuppliers && !hasValidSelectedSupplier && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              Selecteer een leverancier met ingevulde naam en e-mailadres in Instellingen.
            </div>
          )}

          <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
            <Checkbox
              id="include-prices"
              checked={includePrices}
              onCheckedChange={(checked) => setIncludePrices(checked === true)}
            />
            <Label htmlFor="include-prices" className="cursor-pointer">
              Prijzen meenemen (excl. btw)
            </Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              disabled={!items.length}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Kopieer lijst
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenMail}
              disabled={!items.length || !hasSuppliers || !hasValidSelectedSupplier}
              className="gap-2"
            >
              <Mail className="h-4 w-4" />
              Open e-mail
            </Button>
            <Button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!items.length || isPdfBusy}
              className="gap-2"
            >
              {isPdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-file-name">PDF bestandsnaam</Label>
            <Input
              id="material-file-name"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              placeholder="Materiaallijst"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-share-email">Ontvanger e-mail</Label>
            <Input
              id="material-share-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmailTouched(true);
                setEmail(event.target.value);
              }}
              placeholder="inkoop@leverancier.nl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-share-subject">Onderwerp</Label>
            <Input
              id="material-share-subject"
              value={subject}
              onChange={(event) => {
                setSubjectTouched(true);
                setSubject(event.target.value);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-share-body">E-mailtekst</Label>
            <Textarea
              id="material-share-body"
              value={body}
              onChange={(event) => {
                setBodyTouched(true);
                setBody(event.target.value);
              }}
              className="min-h-[220px] resize-y"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Sluiten
          </Button>
          <Button
            type="button"
            onClick={handleOpenMail}
            disabled={!items.length || !hasSuppliers || !hasValidSelectedSupplier}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            E-mail openen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
