"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/shop", label: "Shop" },
  { href: "/care", label: "Care" },
  { href: "/events", label: "Events" },
  { href: "/parks", label: "Parks" },
  { href: "/friends", label: "Friends" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/activity", label: "Activity" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="wrap">
      <nav className="nav">
        <Link href="/" className="logo">
          proot
        </Link>
        <div className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} data-active={path.startsWith(l.href)}>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
