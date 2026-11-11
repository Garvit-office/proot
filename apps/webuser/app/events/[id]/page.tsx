'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { formatDistance, timeAgo } from '@proot/shared';
import { RsvpButton, SpotsChip } from '../../../components/care/RsvpButton';
import { Icon } from '../../../components/Icon';
import { BackLink, ErrorNote, PageLoading, UserAvatar } from '../../../components/ui';
import { formatWhen, useLoad, useRequireUser } from '../../../lib/hooks';
import { api, useSocketEvent } from '../../../lib/session';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready } = useRequireUser();
  const { data: event, setData, error, reload } = useLoad(() => api.getEvent(id), [id], ready);

  const [removed, setRemoved] = useState(false);

  useSocketEvent('event:updated', (u) => {
    if (u.id !== id) return;
    if (u.deleted) return setRemoved(true);
    // Attendee list (managers only) needs a refetch; others just need the count.
    if (event?.attendees.length) reload();
    else setData((e) => (e ? { ...e, rsvpCount: u.rsvpCount } : e));
  });

  if (!ready || (!event && !error && !removed)) return <PageLoading />;
  if (!event || removed) {
    return (
      <main className="wrap page-section">
        <BackLink href="/events">All events</BackLink>
        <ErrorNote error={removed ? 'This event was removed by its organiser.' : error} onRetry={removed ? undefined : reload} />
      </main>
    );
  }

  return (
    <main className="wrap page-section">
      <BackLink href="/events">All events</BackLink>
      <div className="detail-grid">
        {event.imageUrl ? <img className="detail-image" src={event.imageUrl} alt={event.title} /> : <div className="detail-image card-placeholder"><Icon name="calendar" size={56} /></div>}
        <section className="detail-body">
          <SpotsChip event={event} />
          {!event.published && <span className="chip warn care-paused">Draft</span>}
          <h1>{event.title}</h1>
          <p className="lede">{event.description}</p>
          <ul className="facts">
            <li><Icon name="clock" /> {formatWhen(event.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}<span>When</span></li>
            <li><Icon name="pin" /> {event.location}<span>{event.distanceKm != null ? formatDistance(event.distanceKm) : 'Where'}</span></li>
            <li><Icon name="users" /> {event.rsvpCount} going{event.capacity ? ` of ${event.capacity}` : ''}<span>{event.capacity ? 'Capped' : 'No cap'}</span></li>
            {event.managerName && <li><Icon name="user" /> {event.managerName}<span>Organiser</span></li>}
          </ul>
          <div className="actions">
            <RsvpButton event={event} onChange={(e) => setData((cur) => (cur ? { ...cur, ...e } : cur))} />
          </div>
          {event.attendees.length > 0 && (
            <section className="panel event-attendees">
              <h2>Attendees</h2>
              <ul className="saved-list">
                {event.attendees.map((a) => (
                  <li key={a.userId}>
                    <UserAvatar name={a.name} url={a.avatarUrl} size={34} />
                    <div><strong>{a.name}</strong><small>RSVPed {timeAgo(a.createdAt)}</small></div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
