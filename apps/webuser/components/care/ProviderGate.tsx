'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { canOfferCare } from '@proot/shared';
import { EmptyState, PageLoading } from '../ui';
import { useRequireUser } from '../../lib/hooks';

/** Renders provider tools only for roles that can offer care. */
export function ProviderGate({ children }: { children: ReactNode }) {
  const { ready, user } = useRequireUser();
  if (!ready || !user) return <PageLoading />;
  if (!canOfferCare(user.role)) {
    return (
      <main className="wrap page-section">
        <EmptyState
          icon="heart"
          title="Provider tools are for care providers."
          text="Your account is a member account. Ask the Proot team to switch it to a provider account to list services and take bookings."
          action={<Link className="button secondary" href="/care">Browse care</Link>}
        />
      </main>
    );
  }
  return <>{children}</>;
}

export function ProviderTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Provider tools">
      <Link className={`option${pathname === '/provider/services' ? ' selected' : ''}`} href="/provider/services">My services</Link>
      <Link className={`option${pathname === '/provider/bookings' ? ' selected' : ''}`} href="/provider/bookings">Incoming bookings</Link>
    </nav>
  );
}
