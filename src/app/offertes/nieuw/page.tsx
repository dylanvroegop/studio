'use client';

import { useState, useEffect } from 'react';
import { createQuoteAction } from '@/lib/actions';
import { getClients } from '@/lib/data';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Client } from '@/lib/types';

export default function NewQuotePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSource, setClientSource] = useState('existing');

  useEffect(() => {
    async function fetchClients() {
      const fetchedClients = await getClients();
      setClients(fetchedClients);
    }
    fetchClients();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8">
          <Button asChild variant="outline" size="icon" className="h-7 w-7">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl">Nieuwe Offerte</h1>
        </div>

        <form action={createQuoteAction}>
          <Card>
            <CardHeader>
              <CardTitle>Stap 1: Offertedetails en Klant</CardTitle>
              <CardDescription>
                Geef de offerte een titel en kies of maak een klant aan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="titel">Offertetitel</Label>
                <Input
                  id="titel"
                  name="titel"
                  placeholder="bv. Dakkapel plaatsen"
                  required
                />
              </div>

              <Tabs
                defaultValue="existing"
                className="w-full"
                onValueChange={setClientSource}
              >
                <input type="hidden" name="clientSource" value={clientSource} />
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="existing">Bestaande klant</TabsTrigger>
                  <TabsTrigger value="new">Nieuwe klant</TabsTrigger>
                </TabsList>
                <TabsContent value="existing" className="pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="existingClientId">Kies een klant</Label>
                    <Select
                      name="existingClientId"
                      disabled={clientSource !== 'existing'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer een bestaande klant" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.naam} - {client.plaats}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
                <TabsContent value="new" className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="naam">Naam</Label>
                      <Input
                        id="naam"
                        name="newClient.naam"
                        placeholder="bv. Jan de Boer"
                        disabled={clientSource !== 'new'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefoon">Telefoon</Label>
                      <Input
                        id="telefoon"
                        name="newClient.telefoon"
                        placeholder="bv. 0612345678"
                        disabled={clientSource !== 'new'}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        name="newClient.email"
                        placeholder="bv. jan@voorbeeld.nl"
                        disabled={clientSource !== 'new'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adres">Adres</Label>
                      <Input
                        id="adres"
                        name="newClient.adres"
                        placeholder="bv. Voorbeeldstraat 1"
                        disabled={clientSource !== 'new'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postcode">Postcode</Label>
                      <Input
                        id="postcode"
                        name="newClient.postcode"
                        placeholder="bv. 1234 AB"
                        disabled={clientSource !== 'new'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plaats">Plaats</Label>
                      <Input
                        id="plaats"
                        name="newClient.plaats"
                        placeholder="bv. Amsterdam"
                        disabled={clientSource !== 'new'}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Offerte aanmaken en verder
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </main>
  );
}
