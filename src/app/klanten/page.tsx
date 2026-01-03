'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Search,
  Mail,
  Phone,
  Trash2,
  Building2,
  User,
  ArrowLeft,
  Pencil,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { cn } from '@/lib/utils';

type Client = {
  id: string;
  userId?: string;
  klanttype?: string;
  voornaam?: string;
  achternaam?: string;
  bedrijfsnaam?: string;
  emailadres?: string;
  telefoonnummer?: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  createdAt?: any;
  updatedAt?: any;
};

export default function KlantenPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  useEffect(() => {
    if (isUserLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (!firestore) return;

    const fetchClients = async () => {
      try {
        setLoading(true);

        try {
          const q = query(
            collection(firestore, 'clients'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          );
          const snap = await getDocs(q);
          setClients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        } catch (e) {
          const q = query(
            collection(firestore, 'clients'),
            where('userId', '==', user.uid)
          );
          const snap = await getDocs(q);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Client[];
          list.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );
          setClients(list);
        }
      } catch (error) {
        console.error('Fout bij ophalen klanten:', error);
        toast({
          variant: 'destructive',
          title: 'Fout',
          description: 'Kon klanten niet ophalen.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, [user, isUserLoading, firestore, router, toast]);

  const handleDelete = async (clientId: string) => {
    if (!firestore) return;

    try {
      await deleteDoc(doc(firestore, 'clients', clientId));
      setClients((prev) => prev.filter((c) => c.id !== clientId));
      toast({
        title: 'Klant verwijderd',
        description: 'De klant is succesvol verwijderd.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon klant niet verwijderen.',
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!firestore || !editingClient) return;

    setIsEditSaving(true);
    try {
      const docRef = doc(firestore, 'clients', editingClient.id);

      await updateDoc(docRef, {
        voornaam: editingClient.voornaam || '',
        achternaam: editingClient.achternaam || '',
        bedrijfsnaam: editingClient.bedrijfsnaam || '',
        emailadres: editingClient.emailadres || '',
        telefoonnummer: editingClient.telefoonnummer || '',
        straat: editingClient.straat || '',
        huisnummer: editingClient.huisnummer || '',
        postcode: editingClient.postcode || '',
        plaats: editingClient.plaats || '',
        updatedAt: serverTimestamp(),
      });

      setClients((prev) =>
        prev.map((c) => (c.id === editingClient.id ? editingClient : c))
      );
      setEditingClient(null);

      toast({
        title: 'Klant bijgewerkt',
        description: 'De wijzigingen zijn opgeslagen.',
      });
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon wijzigingen niet opslaan.',
      });
    } finally {
      setIsEditSaving(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    const term = searchQuery.toLowerCase();
    const name = `${c.voornaam || ''} ${c.achternaam || ''} ${c.bedrijfsnaam || ''}`.toLowerCase();
    const email = (c.emailadres || '').toLowerCase();
    const city = (c.plaats || '').toLowerCase();
    return name.includes(term) || email.includes(term) || city.includes(term);
  });

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Klanten laden...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="shrink-0 rounded-xl">
              <Link href="/dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Klantenbeheer</h1>
              <p className="text-muted-foreground text-sm">
                Beheer uw relaties ({clients.length} totaal)
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoeken..."
              className="pl-9 bg-card/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm text-left">
              <thead className="[&_tr]:border-b bg-muted/30">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                    Naam / Bedrijf
                  </th>
                  <th className="h-12 px-4 align-middle font-medium text-muted-foreground hidden md:table-cell">
                    Contact
                  </th>
                  <th className="h-12 px-4 align-middle font-medium text-muted-foreground hidden md:table-cell">
                    Locatie
                  </th>
                  <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
                    Acties
                  </th>
                </tr>
              </thead>

              <tbody className="[&_tr:last-child]:border-0">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="h-32 text-center text-muted-foreground align-middle"
                    >
                      Geen klanten gevonden.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => {
                    const isZakelijk =
                      client.klanttype === 'Zakelijk' || client.klanttype === 'zakelijk';

                    return (
                      <tr key={client.id} className="border-b transition-colors hover:bg-muted/30">
                        {/* Name */}
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'h-9 w-9 rounded-full flex items-center justify-center shrink-0 border',
                                isZakelijk
                                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-600'
                                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                              )}
                            >
                              {isZakelijk ? (
                                <Building2 className="h-4 w-4" />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </div>

                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">
                                {client.voornaam} {client.achternaam}
                              </span>
                              {isZakelijk && (
                                <span className="text-xs text-muted-foreground">
                                  {client.bedrijfsnaam}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Mobile contact */}
                          <div className="md:hidden mt-2 space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3" /> {client.emailadres}
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-3 w-3" /> {client.telefoonnummer}
                            </div>
                          </div>
                        </td>

                        {/* Contact (desktop) */}
                        <td className="p-4 align-middle hidden md:table-cell">
                          <div className="flex flex-col gap-1 text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 opacity-70" /> {client.emailadres}
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 opacity-70" /> {client.telefoonnummer}
                            </div>
                          </div>
                        </td>

                        {/* Location (desktop) */}
                        <td className="p-4 align-middle hidden md:table-cell">
                          <span className="text-muted-foreground">
                            {client.straat} {client.huisnummer}
                            <br />
                            {client.postcode} {client.plaats}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-4 align-middle text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* 1-click edit */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingClient(client)}
                              aria-label="Bewerken"
                              title="Bewerken"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>

                            {/* 2-click delete inside menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Meer opties"
                                  title="Meer opties"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent align="end">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Verwijderen
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>

                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Dit verwijdert {client.voornaam} {client.achternaam} uit uw
                                        adresboek.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={() => handleDelete(client.id)}
                                      >
                                        Verwijderen
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Klant bewerken</DialogTitle>
          </DialogHeader>

          {editingClient && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Voornaam</Label>
                  <Input
                    value={editingClient.voornaam || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, voornaam: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Achternaam</Label>
                  <Input
                    value={editingClient.achternaam || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, achternaam: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bedrijfsnaam (optioneel)</Label>
                <Input
                  value={editingClient.bedrijfsnaam || ''}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, bedrijfsnaam: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    value={editingClient.emailadres || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, emailadres: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefoon</Label>
                  <Input
                    value={editingClient.telefoonnummer || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, telefoonnummer: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 space-y-2">
                  <Label>Straat</Label>
                  <Input
                    value={editingClient.straat || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, straat: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nr.</Label>
                  <Input
                    value={editingClient.huisnummer || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, huisnummer: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Postcode</Label>
                  <Input
                    value={editingClient.postcode || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, postcode: e.target.value })
                    }
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Plaats</Label>
                  <Input
                    value={editingClient.plaats || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, plaats: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingClient(null)}>
              Annuleren
            </Button>

            <Button variant="success" onClick={handleSaveEdit} disabled={isEditSaving}>
              {isEditSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
