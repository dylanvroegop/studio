'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ArrowLeft, FileText, Loader2, Mic, MicOff, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DashboardHeader } from '@/components/DashboardHeader';
import { useFirestore, useUser } from '@/firebase';
import { cn } from '@/lib/utils';
import {
  exportMaterialListPdf,
  parseMessyMaterialQuickAdd,
  type MaterialList,
  type MaterialListItem,
  type ParsedMaterialLine,
} from '@/lib/material-lists';

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getErrorMessage(err: unknown, fallback: string): string {
  const record = getRecord(err);
  return `${typeof record.code === 'string' ? record.code : 'error'}: ${typeof record.message === 'string' ? record.message : fallback}`;
}

function emptyItem(materialListId: string, sortOrder: number): Omit<MaterialListItem, 'id' | 'created_at'> {
  return {
    material_list_id: materialListId,
    product_name: '',
    quantity: 1,
    unit: 'st',
    supplier: '',
    category: '',
    checked: false,
    notes: '',
    sort_order: sortOrder,
  };
}

const MIN_VISIBLE_ROWS = 20;

function isEmptyMaterialItem(item: MaterialListItem): boolean {
  return !item.product_name.trim()
    && !item.supplier.trim()
    && !item.category.trim()
    && !item.notes.trim()
    && !item.checked;
}

function countFilledItems(rows: MaterialListItem[]): number {
  return rows.filter((row) => !isEmptyMaterialItem(row)).length;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionErrorLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

function getSpeechErrorMessage(event: SpeechRecognitionErrorLike): string {
  const detail = event.error ? ` (${event.error})` : '';

  switch (event.error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return `Microfoon of spraakherkenning is geblokkeerd. Sta microfoontoegang toe in de browser${detail}.`;
    case 'audio-capture':
      return `Geen werkende microfoon gevonden. Controleer je Mac/browser microfooninstellingen${detail}.`;
    case 'network':
      return `Spraakherkenning heeft internet nodig en kan nu geen verbinding maken${detail}.`;
    case 'no-speech':
      return `Ik hoorde geen spraak. Probeer opnieuw en spreek iets dichter bij de microfoon${detail}.`;
    case 'aborted':
      return `Spraakherkenning is gestopt${detail}.`;
    default:
      return `Spraakherkenning kon niet luisteren${detail}.`;
  }
}

export default function MateriaallijstDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [list, setList] = useState<MaterialList | null>(null);
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  const [quickAddSource, setQuickAddSource] = useState<'ai' | 'fallback' | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseTextRef = useRef('');
  const speechFinalTextRef = useRef('');
  const speechLatestTextRef = useRef('');
  const speechHadResultRef = useRef(false);
  const ensuringRowsRef = useRef(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!user || !firestore || !id) return;
    setLoading(true);
    const listRef = doc(firestore, 'material_lists', id);
    const unsubList = onSnapshot(
      listRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError('Materiaallijst niet gevonden.');
          setList(null);
          setLoading(false);
          return;
        }
        const data = snapshot.data() as Record<string, unknown>;
        if (data.userId !== user.uid) {
          setError('Geen toegang tot deze materiaallijst.');
          setList(null);
          setLoading(false);
          return;
        }
        setList({ ...(data as unknown as MaterialList), id: snapshot.id });
        setLoading(false);
      },
      (err: unknown) => {
        setError(getErrorMessage(err, 'Materiaallijst kon niet geladen worden.'));
        setLoading(false);
      }
    );

    const unsubItems = onSnapshot(
      query(collection(firestore, 'material_list_items'), where('material_list_id', '==', id)),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => ({ ...(docSnap.data() as MaterialListItem), id: docSnap.id }));
        rows.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
        setItems(rows);
      },
      (err: unknown) => setError(getErrorMessage(err, 'Regels konden niet geladen worden.'))
    );

    return () => {
      unsubList();
      unsubItems();
    };
  }, [firestore, id, user]);

  useEffect(() => {
    if (!firestore || !list || ensuringRowsRef.current) return;
    if (items.length >= MIN_VISIBLE_ROWS) return;

    ensuringRowsRef.current = true;
    const missingRows = MIN_VISIBLE_ROWS - items.length;
    const maxSortOrder = items.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), -1);
    const batch = writeBatch(firestore);
    for (let index = 0; index < missingRows; index += 1) {
      const itemRef = doc(collection(firestore, 'material_list_items'));
      batch.set(itemRef, {
        ...emptyItem(list.id, maxSortOrder + index + 1),
        created_at: serverTimestamp(),
      });
    }
    batch.commit()
      .then(() => updateDoc(doc(firestore, 'material_lists', list.id), {
        item_count: countFilledItems(items),
        updated_at: serverTimestamp(),
      }))
      .catch((err: unknown) => setError(getErrorMessage(err, 'Lege regels konden niet worden klaargezet.')))
      .finally(() => {
        ensuringRowsRef.current = false;
      });
  }, [firestore, items, list]);

  async function touchList(extra: Record<string, unknown> = {}): Promise<void> {
    if (!firestore || !id) return;
    await updateDoc(doc(firestore, 'material_lists', id), {
      ...extra,
      updated_at: serverTimestamp(),
    });
  }

  async function parseQuickAddWithAi(input: string): Promise<{ items: ParsedMaterialLine[]; source: 'ai' | 'fallback' }> {
    if (!user) return { items: parseMessyMaterialQuickAdd(input), source: 'fallback' };
    const token = await user.getIdToken();
    const response = await fetch('/api/material-lists/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ input }),
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      source?: 'ai' | 'fallback';
      items?: ParsedMaterialLine[];
      message?: string;
    } | null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
      throw new Error(payload?.message || 'AI parser kon de tekst niet lezen.');
    }
    return {
      items: payload.items,
      source: payload.source === 'ai' ? 'ai' : 'fallback',
    };
  }

  async function applyParsedItemsToRows(parsedItems: ParsedMaterialLine[], source: 'ai' | 'fallback'): Promise<void> {
    if (!firestore || !list) return;
    const materialItems = parsedItems.filter((item) => item.product_name.trim());
    if (materialItems.length === 0) return;

    const emptyRows = items.filter(isEmptyMaterialItem);
    const filledCount = countFilledItems(items);
    const writes = materialItems.map((item, index) => {
      const existingRow = emptyRows[index];
      const payload = {
        quantity: item.quantity,
        unit: item.unit || 'st',
        product_name: item.product_name,
        supplier: item.supplier || '',
        category: item.category || '',
        notes: item.notes || '',
        checked: false,
      };

      if (existingRow) {
        return updateDoc(doc(firestore, 'material_list_items', existingRow.id), payload);
      }

      return addDoc(collection(firestore, 'material_list_items'), {
        ...emptyItem(list.id, items.length + index),
        ...payload,
        sort_order: items.length + index,
        created_at: serverTimestamp(),
      });
    });

    await Promise.all(writes);
    await touchList({ item_count: filledCount + materialItems.length });
    setQuickAddSource(source);
    setQuickAdd('');
  }

  async function addItemFromQuickAdd(inputOverride?: string): Promise<void> {
    if (!firestore || !list || savingQuickAdd) return;
    const input = (inputOverride ?? quickAdd).trim();
    if (!input) return;
    setSavingQuickAdd(true);
    setQuickAddSource(null);
    try {
      const parsed = await parseQuickAddWithAi(input);
      await applyParsedItemsToRows(parsed.items, parsed.source);
    } catch (err: unknown) {
      const fallbackItems = parseMessyMaterialQuickAdd(input).filter((item) => item.product_name.trim());
      if (fallbackItems.length > 0) {
        await applyParsedItemsToRows(fallbackItems, 'fallback');
      } else {
        setError(getErrorMessage(err, 'Regel kon niet worden toegevoegd.'));
      }
    } finally {
      setSavingQuickAdd(false);
    }
  }

  function stopListening(): void {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function startListening(): void {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setSpeechError('Spraakinvoer wordt niet ondersteund in deze browser.');
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    setSpeechError(null);
    setQuickAddSource(null);
    speechBaseTextRef.current = quickAdd.trim();
    speechFinalTextRef.current = '';
    speechLatestTextRef.current = quickAdd.trim();
    speechHadResultRef.current = false;

    const recognition = new Recognition();
    recognition.lang = 'nl-NL';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() || '';
        if (!transcript) continue;
        speechHadResultRef.current = true;
        if (result.isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += `${transcript} `;
        }
      }

      if (finalText.trim()) {
        speechFinalTextRef.current = `${speechFinalTextRef.current} ${finalText}`.trim();
      }

      const combined = [
        speechBaseTextRef.current,
        speechFinalTextRef.current,
        interimText.trim(),
      ].filter(Boolean).join(' ');
      speechLatestTextRef.current = combined;
      setQuickAdd(combined);
    };

    recognition.onerror = (event) => {
      setSpeechError(getSpeechErrorMessage(event));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const spokenText = speechLatestTextRef.current.trim();
      if (speechHadResultRef.current && spokenText) {
        void addItemFromQuickAdd(spokenText);
      }
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setSpeechError('Spraakherkenning kon niet gestart worden.');
      setIsListening(false);
    }
  }

  async function addEmptyItem(): Promise<void> {
    if (!firestore || !list) return;
    await addDoc(collection(firestore, 'material_list_items'), {
      ...emptyItem(list.id, items.length),
      created_at: serverTimestamp(),
    });
    await touchList({ item_count: items.length + 1 });
  }

  async function updateItem(
    itemId: string,
    patch: Partial<Pick<MaterialListItem, 'product_name' | 'quantity' | 'supplier' | 'category' | 'checked' | 'notes'>>
  ): Promise<void> {
    if (!firestore) return;
    await updateDoc(doc(firestore, 'material_list_items', itemId), patch);
    await touchList();
  }

  async function deleteItem(itemId: string): Promise<void> {
    if (!firestore) return;
    await deleteDoc(doc(firestore, 'material_list_items', itemId));
    await touchList({ item_count: Math.max(0, items.length - 1) });
  }

  async function exportPdf(): Promise<void> {
    if (!list || exporting) return;
    setExporting(true);
    try {
      await exportMaterialListPdf({ list, items });
    } catch (err: unknown) {
      const record = getRecord(err);
      setError(typeof record.message === 'string' ? record.message : 'PDF export mislukt.');
    } finally {
      setExporting(false);
    }
  }

  if (isUserLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="app-shell min-h-screen bg-background">
        <AppNavigation />
        <DashboardHeader user={user} title="Materiaallijst" />
        <main className="mx-auto max-w-4xl p-4">
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{error || 'Materiaallijst niet gevonden.'}</CardContent></Card>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Materiaallijst" />
      <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-14 md:px-6 print:px-0">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/materiaallijsten"><ArrowLeft className="h-4 w-4" /> Terug</Link>
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportPdf} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 print:hidden">
              {error}
            </div>
          )}

          <Card className="print:hidden">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="quick-add" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  Snel toevoegen met AI
                </Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isListening && <span className="text-emerald-300">Luisteren...</span>}
                  {quickAddSource && (
                    <span>{quickAddSource === 'ai' ? 'AI parser gebruikt' : 'Lokale parser gebruikt'}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea
                  id="quick-add"
                  value={quickAdd}
                  onChange={(event) => setQuickAdd(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void addItemFromQuickAdd();
                    }
                  }}
                  placeholder="Bijv. heb nodig 15 gipsplaten ak2 2600, 3 metalstud 50 pontmeyer en 2 zak fill finish bmn"
                  className="min-h-24 flex-1 resize-y"
                />
                <div className="flex gap-2 sm:w-52 sm:flex-col">
                  <Button
                    type="button"
                    variant={isListening ? 'destructive' : 'outline'}
                    className="h-12 flex-1 gap-2 sm:flex-none"
                    onClick={startListening}
                    disabled={!speechSupported || savingQuickAdd}
                    title={speechSupported ? 'Spreek je materiaallijst in' : 'Spraakherkenning wordt niet ondersteund'}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isListening ? 'Stop' : 'Spreek in'}
                  </Button>
                  <Button className="h-12 flex-1 gap-2 sm:flex-none" onClick={() => void addItemFromQuickAdd()} disabled={savingQuickAdd || !quickAdd.trim()}>
                    {savingQuickAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Toevoegen
                  </Button>
                </div>
              </div>
              {speechError && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {speechError}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:hidden print:hidden">
            {items.map((item) => (
              <Card key={item.id} className={cn(item.checked && 'bg-emerald-500/8')}>
                <CardContent className="flex gap-3 p-3">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) => void updateItem(item.id, { checked: checked === true })}
                    className="mt-1 h-7 w-7"
                    aria-label={`${item.product_name} afvinken`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className={cn('text-base font-semibold', item.checked && 'text-muted-foreground line-through')}>
                      {item.quantity}x {item.product_name || 'Nieuw materiaal'}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={String(item.quantity)} type="number" inputMode="decimal" onChange={(event) => void updateItem(item.id, { quantity: Number(event.target.value) || 0 })} />
                      <Input value={item.product_name} onChange={(event) => void updateItem(item.id, { product_name: event.target.value })} placeholder="Materiaal" />
                    </div>
                    <Button variant="ghost" className="h-10 px-2 text-red-300" onClick={() => void deleteItem(item.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block print:block print:border-0 print:shadow-none">
            <CardContent className="p-0">
              <div className="grid grid-cols-[54px_120px_1fr_54px] border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:grid-cols-[35px_80px_1fr]">
                <div>✓</div><div>Aantal</div><div className="px-3">Materiaal</div><div className="print:hidden" />
              </div>
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-[54px_120px_1fr_54px] items-center gap-2 border-b border-border/70 px-3 py-3 print:grid-cols-[35px_80px_1fr] print:py-4">
                  <Checkbox checked={item.checked} onCheckedChange={(checked) => void updateItem(item.id, { checked: checked === true })} className="h-6 w-6 print:h-5 print:w-5" />
                  <Input value={String(item.quantity)} type="number" onChange={(event) => void updateItem(item.id, { quantity: Number(event.target.value) || 0 })} className="h-10 print:border-0 print:px-0" />
                  <Input value={item.product_name} onChange={(event) => void updateItem(item.id, { product_name: event.target.value })} className="h-10 font-medium print:border-0 print:px-0" />
                  <Button variant="ghost" size="icon" className="print:hidden" onClick={() => void deleteItem(item.id)} aria-label="Regel verwijderen">
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button variant="outline" className="h-11 gap-2 print:hidden" onClick={addEmptyItem}>
            <Plus className="h-4 w-4" /> Lege regel toevoegen
          </Button>

        </div>
      </main>
    </div>
  );
}
