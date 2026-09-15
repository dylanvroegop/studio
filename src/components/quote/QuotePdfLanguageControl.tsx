'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Languages, Loader2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { collectQuotePdfTexts, type PDFQuoteData } from '@/lib/generate-quote-pdf';
import { createQuotePdfTranslator, validateQuotePdfTranslations, type QuotePdfTranslation } from '@/lib/quote-pdf-translation';

interface QuotePdfLanguageControlProps {
    quoteId: string;
    pdfData: PDFQuoteData;
    disabled?: boolean;
    onBusyChange: (busy: boolean) => void;
    onSaved: (language: 'nl' | 'en', translation?: QuotePdfTranslation) => void;
}

export function QuotePdfLanguageControl({ quoteId, pdfData, disabled, onBusyChange, onSaved }: QuotePdfLanguageControlProps) {
    const { user } = useUser();
    const firestore = useFirestore();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    useEffect(() => () => requestRef.current?.abort(), [quoteId]);

    const selectLanguage = async (language: 'nl' | 'en'): Promise<void> => {
        if (!user || !firestore || busy) return;
        const controller = new AbortController();
        requestRef.current = controller;
        setBusy(true);
        onBusyChange(true);
        setError(null);
        try {
            let translation = pdfData.englishTranslation;
            if (language === 'en') {
                const texts = await collectQuotePdfTexts(pdfData);
                const t = createQuotePdfTranslator('en', translation);
                let reusable = true;
                try { texts.forEach(t); } catch { reusable = false; }
                if (!reusable) {
                    const token = await user.getIdToken();
                    const response = await fetch('/api/translate-quote-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ quoteId, texts }),
                        signal: controller.signal,
                    });
                    const payload = await response.json();
                    if (!response.ok) throw new Error(payload.error || 'Vertalen mislukt. Probeer opnieuw.');
                    const result = payload.translation as QuotePdfTranslation;
                    if (result?.version !== 1 || result.entries?.some((entry, index) => entry.source !== texts[index])) {
                        throw new Error('De vertaling sluit niet aan op deze offerte. Probeer opnieuw.');
                    }
                    translation = validateQuotePdfTranslations(texts, result.entries?.map((entry) => entry.english));
                }
            }
            if (controller.signal.aborted) return;
            await updateDoc(doc(firestore, 'quotes', quoteId), {
                pdfLanguage: language,
                ...(translation ? { pdfEnglishTranslation: translation } : {}),
            });
            if (!controller.signal.aborted) onSaved(language, translation);
        } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Vertalen mislukt. Probeer opnieuw.');
        } finally {
            onBusyChange(false);
            if (!controller.signal.aborted) setBusy(false);
        }
    };

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="PDF-taal">
                <Button type="button" size="sm" variant={pdfData.language !== 'en' ? 'default' : 'outline'}
                    aria-pressed={pdfData.language !== 'en'} disabled={disabled || busy}
                    onClick={() => void selectLanguage('nl')}>Nederlands</Button>
                <Button type="button" size="sm" variant={pdfData.language === 'en' ? 'default' : 'outline'}
                    aria-pressed={pdfData.language === 'en'} disabled={disabled || busy} className="gap-2"
                    title="Vertaal de volledige offertetekst met AI, of vernieuw de vertaling na wijzigingen."
                    onClick={() => void selectLanguage('en')}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                    English
                </Button>
                {busy && <span role="status" className="text-sm text-muted-foreground">PDF-taal voorbereiden...</span>}
            </div>
            {error && <p role="alert" className="max-w-xl text-sm text-destructive">{error}</p>}
            {pdfData.language === 'en' && pdfData.settings.showTekeningen && Boolean(pdfData.drawingImages?.length) && (
                <p className="text-xs text-muted-foreground">Tekst in aangeleverde tekeningen blijft onderdeel van de afbeelding.</p>
            )}
        </div>
    );
}
