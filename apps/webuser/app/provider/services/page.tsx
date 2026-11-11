'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  CARE_CATEGORIES,
  formatDuration,
  rupees,
  toPaise,
  type CareCategory,
  type CareService,
  type CareServiceInput,
} from '@proot/shared';
import { ProviderGate, ProviderTabs } from '../../../components/care/ProviderGate';
import { Icon } from '../../../components/Icon';
import { EmptyState, ErrorNote, PageHead, Spinner } from '../../../components/ui';
import { errorMessage, useLoad } from '../../../lib/hooks';
import { fileToImageDataUrl } from '../../../lib/photo';
import { api, useSession } from '../../../lib/session';

export default function ProviderServicesPage() {
  return (
    <ProviderGate>
      <ProviderServices />
    </ProviderGate>
  );
}

function ProviderServices() {
  const { data, setData, error, reload } = useLoad(() => api.listServices({ mine: true, sort: 'new' }), []);
  const [editing, setEditing] = useState<CareService | 'new' | null>(null);

  const replace = (s: CareService) =>
    setData((list) => (list ? (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list]) : [s]));

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Provider tools"
        title="My services"
        lede="What you offer, your price per visit, and how far you’ll travel. Pause a service to stop new bookings."
        actions={!editing && <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> New service</button>}
      />
      <ProviderTabs />
      {editing && (
        <ServiceForm
          key={editing === 'new' ? 'new' : editing.id}
          service={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(s) => { replace(s); setEditing(null); }}
        />
      )}
      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner />}
      {data && data.length === 0 && !editing && (
        <EmptyState icon="heart" title="No services yet." text="Add your first service so people nearby can book you." action={<button className="button primary" onClick={() => setEditing('new')}>Add a service</button>} />
      )}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((s) => <ServiceRow key={s.id} service={s} onEdit={() => setEditing(s)} onChange={replace} onRemoved={reload} />)}
        </ul>
      )}
    </main>
  );
}

function ServiceRow({ service, onEdit, onChange, onRemoved }: { service: CareService; onEdit: () => void; onChange: (s: CareService) => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="panel row-card service-row">
      {service.imageUrl ? <img className="row-thumb" src={service.imageUrl} alt="" /> : <span className="row-thumb"><Icon name="heart" /></span>}
      <div className="grow">
        <div className="booking-title">
          <Link href={`/care/${service.id}`}><h3>{service.title}</h3></Link>
          <span className={`chip ${service.isActive ? 'good' : 'warn'}`}>{service.isActive ? 'Live' : 'Paused'}</span>
        </div>
        <p>
          {service.category} · {rupees(service.pricePaise)} · {formatDuration(service.durationMin)} · {service.city || 'No city'} · within {service.serviceRadiusKm} km
          {service.ratingCount > 0 && ` · ${service.ratingAvg.toFixed(1)}★ (${service.ratingCount})`}
        </p>
        <ErrorNote error={error} />
      </div>
      <div className="row-actions">
        <button className="button secondary small" disabled={busy} onClick={() => run(async () => onChange(await api.updateService(service.id, { isActive: !service.isActive })))}>
          {service.isActive ? 'Pause' : 'Resume'}
        </button>
        <button className="button secondary small" disabled={busy} onClick={onEdit}><Icon name="edit" size={14} /> Edit</button>
        <button
          className="button danger small"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`Delete “${service.title}”? Services with past bookings are paused instead.`)) return;
            run(async () => {
              await api.deleteService(service.id);
              onRemoved();
            });
          }}
        >
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>
    </li>
  );
}

function ServiceForm({ service, onCancel, onSaved }: { service: CareService | null; onCancel: () => void; onSaved: (s: CareService) => void }) {
  const { user } = useSession();
  const [title, setTitle] = useState(service?.title ?? '');
  const [category, setCategory] = useState<CareCategory>(service?.category ?? 'Walk');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(service ? String(service.pricePaise / 100) : '');
  const [duration, setDuration] = useState(String(service?.durationMin ?? 45));
  const [city, setCity] = useState(service?.city ?? user?.city ?? '');
  const [radius, setRadius] = useState(String(service?.serviceRadiusKm ?? 10));
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [image, setImage] = useState<string | null>(service?.imageUrl ?? null);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hasLocation = user?.lat != null && user?.lng != null;

  async function choose(file?: File) {
    if (!file) return;
    try {
      setImage(await fileToImageDataUrl(file, 1600));
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t read that photo.'));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const pricePaise = toPaise(price);
    const durationMin = Number(duration);
    const serviceRadiusKm = Number(radius);
    if (title.trim().length < 2) return setError('Give the service a title.');
    if (!Number.isFinite(pricePaise) || pricePaise < 100) return setError('Set a price of at least ₹1.');
    if (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 1440) return setError('Duration is 10 to 1440 minutes.');
    if (!Number.isFinite(serviceRadiusKm) || serviceRadiusKm < 0.5 || serviceRadiusKm > 100) return setError('Travel radius is 0.5 to 100 km.');
    const body: CareServiceInput = {
      title: title.trim(), category, description: description.trim(), pricePaise, durationMin,
      image, city: city.trim(), serviceRadiusKm, isActive,
      ...(useMyLocation && hasLocation ? { lat: user!.lat, lng: user!.lng } : {}),
    };
    setBusy(true);
    setError('');
    try {
      onSaved(service ? await api.updateService(service.id, body) : await api.createService(body));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form-grid service-form" onSubmit={submit} noValidate>
      <h2>{service ? `Edit ${service.title}` : 'New service'}</h2>
      <div className="service-photo">
        <label className="service-photo-drop">
          {image ? <img src={image} alt="Service" /> : <span><Icon name="camera" size={24} /> Add a photo</span>}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => choose(e.target.files?.[0])} aria-label="Service photo" />
        </label>
        {image && <button type="button" className="link-button" onClick={() => setImage(null)}>Remove photo</button>}
      </div>
      <div className="field-row">
        <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></label>
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as CareCategory)}>
            {CARE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></label>
      <div className="field-row">
        <label className="field">Price per visit (₹)<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="450" /></label>
        <label className="field">Duration (min)<input type="number" min={10} max={1440} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
        <label className="field">City<input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} /></label>
        <label className="field">Travel radius (km)<input type="number" min={0.5} max={100} step={0.5} value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
      </div>
      <label className="check-field"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Taking bookings</label>
      {!hasLocation ? (
        <p className="field-hint">Set your location in <Link className="link-button" href="/account">Account</Link> so customers see how far you are.</p>
      ) : service ? (
        <label className="check-field">
          <input type="checkbox" checked={useMyLocation} onChange={(e) => setUseMyLocation(e.target.checked)} /> Move this service to my saved location
        </label>
      ) : (
        <p className="field-hint">New services are placed at your saved location.</p>
      )}
      <ErrorNote error={error} />
      <div className="row-actions service-form-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving…' : service ? 'Save changes' : 'Create service'}</button>
      </div>
    </form>
  );
}
