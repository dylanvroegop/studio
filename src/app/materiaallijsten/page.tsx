'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, updateDoc, doc, where } from 'firebase/firestore';
import { ClipboardList, Loader2 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestore, useUser } from '@/firebase';
import { createMaterialList, type MaterialList } from '@/lib/material-lists';

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function MateriaallijstenPageContent() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [error, setError] = useState<string | null>(null);
  const initializingRef = useRef(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    const unsubscribe = onSnapshot(
      query(collection(firestore, 'material_lists'), where('userId', '==', user.uid)),
      async (snapshot) => {
        if (initializingRef.current) return;

        const lists = snapshot.docs.map((snapshotDoc) => ({
          ...(snapshotDoc.data() as unknown as MaterialList),
          id: snapshotDoc.id,
        }));
        const generalList = lists.find((list) => list.is_general === true);

        if (generalList) {
          router.replace(`/materiaallijsten/${generalList.id}`);
          return;
        }

        const standaloneList = lists.find((list) => !list.quote_id);
        initializingRef.current = true;

        try {
          if (standaloneList) {
            await updateDoc(doc(firestore, 'material_lists', standaloneList.id), {
              is_general: true,
              title: 'Mijn materiaallijst',
              quote_id: null,
              quote_number: null,
              quote_client_name: null,
              status: 'active',
            });
            router.replace(`/materiaallijsten/${standaloneList.id}`);
          } else {
            const id = await createMaterialList(firestore, {
              userId: user.uid,
              title: 'Mijn materiaallijst',
              status: 'active',
              isGeneral: true,
            });
            router.replace(`/materiaallijsten/${id}`);
          }
        } catch (err: unknown) {
          const record = getRecord(err);
          setError(typeof record.message === 'string' ? record.message : 'Materiaallijst kon niet worden geopend.');
          initializingRef.current = false;
        }
      },
      (err: unknown) => {
        const record = getRecord(err);
        setError(`${getString(record.code) || 'error'}: ${getString(record.message) || 'Materiaallijst kon niet worden geladen.'}`);
      }
    );

    return unsubscribe;
  }, [firestore, router, user]);

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Materiaallijst" />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-8 md:px-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            {error ? (
              <>
                <ClipboardList className="h-10 w-10 text-red-300" />
                <p className="text-sm text-red-200">{error}</p>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="text-sm text-muted-foreground">Materiaallijst openen...</p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function MateriaallijstenPage() {
  return <MateriaallijstenPageContent />;
}
