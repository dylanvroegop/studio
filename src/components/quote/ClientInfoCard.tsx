'use client';

import { KlantInformatie } from '@/lib/quote-calculations';
import { User, MapPin, Mail, Phone } from 'lucide-react';

interface ClientInfoCardProps {
    klantInfo: KlantInformatie | null;
}

export function ClientInfoCard({ klantInfo }: ClientInfoCardProps) {
    if (!klantInfo) {
        return (
            <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="font-semibold text-muted-foreground text-sm mb-4">KLANTGEGEVENS</h3>
                <p className="text-muted-foreground">Geen klantgegevens beschikbaar</p>
            </div>
        );
    }

    const projectAdres = klantInfo.afwijkendProjectadres && klantInfo.projectAdres
        ? klantInfo.projectAdres
        : { straat: klantInfo.straat, huisnummer: klantInfo.huisnummer, postcode: klantInfo.postcode, plaats: klantInfo.plaats };

    return (
        <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="font-semibold text-muted-foreground text-sm mb-4 flex items-center gap-2">
                <User size={14} />
                KLANTGEGEVENS
            </h3>

            <div className="space-y-1">
                <p className="font-medium text-foreground">
                    {klantInfo.voornaam} {klantInfo.achternaam}
                </p>
                {klantInfo.bedrijfsnaam && (
                    <p className="text-foreground/80">{klantInfo.bedrijfsnaam}</p>
                )}
                <p className="text-muted-foreground text-sm">{klantInfo.klanttype}</p>
            </div>

            <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-start gap-2 text-foreground/80">
                    <MapPin size={14} className="mt-0.5 text-muted-foreground" />
                    <div>
                        <p>{klantInfo.straat} {klantInfo.huisnummer}</p>
                        <p>{klantInfo.postcode} {klantInfo.plaats}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail size={14} className="text-muted-foreground" />
                    <a href={`mailto:${klantInfo.emailadres}`} className="hover:text-foreground">
                        {klantInfo.emailadres}
                    </a>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone size={14} className="text-muted-foreground" />
                    <a href={`tel:${klantInfo.telefoonnummer}`} className="hover:text-foreground">
                        {klantInfo.telefoonnummer}
                    </a>
                </div>
            </div>

            {klantInfo.afwijkendProjectadres && klantInfo.projectAdres && (
                <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="font-semibold text-muted-foreground text-xs mb-2">PROJECTADRES</h4>
                    <div className="text-sm text-foreground/80">
                        <p>{klantInfo.projectAdres.straat} {klantInfo.projectAdres.huisnummer}</p>
                        <p>{klantInfo.projectAdres.postcode} {klantInfo.projectAdres.plaats}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
