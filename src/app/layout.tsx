import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { AppProvider } from '@/context/AppContext';
import { BrandThemeProvider } from '@/components/theme/BrandThemeProvider';
import '../styles/tailwind.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const appBaseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://app.rismos.com';

export const metadata: Metadata = {
  title: 'RISMOS — Run Retail. Smarter.',
  description:
    'RISMOS is an enterprise multi-store retail and point-of-sale platform. Run Retail. Smarter.',
  metadataBase: new URL(appBaseUrl),
  openGraph: {
    title: 'RISMOS — Run Retail. Smarter.',
    description:
      'Enterprise multi-store retail POS billing, inventory, procurement, CRM, and accounting platform.',
    url: appBaseUrl,
    siteName: 'RISMOS',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: ['/favicon.svg'],
    apple: ['/favicon.svg'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="font-sans antialiased min-h-screen bg-background text-foreground"
      >
        <AppProvider>
          <BrandThemeProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                },
                duration: 3000,
              }}
            />
          </BrandThemeProvider>
        </AppProvider>
      </body>
    </html>
  );
}
