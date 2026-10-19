import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 });
    const { auth, firestore } = initFirebaseAdmin();
    let uid: string;
    try { uid = (await auth.verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 }); }
    try {
        const { quoteId, startedAt } = await request.json();
        if (typeof quoteId !== 'string' || !quoteId || quoteId.includes('/') || !(startedAt === null || (typeof startedAt === 'number' && Number.isFinite(startedAt)))) {
            return NextResponse.json({ message: 'Ongeldige calculatie.' }, { status: 400 });
        }
        const ref = firestore.collection('quotes').doc(quoteId);
        const result = await firestore.runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists || snapshot.data()?.userId !== uid) return 404;
            const quote = snapshot.data()!;
            if (quote.status !== 'in_behandeling' && quote.status !== 'fout') return 409;
            const value = quote.calculationStartedAt;
            const currentStart = value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() : null;
            // Een oud tabblad mag een inmiddels nieuw gestarte berekening niet stoppen.
            if (currentStart !== startedAt) return 409;
            transaction.update(ref, {
                status: 'fout',
                calculationError: 'Wachten op de calculatie handmatig gestopt.',
                updatedAt: FieldValue.serverTimestamp(),
            });
            return 200;
        });
        if (result !== 200) return NextResponse.json({ message: result === 404 ? 'Offerte niet gevonden.' : 'De calculatie is inmiddels veranderd. Vernieuw de pagina.' }, { status: result });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ message: 'Wachten stoppen is mislukt. Probeer opnieuw.' }, { status: 500 });
    }
}
