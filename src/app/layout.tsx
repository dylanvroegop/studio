import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { FirebaseProvider } from '@/firebase/provider';

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
          <FirebaseProvider>
            {children}
          </FirebaseProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
