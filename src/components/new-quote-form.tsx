'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createQuoteAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
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
import type { Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function NewQuoteForm({ clients }: { clients: Client[] }) {
  const [clientSource, setClientSource] = useState('existing');
  const router = useRouter();
  const { toast } = useToast();

  const handleFormSubmit = async (formData: FormData) => {
    const result = await createQuoteAction(formData);

    if (result.errors) {
      console.error(result.errors);
      toast({
        variant: 'destructive',
        title: 'Fout bij validatie',
        description:
          Object.values(result.errors).flat().join('\n') ||
          'Controleer de ingevulde velden.',
      });
    } else if (result.message) {
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: result.message,
      });
    } else if (result.redirect) {
      router.push(result.redirect);
    }
  };

  return (
    <form action={handleFormSubmit} className="space-y-6">
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
              required={clientSource === 'existing'}
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
                required={clientSource === 'new'}
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
                required={clientSource === 'new'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                name="newClient.postcode"
                placeholder="bv. 1234 AB"
                disabled={clientSource !== 'new'}
                required={clientSource === 'new'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plaats">Plaats</Label>
              <Input
                id="plaats"
                name="newClient.plaats"
                placeholder="bv. Amsterdam"
                disabled={clientSource !== 'new'}
                required={clientSource === 'new'}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ✅ CTA styling: green base, but NO global changes elsewhere */}
      <div className="flex justify-end">
        <Button
          type="submit"
          className="bg-[hsl(142_45%_38%)] text-white hover:bg-[hsl(142_45%_34%)]"
        >
          Offerte aanmaken en verder
        </Button>
      </div>
    </form>
  );
}
