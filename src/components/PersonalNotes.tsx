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
import { useUser, useFirestore } from '@/firebase';

type Note = {
  id: string;
  userId: string;
  quoteId: string;
  content: string;
  createdAt?: any;
  updatedAt?: any;
};

type PersonalNotesProps = {
  quoteId: string;
};

export function PersonalNotes({ quoteId }: PersonalNotesProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

  // Fetch notes when sheet opens
  useEffect(() => {
    if (!isOpen || !user || !firestore || !quoteId) return;

    const fetchNotes = async () => {
      setLoading(true);
      try {
        try {
          const q = query(
            collection(firestore, 'notes'),
            where('userId', '==', user.uid),
            where('quoteId', '==', quoteId),
            orderBy('createdAt', 'desc')
          );
          const snapshot = await getDocs(q);
          const notesList = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as Note[];
          setNotes(notesList);
        } catch (error) {
          // If orderBy fails (missing index), try without it
          const q = query(
            collection(firestore, 'notes'),
            where('userId', '==', user.uid),
            where('quoteId', '==', quoteId)
          );
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
  }, [isOpen, user, firestore, quoteId, toast]);

  // Add new note
  const handleAddNote = async () => {
    if (!user || !firestore || !newNoteContent.trim()) return;

    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(firestore, 'notes'), {
        userId: user.uid,
        quoteId,
        content: newNoteContent.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newNote: Note = {
        id: docRef.id,
        userId: user.uid,
        quoteId,
        content: newNoteContent.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setNotes([newNote, ...notes]);
      setNewNoteContent('');
      
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
        updatedAt: serverTimestamp(),
      });

      setNotes(notes.map(n => 
        n.id === editingNote.id 
          ? { ...n, content: editContent.trim(), updatedAt: new Date() }
          : n
      ));

      setEditingNote(null);
      setEditContent('');

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
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingNote(null);
    setEditContent('');
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-20 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-amber-500 hover:bg-amber-600 text-white border-0"
            title="Persoonlijke notities"
          >
            <StickyNote className="h-6 w-6" />
          </Button>
        </SheetTrigger>

        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5" />
              Persoonlijke notities
            </SheetTitle>
            <SheetDescription>
              Deze notities zijn alleen voor jou zichtbaar en worden niet toegevoegd aan de offerte.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Add new note */}
            <div className="space-y-2">
              <Textarea
                placeholder="Nieuwe notitie toevoegen..."
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                className="min-h-[100px]"
              />
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
                    className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20"
                  >
                    {editingNote?.id === note.id ? (
                      // Editing mode
                      <div className="space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[80px]"
                        />
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
                            variant="outline"
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
                        <p className="text-sm whitespace-pre-wrap mb-2">
                          {note.content}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {note.createdAt?.toDate?.().toLocaleDateString('nl-NL', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
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
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 border border-red-500/50 bg-red-500/15 text-red-100 hover:bg-red-500/25 hover:border-red-500/65 focus-visible:ring-red-500 focus-visible:ring-offset-0 h-10 px-4"
              onClick={() => deleteNoteId && handleDeleteNote(deleteNoteId)}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}