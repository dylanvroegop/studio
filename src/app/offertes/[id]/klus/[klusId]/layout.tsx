import type { ReactNode } from 'react';
import QuoteWorkspace from '@/components/quote/QuoteWorkspace';

export default function JobLayout({ children }: { children: ReactNode }) {
    return <QuoteWorkspace>{children}</QuoteWorkspace>;
}
