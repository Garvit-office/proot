'use client';

import Link from 'next/link';
import { canManageEvents, formatDistance, type EventRecord } from '@proot/shared';
import { RsvpButton, SpotsChip } from '../../components/care/RsvpButton';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, LocationPrompt, PageHead, PageLoading, Spinner } from '../../components/ui';
import { formatWhen, useLoad, useNear, useRequireUser } from '../../lib/hooks';
import { ADMIN_URL, api, useSocketEvent } from '../../lib/session';

export default function EventsPage() {
  const { ready, user } = useRequireUser();
  const near = useNear();
  const { data, setData, error, reload } = useLoad(() => api.listEvents(near).then((r) => r.visible), [near?.lat, near?.lng], ready);

  const replace = (e: EventRecord) => setData((list) => list?.map((x) => (x.id === e.id ? e : x)));

  useSocketEvent('event:updated', (u) => {
    if (u.deleted) setData((list) => list?.filter((x) => x.id !== u.id));
    else if (data && !data.some((x) => x.id === u.id)) reload(); // newly published
    else setData((list) => list?.map((x) => (x.id === u.id ? { ...x, rsvpCount: u.rsvpCount } : x)));
  });

  if (!ready) return <PageLoading />;

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Events"
        title="Small gatherings."
        lede="Capped meetups published by local organisers. RSVP to save your spot — counts update live."
        actions={canManageEvents(user?.role) && (
          <a className="button secondary" href={`${ADMIN_URL}/events`} target="_blank" rel="noreferrer">
            <Icon name="calendar" size={16} /> Manage events
          </a>
        )}
      />
      <LocationPrompt what="how far each event is" />
      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner label="Loading events…" />}
      {data && data.length === 0 && <EmptyState icon="calendar" title="Nothing on the calendar yet." text="Organisers publish meetups here — check back soon." />}
      {data && data.length > 0 && (
        <div className="live-list">
          {data.map((e) => (
            <article key={e.id} className="panel live-event event-row">
              <div className="live-date">
                <strong>{new Date(e.startsAt).getDate()}</strong>
                <span>{new Date(e.startsAt).toLocaleString([], { month: 'short' })}</span>
              </div>
              <div className="live-body">
                <Link href={`/events/${e.id}`}><h3>{e.title}</h3></Link>
                <div className="card-meta">
                  <span><Icon name="clock" size={14} /> {formatWhen(e.startsAt)}</span>
                  <span><Icon name="pin" size={14} /> {e.location}</span>
                  {e.distanceKm != null && <span>{formatDistance(e.distanceKm)}</span>}
                  {e.managerName && <span>By {e.managerName}</span>}
                </div>
                <p className="card-text">{e.description}</p>
              </div>
              <div className="live-cta">
                <SpotsChip event={e} />
                <RsvpButton event={e} onChange={replace} />
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
