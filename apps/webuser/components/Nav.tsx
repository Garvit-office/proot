'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/shop', label: 'Shop' },
  { href: '/care', label: 'Care' },
  { href: '/events', label: 'Events' },
  { href: '/parks', label: 'Parks' },
  { href: '/friends', label: 'Friends' },
  { href: '/nutrition', label: 'Nutrition' },
  { href: '/activity', label: 'Activity' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Main navigation">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
