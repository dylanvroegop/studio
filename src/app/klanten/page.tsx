/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
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
  addDoc,
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
  Pencil,
  MoreHorizontal,
  Loader2,
  Plus,
} from 'lucide-react';

import { DashboardHeader } from '@/components/DashboardHeader';
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
import { BottomNav } from '@/components/BottomNav';

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
  afwijkendProjectadres?: boolean;
  projectStraat?: string;
  projectHuisnummer?: string;
  projectPostcode?: string;
  projectPlaats?: string;
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
  const [creating, setCreating] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);

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
        afwijkendProjectadres: true,
        projectStraat: editingClient.projectStraat || '',
        projectHuisnummer: editingClient.projectHuisnummer || '',
        projectPostcode: editingClient.projectPostcode || '',
        projectPlaats: editingClient.projectPlaats || '',
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

  const handleCreate = async () => {
    if (!firestore || !user || !editingClient) return;

    setCreating(true);
    try {
      const docRef = await addDoc(collection(firestore, 'clients'), {
        userId: user.uid,
        voornaam: editingClient.voornaam || '',
        achternaam: editingClient.achternaam || '',
        bedrijfsnaam: editingClient.bedrijfsnaam || '',
        emailadres: editingClient.emailadres || '',
        telefoonnummer: editingClient.telefoonnummer || '',
        straat: editingClient.straat || '',
        huisnummer: editingClient.huisnummer || '',
        postcode: editingClient.postcode || '',
        plaats: editingClient.plaats || '',
        afwijkendProjectadres: true,
        projectStraat: editingClient.projectStraat || '',
        projectHuisnummer: editingClient.projectHuisnummer || '',
        projectPostcode: editingClient.projectPostcode || '',
        projectPlaats: editingClient.projectPlaats || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        klanttype: editingClient.bedrijfsnaam ? 'Zakelijk' : 'Particulier',
      });

      const newClient = { ...editingClient, id: docRef.id, userId: user.uid };
      setClients((prev) => [newClient as Client, ...prev]);
      setEditingClient(null);
      setIsNewClient(false);

      toast({
        title: 'Klant aangemaakt',
        description: 'De nieuwe klant is succesvol toegevoegd.',
      });
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon klant niet aanmaken.',
      });
    } finally {
      setCreating(false);
    }
  };

  const openNewClientModal = () => {
    setEditingClient({
      id: '',
      afwijkendProjectadres: true
    } as Client);
    setIsNewClient(true);
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
    <main className="min-h-screen bg-background pb-[280px]">
      <DashboardHeader user={user} title="Klantenbeheer" />
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoeken..."
              className="pl-9 bg-card/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            onClick={openNewClientModal}
            variant="success"
            className="h-10 px-4 font-bold shadow-sm shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe Klant
          </Button>
        </div>
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  aria-label="Verwijderen"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                                  <AlertDialogCancel asChild>
                                    <Button variant="ghost">Annuleren</Button>
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(client.id)}
                                    asChild
                                  >
                                    <Button variant="destructiveSoft">
                                      Verwijderen
                                    </Button>
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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

      {/* Edit/Create modal */}
      <Dialog
        open={!!editingClient}
        onOpenChange={(open) => {
          if (!open) {
            setEditingClient(null);
            setIsNewClient(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{isNewClient ? 'Nieuwe klant toevoegen' : 'Klant bewerken'}</DialogTitle>
          </DialogHeader>

          {editingClient && (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                {/* Factuuradres Section */}
                <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">Factuuradres</span>
                    <div className="flex-1 border-t" />
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

                {/* Projectadres Section - Always visible now */}
                <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">Projectadres</span>
                    <div className="flex-1 border-t" />
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3 space-y-2">
                      <Label>Projectstraat</Label>
                      <Input
                        value={editingClient.projectStraat || ''}
                        onChange={(e) =>
                          setEditingClient({ ...editingClient, projectStraat: e.target.value })
                        }
                        placeholder="Straatnaam"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Nr.</Label>
                      <Input
                        value={editingClient.projectHuisnummer || ''}
                        onChange={(e) =>
                          setEditingClient({ ...editingClient, projectHuisnummer: e.target.value })
                        }
                        placeholder="Nr."
                      />
                    </div>

                    <div className="col-span-1 space-y-2">
                      <Label>Postcode</Label>
                      <Input
                        value={editingClient.projectPostcode || ''}
                        onChange={(e) =>
                          setEditingClient({ ...editingClient, projectPostcode: e.target.value })
                        }
                        placeholder="1234 AB"
                      />
                    </div>

                    <div className="col-span-3 space-y-2">
                      <Label>Plaats</Label>
                      <Input
                        value={editingClient.projectPlaats || ''}
                        onChange={(e) =>
                          setEditingClient({ ...editingClient, projectPlaats: e.target.value })
                        }
                        placeholder="Plaatsnaam"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t p-6 bg-muted/5 sm:justify-between gap-4 shrink-0">
            <Button variant="outline" onClick={() => { setEditingClient(null); setIsNewClient(false); }}>
              Annuleren
            </Button>

            <Button variant="success" onClick={isNewClient ? handleCreate : handleSaveEdit} disabled={isEditSaving || creating}>
              {(isEditSaving || creating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isNewClient ? 'Toevoegen' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <BottomNav />
    </main>
  );
}
