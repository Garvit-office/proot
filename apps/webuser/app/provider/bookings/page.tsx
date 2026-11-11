'use client';

import { useState } from 'react';
import type { Booking, BookingStatus } from '@proot/shared';
import { BookingCard } from '../../../components/care/BookingCard';
import { ProviderGate, ProviderTabs } from '../../../components/care/ProviderGate';
import { EmptyState, ErrorNote, PageHead, Spinner } from '../../../components/ui';
import { errorMessage, useLoad } from '../../../lib/hooks';
import { api, useSession, useSocketEvent } from '../../../lib/session';

const FILTERS = [
  { id: 'open', label: 'Needs action', match: (b: Booking) => b.status === 'REQUESTED' || b.status === 'CONFIRMED' },
  { id: 'done', label: 'Completed', match: (b: Booking) => b.status === 'COMPLETED' },
  { id: 'closed', label: 'Declined / cancelled', match: (b: Booking) => b.status === 'DECLINED' || b.status === 'CANCELLED' },
] as const;

export default function ProviderBookingsPage() {
  return (
    <ProviderGate>
      <ProviderBookings />
    </ProviderGate>
  );
}

function ProviderBookings() {
  const { user } = useSession();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const { data, setData, error, reload } = useLoad(() => api.listProviderBookings(), []);

  const upsert = (b: Booking) =>
    setData((list) => (list ? (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [b, ...list]) : list));

  useSocketEvent('booking:updated', (b) => {
    // Unpaid requests stay hidden from providers until they're paid.
    if ((b.provider.id === user?.id || user?.role === 'ADMIN') && (b.isPaid || b.status !== 'REQUESTED')) upsert(b);
  });

  const active = FILTERS.find((f) => f.id === filter)!;
  const shown = data?.filter(active.match) ?? [];

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Provider tools" title="Incoming bookings" lede="Paid requests appear here. Confirm or decline, then mark visits complete once they’ve happened." />
      <ProviderTabs />
      <div className="tabs" role="radiogroup" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} role="radio" aria-checked={filter === f.id} className={`option${filter === f.id ? ' selected' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}{data ? ` (${data.filter(f.match).length})` : ''}
          </button>
        ))}
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner />}
      {data && shown.length === 0 && <EmptyState icon="calendar" title="Nothing here." text="New paid requests will show up live." />}
      {shown.length > 0 && <ul className="list">{shown.map((b) => <ProviderBooking key={b.id} booking={b} onChange={upsert} />)}</ul>}
    </main>
  );
}

function ProviderBooking({ booking, onChange }: { booking: Booking; onChange: (b: Booking) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function set(status: BookingStatus, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    try {
      onChange(await api.setBookingStatus(booking.id, status));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const started = new Date(booking.startsAt).getTime() <= Date.now();

  return (
    <BookingCard booking={booking} viewer="provider">
      {booking.status === 'REQUESTED' && (
        <div className="row-actions">
          <button className="button primary small" disabled={busy || !booking.isPaid} onClick={() => set('CONFIRMED')}>Confirm</button>
          <button className="button secondary small" disabled={busy} onClick={() => set('DECLINED', 'Decline this booking? The customer is refunded.')}>Decline</button>
        </div>
      )}
      {booking.status === 'CONFIRMED' && (
        <div className="row-actions">
          <button className="button primary small" disabled={busy || !started} title={started ? undefined : 'Available once the visit starts'} onClick={() => set('COMPLETED')}>Mark completed</button>
          <button className="button secondary small" disabled={busy} onClick={() => set('CANCELLED', 'Cancel this confirmed booking? The customer is refunded.')}>Cancel</button>
        </div>
      )}
      {booking.status === 'COMPLETED' && booking.review && (
        <p className="booking-detail">Review: {booking.review.rating}★ {booking.review.comment}</p>
      )}
      <ErrorNote error={error} />
    </BookingCard>
  );
}
