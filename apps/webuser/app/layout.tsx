import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { svgDataUri, wordmarkSvg } from '@proot/shared';
import { HeaderAccount } from '../components/HeaderAccount';
import { Nav } from '../components/Nav';
import { PetName } from '../components/PetBadge';
import { SessionProvider } from '../lib/session';
import '@proot/shared/tokens.css';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const logo = svgDataUri(wordmarkSvg('light'));

export const metadata: Metadata = {
  title: 'Proot | Dog neighborhood',
  description: 'A polished dog-care neighborhood app for pets, care, and community.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <SessionProvider>
          <header className="topbar">
            <div className="wrap topbar-inner">
              <Link className="brand" href="/" aria-label="Proot home">
                <img src={logo} alt="Proot" />
              </Link>
              <Nav />
              <HeaderAccount />
            </div>
          </header>
          {children}
          <footer className="footer">
            <div className="wrap footer-inner">
              <div>
                <Link className="brand" href="/" aria-label="Proot home">
                  <img src={logo} alt="Proot" />
                </Link>
                <p>Pet care, commerce, and community for the dogs on your block.</p>
              </div>
              <div className="footer-links">
                <Link href="/shop">Shop</Link>
                <Link href="/care">Care</Link>
                <Link href="/events">Events</Link>
                <Link href="/parks">Parks</Link>
              </div>
              <p className="footer-meta"><PetName />’s neighborhood · © {new Date().getFullYear()} Proot</p>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
