'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from 'firebase/firestore';
import { Archive, ArchiveRestore, Check, Loader2, Plus, Trash2 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import type { MaterialList, MaterialListItem } from '@/lib/material-lists';
import { cn } from '@/lib/utils';

type ListTab = 'active' | 'archived';

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getErrorMessage(err: unknown, fallback: string): string {
  const record = getRecord(err);
  return `${typeof record.code === 'string' ? record.code : 'error'}: ${typeof record.message === 'string' ? record.message : fallback}`;
}

function namedItems(items: MaterialListItem[]): MaterialListItem[] {
  return items.filter((item) => item.product_name.trim());
}

function countNamedItems(items: MaterialListItem[]): number {
  return namedItems(items).length;
}

export default function MateriaallijstDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [list, setList] = useState<MaterialList | null>(null);
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [tab, setTab] = useState<ListTab>('active');
  const [quickAdd, setQuickAdd] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (!user || !firestore || !id) return;
    setLoading(true);
    const unsubscribeList = onSnapshot(
      doc(firestore, 'material_lists', id),
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
        setError(getErrorMessage(err, 'Materiaallijst kon niet worden geladen.'));
        setLoading(false);
      }
    );
    const unsubscribeItems = onSnapshot(
      query(collection(firestore, 'material_list_items'), where('material_list_id', '==', id)),
      (snapshot) => {
        const rows = snapshot.docs.map((snapshotDoc) => ({
          ...(snapshotDoc.data() as MaterialListItem),
          id: snapshotDoc.id,
        }));
        rows.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
        setItems(rows);
      },
      (err: unknown) => setError(getErrorMessage(err, 'Materialen konden niet worden geladen.'))
    );
    return () => {
      unsubscribeList();
      unsubscribeItems();
    };
  }, [firestore, id, user]);

  const visibleItems = useMemo(
    () => namedItems(items).filter((item) => (tab === 'archived' ? item.checked : !item.checked)),
    [items, tab]
  );
  const activeCount = useMemo(() => namedItems(items).filter((item) => !item.checked).length, [items]);
  const archivedCount = useMemo(() => namedItems(items).filter((item) => item.checked).length, [items]);

  async function touchList(): Promise<void> {
    if (!firestore || !id) return;
    await updateDoc(doc(firestore, 'material_lists', id), {
      item_count: countNamedItems(items),
      updated_at: serverTimestamp(),
    });
  }

  async function addItem(inputOverride?: string): Promise<boolean> {
    if (!firestore || !id || saving) return false;
    const name = (inputOverride ?? quickAdd).trim().replace(/\s+/g, ' ');
    if (!name) return false;
    setSaving(true);
    setError(null);
    try {
      const duplicate = items.some((item) => !item.checked && item.product_name.trim().toLowerCase() === name.toLowerCase());
      if (!duplicate) {
        await addDoc(collection(firestore, 'material_list_items'), {
          material_list_id: id,
          product_name: name,
          quantity: 1,
          unit: 'st',
          supplier: '',
          category: '',
          checked: false,
          notes: '',
          sort_order: items.length,
          created_at: serverTimestamp(),
        });
        await touchList();
      }
      setQuickAdd('');
      setTab('active');
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Materiaal kon niet worden toegevoegd.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: MaterialListItem): Promise<void> {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'material_list_items', item.id), { checked: !item.checked });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Materiaal kon niet worden verplaatst.'));
    }
  }

  async function deleteItem(item: MaterialListItem): Promise<void> {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'material_list_items', item.id));
      await touchList();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Materiaal kon niet worden verwijderd.'));
    }
  }

  async function submitDialog(): Promise<void> {
    const added = await addItem();
    if (added) setIsAddDialogOpen(false);
  }

  if (isUserLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>;
  }

  if (!list) {
    return (
      <div className="app-shell min-h-screen bg-background">
        <AppNavigation />
        <DashboardHeader user={user} title="Materiaallijst" hideAccountOnMobile />
        <main className="mx-auto max-w-3xl p-4"><Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{error || 'Materiaallijst niet gevonden.'}</CardContent></Card></main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Materiaallijst" hideAccountOnMobile />
      <main className="mx-auto w-full max-w-3xl px-4 py-4 pb-24 md:px-6 md:py-5 md:pb-14">
        <div className="space-y-4 md:space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{list.title || 'Mijn materiaallijst'}</h1>
              <p className="text-sm text-muted-foreground">{tab === 'active' ? `${activeCount} te halen` : `${archivedCount} gearchiveerd`}</p>
            </div>
            <Button
              type="button"
              variant={tab === 'archived' ? 'secondary' : 'outline'}
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-3"
              onClick={() => setTab(tab === 'active' ? 'archived' : 'active')}
            >
              <Archive className="h-4 w-4" />
              {tab === 'active' ? 'Archief' : 'Te halen'}
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs">{tab === 'active' ? archivedCount : activeCount}</span>
            </Button>
          </div>

          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

          <Card className="hidden md:block">
            <CardContent className="p-3 sm:p-4">
              <div className="flex gap-2">
                <Input
                  value={quickAdd}
                  onChange={(event) => setQuickAdd(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void addItem();
                    }
                  }}
                  placeholder="Bijv. zwarte kit"
                  className="h-12 text-base"
                  aria-label="Materiaal toevoegen"
                />
                <Button className="h-12 w-12 shrink-0 px-0" onClick={() => void addItem()} disabled={saving || !quickAdd.trim()} aria-label="Materiaal toevoegen">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {visibleItems.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                {tab === 'active' ? <Check className="h-10 w-10 text-emerald-400" /> : <Archive className="h-10 w-10 text-muted-foreground" />}
                <div>
                  <p className="font-medium">{tab === 'active' ? 'Je lijst is leeg' : 'Nog niets in het archief'}</p>
                  <p className="text-sm text-muted-foreground">{tab === 'active' ? 'Voeg een materiaal toe met de + knop.' : 'Afgevinkte materialen verschijnen hier.'}</p>
                </div>
              </CardContent></Card>
            ) : visibleItems.map((item) => (
              <Card key={item.id} className={cn('transition-colors', item.checked && 'border-slate-600/70 bg-slate-500/10')}>
                <CardContent className="flex min-h-16 items-center gap-3 p-3 sm:p-4">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() => void toggleItem(item)}
                    className="h-7 w-7 shrink-0"
                    aria-label={item.checked ? `${item.product_name} terugzetten` : `${item.product_name} afvinken`}
                  />
                  <span className={cn('min-w-0 flex-1 text-base font-semibold sm:text-lg', item.checked && 'text-muted-foreground line-through')}>
                    {item.product_name}
                  </span>
                  {item.checked && <ArchiveRestore className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-300" onClick={() => void deleteItem(item)} aria-label={`${item.product_name} verwijderen`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Button
        type="button"
        size="icon"
        className="fixed bottom-6 right-5 z-40 h-14 w-14 rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-950/30 hover:bg-emerald-400 md:hidden"
        onClick={() => setIsAddDialogOpen(true)}
        aria-label="Materiaal toevoegen"
      >
        <Plus className="h-7 w-7" />
      </Button>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Materiaal toevoegen</DialogTitle>
            <DialogDescription>Voer de naam in van het materiaal dat je wilt halen.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitDialog();
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={quickAdd}
              onChange={(event) => setQuickAdd(event.target.value)}
              placeholder="Bijv. zwarte kit"
              aria-label="Materiaalnaam"
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsAddDialogOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={saving || !quickAdd.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Toevoegen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
