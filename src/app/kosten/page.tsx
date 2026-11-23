import { redirect } from 'next/navigation';

import { KostenPage, type KostenView } from '@/components/kosten/KostenPage';

interface KostenPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

const LEGACY_VIEWS = [
  'pdfs', 'overview', 'finance-costs', 'invoices', 'quotes', 'projects',
  'analysis', 'bouwmaat', 'knab-account', 'bunq-personal',
] as const satisfies readonly KostenView[];

export default function Page({ searchParams }: KostenPageProps) {
  const { tab, ...otherParams } = searchParams;
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  if (requestedTab === 'quick-add' || requestedTab === 'totalen' || requestedTab === 'kosten') {
    const pathname = requestedTab === 'quick-add' ? '/snel-toevoegen' : requestedTab === 'totalen' ? '/totalen' : '/kosten';
    const params = new URLSearchParams();
    for (const [key, values] of Object.entries(otherParams)) {
      for (const value of Array.isArray(values) ? values : [values]) {
        if (value !== undefined) params.append(key, value);
      }
    }
    redirect(params.size ? `${pathname}?${params}` : pathname);
  }

  const view = LEGACY_VIEWS.find((legacyView) => legacyView === requestedTab) ?? 'kosten';
  return <KostenPage view={view} />;
}
