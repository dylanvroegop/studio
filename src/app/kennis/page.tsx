'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Calculator, Hammer, Receipt } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { useUser } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function PageSkeleton() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Kennis" />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Kennisbank laden...</CardTitle>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}

export default function KennisPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, router, user]);

  if (isUserLoading || !user) {
    return <PageSkeleton />;
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Kennis" />

      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Card className="border-border/70 bg-card/40 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-400" />
              <CardTitle>Kennisbank</CardTitle>
            </div>
            <CardDescription>
              Handige informatie voor je dagelijkse werk. Kies een hoofdtab, en daarna een subtab voor het juiste onderwerp.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="belasting" className="w-full">
              <TabsList className="mb-4 grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="belasting" className="gap-2">
                  <Receipt className="h-4 w-4" />
                  Belasting
                </TabsTrigger>
                <TabsTrigger value="gereedschap" className="gap-2">
                  <Hammer className="h-4 w-4" />
                  Gereedschap
                </TabsTrigger>
              </TabsList>

              <TabsContent value="belasting" className="mt-0">
                <Tabs defaultValue="overzicht" className="w-full">
                  <TabsList className="mb-4 w-full justify-start gap-2 overflow-x-auto">
                    <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
                    <TabsTrigger value="aftrek" className="gap-2">
                      <Calculator className="h-4 w-4" />
                      Aftrek
                    </TabsTrigger>
                    <TabsTrigger value="aangifte">Aangifte</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overzicht" className="mt-0">
                    <Card className="border-emerald-500/20 bg-emerald-500/5">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Belasting overzicht</CardTitle>
                          <Badge variant="secondary">Nieuw</Badge>
                        </div>
                        <CardDescription>
                          Basisinformatie over btw, aangifteperiodes en fiscale aandachtspunten voor projecten.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="aftrek" className="mt-0">
                    <Card className="border-emerald-500/20 bg-emerald-500/5">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Aftrek</CardTitle>
                          <Badge variant="secondary">Nieuw</Badge>
                        </div>
                        <CardDescription>
                          Notities voor aftrekposten, voorwaarden en praktische checks per klus en kostenpost.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="aangifte" className="mt-0">
                    <Card className="border-emerald-500/20 bg-emerald-500/5">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Aangifte</CardTitle>
                        </div>
                        <CardDescription>
                          Werkwijze en checklist voor correcte btw-aangifte op maand- of kwartaalbasis.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="gereedschap" className="mt-0">
                <Card className="border-blue-500/20 bg-blue-500/5">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">Gereedschap</CardTitle>
                      <Badge variant="secondary">Nieuw</Badge>
                    </div>
                    <CardDescription>
                      Praktische tips en naslag voor gereedschap, onderhoud en gebruik in verschillende klussen.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
