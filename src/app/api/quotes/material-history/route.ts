import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const { auth, firestore } = initFirebaseAdmin();
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 });
    let uid: string;
    try { uid = (await auth.verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 }); }
    try {
        const { quoteId } = await request.json();
        if (typeof quoteId !== 'string' || !quoteId || quoteId.includes('/')) {
            return NextResponse.json({ message: 'Ongeldige offerte.' }, { status: 400 });
        }
        const quoteRef = firestore.collection('quotes').doc(quoteId);
        const quote = await quoteRef.get();
        if (!quote.exists || quote.data()?.userId !== uid) {
            return NextResponse.json({ message: 'Offerte niet gevonden.' }, { status: 404 });
        }
        const history = await quoteRef.collection('materialCalculationHistory').orderBy('savedAt', 'desc').get();
        return NextResponse.json({ rows: history.docs.map((doc, index) => ({
            number: history.docs.length - index,
            deleted: Boolean(doc.data().deletedAt),
            id: doc.id,
            savedAt: doc.data().savedAt,
            data: JSON.parse(doc.data().materialsJson),
        })).filter(row => !row.deleted) });
    } catch {
        return NextResponse.json({ message: 'Eerdere calculaties konden niet worden geladen.' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 });
    const { auth, firestore } = initFirebaseAdmin();
    let uid: string;
    try { uid = (await auth.verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 }); }
    try {
        const { quoteId, historyId } = await request.json();
        if (![quoteId, historyId].every(value => typeof value === 'string' && value.length > 0 && !value.includes('/'))) {
            return NextResponse.json({ message: 'Ongeldige stand.' }, { status: 400 });
        }
        const quoteRef = firestore.collection('quotes').doc(quoteId);
        const historyRef = quoteRef.collection('materialCalculationHistory').doc(historyId);
        const status = await firestore.runTransaction(async transaction => {
            const quote = await transaction.get(quoteRef);
            if (!quote.exists || quote.data()?.userId !== uid) return 404;
            const snapshot = await transaction.get(historyRef);
            if (!snapshot.exists) return 404;
            // Alleen de historische stand verbergen; actieve materialen blijven intact.
            transaction.update(historyRef, { deletedAt: new Date().toISOString() });
            return 200;
        });
        return NextResponse.json(status === 200 ? { ok: true } : { message: 'Stand niet gevonden.' }, { status });
    } catch {
        return NextResponse.json({ message: 'Stand verwijderen mislukt.' }, { status: 500 });
    }
}
