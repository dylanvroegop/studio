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
    onSnapshot,
} from 'firebase/firestore';
import {
    StickyNote,
    Plus,
    Trash2,
    Edit2,
    X,
    Save,
    Loader2,
    ReceiptEuro,
    ClipboardList,
    Tags,
    Search,
    ArrowRightLeft,
    AlertCircle
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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

type QuoteNote = {
    id: string;
    userId: string;
    quoteId: string;
    content: string;
    tags?: string[];
    createdAt?: any;
    updatedAt?: any;
};

type QuoteNotesProps = {
    quoteId: string;
};

const QUOTE_NOTE_TAGS = [
    { label: 'Materiaal toevoegen', icon: <Plus className="w-3.5 h-3.5" />, value: 'add_material', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' },
    { label: 'Toevoegen aan prijslijst', icon: <ClipboardList className="w-3.5 h-3.5" />, value: 'add_pricelist', color: 'bg-blue-500/15 text-blue-600 border-blue-500/20' },
    { label: 'Prijs checken', icon: <ReceiptEuro className="w-3.5 h-3.5" />, value: 'check_price', color: 'bg-amber-500/15 text-amber-600 border-amber-500/20' },
    { label: 'Alternatief', icon: <ArrowRightLeft className="w-3.5 h-3.5" />, value: 'alternative', color: 'bg-violet-500/15 text-violet-600 border-violet-500/20' },
    { label: 'Optie', icon: <Tags className="w-3.5 h-3.5" />, value: 'option', color: 'bg-pink-500/15 text-pink-600 border-pink-500/20' },
    { label: 'Onderzoeken', icon: <Search className="w-3.5 h-3.5" />, value: 'research', color: 'bg-orange-500/15 text-orange-600 border-orange-500/20' },
] as const;

export function QuoteNotes({ quoteId }: QuoteNotesProps) {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [notes, setNotes] = useState<QuoteNote[]>([]);
    const [loading, setLoading] = useState(true);

    const [newNoteContent, setNewNoteContent] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const [editingNote, setEditingNote] = useState<QuoteNote | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editTags, setEditTags] = useState<string[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

    // Real-time subscription to notes
    useEffect(() => {
        if (!user || !firestore || !quoteId) return;

        setLoading(true);

        // We store these in a subcollection 'quote_notes' under the quote document
        // Or a top-level collection linked by quoteId. 
        // Creating a subcollection is cleaner for 'stored inside the quotes ID'.
        // Path: quotes/{quoteId}/quote_notes

        const notesRef = collection(firestore, 'quotes', quoteId, 'quote_notes');
        const q = query(
            notesRef,
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notesList = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
            })) as QuoteNote[];
            setNotes(notesList);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching quote notes:', error);
            // Fallback if index is creating issues (sometimes happens with new collections)
            // fetch without orderBy and sort client side
            const qSimple = query(notesRef);
            getDocs(qSimple).then(snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as QuoteNote[];
                list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                setNotes(list);
                setLoading(false);
            });
        });

        return () => unsubscribe();
    }, [user, firestore, quoteId]);

    // Add new note
    const handleAddNote = async () => {
        if (!user || !firestore || (!newNoteContent.trim() && selectedTags.length === 0)) return;

        setIsSaving(true);
        try {
            await addDoc(collection(firestore, 'quotes', quoteId, 'quote_notes'), {
                userId: user.uid,
                quoteId,
                content: newNoteContent.trim(),
                tags: selectedTags,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            setNewNoteContent('');
            setSelectedTags([]);

            toast({
                title: 'Offerte notitie toegevoegd',
                description: 'Deze notitie is opgeslagen bij de offerte.',
            });
        } catch (error) {
            console.error('Error adding quote note:', error);
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
        if (!firestore || !editingNote || (!editContent.trim() && editTags.length === 0)) return;

        setIsSaving(true);
        try {
            const noteRef = doc(firestore, 'quotes', quoteId, 'quote_notes', editingNote.id);
            await updateDoc(noteRef, {
                content: editContent.trim(),
                tags: editTags,
                updatedAt: serverTimestamp(),
            });

            setEditingNote(null);
            setEditContent('');
            setEditTags([]);

            toast({
                title: 'Notitie bijgewerkt',
                description: 'Je wijzigingen zijn opgeslagen.',
            });
        } catch (error) {
            console.error('Error updating quote note:', error);
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
            await deleteDoc(doc(firestore, 'quotes', quoteId, 'quote_notes', noteId));
            setDeleteNoteId(null);

            toast({
                title: 'Notitie verwijderd',
                description: 'De notitie is verwijderd.',
            });
        } catch (error) {
            console.error('Error deleting quote note:', error);
            toast({
                variant: 'destructive',
                title: 'Fout',
                description: 'Kon notitie niet verwijderen.',
            });
        }
    };

    const startEdit = (note: QuoteNote) => {
        setEditingNote(note);
        setEditContent(note.content);
        setEditTags(note.tags || []);
    };

    const cancelEdit = () => {
        setEditingNote(null);
        setEditContent('');
        setEditTags([]);
    };

    const toggleTag = (tagValue: string, isEditing: boolean) => {
        if (isEditing) {
            setEditTags(prev =>
                prev.includes(tagValue)
                    ? prev.filter(t => t !== tagValue)
                    : [...prev, tagValue]
            );
        } else {
            setSelectedTags(prev =>
                prev.includes(tagValue)
                    ? prev.filter(t => t !== tagValue)
                    : [...prev, tagValue]
            );
        }
    };

    return (
        <Card className="border-amber-500/20 bg-amber-500/5 shadow-sm overflow-hidden ring-1 ring-amber-500/10">
            <CardHeader className="pb-3 border-b border-amber-500/10 bg-amber-500/5">
                <CardTitle className="flex items-center gap-2 text-amber-500 text-lg">
                    <StickyNote className="h-5 w-5 fill-amber-500/20" />
                    Offerte Notities & Extra's
                </CardTitle>
                <CardDescription className="flex items-start gap-2 text-amber-500/70">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                        Deze notities zijn <span className="text-amber-500 font-medium">zichtbaar</span> op de offerte en beïnvloeden de prijs.
                        Gebruik dit voor extra materialen, opties of specifieke klantwensen.
                    </span>
                </CardDescription>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-6">
                {/* Add new note section */}
                <div className="space-y-4">
                    {/* Tags Selector */}
                    <div className="flex flex-wrap gap-2">
                        {QUOTE_NOTE_TAGS.map((tag) => {
                            const isSelected = selectedTags.includes(tag.value);
                            return (
                                <button
                                    key={tag.value}
                                    onClick={() => toggleTag(tag.value, false)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                                        isSelected
                                            ? cn("ring-1 ring-offset-0 shadow-sm transform scale-105", tag.color)
                                            : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                >
                                    <span className={cn(isSelected ? "opacity-100" : "opacity-70")}>{tag.icon}</span>
                                    {tag.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="border rounded-lg overflow-hidden bg-background/50 shadow-sm focus-within:ring-2 focus-within:ring-amber-500/30 focus-within:border-amber-500/50 transition-all border-amber-200/20">
                        {selectedTags.length > 0 && (
                            <div className="flex flex-col border-b border-amber-500/10 divide-y divide-amber-500/10 bg-amber-500/5">
                                {selectedTags.map((tagValue) => {
                                    const tagDef = QUOTE_NOTE_TAGS.find(t => t.value === tagValue);
                                    if (!tagDef) return null;
                                    return (
                                        <div key={tagValue} className={cn("w-full py-1.5 px-3 text-xs font-medium flex items-center gap-2", tagDef.color)}>
                                            <span>{tagDef.icon}</span>
                                            {tagDef.label}
                                            <button onClick={(e) => { e.stopPropagation(); toggleTag(tagValue, false); }} className="ml-auto hover:opacity-75 p-1 hover:bg-black/5 rounded-full">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <Textarea
                            placeholder="Beschrijf hier het extra materiaal, de optie of de prijsaanvraag..."
                            value={newNoteContent}
                            onChange={(e) => setNewNoteContent(e.target.value)}
                            className="min-h-[100px] border-0 focus-visible:ring-0 rounded-none shadow-none resize-none bg-transparent placeholder:text-muted-foreground/50 selection:bg-amber-500/20"
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="default"
                            onClick={handleAddNote}
                            disabled={(!newNoteContent.trim() && selectedTags.length === 0) || isSaving}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-medium shadow-amber-900/10 border-none"
                        >
                            {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Plus className="h-4 w-4 mr-2" />
                            )}
                            Toevoegen aan offerte
                        </Button>
                    </div>
                </div>

                {/* Notes list */}
                {notes.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-amber-500/10">
                        <h3 className="text-sm font-semibold text-amber-500 mb-2 px-1">Toegevoegde notities</h3>
                        <div className="space-y-3">
                            {notes.map((note) => (
                                <div
                                    key={note.id}
                                    className="group border border-border/50 rounded-lg transition-all relative overflow-hidden bg-background/40 hover:bg-background/60 hover:border-amber-500/30"
                                >
                                    {editingNote?.id === note.id ? (
                                        // Editing mode
                                        <div className="space-y-3 p-4">
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {QUOTE_NOTE_TAGS.map((tag) => {
                                                    const isSelected = editTags.includes(tag.value);
                                                    return (
                                                        <button
                                                            key={tag.value}
                                                            onClick={() => toggleTag(tag.value, true)}
                                                            className={cn(
                                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                                                                isSelected
                                                                    ? cn("ring-1 ring-offset-0", tag.color)
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
                                                <Textarea
                                                    value={editContent}
                                                    onChange={(e) => setEditContent(e.target.value)}
                                                    className="min-h-[80px] border-0 focus-visible:ring-0 rounded-none shadow-none bg-transparent"
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={cancelEdit}
                                                >
                                                    <X className="h-3 w-3 mr-1" />
                                                    Annuleren
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    className="bg-amber-500 hover:bg-amber-600 text-black"
                                                    onClick={handleUpdateNote}
                                                    disabled={(!editContent.trim() && editTags.length === 0) || isSaving}
                                                >
                                                    {isSaving ? (
                                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                    ) : (
                                                        <Save className="h-3 w-3 mr-1" />
                                                    )}
                                                    Opslaan
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        // View mode
                                        <>
                                            {/* Full Width Bar Tags Display */}
                                            {note.tags && note.tags.length > 0 && (
                                                <div className="flex flex-col w-full divide-y divide-border/30 border-b border-border/30 bg-muted/10">
                                                    {note.tags.map(tagValue => {
                                                        const tagDef = QUOTE_NOTE_TAGS.find(t => t.value === tagValue);
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
                                                        <p className="text-sm whitespace-pre-wrap mb-1 leading-relaxed text-foreground/90">
                                                            {note.content}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-3 mt-1 border-t border-border/30 text-xs text-muted-foreground">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-amber-500/60">
                                                            {note.createdAt?.toDate?.().toLocaleDateString('nl-NL', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 hover:bg-amber-500/10"
                                                            onClick={() => startEdit(note)}
                                                        >
                                                            <Edit2 className="h-3 w-3 text-amber-500" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 hover:bg-red-500/10"
                                                            onClick={() => setDeleteNoteId(note.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3 text-red-500" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>

            <AlertDialog open={!!deleteNoteId} onOpenChange={(open) => !open && setDeleteNoteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Notitie verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deze actie kan niet ongedaan worden gemaakt.
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
        </Card>
    );
}
