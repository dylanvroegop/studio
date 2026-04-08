'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { CalendarDays } from 'lucide-react';

interface SchedulingBannerProps {
  clientName: string;
  offerteNummer: string;
  hours: number;
  planningType?: 'job' | 'werkbespreking';
  onCancel: () => void;
}

export function SchedulingBanner({
  clientName,
  offerteNummer,
  hours,
  planningType = 'job',
  onCancel
}: SchedulingBannerProps) {
  const isWerkbespreking = planningType === 'werkbespreking';

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <CalendarDays className="w-5 h-5 text-emerald-400" />
        <div>
          <div className="font-medium text-emerald-400">
            {isWerkbespreking ? 'Werkbespreking inplannen' : 'Klus inplannen'}: {clientName} {offerteNummer && `(#${offerteNummer})`}
          </div>
          <div className="text-sm text-zinc-400">
            {isWerkbespreking
              ? 'Klik op een datum en kies direct een tijd.'
              : `Klik op een datum om ${hours}u in te plannen`}
          </div>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Annuleren
      </Button>
    </div>
  );
}
