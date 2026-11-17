import QuoteWorkspace from '@/components/quote/QuoteWorkspace';

export default function QuotePage({ searchParams }: { searchParams: { tab?: string } }) {
    return <QuoteWorkspace initialTab={searchParams.tab === 'offertecheck' ? 'offertecheck' : undefined} />;
}
