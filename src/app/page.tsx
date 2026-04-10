import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { initFirebaseAdmin } from '@/firebase/admin';
import { FIREBASE_SESSION_COOKIE_NAME } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(FIREBASE_SESSION_COOKIE_NAME)?.value || null;

  if (!sessionCookie) {
    redirect('/login');
  }

  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifySessionCookie(sessionCookie, true).catch(() => null);

  if (decoded?.uid) {
    redirect('/dashboard');
  }

  redirect('/login');
}
