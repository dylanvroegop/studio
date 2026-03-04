import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { MeasurementUnitProvider } from '@/context/MeasurementUnitContext';
import { BusinessProfileGate } from '@/components/BusinessProfileGate';
import { ThemeModeProvider } from '@/context/ThemeModeContext';

export const metadata: Metadata = {
  title: 'Calvora',
  description: 'Maak snel en eenvoudig offertes voor timmerwerk.',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

const themeBootstrapScript = `
(function() {
  try {
    var storageKey = 'offertehulp.appearanceMode';
    var defaultMode = 'dark';
    var stored = window.localStorage.getItem(storageKey);
    var mode = stored === 'light' || stored === 'dark' ? stored : defaultMode;
    var root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    root.dataset.theme = mode;
  } catch (error) {
    var root = document.documentElement;
    root.classList.add('dark');
    root.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <ThemeModeProvider>
            <MeasurementUnitProvider>
              <BusinessProfileGate />
              {children}
              <Toaster />
            </MeasurementUnitProvider>
          </ThemeModeProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
