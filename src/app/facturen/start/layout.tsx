import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Factureren',
  manifest: '/factureren.webmanifest',
  appleWebApp: { capable: true, title: 'Factureren', statusBarStyle: 'default' },
};

export default function InvoiceStartLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
