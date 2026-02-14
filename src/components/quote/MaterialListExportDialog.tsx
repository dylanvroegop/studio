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
  onUpdateSupplierContact?: (payload: {
    supplierId: string;
    contactNaam: string;
    email: string;
  }) => Promise<void>;
  onCreateSupplier?: (payload: {
    naam: string;
    contactNaam: string;
    email: string;
  }) => Promise<string | void>;
}

export function MaterialListExportDialog({
  isOpen,
  onClose,
  items,
  meta,
  suppliers,
  defaultSupplierId,
  onUpdateSupplierContact,
  onCreateSupplier,
}: MaterialListExportDialogProps) {
  const { toast } = useToast();
  const [includePrices, setIncludePrices] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContactName, setNewSupplierContactName] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fileName, setFileName] = useState('');
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const hasSuppliers = suppliers.length > 0;
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId],
  );

  const selectedSupplierDisplayName = useMemo(() => {
    if (!selectedSupplier) return '';
    const inlineContactName = String(contactName || '').trim();
    if (inlineContactName) return inlineContactName;
    const defaultContactName = String(selectedSupplier.contactNaam || '').trim();
    const supplierName = String(selectedSupplier.naam || '').trim();
    return defaultContactName || supplierName;
  }, [selectedSupplier, contactName]);

  const hasValidSelectedSupplier = !!(
    selectedSupplier
    && String(selectedSupplier.naam || '').trim()
    && String(email || '').trim()
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
    setContactName(String(initialSupplier?.contactNaam || '').trim());
    setNewSupplierName('');
    setNewSupplierContactName('');
    setNewSupplierEmail('');
    setSubject(defaultSubject);
    setBody(buildMaterialListEmailBody(items, {
      includePrices: false,
      meta,
      greetingName: String(initialSupplier?.contactNaam || initialSupplier?.naam || '').trim(),
    }));
    setFileName(defaultFileName);
    setSubjectTouched(false);
    setBodyTouched(false);

    if (!suppliers.length) {
      toast({
        variant: 'destructive',
        title: 'Geen leverancier ingesteld',
        description: 'Voeg hieronder direct een leverancier toe om e-mail te gebruiken.',
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
    if (!isOpen || !selectedSupplier) return;
    setEmail(String(selectedSupplier.email || '').trim());
    setContactName(String(selectedSupplier.contactNaam || '').trim());
  }, [isOpen, selectedSupplier]);

  useEffect(() => {
    if (!isOpen || selectedSupplierId || !suppliers.length) return;
    const resolvedDefaultSupplierId = defaultSupplierId && suppliers.some((supplier) => supplier.id === defaultSupplierId)
      ? defaultSupplierId
      : suppliers[0]?.id || '';
    if (resolvedDefaultSupplierId) {
      setSelectedSupplierId(resolvedDefaultSupplierId);
    }
  }, [isOpen, selectedSupplierId, suppliers, defaultSupplierId]);

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
        description: 'Voeg eerst een leverancier toe in deze popup.',
      });
      return;
    }

    if (!hasValidSelectedSupplier) {
      toast({
        variant: 'destructive',
        title: 'Leverancier onvolledig',
        description: 'Vul leverancier en ontvanger e-mail in en sla op in deze popup.',
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

  const handleSaveSupplierContact = async (): Promise<void> => {
    if (!selectedSupplier) {
      toast({
        variant: 'destructive',
        title: 'Geen leverancier gekozen',
        description: 'Kies eerst een leverancier.',
      });
      return;
    }
    if (!onUpdateSupplierContact) {
      toast({
        variant: 'destructive',
        title: 'Opslaan niet beschikbaar',
        description: 'Kon leveranciersinstellingen hier niet bijwerken.',
      });
      return;
    }

    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail) {
      toast({
        variant: 'destructive',
        title: 'E-mailadres ontbreekt',
        description: 'Vul een ontvanger e-mailadres in.',
      });
      return;
    }

    setIsSavingSupplier(true);
    try {
      await onUpdateSupplierContact({
        supplierId: selectedSupplier.id,
        contactNaam: String(contactName || '').trim(),
        email: trimmedEmail,
      });
      toast({
        title: 'Leverancier bijgewerkt',
        description: 'Contactpersoon en e-mailadres zijn opgeslagen.',
      });
    } catch (error) {
      console.error('Leverancier opslaan mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Opslaan mislukt',
        description: 'Kon leverancier niet opslaan. Probeer het opnieuw.',
      });
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleCreateSupplier = async (): Promise<void> => {
    if (!onCreateSupplier) {
      toast({
        variant: 'destructive',
        title: 'Toevoegen niet beschikbaar',
        description: 'Kon leverancier hier niet toevoegen.',
      });
      return;
    }

    const trimmedName = String(newSupplierName || '').trim();
    const trimmedEmail = String(newSupplierEmail || '').trim();

    if (!trimmedName) {
      toast({
        variant: 'destructive',
        title: 'Naam ontbreekt',
        description: 'Vul een leveranciersnaam in.',
      });
      return;
    }

    if (!trimmedEmail) {
      toast({
        variant: 'destructive',
        title: 'E-mailadres ontbreekt',
        description: 'Vul een ontvanger e-mailadres in.',
      });
      return;
    }

    setIsSavingSupplier(true);
    try {
      const createdSupplierId = await onCreateSupplier({
        naam: trimmedName,
        contactNaam: String(newSupplierContactName || '').trim(),
        email: trimmedEmail,
      });

      setNewSupplierName('');
      setNewSupplierContactName('');
      setNewSupplierEmail('');
      if (createdSupplierId) {
        setSelectedSupplierId(createdSupplierId);
      }

      toast({
        title: 'Leverancier toegevoegd',
        description: 'Je kunt nu direct e-mailen vanuit deze popup.',
      });
    } catch (error) {
      console.error('Leverancier toevoegen mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Toevoegen mislukt',
        description: 'Kon leverancier niet toevoegen. Probeer het opnieuw.',
      });
    } finally {
      setIsSavingSupplier(false);
    }
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
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-3">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Nog geen leverancier ingesteld</p>
                  <p className="text-destructive/90">
                    Voeg hieronder direct je eerste leverancier toe.
                  </p>
                  <p className="text-destructive/80">
                    Of beheer later alles in{' '}
                    <Link href="/instellingen" className="underline underline-offset-2 font-medium">
                      Instellingen
                    </Link>
                    .
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-name">Leverancier</Label>
                  <Input
                    id="new-supplier-name"
                    value={newSupplierName}
                    onChange={(event) => setNewSupplierName(event.target.value)}
                    placeholder="Bijv. Bouwmaat"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-contact">Contactpersoon</Label>
                  <Input
                    id="new-supplier-contact"
                    value={newSupplierContactName}
                    onChange={(event) => setNewSupplierContactName(event.target.value)}
                    placeholder="Bijv. J. Jansen"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-email">Ontvanger e-mail</Label>
                  <Input
                    id="new-supplier-email"
                    type="email"
                    value={newSupplierEmail}
                    onChange={(event) => setNewSupplierEmail(event.target.value)}
                    placeholder="inkoop@leverancier.nl"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handleCreateSupplier} disabled={isSavingSupplier}>
                  {isSavingSupplier ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Leverancier toevoegen
                </Button>
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
              Vul ontvanger e-mail in en klik op &quot;Contact opslaan&quot;.
            </div>
          )}

          {hasSuppliers && selectedSupplier && (
            <div className="rounded-lg border border-border/70 p-3 space-y-3">
              <div className="text-xs text-muted-foreground">
                Wijzig contactpersoon en e-mail direct voor <span className="font-medium">{selectedSupplier.naam || 'deze leverancier'}</span>.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="material-share-contact-name">Contactpersoon</Label>
                  <Input
                    id="material-share-contact-name"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Bijv. J. Jansen"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="material-share-email">
                    Ontvanger e-mail (contact: {String(contactName || '').trim() || 'niet ingevuld'})
                  </Label>
                  <Input
                    id="material-share-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="inkoop@leverancier.nl"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveSupplierContact}
                  disabled={isSavingSupplier}
                >
                  {isSavingSupplier ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Contact opslaan
                </Button>
              </div>
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
