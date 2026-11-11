'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, formatDuration, isAdmin, rupees, type BookingStatus, type CareService } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { dateTime } from '../../lib/format';
import { api, useApiError } from '../../lib/session';
import { FlashMessage, Pager, Segmented, TableState, Thumb, usePagedList, type Flash } from '../../lib/ui';

const BOOKING_TONE: Record<BookingStatus, string> = { REQUESTED: 'warn', CONFIRMED: 'brand', DECLINED: 'bad', COMPLETED: 'good', CANCELLED: '' };

type Tab = 'services' | 'bookings';

export default function CarePage() {
  return <RequireRole allowed={isAdmin}><Suspense><Care /></Suspense></RequireRole>;
}

function Care() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get('tab') === 'bookings' ? 'bookings' : 'services';
  const setTab = (next: Tab) => router.replace(next === 'services' ? pathname : `${pathname}?tab=${next}`);

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">Care</p>
          <h1>Services & bookings</h1>
        </div>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'services'} className={tab === 'services' ? 'active' : undefined} onClick={() => setTab('services')}>Services</button>
        <button role="tab" aria-selected={tab === 'bookings'} className={tab === 'bookings' ? 'active' : undefined} onClick={() => setTab('bookings')}>Bookings</button>
      </div>
      {tab === 'services' ? <Services /> : <Bookings />}
    </>
  );
}

function Services() {
  const describe = useApiError();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'paused'>('');
  const list = usePagedList(api.adminServices, { q, status });
  const [pending, setPending] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  async function toggle(service: CareService) {
    const next = !service.isActive;
    const prompt = next
      ? `Resume “${service.title}” by ${service.provider.name}? It becomes bookable again.`
      : `Pause “${service.title}” by ${service.provider.name}? It’s hidden from search and can’t take new bookings. Existing bookings are unaffected.`;
    if (!window.confirm(prompt)) return;
    setPending(service.id);
    setFlash(null);
    list.patch(service.id, (s) => ({ ...s, isActive: next }));
    try {
      const saved = await api.updateService(service.id, { isActive: next });
      list.patch(service.id, () => saved);
      setFlash({ tone: 'good', text: `“${service.title}” ${next ? 'resumed' : 'paused'}.` });
      if (status) list.reload();
    } catch (err) {
      list.patch(service.id, () => service);
      setFlash({ tone: 'error', text: describe(err) });
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search title or provider" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search services" /></label>
        <Segmented<'' | 'active' | 'paused'> label="Filter services" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]} />
      </div>
      <FlashMessage flash={flash} />
      {list.error && list.items.length > 0 && <p className="alert" role="alert">{list.error}</p>}
      <div className="panel">
        <div className="panel-head"><h2>Services</h2><span className="count">{list.page ? `${list.page.total} total` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Service</th><th>Provider</th><th>Price</th><th>Rating</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {list.items.map((s) => (
              <tr key={s.id}>
                <td className="strong">
                  <div className="cell-media">
                    <Thumb src={s.imageUrl} alt={s.title} />
                    <div>{s.title}<small className="sub">{s.category} · {formatDuration(s.durationMin)}{s.city ? ` · ${s.city}` : ''}</small></div>
                  </div>
                </td>
                <td>{s.provider.name}</td>
                <td>{rupees(s.pricePaise)}</td>
                <td>{s.ratingCount ? `${s.ratingAvg.toFixed(1)} ★ (${s.ratingCount})` : <span className="muted">No reviews</span>}</td>
                <td><span className={`pill ${s.isActive ? 'good' : 'warn'}`}>{s.isActive ? 'Active' : 'Paused'}</span></td>
                <td className="row-actions">
                  <button className={`button ghost${s.isActive ? ' danger' : ''}`} disabled={pending === s.id} onClick={() => toggle(s)}>{s.isActive ? 'Pause' : 'Resume'}</button>
                </td>
              </tr>
            ))}
            <TableState cols={6} loading={list.loading} error={list.error} hasRows={list.items.length > 0} empty={q || status ? 'No services match.' : 'No care services yet.'} onRetry={list.reload} />
          </tbody>
        </table>
        {list.page && <Pager total={list.page.total} limit={list.limit} offset={list.offset} onChange={list.setOffset} loading={list.loading} />}
      </div>
    </>
  );
}

function Bookings() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(api.adminBookings, { q, status });

  return (
    <>
      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search customer, provider or service" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Every status</option>
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {list.error && list.items.length > 0 && <p className="alert" role="alert">{list.error}</p>}
      <div className="panel">
        <div className="panel-head"><h2>Bookings</h2><span className="count">{list.page ? `${list.page.total} total` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Service</th><th>When</th><th>Customer</th><th>Provider</th><th>Price</th><th>Status</th></tr></thead>
          <tbody>
            {list.items.map((b) => (
              <tr key={b.id}>
                <td className="strong">
                  <div className="cell-media">
                    <Thumb src={b.service.imageUrl} alt={b.service.title} />
                    <div>{b.service.title}<small className="sub">{b.service.category}{b.pet ? ` · for ${b.pet.name}` : ''}</small></div>
                  </div>
                </td>
                <td>{dateTime(b.startsAt)}<small className="sub">{b.address}</small></td>
                <td>{b.customer.name}{b.customer.phone && <small className="sub">{b.customer.phone}</small>}</td>
                <td>{b.provider.name}</td>
                <td>{rupees(b.pricePaise)}<small className="sub">{b.isPaid ? 'Paid' : 'Unpaid'}</small></td>
                <td><span className={`pill ${BOOKING_TONE[b.status]}`}>{BOOKING_STATUS_LABELS[b.status]}</span>{b.review && <small className="sub">Reviewed {b.review.rating} ★</small>}</td>
              </tr>
            ))}
            <TableState cols={6} loading={list.loading} error={list.error} hasRows={list.items.length > 0} empty={q || status ? 'No bookings match.' : 'No bookings yet.'} onRetry={list.reload} />
          </tbody>
        </table>
        {list.page && <Pager total={list.page.total} limit={list.limit} offset={list.offset} onChange={list.setOffset} loading={list.loading} />}
      </div>
    </>
  );
}
