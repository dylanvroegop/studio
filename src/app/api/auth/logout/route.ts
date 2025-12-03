import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function POST(req: NextRequest) {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);
    session.destroy();
    return NextResponse.json({ message: 'Logged out' }, { status: 200 });
}
