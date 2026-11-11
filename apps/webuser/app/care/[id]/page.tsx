'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatDistance, formatDuration, localDateKey, rupees, timeAgo, type AddressRecord, type Booking } from '@proot/shared';
import { Icon } from '../../../components/Icon';
import { BackLink, ErrorNote, PageLoading, PaymentStatus, Stars, UserAvatar } from '../../../components/ui';
import { errorMessage, formatTime, useLoad, useNear } from '../../../lib/hooks';
import { usePayment } from '../../../lib/payments';
import { api, useSession } from '../../../lib/session';

function nextDays(count: number) {
  const days: Date[] = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function addressLine(a: AddressRecord) {
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
}

export default function CareDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { status } = useSession();
  const near = useNear();
  const { data: service, error, reload } = useLoad(() => api.getService(id), [id], status !== 'loading');

  if (error && !service) {
    return (
      <main className="wrap page-section">
        <BackLink href="/care">All care</BackLink>
        <ErrorNote error={error} onRetry={reload} />
      </main>
    );
  }
  if (!service) return <PageLoading />;

  const distance = near && service.distanceKm != null ? formatDistance(service.distanceKm) : '';

  return (
    <main className="wrap page-section">
      <BackLink href="/care">All care</BackLink>
      <div className="detail-grid">
        <div className="care-detail-media">
          {service.imageUrl ? <img className="detail-image" src={service.imageUrl} alt={service.title} /> : <div className="detail-image card-placeholder"><Icon name="heart" size={56} /></div>}
          <section className="panel care-reviews">
            <h2>Reviews</h2>
            {service.reviews.length === 0 ? (
              <p className="panel-muted">No reviews yet.</p>
            ) : (
              <ul className="list">
                {service.reviews.map((r) => (
                  <li key={r.id} className="review-item">
                    <UserAvatar name={r.user.name} url={r.user.avatarUrl} size={34} />
                    <div>
                      <strong>{r.user.name}</strong> <Stars value={r.rating} size={13} /> <small className="muted">{timeAgo(r.createdAt)}</small>
                      {r.comment && <p>{r.comment}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <section className="detail-body">
          <span className="chip brand">{service.category}</span>
          {!service.isActive && <span className="chip warn care-paused">Paused</span>}
          <h1>{service.title}</h1>
          <p className="lede">{service.description}</p>
          <ul className="facts">
            <li><UserAvatar name={service.provider.name} url={service.provider.avatarUrl} size={24} /> {service.provider.name}<span>Your pro</span></li>
            <li><Icon name="star" /> {service.ratingCount ? `${service.ratingAvg.toFixed(1)} rating` : 'No ratings yet'}<span>{service.ratingCount} review{service.ratingCount === 1 ? '' : 's'}</span></li>
            <li><Icon name="clock" /> {formatDuration(service.durationMin)}<span>Per visit</span></li>
            <li><Icon name="pin" /> {service.city || 'Local'}{distance ? ` · ${distance}` : ''}<span>Within {service.serviceRadiusKm} km</span></li>
          </ul>
          <p className="detail-price">{rupees(service.pricePaise)}<small>per visit</small></p>
          <BookingForm serviceId={service.id} providerId={service.provider.id} active={service.isActive} />
        </section>
      </div>
    </main>
  );
}

function BookingForm({ serviceId, providerId, active }: { serviceId: string; providerId: string; active: boolean }) {
  const { status, user, pets, pet } = useSession();
  const days = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState(() => localDateKey());
  const [slot, setSlot] = useState('');
  const [petId, setPetId] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const signedIn = status === 'ready';
  const own = user?.id === providerId;

  const payment = usePayment();
  const slots = useLoad(() => api.getSlots(serviceId, date), [serviceId, date], signedIn && active && !own);

  useEffect(() => setSlot(''), [date]);
  useEffect(() => {
    if (!petId && pet) setPetId(pet.id);
  }, [pet, petId]);
  useEffect(() => {
    if (!signedIn) return;
    api.listAddresses().then((list) => {
      setAddresses(list);
      const preferred = list.find((a) => a.isDefault) ?? list[0];
      if (preferred) setAddress((current) => current || addressLine(preferred));
    }).catch(() => {});
  }, [signedIn]);

  if (status === 'loading') return null;
  if (!signedIn) {
    return (
      <div className="actions">
        <Link className="button primary" href={`/onboarding?next=${encodeURIComponent(`/care/${serviceId}`)}`}><Icon name="calendar" size={17} /> Sign in to book</Link>
      </div>
    );
  }
  if (own) return <p className="callout"><Icon name="info" size={16} /> This is your service. Manage it from <Link className="link-button" href="/provider/services">Provider tools</Link>.</p>;
  if (!active) return <p className="callout"><Icon name="info" size={16} /> This service isn’t taking bookings right now.</p>;
  if (pets.length === 0) {
    return (
      <div className="actions">
        <Link className="button primary" href="/onboarding">Add your dog to book</Link>
      </div>
    );
  }

  if (booking) {
    return (
      <div className="panel care-booked">
        <h2>{payment.state.phase === 'paid' ? 'Booked and paid.' : 'Booking requested.'}</h2>
        <p className="panel-muted">
          {new Date(booking.startsAt).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} for {booking.pet?.name ?? 'your dog'}.
          {payment.state.phase === 'paid' ? ' The provider will confirm shortly.' : ' Pay to send it to the provider.'}
        </p>
        <PaymentStatus state={payment.state} />
        <div className="actions">
          {payment.state.phase !== 'paid' && (
            <button className="button primary" disabled={payment.busy} onClick={() => payment.pay(() => api.payBooking(booking.id))}>
              <Icon name="card" size={16} /> Pay {rupees(booking.pricePaise)}
            </button>
          )}
          <Link className="button secondary" href="/bookings">See my bookings</Link>
        </div>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!slot) return setFormError('Pick a time.');
    if (!petId) return setFormError('Choose which dog this is for.');
    if (address.trim().length < 5) return setFormError('Add the address for the visit.');
    const box: { created: Booking | null } = { created: null };
    await payment.pay(async () => {
      try {
        const res = await api.createBooking({ serviceId, petId, startsAt: slot, address: address.trim(), notes: notes.trim() || undefined });
        box.created = res.booking;
        return res.payment;
      } catch (err) {
        // Booking itself failed (e.g. slot taken): show inline and refresh the slots.
        if (!box.created) {
          setFormError(errorMessage(err));
          slots.reload();
        }
        throw err;
      }
    });
    if (box.created) setBooking(box.created);
  }

  return (
    <form className="panel care-book form-grid" onSubmit={submit} noValidate>
      <h2>Book a visit</h2>
      <div className="field">
        <span>Day</span>
        <div className="day-strip" role="radiogroup" aria-label="Day">
          {days.map((d) => {
            const key = localDateKey(d);
            return (
              <button key={key} type="button" role="radio" aria-checked={key === date} className={`day${key === date ? ' selected' : ''}`} onClick={() => setDate(key)}>
                <small>{d.toLocaleDateString([], { weekday: 'short' })}</small>
                <strong>{d.getDate()}</strong>
                <small>{d.toLocaleDateString([], { month: 'short' })}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <span>Time</span>
        {slots.error ? <ErrorNote error={slots.error} onRetry={slots.reload} /> : !slots.data || slots.loading ? (
          <p className="panel-muted">Checking availability…</p>
        ) : slots.data.slots.length === 0 ? (
          <p className="panel-muted">No free slots that day — try another.</p>
        ) : (
          <div className="options slot-grid" role="radiogroup" aria-label="Time">
            {slots.data.slots.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={slot === s} className={`option${slot === s ? ' selected' : ''}`} onClick={() => setSlot(s)}>
                {formatTime(s)}
              </button>
            ))}
          </div>
        )}
      </div>
      {pets.length > 1 && (
        <label className="field">
          For
          <select value={petId} onChange={(e) => setPetId(e.target.value)}>
            {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {addresses.length > 0 && (
        <label className="field">
          Saved address
          <select value="" onChange={(e) => { const a = addresses.find((x) => x.id === e.target.value); if (a) setAddress(addressLine(a)); }}>
            <option value="">Use a saved address…</option>
            {addresses.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.line1}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        Visit address
        <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat, street, area" />
      </label>
      <label className="field">
        Notes for the provider <span className="field-hint">Optional</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, leash habits, anything to know" />
      </label>
      <ErrorNote error={formError} />
      {!formError && <PaymentStatus state={payment.state} />}
      <button type="submit" className="button primary block" disabled={payment.busy}>
        <Icon name="calendar" size={17} /> {payment.busy ? 'Working…' : 'Book and pay'}
      </button>
    </form>
  );
}
