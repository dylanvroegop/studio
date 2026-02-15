
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { MeasurementUnitProvider } from '@/context/MeasurementUnitContext';

export const metadata: Metadata = {
  title: 'Calvora',
  description: 'Maak snel en eenvoudig offertes voor timmerwerk.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className="dark">
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <MeasurementUnitProvider>
            {children}
            <Toaster />
          </MeasurementUnitProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
