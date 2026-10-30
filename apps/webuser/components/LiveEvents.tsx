'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { canManageEvents, type EventRecord } from '@proot/shared';
import { api, useSession } from '../lib/session';
import { Icon } from './Icon';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';

function when(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Published events from the API, with RSVP. Event managers also get a shortcut to the console. */
export function LiveEvents() {
  const { status, user } = useSession();
  const [events, setEvents] = useState<EventRecord[]>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.listEvents().then((res) => setEvents(res.visible)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (status === 'ready') load();
  }, [status, load]);

  async function toggle(event: EventRecord) {
    setBusy(event.id);
    setError('');
    try {
      const updated = event.rsvped ? await api.cancelRsvp(event.id) : await api.rsvp(event.id);
      setEvents((list) => list?.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      load();
    } finally {
      setBusy(null);
    }
  }

  if (status === 'loading') return null;
  if (status === 'guest') {
    return (
      <div className="onboard-banner live-events-guest">
        <span className="icon-tile"><Icon name="calendar" size={22} /></span>
        <div><strong>RSVP to live neighborhood events.</strong><p>Sign in to see what organisers have published and save your spot.</p></div>
        <Link className="button primary" href="/onboarding">Sign in</Link>
      </div>
    );
  }

  return (
    <section className="live-events">
      <div className="section-head">
        <div>
          <p className="eyebrow">Live on Proot</p>
          <h2>Published by organisers</h2>
        </div>
        {canManageEvents(user?.role) && (
          <a className="button secondary" href={`${ADMIN_URL}/events`} target="_blank" rel="noreferrer">
            <Icon name="calendar" size={16} /> Manage events
          </a>
        )}
      </div>
      {error && <p className="callout error" role="alert"><Icon name="info" size={16} /> {error}</p>}
      {events && events.length === 0 && <p className="panel-muted">Nothing published yet — check back soon.</p>}
      <div className="live-list">
        {events?.map((e) => {
          const full = e.capacity > 0 && e.rsvpCount >= e.capacity && !e.rsvped;
          const left = e.capacity ? Math.max(0, e.capacity - e.rsvpCount) : null;
          return (
            <article key={e.id} className="panel live-event">
              <div className="live-date">
                <strong>{new Date(e.startsAt).getDate()}</strong>
                <span>{new Date(e.startsAt).toLocaleString([], { month: 'short' })}</span>
              </div>
              <div className="live-body">
                <h3>{e.title}</h3>
                <div className="card-meta">
                  <span><Icon name="clock" size={14} /> {when(e.startsAt)}</span>
                  <span><Icon name="pin" size={14} /> {e.location}</span>
                </div>
                <p className="card-text">{e.description}</p>
              </div>
              <div className="live-cta">
                <span className={`chip ${full ? 'bad' : left !== null && left <= 3 ? 'warn' : 'brand'}`}>
                  {left === null ? `${e.rsvpCount} going` : full ? 'Full' : `${left} spot${left === 1 ? '' : 's'} left`}
                </span>
                <button className={`button ${e.rsvped ? 'secondary' : 'primary'}`} disabled={busy === e.id || full} onClick={() => toggle(e)}>
                  {e.rsvped ? <><Icon name="check" size={16} /> Going · cancel</> : full ? 'Full' : 'RSVP'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
