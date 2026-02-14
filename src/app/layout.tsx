
import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { SupportSidePanel } from '@/components/SupportSidePanel';
import { FirebaseClientProvider } from '@/firebase';
import { MeasurementUnitProvider } from '@/context/MeasurementUnitContext';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'OfferteHulp',
  description: 'Maak snel en eenvoudig offertes voor timmerwerk.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className="dark">
      <body className={`${inter.variable} font-body antialiased`}>
        <FirebaseClientProvider>
          <MeasurementUnitProvider>
            {children}
            <SupportSidePanel />
            <Toaster />
          </MeasurementUnitProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
