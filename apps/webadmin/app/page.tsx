'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAdmin, ROLE_LABELS, ROLES, type AdminStats, type AuditRecord, type EventRecord } from '@proot/shared';
import { Icon, type IconName } from '../components/Icon';
import { dateTime, relative } from '../lib/format';
import { api, useApiError, useSession } from '../lib/session';

export default function OverviewPage() {
  const { user } = useSession();
  const router = useRouter();
  const describe = useApiError();
  const [stats, setStats] = useState<AdminStats>();
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState('');
  const admin = isAdmin(user?.role);

  // Event managers land on their own section.
  useEffect(() => {
    if (!admin) router.replace('/events');
  }, [admin, router]);

  useEffect(() => {
    if (!admin) return;
    Promise.all([api.adminStats(), api.adminAudit(8), api.listEvents()])
      .then(([s, a, e]) => {
        setStats(s);
        setAudit(a);
        setEvents(e.visible.slice(0, 5));
      })
      .catch((err) => setError(describe(err)));
  }, [admin, describe]);

  if (!admin) return null;

  const cards: { label: string; value: number | string; meta: string; icon: IconName }[] = stats
    ? [
        { label: 'Users', value: stats.users.total, meta: `+${stats.users.newLast7Days} this week`, icon: 'users' },
        { label: 'Dogs onboarded', value: stats.pets, meta: `${stats.users.total ? Math.round((stats.pets / stats.users.total) * 100) : 0}% of users`, icon: 'heart' },
        { label: 'Upcoming events', value: stats.events.upcoming, meta: `${stats.events.total - stats.events.published} drafts`, icon: 'calendar' },
        { label: 'RSVPs', value: stats.rsvps, meta: `${stats.auditLast24h} actions in 24h`, icon: 'flag' },
      ]
    : [];

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">Operations · live</p>
          <h1>Neighborhood overview</h1>
        </div>
        <Link className="button" href="/events?new=1"><Icon name="plus" size={16} /> New event</Link>
      </header>

      {error && <p className="alert" role="alert">{error}</p>}

      <div className="stats-grid">
        {(stats ? cards : Array.from({ length: 4 }, () => null)).map((item, i) => (
          <div key={item?.label ?? i} className={`stat-card${item ? '' : ' skeleton'}`}>
            {item && (
              <>
                <div className="stat-top"><span>{item.label}</span><i><Icon name={item.icon} size={17} /></i></div>
                <strong>{item.value}</strong>
                <small>{item.meta}</small>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h2>Upcoming events</h2><Link className="link" href="/events">Manage</Link></div>
          {events.length === 0 ? <p className="empty-row">No published events coming up.</p> : (
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
            {stats && ROLES.map((role) => (
              <li key={role}>
                <span>{ROLE_LABELS[role]}</span>
                <div className="bar"><i style={{ width: `${stats.users.total ? (stats.users[role] / stats.users.total) * 100 : 0}%` }} /></div>
                <strong>{stats.users[role]}</strong>
              </li>
            ))}
          </ul>
          <div className="panel-head"><h2>Recent activity</h2><Link className="link" href="/audit">All</Link></div>
          <ul className="activity">
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
