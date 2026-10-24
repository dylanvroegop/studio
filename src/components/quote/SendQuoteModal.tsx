'use client';

import React, { useEffect, useRef, useState } from 'react';
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

export interface QuoteAttachmentOptions {
    includeOfferte: boolean;
    includeTekeningen: boolean;
    includeWerkbeschrijving: boolean;
}

interface SendQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    klantInfo: KlantInformatie | null;
    offerteNummer: string;
    werkbeschrijving: any;
    onDownloadPDF: (options: QuoteAttachmentOptions) => Promise<void> | void;
    totaalInclBtw: number;
    geldigTot: string;
    bedrijfsnaam: string;
    afzenderNaam: string;
    afzenderEmail?: string;
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
    afzenderEmail,
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
    const hasInitializedForOpenRef = useRef(false);
    const isLaunchingMailRef = useRef(false);
    const attachments: QuoteAttachmentOptions = {
        includeOfferte: true,
        includeTekeningen: false,
        includeWerkbeschrijving: false,
    };

    useEffect(() => {
        if (!isOpen) {
            hasInitializedForOpenRef.current = false;
            isLaunchingMailRef.current = false;
            return;
        }

        if (!klantInfo || hasInitializedForOpenRef.current) return;

        hasInitializedForOpenRef.current = true;
        setEmail(klantInfo.emailadres || '');


        const shortDesc = generateWorkSummary(werkbeschrijving, 40);
        setSubject(`Offerte #${offerteNummer}${shortDesc ? ` - ${shortDesc}` : ''}`);

        setBody(`Goedenavond ${klantInfo.voornaam || klantInfo.bedrijfsnaam || 'klant'},\n\nBedankt voor het prettige gesprek.\n\nHierbij ontvangt u de offerte voor de besproken werkzaamheden. Mocht er iets niet duidelijk zijn of wilt u bepaalde onderdelen aanpassen, dan hoor ik dat graag.\n\nMet vriendelijke groet,\n\nDylan Vroegop\nVroegop Timmerwerken`);
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
        if (isSending || isLaunchingMailRef.current) return;
        const trimmedEmail = email.trim();
        const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
        const selectedAttachmentCount = [attachments.includeOfferte, attachments.includeTekeningen, attachments.includeWerkbeschrijving]
            .filter(Boolean)
            .length;

        if (!emailIsValid) {
            toast({
                title: "E-mailadres ongeldig",
                description: "Vul een geldig e-mailadres in voordat je verstuurt.",
                variant: "destructive",
            });
            return;
        }

        if (selectedAttachmentCount === 0) {
            toast({
                title: "Kies minimaal één PDF",
                description: "Selecteer offerte, tekeningen en/of Werk & Levering.",
                variant: "destructive",
            });
            return;
        }

        const gmailTab = window.open('about:blank', 'calvora-gmail-compose');
        if (!gmailTab) {
            toast({ title: 'Gmail niet geopend', description: 'Sta het openen van Gmail toe in je browser en probeer opnieuw.', variant: 'destructive' });
            return;
        }
        gmailTab.opener = null;
        isLaunchingMailRef.current = true;
        setIsSending(true);
        try {
            try {
                await Promise.resolve(onDownloadPDF(attachments));
            } catch (error) {
                gmailTab.close();
                console.error('Error downloading PDF before Gmail:', error);
                toast({
                    title: "PDF downloaden mislukt",
                    description: "De e-mail is niet geopend. Probeer het opnieuw.",
                    variant: "destructive",
                });
                return;
            }

            const gmailUrl = new URL('https://mail.google.com/mail/');
            gmailUrl.search = new URLSearchParams({
                view: 'cm', fs: '1', to: trimmedEmail, su: subject, body,
                ...(afzenderEmail?.trim() ? { authuser: afzenderEmail.trim() } : {}),
            }).toString();
            gmailTab.location.href = gmailUrl.toString();

            if (onMarkAsSent) {
                try {
                    await Promise.resolve(onMarkAsSent());
                } catch (error) {
                    console.error('Error marking quote as sent:', error);
                    toast({
                        title: "Status bijwerken mislukt",
                        description: "Gmail is geopend, maar de offertestatus kon niet worden bijgewerkt.",
                        variant: "destructive",
                    });
                    return;
                }
            }

            toast({
                title: "Gmail geopend",
                description: selectedAttachmentCount === 1
                    ? "Vergeet niet de gedownloade PDF als bijlage toe te voegen."
                    : `Vergeet niet ${selectedAttachmentCount} gedownloade PDF's als bijlage toe te voegen.`,
                duration: 5000,
            });

            onClose();
        } finally {
            setIsSending(false);
            isLaunchingMailRef.current = false;
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

                    <p className="text-sm text-zinc-400">
                        Je downloadt één complete offerte-PDF, zoals in het tabblad PDF.
                        Voeg dit bestand daarna als bijlage toe in Gmail.
                    </p>

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
                        variant="success"
                        onClick={handleDownloadAndOpenEmail}
                        disabled={isSending || isGenerating}
                        className="w-full py-6 rounded-xl flex items-center justify-center gap-2"
                    >
                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        <div className="flex flex-col items-start leading-tight">
                            <span>{isSending ? 'Offerte-PDF downloaden...' : 'Download offerte-PDF en open Gmail'}</span>
                            <span className="text-[10px] opacity-80 font-normal">Voeg de offerte-PDF toe in Gmail</span>
                        </div>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
