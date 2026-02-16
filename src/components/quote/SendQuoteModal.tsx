'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Download, Sparkles, Loader2 } from "lucide-react";
import { KlantInformatie, generateWorkSummary } from "@/lib/quote-calculations";
import { toast } from "@/hooks/use-toast";
import { useUser } from '@/firebase';
import { reportOperationalError } from '@/lib/report-operational-error';

interface SendQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    klantInfo: KlantInformatie | null;
    offerteNummer: string;
    werkbeschrijving: any;
    onDownloadPDF: () => Promise<void> | void;
    totaalInclBtw: number;
    geldigTot: string;
    bedrijfsnaam: string;
    afzenderNaam: string;
    korteTitel?: string;
    korteBeschrijving?: string;
    onMarkAsSent?: () => Promise<void> | void;
}

export function SendQuoteModal({
    isOpen,
    onClose,
    klantInfo,
    offerteNummer,
    werkbeschrijving,
    onDownloadPDF,
    totaalInclBtw,
    geldigTot,
    bedrijfsnaam,
    afzenderNaam,
    korteTitel,
    korteBeschrijving,
    onMarkAsSent
}: SendQuoteModalProps) {
    const { user } = useUser();
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (isOpen && klantInfo) {
            setEmail(klantInfo.emailadres || '');

            const shortDesc = generateWorkSummary(werkbeschrijving, 40);
            setSubject(`Offerte #${offerteNummer}${shortDesc ? ` - ${shortDesc}` : ''}`);

            // Set a default body or placeholder
            setBody(`Beste ${klantInfo.voornaam || (klantInfo.bedrijfsnaam || 'klant')},\n\nHierbij ontvangt u de offerte voor de aangevraagde werkzaamheden.\n\nMet vriendelijke groet,\n\n${bedrijfsnaam || klantInfo.bedrijfsnaam || ''}`);
        }
    }, [isOpen, klantInfo, offerteNummer, werkbeschrijving, bedrijfsnaam]);

    const handleGenerateEmail = async () => {
        if (!klantInfo) return;
        if (!user) {
            toast({
                title: "Niet ingelogd",
                description: "Log opnieuw in en probeer daarna nogmaals.",
                variant: "destructive",
            });
            return;
        }

        setIsGenerating(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/generate-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    klantNaam: `${klantInfo.voornaam} ${klantInfo.achternaam}`,
                    klantVoornaam: klantInfo.voornaam,
                    offerteNummer: offerteNummer,
                    korteTitel: korteTitel || '',
                    korteBeschrijving: korteBeschrijving || '',
                    totaalInclBtw: totaalInclBtw,
                    geldigTot: geldigTot,
                    bedrijfsnaam: bedrijfsnaam,
                    afzenderNaam: afzenderNaam
                })
            });

            if (!response.ok) {
                const apiError = await response
                    .json()
                    .then((payload) => {
                        if (!payload || typeof payload !== 'object') return null;
                        const candidate = payload as { error?: unknown; message?: unknown };
                        if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
                        if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
                        return null;
                    })
                    .catch(() => null);

                throw new Error(apiError || `Generation failed (${response.status})`);
            }

            const data = await response.json();
            if (data.onderwerp || data.body) {
                if (data.onderwerp) {
                    setSubject(`Offerte #${offerteNummer} - ${data.onderwerp}`);
                }
                if (data.body) {
                    setBody(data.body);
                }
                toast({
                    title: "Tekst gegenereerd",
                    description: "De e-mail tekst en het onderwerp zijn succesvol aangepast.",
                });
            } else {
                throw new Error('No valid content in response');
            }
        } catch (error) {
            console.error('Error generating email:', error);
            const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren van e-mailtekst.';
            void reportOperationalError({
                source: 'send_quote_generate_email',
                title: 'Fout bij genereren',
                message,
                context: {
                    offerteNummer,
                },
            });
            toast({
                title: "Fout bij genereren",
                description: "Kon tekst niet genereren, probeer opnieuw.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadAndOpenEmail = async () => {
        if (isSending) return;
        const trimmedEmail = email.trim();
        const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

        if (!emailIsValid) {
            toast({
                title: "E-mailadres ongeldig",
                description: "Vul een geldig e-mailadres in voordat je verstuurt.",
                variant: "destructive",
            });
            return;
        }

        setIsSending(true);
        try {
            try {
                await Promise.resolve(onDownloadPDF());
            } catch (error) {
                console.error('Error downloading PDF before mailto:', error);
                toast({
                    title: "PDF downloaden mislukt",
                    description: "De e-mail is niet geopend. Probeer het opnieuw.",
                    variant: "destructive",
                });
                return;
            }

            if (onMarkAsSent) {
                try {
                    await Promise.resolve(onMarkAsSent());
                } catch (error) {
                    console.error('Error marking quote as sent:', error);
                    toast({
                        title: "Status bijwerken mislukt",
                        description: "Kon offerte niet op 'Verstuurd' zetten. Probeer het opnieuw.",
                        variant: "destructive",
                    });
                    return;
                }
            }

            const encodedSubject = encodeURIComponent(subject);
            const encodedBody = encodeURIComponent(body);
            const mailto = `mailto:${encodeURIComponent(trimmedEmail)}?subject=${encodedSubject}&body=${encodedBody}`;

            window.location.href = mailto;

            toast({
                title: "E-mail geopend",
                description: "Vergeet niet de gedownloade PDF als bijlage toe te voegen.",
                duration: 5000,
            });

            onClose();
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Mail className="w-5 h-5 text-emerald-400" />
                        Offerte versturen
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-zinc-400">Klant e-mailadres</Label>
                        <Input
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="naam@voorbeeld.nl"
                            className="bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="subject" className="text-zinc-400">Onderwerp</Label>
                        <Input
                            id="subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="body" className="text-zinc-400">E-mail bericht</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleGenerateEmail}
                                disabled={isGenerating || isSending}
                                className="h-7 text-xs gap-1 text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Genereren...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-3 h-3" />
                                        Genereer tekst
                                    </>
                                )}
                            </Button>
                        </div>
                        <Textarea
                            id="body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Typ hier uw bericht aan de klant..."
                            className="min-h-[150px] bg-zinc-800 border-zinc-700 focus:ring-emerald-500 text-white resize-none"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        onClick={handleDownloadAndOpenEmail}
                        disabled={isSending || isGenerating}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                    >
                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        <div className="flex flex-col items-start leading-tight">
                            <span>{isSending ? 'PDF downloaden...' : 'Download PDF en open e-mail'}</span>
                            <span className="text-[10px] opacity-80 font-normal">Voeg de PDF handmatig toe in je mail-app</span>
                        </div>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
