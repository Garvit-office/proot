'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useRealtime, useSession } from '../lib/session';
import { Icon } from './Icon';
import { NotificationsMenu } from './Notifications';
import { PetAvatar, ProfileDrawer } from './ProfileDrawer';
import { UserAvatar } from './ui';

export function HeaderAccount() {
  const { status, user, pet } = useSession();
  const { cartCount } = useRealtime();
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
    <div className="header-actions">
      <Link className="header-icon" href="/cart" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}>
        <Icon name="cart" size={20} />
        {cartCount > 0 && <span className="badge-count">{cartCount > 99 ? '99+' : cartCount}</span>}
      </Link>
      <NotificationsMenu />
      <button
        className="avatar"
        onClick={() => setOpen(true)}
        aria-label={pet ? `Open ${pet.name}’s profile` : 'Open profile'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {pet ? <PetAvatar pet={pet} size={36} /> : user ? <UserAvatar name={user.name} url={user.avatarUrl} size={36} /> : null}
      </button>
      <ProfileDrawer open={open} onClose={close} />
    </div>
  );
}
