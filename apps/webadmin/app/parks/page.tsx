'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { isAdmin, type Park, type ParkInput } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { api, useApiError } from '../../lib/session';
import { currentPosition, FlashMessage, PhotoField, TableState, Thumb, type Flash } from '../../lib/ui';

export default function ParksPage() {
  return <RequireRole allowed={isAdmin}><Parks /></RequireRole>;
}

function Parks() {
  const describe = useApiError();
  const [parks, setParks] = useState<Park[]>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Park | 'new' | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listParks()
      .then((list) => {
        setParks(list);
        setLoadError('');
      })
      .catch((err) => setLoadError(describe(err)))
      .finally(() => setLoading(false));
  }, [describe]);
  useEffect(load, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = [...(parks ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return needle ? list.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(needle)) : list;
  }, [parks, q]);

  async function remove(park: Park) {
    const warn = park.dogsNow ? ` ${park.dogsNow} ${park.dogsNow === 1 ? 'dog is' : 'dogs are'} checked in right now.` : '';
    if (!window.confirm(`Delete “${park.name}”?${warn} Its check-in history goes with it. This can’t be undone.`)) return;
    setPending(park.id);
    setFlash(null);
    try {
      await api.deletePark(park.id);
      setParks((list) => list?.filter((p) => p.id !== park.id));
      if (editing !== null && editing !== 'new' && editing.id === park.id) setEditing(null);
      setFlash({ tone: 'good', text: `Deleted “${park.name}”.` });
    } catch (err) {
      setFlash({ tone: 'error', text: describe(err) });
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">Community</p>
          <h1>Parks</h1>
        </div>
        {editing === null && <button className="button" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add park</button>}
      </header>

      <FlashMessage flash={flash} />

      {editing !== null && (
        <ParkForm
          key={editing === 'new' ? 'new' : editing.id}
          park={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            setParks((list) => (created ? [...(list ?? []), saved] : list?.map((p) => (p.id === saved.id ? saved : p))));
            setFlash({ tone: 'good', text: `${created ? 'Added' : 'Saved'} “${saved.name}”.` });
          }}
        />
      )}

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search name or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search parks" /></label>
        <button className="button ghost" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {loadError && parks && <p className="alert" role="alert">{loadError}</p>}

      <div className="panel">
        <div className="panel-head"><h2>All parks</h2><span className="count">{parks ? `${visible.length} of ${parks.length}` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Park</th><th>Hours</th><th>Amenities</th><th>Location</th><th>Dogs now</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td className="strong">
                  <div className="cell-media">
                    <Thumb src={p.imageUrl} alt={p.name} />
                    <div>{p.name}{p.address && <small className="sub"><Icon name="pin" size={12} /> {p.address}</small>}</div>
                  </div>
                </td>
                <td className="muted">{p.hours || '—'}</td>
                <td>{p.amenities.length ? <div className="chips">{p.amenities.map((a) => <span key={a}>{a}</span>)}</div> : <span className="muted">—</span>}</td>
                <td className="muted"><a className="link" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</a></td>
                <td>{p.dogsNow ? <span className="pill good">{p.dogsNow}</span> : <span className="muted">0</span>}</td>
                <td className="row-actions">
                  <button className="button ghost" onClick={() => setEditing(p)}>Edit</button>
                  <button className="button ghost danger" disabled={pending === p.id} onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            <TableState cols={6} loading={loading} error={parks ? '' : loadError} hasRows={visible.length > 0} empty={q ? 'No parks match.' : 'No parks yet — add the first one.'} onRetry={load} />
          </tbody>
        </table>
      </div>
    </>
  );
}

type ParkForm = { name: string; description: string; address: string; lat: string; lng: string; hours: string; amenities: string };

function ParkForm({ park, onCancel, onSaved }: { park: Park | null; onCancel: () => void; onSaved: (saved: Park, created: boolean) => void }) {
  const describe = useApiError();
  const [form, setForm] = useState<ParkForm>(() => ({
    name: park?.name ?? '',
    description: park?.description ?? '',
    address: park?.address ?? '',
    lat: park ? String(park.lat) : '',
    lng: park ? String(park.lng) : '',
    hours: park?.hours ?? '',
    amenities: park?.amenities.join(', ') ?? '',
  }));
  // undefined = unchanged; data URL = new photo; null = remove.
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (key: keyof ParkForm, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const preview = image === undefined ? park?.imageUrl ?? null : image;

  async function locate() {
    setLocating(true);
    setError('');
    try {
      const pos = await currentPosition();
      setForm((f) => ({ ...f, lat: String(pos.lat), lng: String(pos.lng) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t get your location.');
    } finally {
      setLocating(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (form.name.trim().length < 2) return setError('Give the park a name (at least 2 characters).');
    if (form.lat.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) return setError('Latitude must be a number between -90 and 90.');
    if (form.lng.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) return setError('Longitude must be a number between -180 and 180.');
    const amenities = [...new Set(form.amenities.split(',').map((a) => a.trim()).filter(Boolean))];
    if (amenities.some((a) => a.length > 40)) return setError('Keep each amenity under 40 characters.');
    if (amenities.length > 20) return setError('List at most 20 amenities.');
    const body: ParkInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      address: form.address.trim(),
      lat,
      lng,
      hours: form.hours.trim(),
      amenities,
      ...(image !== undefined ? { image } : {}),
    };
    setBusy(true);
    setError('');
    try {
      const saved = park ? await api.updatePark(park.id, body) : await api.createPark(body);
      onSaved(saved, !park);
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit}>
      <div className="panel-head"><h2>{park ? `Edit “${park.name}”` : 'New park'}</h2></div>
      <div className="form-grid">
        <label className="field">Name<input value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} placeholder="Cubbon Park dog run" /></label>
        <label className="field wide-2">Address<input value={form.address} maxLength={300} onChange={(e) => set('address', e.target.value)} placeholder="Kasturba Rd, Bengaluru" /></label>
        <label className="field wide">Description<textarea rows={3} value={form.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} placeholder="Fenced off-leash area with shade and water." /></label>
        <label className="field">Latitude<input inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="12.9763" /></label>
        <label className="field">Longitude<input inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="77.5929" /></label>
        <div className="field">
          &nbsp;
          <button type="button" className="button ghost file-button" onClick={locate} disabled={locating}><Icon name="locate" size={15} /> {locating ? 'Locating…' : 'Use my location'}</button>
        </div>
        <label className="field">Hours<input value={form.hours} maxLength={120} onChange={(e) => set('hours', e.target.value)} placeholder="6 am – 8 pm" /></label>
        <label className="field wide-2">Amenities<input value={form.amenities} onChange={(e) => set('amenities', e.target.value)} placeholder="Water, Shade, Fenced" /><small>Separate with commas.</small></label>
        <PhotoField label="Photo" value={preview} onChange={setImage} />
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel}>Cancel</button>
        <button className="button" disabled={busy}>{busy ? 'Saving…' : park ? 'Save changes' : 'Add park'}</button>
      </div>
    </form>
  );
}
