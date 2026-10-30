'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { canManageEvents, isAdmin, ROLE_LABELS, svgDataUri, wordmarkSvg, type Role } from '@proot/shared';
import { useSession } from '../lib/session';
import { Icon, type IconName } from './Icon';

const logo = svgDataUri(wordmarkSvg('dark'));

type NavItem = { href: string; label: string; icon: IconName; allowed: (role: Role) => boolean };

export const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: 'grid', allowed: isAdmin },
  { href: '/users', label: 'Users', icon: 'users', allowed: isAdmin },
  { href: '/events', label: 'Events', icon: 'flag', allowed: canManageEvents },
  { href: '/audit', label: 'Audit', icon: 'shield', allowed: isAdmin },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user, signOut } = useSession();
  const pathname = usePathname();

  if (status === 'loading') return <div className="center-screen"><span className="spinner" aria-label="Loading" /></div>;
  if (status === 'guest' || !user) return <LoginScreen />;

  if (!canManageEvents(user.role)) {
    return (
      <div className="center-screen">
        <div className="auth-card">
          <img src={svgDataUri(wordmarkSvg('light'))} alt="Proot" className="auth-logo" />
          <h1>No console access</h1>
          <p className="muted">{user.email} is a {ROLE_LABELS[user.role].toLowerCase()}. The console is for event managers and admins — ask an admin to change your role.</p>
          <button className="button block" onClick={signOut}>Sign in as someone else</button>
        </div>
      </div>
    );
  }

  const items = NAV.filter((item) => item.allowed(user.role));

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="Proot" />
          <small>{isAdmin(user.role) ? 'admin' : 'events'}</small>
        </div>
        <p className="nav-label">Workspace</p>
        <nav aria-label="Console sections">
          {items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
          <span className="nav-item unavailable" aria-disabled="true"><Icon name="bag" />Catalog<em>Soon</em></span>
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{user.name[0]?.toUpperCase()}</span>
          <div><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></div>
          <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={17} /></button>
        </div>
      </aside>
      <section className="workspace">{children}</section>
    </main>
  );
}

/** Renders children only for the allowed roles; anyone else is sent to Events (their one section). */
export function RequireRole({ allowed, children }: { allowed: (role: Role) => boolean; children: ReactNode }) {
  const { user } = useSession();
  const router = useRouter();
  const permitted = Boolean(user && allowed(user.role));

  useEffect(() => {
    if (!permitted) router.replace('/events');
  }, [permitted, router]);

  if (!permitted) {
    return (
      <div className="panel empty-state">
        <h2>Admins only</h2>
        <p className="muted">This section needs the admin role. <Link href="/events">Go to events</Link></p>
      </div>
    );
  }
  return <>{children}</>;
}

function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={submit}>
        <img src={svgDataUri(wordmarkSvg('light'))} alt="Proot" className="auth-logo" />
        <p className="eyebrow">Console</p>
        <h1>Sign in</h1>
        <p className="muted">For admins and event managers. Use your Proot account.</p>
        <label className="field">Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></label>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="button block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
