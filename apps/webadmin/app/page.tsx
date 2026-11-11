'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { connectRealtime, isAdmin, rupees, ROLE_LABELS, ROLES, type AdminStats, type AuditRecord, type EventRecord, type Role } from '@proot/shared';
import { Icon, type IconName } from '../components/Icon';
import { dateTime, relative } from '../lib/format';
import { API_BASE_URL, api, getToken, useApiError, useSession } from '../lib/session';

type Card = { label: string; value: number | string; meta: string; icon: IconName; href?: string };

export default function OverviewPage() {
  const { user } = useSession();
  const router = useRouter();
  const describe = useApiError();
  const [stats, setStats] = useState<AdminStats>();
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const admin = isAdmin(user?.role);

  // Event managers land on their own section.
  useEffect(() => {
    if (!admin) router.replace('/events');
  }, [admin, router]);

  const load = useCallback(() => {
    return Promise.all([api.adminStats(), api.adminAudit(8), api.listEvents()])
      .then(([s, a, e]) => {
        setStats(s);
        setAudit(a);
        setEvents(e.visible.slice(0, 5));
        setError('');
        setUpdatedAt(new Date());
      })
      .catch((err) => setError(describe(err)));
  }, [describe]);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  // Live refresh: any presence / event / listing / notification push refetches stats (debounced).
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!admin) return;
    const socket = connectRealtime(API_BASE_URL, getToken);
    const schedule = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 800);
    };
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('park:presence', schedule);
    socket.on('event:updated', schedule);
    socket.on('product:updated', schedule);
    socket.on('notification', schedule);
    return () => {
      window.clearTimeout(timer.current);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [admin, load]);

  if (!admin) return null;

  const s = stats;
  const people: Card[] = s
    ? [
        { label: 'Users', value: s.users.total, meta: `+${s.users.newLast7Days} this week · ${s.users.inactive} inactive`, icon: 'users', href: '/users' },
        { label: 'Care providers', value: s.users.PROVIDER, meta: `${s.services.active} of ${s.services.total} services live`, icon: 'care', href: '/care' },
        { label: 'Dogs onboarded', value: s.pets, meta: `${s.users.total ? Math.round((s.pets / s.users.total) * 100) : 0}% of users`, icon: 'heart' },
        { label: 'Actions in 24h', value: s.auditLast24h, meta: 'Audit log entries', icon: 'shield', href: '/audit' },
      ]
    : [];
  const commerce: Card[] = s
    ? [
        { label: 'Order revenue', value: rupees(s.orders.revenuePaise), meta: `${rupees(s.orders.revenueLast30DaysPaise)} in the last 30 days`, icon: 'box', href: '/orders' },
        { label: 'Orders', value: s.orders.total, meta: `${s.orders.paid} paid · ${s.orders.pendingPayment} awaiting payment`, icon: 'box', href: '/orders' },
        { label: 'Listings', value: s.products.total, meta: `${s.products.active} active`, icon: 'bag', href: '/marketplace' },
        { label: 'Care bookings', value: s.bookings.total, meta: `${rupees(s.bookings.revenuePaise)} · ${s.bookings.requested} new · ${s.bookings.confirmed} confirmed · ${s.bookings.completed} done`, icon: 'calendar', href: '/care?tab=bookings' },
      ]
    : [];
  const community: Card[] = s
    ? [
        { label: 'Parks', value: s.parks.total, meta: `${s.parks.dogsNow} dogs checked in now`, icon: 'tree', href: '/parks' },
        { label: 'Upcoming events', value: s.events.upcoming, meta: `${s.events.published} published · ${s.events.total - s.events.published} drafts`, icon: 'flag', href: '/events' },
        { label: 'RSVPs', value: s.rsvps, meta: `Across ${s.events.total} events`, icon: 'calendar', href: '/events' },
        { label: 'Dogs at parks now', value: s.parks.dogsNow, meta: 'Live check-ins', icon: 'pin', href: '/parks' },
      ]
    : [];

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow"><span className={`live-dot${live ? ' on' : ''}`} />Operations · {live ? 'live' : 'offline'}{updatedAt && ` · updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}</p>
          <h1>Neighborhood overview</h1>
        </div>
        <Link className="button" href="/events?new=1"><Icon name="plus" size={16} /> New event</Link>
      </header>

      {error && <p className="alert" role="alert">{error} <button className="button ghost" onClick={() => void load()}>Try again</button></p>}

      <p className="section-label">People</p>
      <StatGrid cards={s ? people : null} />
      <p className="section-label">Commerce</p>
      <StatGrid cards={s ? commerce : null} />
      <p className="section-label">Community</p>
      <StatGrid cards={s ? community : null} />

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h2>Upcoming events</h2><Link className="link" href="/events">Manage</Link></div>
          {events.length === 0 ? <p className="empty-row">{s ? 'No published events coming up.' : 'Loading…'}</p> : (
            <table>
              <thead><tr><th>Event</th><th>When</th><th>RSVPs</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="strong">{e.title}<small className="sub">{e.location}</small></td>
                    <td>{dateTime(e.startsAt)}</td>
                    <td>{e.rsvpCount}{e.capacity ? ` / ${e.capacity}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Roles</h2><Link className="link" href="/users">Manage</Link></div>
          <ul className="role-bars">
            {s && ROLES.map((role: Role) => (
              <li key={role}>
                <span>{ROLE_LABELS[role]}</span>
                <div className="bar"><i style={{ width: `${s.users.total ? (s.users[role] / s.users.total) * 100 : 0}%` }} /></div>
                <strong>{s.users[role]}</strong>
              </li>
            ))}
          </ul>
          <div className="panel-head"><h2>Recent activity</h2><Link className="link" href="/audit">All</Link></div>
          <ul className="activity">
            {s && audit.length === 0 && <li className="muted">Nothing logged yet.</li>}
            {audit.map((a) => (
              <li key={a.id}>
                <span className="pill">{a.action}</span>
                <div><p>{a.details}</p><small>{a.actorName ?? 'System'} · {relative(a.createdAt)}</small></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function StatGrid({ cards }: { cards: Card[] | null }) {
  return (
    <div className="stats-grid compact">
      {(cards ?? Array.from({ length: 4 }, () => null)).map((item, i) => {
        if (!item) return <div key={i} className="stat-card skeleton" />;
        const body = (
          <>
            <div className="stat-top"><span>{item.label}</span><i><Icon name={item.icon} size={17} /></i></div>
            <strong>{item.value}</strong>
            <small>{item.meta}</small>
          </>
        );
        return item.href
          ? <Link key={item.label} href={item.href} className="stat-card">{body}</Link>
          : <div key={item.label} className="stat-card">{body}</div>;
      })}
    </div>
  );
}
