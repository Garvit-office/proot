import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@proot/shared/tokens.css';
import './globals.css';
import { AdminShell } from '../components/AdminShell';
import { SessionProvider } from '../lib/session';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Proot Admin',
  description: 'Administrative dashboard for Proot operations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <SessionProvider>
          <AdminShell>{children}</AdminShell>
        </SessionProvider>
      </body>
    </html>
  );
}
