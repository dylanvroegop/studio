'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Edit2, Loader2, Plus, Save, StickyNote, Trash2, UserRound, X } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cleanFirestoreData } from '@/lib/clean-firestore';
import { cn } from '@/lib/utils';

type NoteDocument = {
  id: string;
  userId: string;
  quoteId?: string | null;
  jobId?: string | null;
  content: string;
  tags?: string[];
  context?: string;
  isResolved?: boolean;
  clientId?: string | null;
  clientNaam?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type ClientDocument = {
  id: string;
  userId?: string;
  voornaam?: string;
  achternaam?: string;
  bedrijfsnaam?: string;
  createdAt?: unknown;
};

const NO_CLIENT_VALUE = '__NO_CLIENT__';
const ALL_CLIENTS_VALUE = '__ALL_CLIENTS__';

const NOTE_TAGS = [
  { label: 'Let op', value: 'warning', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { label: 'Aanname', value: 'assumption', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { label: 'Klant zegt', value: 'client_request', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  { label: 'Later checken', value: 'follow_up', color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  { label: 'Prijsgevoelig', value: 'budget', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { label: 'Beslis nog', value: 'decision', color: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
] as const;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'object' && value !== null) {
    const withToDate = value as { toDate?: () => Date; seconds?: number };
    if (typeof withToDate.toDate === 'function') {
      try {
        return withToDate.toDate();
      } catch {
        return null;
      }
    }
    if (typeof withToDate.seconds === 'number') {
      return new Date(withToDate.seconds * 1000);
    }
  }

  return null;
}

function formatDate(value: unknown): string {
  const date = toDate(value);
  if (!date) return 'Zonder datum';

  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getClientName(client: ClientDocument): string {
  const bedrijfsnaam = (client.bedrijfsnaam || '').trim();
  if (bedrijfsnaam) return bedrijfsnaam;
  const fullName = `${client.voornaam || ''} ${client.achternaam || ''}`.trim();
  if (fullName) return fullName;
  return 'Onbekende klant';
}

function PageSkeleton() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Notities" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function NotitiesPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [clients, setClients] = useState<ClientDocument[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);

  const [newNoteContent, setNewNoteContent] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newClientValue, setNewClientValue] = useState(NO_CLIENT_VALUE);
  const [isSaving, setIsSaving] = useState(false);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editClientValue, setEditClientValue] = useState(NO_CLIENT_VALUE);

  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState(NO_CLIENT_VALUE);
  const [hasInitializedClientScope, setHasInitializedClientScope] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    let cancelled = false;
    setClientsLoading(true);

    const fetchClients = async () => {
      try {
        try {
          const clientsQuery = query(
            collection(firestore, 'clients'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          );
          const snap = await getDocs(clientsQuery);
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClientDocument, 'id'>),
          }));
          if (!cancelled) setClients(list);
        } catch (error) {
          console.warn('Client sortering met index niet beschikbaar, fallback op handmatige sortering.', error);
          const fallbackQuery = query(collection(firestore, 'clients'), where('userId', '==', user.uid));
          const snap = await getDocs(fallbackQuery);
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClientDocument, 'id'>),
          }));
          list.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
          if (!cancelled) setClients(list);
        }
      } catch (error) {
        console.error('Kon klanten niet laden voor notitiespagina:', error);
        if (!cancelled) {
          setClients([]);
          toast({
            variant: 'destructive',
            title: 'Fout',
            description: 'Kon klanten niet laden.',
          });
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    };

    void fetchClients();

    return () => {
      cancelled = true;
    };
  }, [firestore, toast, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    let cancelled = false;
    setNotesLoading(true);

    const fetchNotes = async () => {
      try {
        try {
          const notesQuery = query(
            collection(firestore, 'notes'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          );
          const snap = await getDocs(notesQuery);
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NoteDocument, 'id'>),
          }));
          if (!cancelled) setNotes(list);
        } catch (error) {
          console.warn('Notitie sortering met index niet beschikbaar, fallback op handmatige sortering.', error);
          const fallbackQuery = query(collection(firestore, 'notes'), where('userId', '==', user.uid));
          const snap = await getDocs(fallbackQuery);
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NoteDocument, 'id'>),
          }));
          list.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
          if (!cancelled) setNotes(list);
        }
      } catch (error) {
        console.error('Kon notities niet laden:', error);
        if (!cancelled) {
          setNotes([]);
          toast({
            variant: 'destructive',
            title: 'Fout',
            description: 'Kon notities niet laden.',
          });
        }
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    };

    void fetchNotes();

    return () => {
      cancelled = true;
    };
  }, [firestore, toast, user]);

  const clientsById = useMemo(() => {
    return new Map(clients.map((client) => [client.id, client]));
  }, [clients]);

  useEffect(() => {
    if (clientsLoading || hasInitializedClientScope) return;

    const defaultClientValue = clients.length > 0 ? clients[0].id : NO_CLIENT_VALUE;
    setNewClientValue(defaultClientValue);
    setClientFilter(defaultClientValue);
    setHasInitializedClientScope(true);
  }, [clients, clientsLoading, hasInitializedClientScope]);

  const filteredNotes = useMemo(() => {
    if (clientFilter === ALL_CLIENTS_VALUE) return notes;
    if (clientFilter === NO_CLIENT_VALUE) return notes.filter((note) => !note.clientId);
    return notes.filter((note) => note.clientId === clientFilter);
  }, [clientFilter, notes]);

  const loading = notesLoading || clientsLoading;

  const toggleNewTag = (tagValue: string) => {
    setNewTags((prev) => (prev.includes(tagValue) ? [] : [tagValue]));
  };

  const toggleEditTag = (tagValue: string) => {
    setEditTags((prev) => (prev.includes(tagValue) ? [] : [tagValue]));
  };

  const startEdit = (note: NoteDocument) => {
    setEditingNoteId(note.id);
    setEditContent(note.content || '');
    setEditTags(note.tags || []);
    setEditClientValue(note.clientId && clientsById.has(note.clientId) ? note.clientId : NO_CLIENT_VALUE);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditContent('');
    setEditTags([]);
    setEditClientValue(NO_CLIENT_VALUE);
  };

  const handleAddNote = async () => {
    if (!user || !firestore || !newNoteContent.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const selectedClient = newClientValue === NO_CLIENT_VALUE ? null : (clientsById.get(newClientValue) ?? null);
      const selectedClientName = selectedClient ? getClientName(selectedClient) : null;

      const rawData = {
        userId: user.uid,
        quoteId: null,
        jobId: null,
        content: newNoteContent.trim(),
        tags: newTags,
        context: 'Notities pagina',
        isResolved: false,
        clientId: selectedClient?.id ?? null,
        clientNaam: selectedClientName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const cleanedData = cleanFirestoreData(rawData);
      const docRef = await addDoc(collection(firestore, 'notes'), cleanedData);

      const createdNote: NoteDocument = {
        id: docRef.id,
        userId: user.uid,
        quoteId: null,
        jobId: null,
        content: newNoteContent.trim(),
        tags: newTags,
        context: 'Notities pagina',
        isResolved: false,
        clientId: selectedClient?.id ?? null,
        clientNaam: selectedClientName,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setNotes((prev) => [createdNote, ...prev]);
      setNewNoteContent('');
      setNewTags([]);
      toast({
        title: 'Notitie toegevoegd',
        description: 'Je notitie is opgeslagen.',
      });
    } catch (error) {
      console.error('Kon notitie niet toevoegen:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon notitie niet toevoegen.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateNote = async () => {
    if (!firestore || !editingNoteId || !editContent.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const selectedClient = editClientValue === NO_CLIENT_VALUE ? null : (clientsById.get(editClientValue) ?? null);
      const selectedClientName = selectedClient ? getClientName(selectedClient) : null;

      const rawUpdate = {
        content: editContent.trim(),
        tags: editTags,
        clientId: selectedClient?.id ?? null,
        clientNaam: selectedClientName,
        updatedAt: serverTimestamp(),
      };
      const cleanedUpdate = cleanFirestoreData(rawUpdate, { isUpdate: true });

      await updateDoc(doc(firestore, 'notes', editingNoteId), cleanedUpdate);

      setNotes((prev) =>
        prev.map((note) =>
          note.id === editingNoteId
            ? {
              ...note,
              content: editContent.trim(),
              tags: editTags,
              clientId: selectedClient?.id ?? null,
              clientNaam: selectedClientName,
              updatedAt: new Date(),
            }
            : note
        )
      );

      cancelEdit();
      toast({
        title: 'Notitie bijgewerkt',
        description: 'Je wijzigingen zijn opgeslagen.',
      });
    } catch (error) {
      console.error('Kon notitie niet bijwerken:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon notitie niet bijwerken.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!firestore) return;

    try {
      await deleteDoc(doc(firestore, 'notes', noteId));
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setDeleteNoteId(null);
      toast({
        title: 'Notitie verwijderd',
        description: 'De notitie is verwijderd.',
      });
    } catch (error) {
      console.error('Kon notitie niet verwijderen:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon notitie niet verwijderen.',
      });
    }
  };

  const getNoteClientLabel = (note: NoteDocument): string => {
    if (note.clientNaam && note.clientNaam.trim()) return note.clientNaam.trim();
    if (note.clientId) {
      const client = clientsById.get(note.clientId);
      if (client) return getClientName(client);
    }
    return 'Geen klant';
  };

  const handleCurrentClientChange = (value: string) => {
    setNewClientValue(value);
    setClientFilter(value);
  };

  if (isUserLoading || !user || loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Notities" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-5xl space-y-6">
          <Card className="border-amber-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-300">
                <StickyNote className="h-5 w-5" />
                Persoonlijke notities
              </CardTitle>
              <CardDescription>
                Deze notities zijn alleen voor jou zichtbaar en worden niet toegevoegd aan een offerte.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-note-client">Klant koppelen</Label>
                  <Select value={newClientValue} onValueChange={handleCurrentClientChange}>
                    <SelectTrigger id="new-note-client">
                      <SelectValue placeholder="Selecteer een klant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CLIENT_VALUE}>Geen klant</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {getClientName(client)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter-client">Filter op klant</Label>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger id="filter-client">
                      <SelectValue placeholder="Alle klanten" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_CLIENTS_VALUE}>Alle klanten</SelectItem>
                      <SelectItem value={NO_CLIENT_VALUE}>Zonder klant</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={`filter-${client.id}`} value={client.id}>
                          {getClientName(client)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {NOTE_TAGS.map((tag) => {
                  const isSelected = newTags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => toggleNewTag(tag.value)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                        isSelected
                          ? cn('ring-1 ring-offset-1', tag.color)
                          : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>

              <div className="border rounded-lg bg-card/30 overflow-hidden focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring transition-all">
                <Textarea
                  placeholder="Nieuwe notitie toevoegen..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="min-h-[180px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
              </div>

              <Button
                variant="success"
                onClick={handleAddNote}
                disabled={!newNoteContent.trim() || isSaving}
                className="w-full"
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Notitie toevoegen
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Jouw notities</CardTitle>
              <CardDescription>
                {filteredNotes.length} resultaat{filteredNotes.length === 1 ? '' : 'en'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Nog geen notities gevonden.
                </div>
              ) : (
                filteredNotes.map((note) => (
                  <div key={note.id} className="rounded-lg border bg-card/40 transition-all hover:bg-card/60">
                    {editingNoteId === note.id ? (
                      <div className="space-y-3 p-4">
                        <div className="space-y-2">
                          <Label htmlFor={`edit-client-${note.id}`}>Klant</Label>
                          <Select value={editClientValue} onValueChange={setEditClientValue}>
                            <SelectTrigger id={`edit-client-${note.id}`}>
                              <SelectValue placeholder="Selecteer een klant" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_CLIENT_VALUE}>Geen klant</SelectItem>
                              {clients.map((client) => (
                                <SelectItem key={`edit-${note.id}-${client.id}`} value={client.id}>
                                  {getClientName(client)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {NOTE_TAGS.map((tag) => {
                            const isSelected = editTags.includes(tag.value);
                            return (
                              <button
                                key={`edit-tag-${note.id}-${tag.value}`}
                                type="button"
                                onClick={() => toggleEditTag(tag.value)}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                                  isSelected
                                    ? cn('ring-1 ring-offset-1', tag.color)
                                    : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                                )}
                              >
                                {tag.label}
                              </button>
                            );
                          })}
                        </div>

                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[140px] resize-none"
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={handleUpdateNote}
                            disabled={!editContent.trim() || isSaving}
                          >
                            {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                            Opslaan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            <X className="mr-1 h-3 w-3" />
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {note.tags && note.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 border-b p-2">
                            {note.tags.map((tagValue) => {
                              const tagDef = NOTE_TAGS.find((tag) => tag.value === tagValue);
                              if (!tagDef) return null;
                              return (
                                <span
                                  key={`${note.id}-${tagValue}`}
                                  className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', tagDef.color)}
                                >
                                  {tagDef.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="space-y-3 p-4">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{note.content}</p>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{formatDate(note.createdAt)}</span>
                              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5">
                                <UserRound className="h-3 w-3" />
                                {getNoteClientLabel(note)}
                              </span>
                              {note.context ? (
                                <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground/90">
                                  {note.context}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => startEdit(note)}
                                aria-label="Notitie bewerken"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-600 hover:text-red-700"
                                onClick={() => setDeleteNoteId(note.id)}
                                aria-label="Notitie verwijderen"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <AlertDialog open={!!deleteNoteId} onOpenChange={(open) => !open && setDeleteNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notitie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan worden gemaakt. De notitie wordt permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">Annuleren</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild onClick={() => deleteNoteId && handleDeleteNote(deleteNoteId)}>
              <Button variant="destructiveSoft">Verwijderen</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
