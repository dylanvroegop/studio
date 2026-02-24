'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Copy, Download, Loader2, Mail, AlertTriangle, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  MaterialListExportItem,
  MaterialListExportMeta,
  buildDefaultMaterialListFileName,
  buildMaterialListEmailBody,
  buildMaterialListRowsText,
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
    contactId?: string;
    contactNaam: string;
    email: string;
  }) => Promise<void>;
  onCreateSupplier?: (payload: {
    naam: string;
    contactNaam: string;
    email: string;
  }) => Promise<string | void>;
  savedEmailTemplate?: string;
  onSaveEmailTemplate?: (template: string) => Promise<void>;
}

const TEMPLATE_PLACEHOLDERS: Array<{ label: string; token: string }> = [
  { label: 'Aanhef', token: '{{AANHEF}}' },
  { label: 'Materiaallijst', token: '{{MATERIAALLIJST}}' },
  { label: 'Offerte nummer', token: '{{offerte_nummer}}' },
  { label: 'Klus titel', token: '{{klus_titel}}' },
  { label: 'Project klant', token: '{{project_klant}}' },
  { label: 'Datum', token: '{{datum}}' },
  { label: 'Bedrijfsnaam', token: '{{bedrijfsnaam}}' },
  { label: 'Contactnaam', token: '{{contactnaam}}' },
  { label: 'Adresregel', token: '{{adresregel}}' },
  { label: 'Postcode + plaats', token: '{{postcode_plaats}}' },
  { label: 'Telefoon', token: '{{telefoon}}' },
  { label: 'KVK nummer', token: '{{kvk_nummer}}' },
  { label: 'BTW nummer', token: '{{btw_nummer}}' },
];

const DEFAULT_TEMPLATE_EXAMPLE = [
  'Beste {{AANHEF}},',
  '',
  'Hierbij sturen we onze materiaallijst.',
  'Zou u voor onderstaande materialen uw actuele prijzen (excl. btw) en verwachte levertijd met ons kunnen delen?',
  '',
  '{{MATERIAALLIJST}}',
  '',
  'Met vriendelijke groet,',
  '{{contactnaam}}',
  '',
  '{{bedrijfsnaam}}',
  '{{adresregel}}',
  '{{postcode_plaats}}',
  '',
  'Tel.: {{telefoon}}',
  'KVK nr. {{kvk_nummer}}',
  'BTW nr.: {{btw_nummer}}',
].join('\n');

export function MaterialListExportDialog({
  isOpen,
  onClose,
  items,
  meta,
  suppliers,
  defaultSupplierId,
  onUpdateSupplierContact,
  onCreateSupplier,
  savedEmailTemplate,
  onSaveEmailTemplate,
}: MaterialListExportDialogProps) {
  const { toast } = useToast();
  const [includePrices, setIncludePrices] = useState(false);
  const [selectedSupplierOptionId, setSelectedSupplierOptionId] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContactName, setNewSupplierContactName] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [isSavingTemplateEditor, setIsSavingTemplateEditor] = useState(false);
  const [materialSelectionMode, setMaterialSelectionMode] = useState<'all' | 'custom'>('all');
  const [selectedMaterialKeys, setSelectedMaterialKeys] = useState<string[]>([]);
  const lastSavedTemplateRef = useRef('');
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasSuppliers = suppliers.length > 0;
  const supplierOptions = useMemo(() => (
    suppliers.flatMap((supplier) => {
      const supplierName = String(supplier.naam || '').trim();
      const contacts = Array.isArray(supplier.contacten) ? supplier.contacten : [];
      if (contacts.length > 0) {
        return contacts.map((contact) => ({
          optionId: `${supplier.id}::${contact.id}`,
          supplierId: supplier.id,
          contactId: contact.id,
          supplierName,
          contactName: String(contact.naam || '').trim(),
          email: String(contact.email || '').trim(),
        }));
      }
      return [{
        optionId: `${supplier.id}::primary`,
        supplierId: supplier.id,
        contactId: undefined as string | undefined,
        supplierName,
        contactName: String(supplier.contactNaam || '').trim(),
        email: String(supplier.email || '').trim(),
      }];
    })
  ), [suppliers]);
  const selectedSupplierOption = useMemo(
    () => supplierOptions.find((option) => option.optionId === selectedSupplierOptionId) || null,
    [supplierOptions, selectedSupplierOptionId],
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierOption?.supplierId) || null,
    [suppliers, selectedSupplierOption?.supplierId],
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

  const selectedMaterialKeySet = useMemo(
    () => new Set(selectedMaterialKeys),
    [selectedMaterialKeys],
  );

  const exportItems = useMemo(
    () => (materialSelectionMode === 'all'
      ? items
      : items.filter((item) => selectedMaterialKeySet.has(item.key))),
    [items, materialSelectionMode, selectedMaterialKeySet],
  );

  const hasExportItems = exportItems.length > 0;

  const generatedBody = useMemo(
    () => buildMaterialListEmailBody(exportItems, {
      includePrices,
      meta,
      greetingName: selectedSupplierDisplayName,
      emailTemplate: savedEmailTemplate,
    }),
    [exportItems, includePrices, meta, selectedSupplierDisplayName, savedEmailTemplate],
  );

  const plainListText = useMemo(
    () => buildMaterialListText(exportItems, { includePrices, meta }),
    [exportItems, includePrices, meta],
  );

  useEffect(() => {
    if (!isOpen) return;

    const defaultSupplierOptions = defaultSupplierId
      ? supplierOptions.filter((option) => option.supplierId === defaultSupplierId)
      : [];
    const initialOption = defaultSupplierOptions[0] || supplierOptions[0] || null;
    const initialSupplier = suppliers.find((supplier) => supplier.id === initialOption?.supplierId) || null;

    setIncludePrices(false);
    setSelectedSupplierOptionId(initialOption?.optionId || '');
    setEmail(String(initialOption?.email || '').trim());
    setContactName(String(initialOption?.contactName || initialSupplier?.contactNaam || '').trim());
    setNewSupplierName('');
    setNewSupplierContactName('');
    setNewSupplierEmail('');
    setMaterialSelectionMode('all');
    setSelectedMaterialKeys(items.map((item) => item.key));
    setSubject(defaultSubject);
    setBody(buildMaterialListEmailBody(items, {
      includePrices: false,
      meta,
      greetingName: String(initialOption?.contactName || initialSupplier?.contactNaam || initialSupplier?.naam || '').trim(),
      emailTemplate: savedEmailTemplate,
    }));
    setSubjectTouched(false);
    setBodyTouched(false);

    if (!suppliers.length) {
      toast({
        variant: 'destructive',
        title: 'Geen leverancier ingesteld',
        description: 'Voeg hieronder direct een leverancier toe om e-mail te gebruiken.',
      });
    }
  }, [isOpen, defaultSupplierId, supplierOptions, suppliers, defaultSubject, items, meta, toast, savedEmailTemplate]);

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
    if (!isOpen || !selectedSupplierOption) return;
    setEmail(String(selectedSupplierOption.email || '').trim());
    setContactName(String(selectedSupplierOption.contactName || '').trim());
  }, [isOpen, selectedSupplierOption]);

  useEffect(() => {
    if (!isOpen || selectedSupplierOptionId || !supplierOptions.length) return;
    const defaultOption = defaultSupplierId
      ? supplierOptions.find((option) => option.supplierId === defaultSupplierId)
      : null;
    const resolvedOptionId = defaultOption?.optionId || supplierOptions[0]?.optionId || '';
    if (resolvedOptionId) {
      setSelectedSupplierOptionId(resolvedOptionId);
    }
  }, [isOpen, selectedSupplierOptionId, supplierOptions, defaultSupplierId]);

  const handleToggleMaterial = (key: string): void => {
    setSelectedMaterialKeys((current) => (
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key]
    ));
  };

  const handleSelectAllMaterials = (): void => {
    setSelectedMaterialKeys(items.map((item) => item.key));
  };

  const handleClearMaterialSelection = (): void => {
    setSelectedMaterialKeys([]);
  };

  const getBodyTemplateFromCurrentBody = useCallback((): string => {
    const currentBody = String(body || '').replace(/\r\n/g, '\n').trim();
    if (!currentBody) return DEFAULT_TEMPLATE_EXAMPLE;

    const currentGreetingName = String(selectedSupplierDisplayName || '').trim() || 'team';
    const senderCompanyName = String(meta?.senderCompanyName || '').trim();
    const senderContactName = String(meta?.senderContactName || '').trim();
    const offerteNummer = String(meta?.offerteNummer || '').trim();
    const klusTitel = String(meta?.klusTitel || '').trim();
    const projectKlant = String(meta?.klantNaam || '').trim();
    const datum = (meta?.createdAt instanceof Date ? meta.createdAt : new Date()).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const listWithoutPrices = buildMaterialListText(exportItems, {
      includePrices: false,
      includeSource: false,
      meta,
    });
    const listWithPrices = buildMaterialListText(exportItems, {
      includePrices: true,
      includeSource: false,
      meta,
    });
    const listRowsWithoutPrices = buildMaterialListRowsText(exportItems, {
      includePrices: false,
      includeSource: false,
    });
    const listRowsWithPrices = buildMaterialListRowsText(exportItems, {
      includePrices: true,
      includeSource: false,
    });

    let template = currentBody;
    const greetingLine = `Beste ${currentGreetingName},`;
    if (template.includes(greetingLine)) {
      template = template.replace(greetingLine, 'Beste {{aanhef}},');
    }

    if (senderCompanyName) {
      template = template.replaceAll(senderCompanyName, '{{bedrijfsnaam}}');
    }
    if (senderContactName) {
      template = template.replaceAll(senderContactName, '{{contactnaam}}');
    }
    if (offerteNummer) {
      template = template.replaceAll(`Offerte: #${offerteNummer}`, '{{offerte_nummer}}');
    }
    if (klusTitel) {
      template = template.replaceAll(`Materiaallijst - ${klusTitel}`, '{{klus_titel}}');
    }
    if (projectKlant) {
      template = template.replaceAll(`Project klant: ${projectKlant}`, '{{project_klant}}');
    }
    template = template.replaceAll(`Datum: ${datum}`, '{{datum}}');

    const replaceList = (candidate: string): void => {
      if (candidate && template.includes(candidate)) {
        template = template.replace(candidate, '{{materiaallijst}}');
      }
    };

    replaceList(listWithoutPrices);
    replaceList(listWithPrices);
    replaceList(listRowsWithoutPrices);
    replaceList(listRowsWithPrices);

    if (!template.toLowerCase().includes('{{materiaallijst}}')) {
      template = `${template}\n\n{{materiaallijst}}`;
    }

    return template.trim();
  }, [body, selectedSupplierDisplayName, meta, exportItems]);

  const handleInsertTemplateToken = (token: string, start?: number, end?: number): void => {
    const safeToken = String(token || '').trim();
    if (!safeToken) return;

    const currentText = templateDraft;
    const fallbackPos = currentText.length;
    const from = typeof start === 'number' ? start : (templateTextareaRef.current?.selectionStart ?? fallbackPos);
    const to = typeof end === 'number' ? end : (templateTextareaRef.current?.selectionEnd ?? from);
    const next = `${currentText.slice(0, from)}${safeToken}${currentText.slice(to)}`;

    setTemplateDraft(next);

    const nextCursorPos = from + safeToken.length;
    requestAnimationFrame(() => {
      const el = templateTextareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCursorPos, nextCursorPos);
    });
  };

  const handleOpenTemplateEditor = (): void => {
    const baseTemplate = String(savedEmailTemplate || '').trim() || DEFAULT_TEMPLATE_EXAMPLE;
    setTemplateDraft(baseTemplate);
    setIsTemplateEditorOpen(true);
  };

  const handleSaveTemplateEditor = async (): Promise<void> => {
    if (!onSaveEmailTemplate) {
      toast({
        variant: 'destructive',
        title: 'Opslaan niet beschikbaar',
        description: 'Kon e-mailsjabloon niet opslaan.',
      });
      return;
    }

    const normalizedTemplate = String(templateDraft || '').trim();
    setIsSavingTemplateEditor(true);
    try {
      await onSaveEmailTemplate(normalizedTemplate);
      lastSavedTemplateRef.current = normalizedTemplate;
      setIsTemplateEditorOpen(false);
      setBodyTouched(false);
      setBody(buildMaterialListEmailBody(exportItems, {
        includePrices,
        meta,
        greetingName: selectedSupplierDisplayName,
        emailTemplate: normalizedTemplate,
      }));
      toast({
        title: 'Sjabloon opgeslagen',
        description: 'Je e-mailsjabloon is bijgewerkt.',
      });
    } catch (error) {
      console.error('Sjabloon opslaan mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Opslaan mislukt',
        description: 'Kon e-mailsjabloon niet opslaan. Probeer het opnieuw.',
      });
    } finally {
      setIsSavingTemplateEditor(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !bodyTouched || !onSaveEmailTemplate) return;

    const template = getBodyTemplateFromCurrentBody();
    if (!template || template === lastSavedTemplateRef.current) return;

    const timeoutId = window.setTimeout(async () => {
      try {
        await onSaveEmailTemplate(template);
        lastSavedTemplateRef.current = template;
      } catch (error) {
        console.error('E-mailtemplate live opslaan mislukt:', error);
      }
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, bodyTouched, onSaveEmailTemplate, getBodyTemplateFromCurrentBody]);

  const handleCopy = async (): Promise<void> => {
    if (!hasExportItems) {
      toast({
        variant: 'destructive',
        title: 'Geen materialen geselecteerd',
        description: 'Kies minimaal een materiaal om te kopieren.',
      });
      return;
    }

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
    if (!hasExportItems) {
      toast({
        variant: 'destructive',
        title: 'Geen materialen geselecteerd',
        description: 'Kies minimaal een materiaal om in de e-mail op te nemen.',
      });
      return;
    }

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
        contactId: selectedSupplierOption?.contactId,
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
        const firstForSupplier = supplierOptions.find((option) => option.supplierId === createdSupplierId);
        if (firstForSupplier?.optionId) {
          setSelectedSupplierOptionId(firstForSupplier.optionId);
        }
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
    if (!hasExportItems) {
      toast({
        variant: 'destructive',
        title: 'Geen materialen geselecteerd',
        description: 'Kies minimaal een materiaal om te exporteren.',
      });
      return;
    }

    setIsPdfBusy(true);
    try {
      const blob = await generateMaterialListPDF({
        items: exportItems,
        includePrices,
        meta,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = sanitizeMaterialListFilename(defaultFileName);
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
      <DialogContent className="max-w-3xl w-[95vw] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Materiaallijst delen</DialogTitle>
          <DialogDescription>
            Kies materialen, toon optioneel prijzen en deel via kopieren, e-mail of PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="space-y-5 py-2 pb-6">
            <Tabs
              value={materialSelectionMode}
              onValueChange={(value) => setMaterialSelectionMode(value === 'custom' ? 'custom' : 'all')}
              className="space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Materialen meesturen</p>
                  <p className="text-xs text-muted-foreground">
                    Bepaal direct welke materialen meegaan in e-mail, kopie en PDF.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {exportItems.length}/{items.length} geselecteerd
                </div>
              </div>

              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="all">Alles meesturen</TabsTrigger>
                <TabsTrigger value="custom">Zelf kiezen</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-0">
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                  Alle materialen worden opgenomen in de aanvraag.
                </div>
              </TabsContent>

              <TabsContent value="custom" className="mt-0">
                <div className="rounded-lg border border-border/70 p-3 space-y-3">
                  {!items.length && (
                    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Er zijn nog geen materialen om te kiezen.
                    </div>
                  )}

                  {!!items.length && (
                    <>
                      <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
                        {items.map((item, index) => {
                          const isSelected = selectedMaterialKeySet.has(item.key);
                          const amount = Number.isFinite(item.aantal) && item.aantal > 0 ? Math.round(item.aantal) : 1;
                          const unit = String(item.eenheid || '').trim() || 'stuk';

                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => handleToggleMaterial(item.key)}
                              className={cn(
                                'w-full rounded-md border px-3 py-2 text-left transition-colors',
                                isSelected
                                  ? 'border-primary/45 bg-primary/10'
                                  : 'border-border/70 bg-muted/20 hover:bg-muted/40',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium leading-snug">
                                    {index + 1}. {item.naam}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {amount} {unit}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                    isSelected
                                      ? 'border-primary/35 text-primary'
                                      : 'border-border text-muted-foreground',
                                  )}
                                >
                                  {isSelected ? 'Meesturen' : 'Overslaan'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClearMaterialSelection}
                          disabled={!selectedMaterialKeys.length}
                        >
                          Alles uit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSelectAllMaterials}
                          disabled={selectedMaterialKeys.length === items.length}
                        >
                          Alles aan
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>

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
              <Select value={selectedSupplierOptionId} onValueChange={setSelectedSupplierOptionId}>
                <SelectTrigger id="supplier-select">
                  <SelectValue placeholder="Kies leverancier" />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map((option) => {
                    const supplierName = option.supplierName || 'Naam ontbreekt';
                    const contactName = option.contactName;
                    const emailValue = option.email;
                    const label = contactName
                      ? `${supplierName} - ${contactName}`
                      : supplierName;
                    return (
                      <SelectItem key={option.optionId} value={option.optionId}>
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
              Vul ontvanger e-mail in en sla contact op.
            </div>
          )}

          {hasSuppliers && selectedSupplier && (
            <div className="rounded-lg border border-border/70 p-3 space-y-3">
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
                  <div className="flex items-center gap-2">
                    <Input
                      id="material-share-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="inkoop@leverancier.nl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleSaveSupplierContact}
                      disabled={isSavingSupplier}
                      aria-label="Contact opslaan"
                    >
                      {isSavingSupplier ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="material-share-body">E-mailtekst</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenTemplateEditor}
                className="gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                Edit sjabloon
              </Button>
            </div>
            <Textarea
              id="material-share-body"
              value={body}
              onChange={(event) => {
                setBodyTouched(true);
                setBody(event.target.value);
              }}
              className="min-h-[660px] resize-y"
            />
          </div>
        </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-10 border-t border-border/70 bg-background/95 p-2 backdrop-blur sm:p-3">
          <div className="w-full rounded-xl border border-border/70 bg-card/90 p-2 shadow-lg">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
                Sluiten
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                disabled={!hasExportItems}
                className="w-full gap-2 sm:w-auto"
              >
                <Copy className="h-4 w-4" />
                Kopieer lijst
              </Button>
              <Button
                type="button"
                onClick={handleOpenMail}
                disabled={!hasExportItems || !hasSuppliers || !hasValidSelectedSupplier}
                className="w-full gap-2 sm:w-auto"
              >
                <Mail className="h-4 w-4" />
                E-mail openen
              </Button>
              <Button
                type="button"
                onClick={handleDownloadPdf}
                disabled={!hasExportItems || isPdfBusy}
                className="w-full gap-2 sm:w-auto"
              >
                {isPdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </Button>
            </div>
          </div>
        </DialogFooter>

        <Dialog open={isTemplateEditorOpen} onOpenChange={setIsTemplateEditorOpen}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>E-mail sjabloon bewerken</DialogTitle>
              <DialogDescription>
                Sleep placeholders in de tekst of klik erop om in te voegen.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                Voorbeeld placeholders: <code>{'{{AANHEF}}'}</code>, <code>{'{{MATERIAALLIJST}}'}</code>, <code>{'{{offerte_nummer}}'}</code>, <code>{'{{datum}}'}</code>.
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                  <button
                    key={placeholder.token}
                    type="button"
                    draggable
                    onClick={() => handleInsertTemplateToken(placeholder.token)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-template-token', placeholder.token);
                      event.dataTransfer.setData('text/plain', placeholder.token);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="rounded-md border border-border/70 bg-background px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="text-xs font-medium">{placeholder.label}</div>
                    <div className="text-[11px] text-muted-foreground">{placeholder.token}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-editor-textarea">Sjabloontekst</Label>
                <Textarea
                  id="template-editor-textarea"
                  ref={templateTextareaRef}
                  value={templateDraft}
                  onChange={(event) => setTemplateDraft(event.target.value)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const token = event.dataTransfer.getData('application/x-template-token')
                      || event.dataTransfer.getData('text/plain');
                    if (!token) return;
                    handleInsertTemplateToken(token, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
                  }}
                  className="min-h-[430px] resize-y"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setIsTemplateEditorOpen(false)}>
                Annuleren
              </Button>
              <Button
                type="button"
                onClick={handleSaveTemplateEditor}
                disabled={isSavingTemplateEditor}
                className="gap-2"
              >
                {isSavingTemplateEditor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Sjabloon opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
