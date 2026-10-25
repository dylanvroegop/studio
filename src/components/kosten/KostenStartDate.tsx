'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props { value: string; onChange: (value: string) => void }

export function KostenStartDate({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Date(`${value}T12:00:00`);
  const today = new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())}T23:59:59`);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="h-9 gap-2 font-normal" aria-label="Begindatum aanpassen">
        <CalendarDays className="h-4 w-4" />Vanaf {format(selected, 'd MMMM yyyy', { locale: nl })}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0">
      <Calendar mode="single" locale={nl} selected={selected} defaultMonth={selected} disabled={[{ after: today }, { before: new Date(1900, 0, 1) }]} onSelect={(date) => {
        if (!date) return;
        onChange(format(date, 'yyyy-MM-dd'));
        setOpen(false);
      }} initialFocus />
    </PopoverContent>
  </Popover>;
}
