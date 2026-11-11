'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Booking } from '@proot/shared';
import { BookingCard } from '../../components/care/BookingCard';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, PageHead, PageLoading, PaymentStatus, Spinner, Stars } from '../../components/ui';
import { errorMessage, useLoad, useRequireUser } from '../../lib/hooks';
import { usePayment } from '../../lib/payments';
import { api, useSocketEvent } from '../../lib/session';

const isOpen = (b: Booking) => b.status === 'REQUESTED' || b.status === 'CONFIRMED';

export default function BookingsPage() {
  const { ready, user } = useRequireUser();
  const { data, setData, error, reload } = useLoad(() => api.listBookings(), [], ready);

  const upsert = (b: Booking) =>
    setData((list) => (list ? (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [b, ...list]) : list));

  useSocketEvent('booking:updated', (b) => {
    if (b.customer.id === user?.id) upsert(b);
  });

  if (!ready) return <PageLoading />;

  const upcoming = data?.filter((b) => isOpen(b) && new Date(b.endsAt).getTime() > Date.now()) ?? [];
  const past = data?.filter((b) => !upcoming.includes(b)) ?? [];

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Care"
        title="My bookings"
        lede="Visits you’ve booked, with payment and review in one place."
        actions={<Link className="button secondary" href="/care"><Icon name="plus" size={16} /> Book care</Link>}
      />
      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner />}
      {data && data.length === 0 && (
        <EmptyState icon="calendar" title="No bookings yet." text="Find a walker, groomer or vet nearby." action={<Link className="button primary" href="/care">Browse care</Link>} />
      )}
      {upcoming.length > 0 && (
        <section className="booking-section">
          <h2>Upcoming</h2>
          <ul className="list">{upcoming.map((b) => <CustomerBooking key={b.id} booking={b} onChange={upsert} onRefresh={reload} />)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="booking-section">
          <h2>Past and closed</h2>
          <ul className="list">{past.map((b) => <CustomerBooking key={b.id} booking={b} onChange={upsert} onRefresh={reload} />)}</ul>
        </section>
      )}
    </main>
  );
}

function CustomerBooking({ booking, onChange, onRefresh }: { booking: Booking; onChange: (b: Booking) => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const payment = usePayment({ onPaid: () => onRefresh() });
  const canPay = !booking.isPaid && booking.status === 'REQUESTED';
  const canCancel = isOpen(booking);

  async function cancel() {
    if (!window.confirm(`Cancel ${booking.service.title}?${booking.isPaid ? ' Paid bookings are refunded.' : ''}`)) return;
    setBusy(true);
    setError('');
    try {
      onChange(await api.setBookingStatus(booking.id, 'CANCELLED'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BookingCard booking={booking} viewer="customer">
      {(canPay || canCancel) && (
        <div className="row-actions">
          {canPay && (
            <button className="button primary small" disabled={payment.busy} onClick={() => payment.pay(() => api.payBooking(booking.id))}>
              <Icon name="card" size={15} /> Pay now
            </button>
          )}
          {canCancel && <button className="button secondary small" disabled={busy} onClick={cancel}>Cancel</button>}
        </div>
      )}
      <PaymentStatus state={payment.state} />
      <ErrorNote error={error} />
      {booking.status === 'COMPLETED' && (booking.review ? (
        <div className="booking-review">
          <span className="muted">Your review</span> <Stars value={booking.review.rating} size={14} />
          {booking.review.comment && <p>{booking.review.comment}</p>}
        </div>
      ) : (
        <ReviewForm booking={booking} onDone={(review) => onChange({ ...booking, review })} />
      ))}
    </BookingCard>
  );
}

function ReviewForm({ booking, onDone }: { booking: Booking; onDone: (review: NonNullable<Booking['review']>) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) return setError('Pick a star rating.');
    setBusy(true);
    setError('');
    try {
      onDone(await api.reviewBooking(booking.id, { rating, comment: comment.trim() || undefined }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="booking-review form-grid" onSubmit={submit}>
      <div className="review-row">
        <strong>How was it?</strong>
        <Stars value={rating} onChange={setRating} size={20} />
      </div>
      <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="A line for other dog owners (optional)" aria-label="Review comment" />
      <ErrorNote error={error} />
      <div><button className="button primary small" disabled={busy}>{busy ? 'Saving…' : 'Post review'}</button></div>
    </form>
  );
}
