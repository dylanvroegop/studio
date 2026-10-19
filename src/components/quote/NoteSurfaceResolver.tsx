'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, updateDoc, type Firestore } from 'firebase/firestore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { noteSurfaceArea, validNoteSurfaceSelection, type NoteSurfaceCandidate, type NoteSurfaceSelection } from '@/lib/note-surfaces';

interface Props {
    candidates: NoteSurfaceCandidate[];
    enabled: boolean;
    savedSelection: unknown;
    quoteId: string;
    user: User | null;
    firestore: Firestore | null;
}

export function useNoteSurfaceResolver({ candidates, enabled, savedSelection, quoteId, user, firestore }: Props) {
    const fingerprint = JSON.stringify(candidates);
    const [localSelection, setLocalSelection] = useState<NoteSurfaceSelection | null>(null);
    const [reviewed, setReviewed] = useState('');
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [choices, setChoices] = useState<Record<string, 'wand' | 'plafond' | ''>>({});
    const single = useMemo(() => candidates.length === 1 ? validNoteSurfaceSelection({
        fingerprint, surfaces: [{ key: candidates[0].key, kind: /plafond/i.test(candidates[0].title) ? 'plafond' : 'wand' }],
    }, candidates, fingerprint) : null, [candidates, fingerprint]);
    const selection = useMemo(() => validNoteSurfaceSelection(localSelection, candidates, fingerprint)
        || validNoteSurfaceSelection(savedSelection, candidates, fingerprint) || single,
    [localSelection, savedSelection, candidates, fingerprint, single]);
    const resolved = Boolean(selection);

    useEffect(() => {
        if (!enabled || resolved || !candidates.length || reviewed === fingerprint || !user || !firestore) return;
        let active = true;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setBusy(true);
            setError('');
            try {
                const token = await user.getIdToken();
                const response = await fetch('/api/quote-notes/select-surfaces', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ candidates }), signal: controller.signal,
                });
                if (!response.ok) throw new Error('AI niet beschikbaar. Kies de wand of het plafond.');
                const payload = await response.json();
                if (!active) return;
                const next = payload.certain === true
                    ? validNoteSurfaceSelection({ fingerprint, surfaces: payload.surfaces }, candidates, fingerprint) : null;
                if (next) {
                    await updateDoc(doc(firestore, 'quotes', quoteId), { noteSurfaceSelection: next });
                    if (active) setLocalSelection(next);
                } else {
                    setChoices({});
                    setOpen(true);
                }
            } catch {
                if (active) { setChoices({}); setOpen(true); }
            } finally {
                if (active) { setBusy(false); setReviewed(fingerprint); }
            }
        }, 700);
        return () => { active = false; clearTimeout(timer); controller.abort(); setBusy(false); };
    }, [candidates, enabled, fingerprint, firestore, quoteId, resolved, reviewed, user]);

    async function saveSelection(): Promise<void> {
        if (!firestore || saving) return;
        const next = validNoteSurfaceSelection({ fingerprint,
            surfaces: Object.entries(choices).filter(([, kind]) => kind).map(([key, kind]) => ({ key, kind })),
        }, candidates, fingerprint);
        if (!next) { setError('Kies minimaal één regel met twee geldige maten.'); return; }
        setSaving(true);
        setError('');
        try {
            await updateDoc(doc(firestore, 'quotes', quoteId), { noteSurfaceSelection: next });
            setLocalSelection(next);
            setOpen(false);
        } catch { setError('Keuze opslaan mislukt. Probeer opnieuw.'); }
        finally { setSaving(false); }
    }

    const dialog = (
        <Dialog open={open && enabled} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Welke maten uit de notities horen bij de wand?</DialogTitle>
                    <DialogDescription>Kies de wand- of plafondvlakken voor het naden vullen. De oppervlakte wordt uit de ingevulde maten berekend.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {candidates.map(row => (
                        <div key={row.key} className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_auto]">
                            <div>
                                <div className="font-medium">{row.title || row.section || 'Maatwerk'}</div>
                                <div className="text-xs text-muted-foreground">
                                    {[row.length && `L ${row.length}`, row.width && `B ${row.width}`, row.height && `H ${row.height}`].filter(Boolean).join(' × ')} mm
                                    {' · '}{noteSurfaceArea(row, choices[row.key] || 'wand').toLocaleString('nl-NL', { maximumFractionDigits: 2 })} m²
                                </div>
                                {!noteSurfaceArea(row) && <p className="text-xs text-destructive">Vul eerst twee geldige maten in bij Notes.</p>}
                            </div>
                            <div className="flex flex-wrap gap-1" role="group" aria-label={`Gebruik ${row.title || row.key} als`}>
                                {(['', 'wand', 'plafond'] as const).map(kind => (
                                    <Button key={kind} type="button" size="sm" variant={(choices[row.key] || '') === kind ? 'default' : 'outline'}
                                        aria-pressed={(choices[row.key] || '') === kind} disabled={!noteSurfaceArea(row) || saving}
                                        onClick={() => setChoices(current => ({ ...current, [row.key]: kind }))}>
                                        {kind === 'wand' ? 'Wand' : kind === 'plafond' ? 'Plafond' : 'Niet gebruiken'}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button disabled={saving} onClick={() => void saveSelection()}>{saving ? 'Opslaan…' : 'Gebruik gekozen maten'}</Button>
            </DialogContent>
        </Dialog>
    );
    return { selection, busy, dialog, openDialog: () => {
        setChoices(Object.fromEntries(selection?.surfaces.map(surface => [surface.key, surface.kind]) || []));
        setError(''); setOpen(true);
    } };
}
