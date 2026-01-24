'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import {
  StickyNote,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUser, useFirestore } from '@/firebase';

type Note = {
  id: string;
  userId: string;
  quoteId: string;
  jobId?: string; // Optional: Link to specific job
  content: string;
  tags?: string[];
  context?: string;
  isResolved?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type PersonalNotesProps = {
  quoteId: string;
  jobId?: string; // Optional: Link to specific job
  context?: string;
};

const NOTE_TAGS = [
  { label: 'Let op', icon: '⚠️', value: 'warning', color: 'bg-amber-500/15 text-amber-600 border-amber-500/20' },
  { label: 'Aanname', icon: '📐', value: 'assumption', color: 'bg-blue-500/15 text-blue-600 border-blue-500/20' },
  { label: 'Klant zegt', icon: '🗣️', value: 'client_request', color: 'bg-violet-500/15 text-violet-600 border-violet-500/20' },
  { label: 'Later checken', icon: '🔁', value: 'follow_up', color: 'bg-orange-500/15 text-orange-600 border-orange-500/20' },
  { label: 'Prijsgevoelig', icon: '💰', value: 'budget', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' },
  { label: 'Beslis nog', icon: '🧠', value: 'decision', color: 'bg-pink-500/15 text-pink-600 border-pink-500/20' },
] as const;

export function PersonalNotes({ quoteId, jobId, context }: PersonalNotesProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

  // Fetch notes when sheet opens
  useEffect(() => {
    if (!isOpen || !user || !firestore || !quoteId) return;

    const fetchNotes = async () => {
      setLoading(true);
      try {
        try {
          // Construct query based on whether jobId is present
          let q;
          if (jobId) {
            q = query(
              collection(firestore, 'notes'),
              where('userId', '==', user.uid),
              where('quoteId', '==', quoteId),
              where('jobId', '==', jobId), // Filter by job
              orderBy('createdAt', 'desc')
            );
          } else {
            // Fallback/Legacy: Show notes for quote that DON'T have a specific job? 
            // OR show all? User likely wants specific context. 
            // Let's filter by context or show all if no jobId?
            // Safest: Filter by quoteId. But if we are in a job, we want job notes.
            // If we are NOT in a job (e.g. quote overview), maybe we want all?
            // For now, simple logic:
            q = query(
              collection(firestore, 'notes'),
              where('userId', '==', user.uid),
              where('quoteId', '==', quoteId),
              orderBy('createdAt', 'desc')
            );
          }

          const snapshot = await getDocs(q);
          const notesList = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as Note[];
          setNotes(notesList);
        } catch (error) {
          // Fallback if index missing
          console.warn("Index missing or query failed, falling back to manual sort", error);
          let q;
          if (jobId) {
            q = query(
              collection(firestore, 'notes'),
              where('userId', '==', user.uid),
              where('quoteId', '==', quoteId),
              where('jobId', '==', jobId)
            );
          } else {
            q = query(
              collection(firestore, 'notes'),
              where('userId', '==', user.uid),
              where('quoteId', '==', quoteId)
            );
          }

          const snapshot = await getDocs(q);
          const notesList = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as Note[];
          // Sort manually
          notesList.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });
          setNotes(notesList);
        }
      } catch (error) {
        console.error('Error fetching notes:', error);
        toast({
          variant: 'destructive',
          title: 'Fout',
          description: 'Kon notities niet laden.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [isOpen, user, firestore, quoteId, jobId, toast]);

  // Add new note
  const handleAddNote = async () => {
    if (!user || !firestore || !newNoteContent.trim()) return;

    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(firestore, 'notes'), {
        userId: user.uid,
        quoteId,
        jobId: jobId || null, // Create relationship
        content: newNoteContent.trim(),
        tags: selectedTags,
        context: context || 'Algemeen',
        isResolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newNote: Note = {
        id: docRef.id,
        userId: user.uid,
        quoteId,
        jobId: jobId || undefined,
        content: newNoteContent.trim(),
        tags: selectedTags,
        context: context || 'Algemeen',
        isResolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setNotes([newNote, ...notes]);
      setNewNoteContent('');
      setSelectedTags([]);

      toast({
        title: 'Notitie toegevoegd',
        description: 'Je persoonlijke notitie is opgeslagen.',
      });
    } catch (error) {
      console.error('Error adding note:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon notitie niet toevoegen.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Update note
  const handleUpdateNote = async () => {
    if (!firestore || !editingNote || !editContent.trim()) return;

    setIsSaving(true);
    try {
      const noteRef = doc(firestore, 'notes', editingNote.id);
      await updateDoc(noteRef, {
        content: editContent.trim(),
        tags: editTags,
        updatedAt: serverTimestamp(),
      });

      setNotes(notes.map(n =>
        n.id === editingNote.id
          ? { ...n, content: editContent.trim(), tags: editTags, updatedAt: new Date() }
          : n
      ));

      setEditingNote(null);
      setEditContent('');
      setEditTags([]);

      toast({
        title: 'Notitie bijgewerkt',
        description: 'Je wijzigingen zijn opgeslagen.',
      });
    } catch (error) {
      console.error('Error updating note:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon notitie niet bijwerken.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    if (!firestore) return;

    try {
      await deleteDoc(doc(firestore, 'notes', noteId));
      setNotes(notes.filter(n => n.id !== noteId));
      setDeleteNoteId(null);

      toast({
        title: 'Notitie verwijderd',
        description: 'Je persoonlijke notitie is verwijderd.',
      });
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon notitie niet verwijderen.',
      });
    }
  };



  // Start editing
  const startEdit = (note: Note) => {
    setEditingNote(note);
    setEditContent(note.content);
    setEditTags(note.tags || []);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingNote(null);
    setEditContent('');
    setEditTags([]);
  };

  const toggleTag = (tagValue: string, isEditing: boolean) => {
    if (isEditing) {
      setEditTags(prev =>
        prev.includes(tagValue)
          ? []
          : [tagValue]
      );
    } else {
      setSelectedTags(prev =>
        prev.includes(tagValue)
          ? []
          : [tagValue]
      );
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className="p-0"
            aria-label="Notities"
            title="Notities"
          >
            <div className="group h-10 sm:h-10 px-3 sm:px-3 flex items-center gap-2 rounded-lg hover:bg-amber-500/10">
              <StickyNote className="!h-6 !w-6 !text-amber-500 group-hover:!text-amber-600" strokeWidth={2.2} />
              <span className="hidden sm:inline text-sm font-medium !text-amber-500 group-hover:!text-amber-600">
                Notities
              </span>
            </div>
          </Button>


        </SheetTrigger>

        <SheetContent className="w-full max-w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-amber-500">
              <StickyNote className="h-5 w-5" />
              Persoonlijke notities
            </SheetTitle>
            <SheetDescription>
              Deze notities zijn alleen voor jou zichtbaar en worden niet toegevoegd aan de offerte.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Add new note */}
            <div className="space-y-3">
              {/* Tags Selector */}
              <div className="flex flex-wrap gap-2">
                {NOTE_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      onClick={() => toggleTag(tag.value, false)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        isSelected
                          ? cn("ring-1 ring-offset-1 rtl:ring-offset-0", tag.color)
                          : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <span>{tag.icon}</span>
                      {tag.label}
                    </button>
                  );
                })}
              </div>

              <div className="border rounded-lg overflow-hidden bg-card/30 focus-within:ring-2 focus-within:ring-ring focus-within:border-primary/50 transition-all">
                {selectedTags.length > 0 && (
                  <div className="flex flex-col border-b border-border/50 divide-y divide-border/50">
                    {selectedTags.map((tagValue) => {
                      const tagDef = NOTE_TAGS.find(t => t.value === tagValue);
                      if (!tagDef) return null;
                      return (
                        <div key={tagValue} className={cn("w-full py-1.5 px-3 text-xs font-medium flex items-center gap-2", tagDef.color)}>
                          <span>{tagDef.icon}</span>
                          {tagDef.label}
                          <button onClick={(e) => { e.stopPropagation(); toggleTag(tagValue, false); }} className="ml-auto hover:opacity-75">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <Textarea
                  placeholder="Nieuwe notitie toevoegen..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="min-h-[200px] border-0 focus-visible:ring-0 rounded-none shadow-none resize-none bg-transparent"
                />
              </div>
              <Button
                variant="success"
                onClick={handleAddNote}
                disabled={!newNoteContent.trim() || isSaving}
                className="w-full"
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Notitie toevoegen
              </Button>
            </div>

            {/* Notes list */}
            <div className="space-y-3 mt-6">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Notities laden...
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nog geen notities. Voeg er een toe om te beginnen.
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="group border rounded-lg transition-all relative overflow-hidden bg-card/40 hover:bg-card/60"
                  >
                    {editingNote?.id === note.id ? (
                      // Editing mode
                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {NOTE_TAGS.map((tag) => {
                            const isSelected = editTags.includes(tag.value);
                            return (
                              <button
                                key={tag.value}
                                onClick={() => toggleTag(tag.value, true)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                                  isSelected
                                    ? cn("ring-1 ring-offset-1", tag.color)
                                    : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                                )}
                              >
                                <span>{tag.icon}</span>
                                {tag.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="border rounded-md overflow-hidden bg-background">
                          {editTags.length > 0 && (
                            <div className="flex flex-col border-b border-border/50 divide-y divide-border/50">
                              {editTags.map((tagValue) => {
                                const tagDef = NOTE_TAGS.find(t => t.value === tagValue);
                                if (!tagDef) return null;
                                return (
                                  <div key={tagValue} className={cn("w-full py-1 px-3 text-xs font-medium flex items-center gap-2", tagDef.color)}>
                                    <span>{tagDef.icon}</span>
                                    {tagDef.label}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="min-h-[120px] border-0 focus-visible:ring-0 rounded-none shadow-none bg-transparent"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={handleUpdateNote}
                            disabled={!editContent.trim() || isSaving}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Save className="h-3 w-3 mr-1" />
                            )}
                            Opslaan
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        {/* Full Width Bar Tags Display */}
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex flex-col w-full divide-y divide-border/50 border-b border-border/50">
                            {note.tags.map(tagValue => {
                              const tagDef = NOTE_TAGS.find(t => t.value === tagValue);
                              if (!tagDef) return null;
                              return (
                                <div
                                  key={tagValue}
                                  className={cn(
                                    "w-full py-1.5 px-4 text-xs font-medium flex items-center gap-2",
                                    tagDef.color
                                  )}
                                >
                                  <span>{tagDef.icon}</span>
                                  {tagDef.label}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm whitespace-pre-wrap mb-3 leading-relaxed text-foreground/90 transition-all">
                                {note.content}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
                            <div className="flex flex-col gap-0.5">
                              <span>
                                {note.createdAt?.toDate?.().toLocaleDateString('nl-NL', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {note.context && (
                                <span className="text-[10px] text-muted-foreground/70 italic">
                                  {note.context}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => startEdit(note)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-600 hover:text-red-700"
                                onClick={() => setDeleteNoteId(note.id)}
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
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
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
            <AlertDialogAction
              asChild
              onClick={() => deleteNoteId && handleDeleteNote(deleteNoteId)}
            >
              <Button variant="destructiveSoft">Verwijderen</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}