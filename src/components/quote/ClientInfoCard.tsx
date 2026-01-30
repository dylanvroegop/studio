'use client';

import { KlantInformatie } from '@/lib/quote-calculations';
import { User, MapPin, Mail, Phone } from 'lucide-react';

interface ClientInfoCardProps {
    klantInfo: KlantInformatie | null;
}

export function ClientInfoCard({ klantInfo }: ClientInfoCardProps) {
    if (!klantInfo) {
        return (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
                <h3 className="font-semibold text-zinc-400 text-sm mb-4">KLANTGEGEVENS</h3>
                <p className="text-zinc-500">Geen klantgegevens beschikbaar</p>
            </div>
        );
    }

    const projectAdres = klantInfo.afwijkendProjectadres && klantInfo.projectAdres
        ? klantInfo.projectAdres
        : { straat: klantInfo.straat, huisnummer: klantInfo.huisnummer, postcode: klantInfo.postcode, plaats: klantInfo.plaats };

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <h3 className="font-semibold text-zinc-400 text-sm mb-4 flex items-center gap-2">
                <User size={14} />
                KLANTGEGEVENS
            </h3>

            <div className="space-y-1">
                <p className="font-medium text-white">
                    {klantInfo.voornaam} {klantInfo.achternaam}
                </p>
                {klantInfo.bedrijfsnaam && (
                    <p className="text-zinc-300">{klantInfo.bedrijfsnaam}</p>
                )}
                <p className="text-zinc-500 text-sm">{klantInfo.klanttype}</p>
            </div>

            <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-start gap-2 text-zinc-300">
                    <MapPin size={14} className="mt-0.5 text-zinc-500" />
                    <div>
                        <p>{klantInfo.straat} {klantInfo.huisnummer}</p>
                        <p>{klantInfo.postcode} {klantInfo.plaats}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                    <Mail size={14} className="text-zinc-500" />
                    <a href={`mailto:${klantInfo.emailadres}`} className="hover:text-white">
                        {klantInfo.emailadres}
                    </a>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                    <Phone size={14} className="text-zinc-500" />
                    <a href={`tel:${klantInfo.telefoonnummer}`} className="hover:text-white">
                        {klantInfo.telefoonnummer}
                    </a>
                </div>
            </div>

            {klantInfo.afwijkendProjectadres && klantInfo.projectAdres && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                    <h4 className="font-semibold text-zinc-400 text-xs mb-2">PROJECTADRES</h4>
                    <div className="text-sm text-zinc-300">
                        <p>{klantInfo.projectAdres.straat} {klantInfo.projectAdres.huisnummer}</p>
                        <p>{klantInfo.projectAdres.postcode} {klantInfo.projectAdres.plaats}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
