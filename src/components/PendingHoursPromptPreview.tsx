'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PendingHoursPromptPreview() {
  const [open, setOpen] = useState(true);
  const [workedHours, setWorkedHours] = useState('9,1');
  const [workedDays, setWorkedDays] = useState('1');
  const [quotedHours, setQuotedHours] = useState('');
  const [note, setNote] = useState('');

  const closePreview = () => setOpen(false);

  return (
    <CardPreviewShell>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Openstaande uren</DialogTitle>
            <DialogDescription>
              Je hebt openstaande uren op <strong>Chris Palmen</strong> van 2026-07-23. Controleer de voorgestelde 9,1 uur en pas direct aan waar nodig. Dit voorstel komt uit Traccar GPS-data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 rounded-md border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground">
            <div><strong className="text-foreground">Quote ID:</strong> L0mLM5POgCbsvrBunqwL</div>
            <div><strong className="text-foreground">Offerte nr:</strong> 260313</div>
            <div><strong className="text-foreground">Klant:</strong> Chris Palmen</div>
            <div><strong className="text-foreground">Project:</strong> Jagtlustlaan 3, Santpoort-Zuid</div>
            <div><strong className="text-foreground">Type:</strong> GPS-tracking</div>
            <div><strong className="text-foreground">GPS-tijd:</strong> 09:18 - 18:24</div>
            <div><strong className="text-foreground">Afstand tot project:</strong> 0 meter</div>
            <div><strong className="text-foreground">GPS-punten:</strong> 665</div>
            <div><strong className="text-foreground">Open dagen:</strong> 1</div>
            <div><strong className="text-foreground">Prompt key:</strong> gps:L0mLM5POgCbsvrBunqwL:2026-07-23</div>
            <div><strong className="text-foreground">Planning refs:</strong> traccar:3707, traccar:3708, traccar:3709 (+17)</div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="preview-worked-hours">Werkelijk gewerkt (uur)</Label>
              <Input id="preview-worked-hours" type="text" inputMode="decimal" value={workedHours} onChange={(event) => setWorkedHours(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview-worked-days">Werkelijk gewerkt (dagen)</Label>
              <Input id="preview-worked-days" type="text" inputMode="decimal" value={workedDays} onChange={(event) => setWorkedDays(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview-quoted-hours">Geoffreerd (optioneel)</Label>
              <Input id="preview-quoted-hours" type="text" inputMode="decimal" value={quotedHours} onChange={(event) => setQuotedHours(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview-hours-note">Notitie (optioneel)</Label>
              <Input id="preview-hours-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Bijv. Meerwerk door extra afwerking" />
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={closePreview}>Later</Button>
              <Button type="button" variant="outline" onClick={closePreview}>Niet gewerkt</Button>
            </div>
            <Button type="button" onClick={closePreview}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!open ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <BellRing className="h-8 w-8 text-emerald-400" />
          <div>
            <p className="font-medium">Popup gesloten</p>
            <p className="text-sm text-muted-foreground">Dit was alleen een voorbeeld. Er is niets opgeslagen.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>Toon popup opnieuw</Button>
        </div>
      ) : null}
    </CardPreviewShell>
  );
}

function CardPreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-muted-foreground">
      <div className="mb-4 flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div>
          <p className="font-medium text-foreground">Voorbeeld van de uren-popup</p>
          <p>Dit is een veilige preview. De knoppen sluiten alleen de preview en maken geen urenboeking.</p>
        </div>
      </div>
      {children}
    </div>
  );
}
