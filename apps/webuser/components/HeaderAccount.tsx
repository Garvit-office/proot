'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import { PetAvatar, ProfileDrawer } from './ProfileDrawer';

export function HeaderAccount() {
  const { status, user, pet } = useSession();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);

  // Navigating away (e.g. to edit the profile) closes the drawer.
  useEffect(() => setOpen(false), [pathname]);

  if (status === 'loading') return <span className="avatar avatar-skeleton" aria-hidden="true" />;

  if (status === 'guest') {
    return <Link className="button primary header-cta" href="/onboarding">Get started</Link>;
  }

  return (
    <>
      <button
        className="avatar"
        onClick={() => setOpen(true)}
        aria-label={pet ? `Open ${pet.name}’s profile` : 'Open profile'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {pet ? <PetAvatar pet={pet} size={36} /> : user?.name[0]?.toUpperCase()}
      </button>
      <ProfileDrawer open={open} onClose={close} />
    </>
  );
}
