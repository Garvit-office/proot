'use client';

import { useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { isAdmin, type EventAttendee, type EventInput, type EventRecord } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { dateTime, relative, toLocalInput } from '../../lib/format';
import { api, useApiError, useSession } from '../../lib/session';
import { currentPosition, FlashMessage, parseCoord, PhotoField, Segmented, TableState, Thumb, type Flash } from '../../lib/ui';

type Filter = 'all' | 'upcoming' | 'drafts' | 'past';

export default function EventsPage() {
  return <Suspense><Events /></Suspense>;
}

function Events() {
  const { user } = useSession();
  const describe = useApiError();
  const params = useSearchParams();
  const admin = isAdmin(user?.role);
  const [events, setEvents] = useState<EventRecord[]>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<EventRecord | 'new' | null>(params.get('new') === '1' ? 'new' : null);
  const [attendeesFor, setAttendeesFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    setLoading(true);
    api.listEvents()
      .then((res) => {
        setEvents(res.manageable);
        setLoadError('');
      })
      .catch((err) => setLoadError(describe(err)))
      .finally(() => setLoading(false));
  }, [describe]);
  useEffect(load, [load]);

  async function run(id: string, action: () => Promise<unknown>, success: string) {
    setBusyId(id);
    setFlash(null);
    try {
      await action();
      setFlash({ tone: 'good', text: success });
      load();
    } catch (err) {
      setFlash({ tone: 'error', text: describe(err) });
    } finally {
      setBusyId(null);
    }
  }

  const now = Date.now();
  const needle = q.trim().toLowerCase();
  const visible = (events ?? []).filter((e) => {
      const past = new Date(e.startsAt).getTime() < now;
      if (filter === 'upcoming' && (past || !e.published)) return false;
      if (filter === 'drafts' && (past || e.published)) return false;
      if (filter === 'past' && !past) return false;
      return !needle || `${e.title} ${e.location} ${e.managerName ?? ''}`.toLowerCase().includes(needle);
  });

  const cols = admin ? 6 : 5;
  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">{admin ? 'All events' : 'Your events'}</p>
          <h1>Events</h1>
        </div>
        {editing === null && <button className="button" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> New event</button>}
      </header>

      <FlashMessage flash={flash} />

      {editing !== null && (
        <EventForm
          key={editing === 'new' ? 'new' : editing.id}
          event={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            setFlash({ tone: 'good', text: `${created ? 'Created' : 'Saved'} “${saved.title}”${saved.published ? ' — it’s live.' : ' as a draft.'}` });
            load();
          }}
        />
      )}

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search title, place or owner" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" /></label>
        <Segmented<Filter> label="Filter events" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'upcoming', label: 'Live' }, { value: 'drafts', label: 'Drafts' }, { value: 'past', label: 'Past' }]} />
      </div>
      {loadError && events && <p className="alert" role="alert">{loadError}</p>}

      <div className="panel">
        <div className="panel-head"><h2>{admin ? 'Every event' : 'Events you manage'}</h2><span className="count">{events ? `${visible.length} of ${events.length}` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Event</th><th>When</th><th>RSVPs</th><th>Status</th>{admin && <th>Owner</th>}<th aria-label="Actions" /></tr></thead>
          <tbody>
            {visible.map((e) => {
              const past = new Date(e.startsAt).getTime() < now;
              const showing = attendeesFor === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className={showing ? 'expanded' : undefined}>
                    <td className="strong">
                      <div className="cell-media">
                        <Thumb src={e.imageUrl} alt={e.title} />
                        <div>{e.title}<small className="sub"><Icon name="pin" size={12} /> {e.location}{e.lat !== null && e.lng !== null ? ' · mapped' : ''}</small></div>
                      </div>
                    </td>
                    <td className={past ? 'muted' : undefined}>{dateTime(e.startsAt)}</td>
                    <td>
                      <button className="button ghost" onClick={() => setAttendeesFor(showing ? null : e.id)} aria-expanded={showing} title="Show attendees">
                        {e.rsvpCount}{e.capacity ? ` / ${e.capacity}` : ''}
                      </button>
                    </td>
                    <td><span className={`pill ${past ? '' : e.published ? 'good' : 'warn'}`}>{past ? 'Past' : e.published ? 'Published' : 'Draft'}</span></td>
                    {admin && <td className="muted">{e.managerName ?? '—'}</td>}
                    <td className="row-actions">
                      <button className="button ghost" disabled={busyId === e.id} onClick={() => run(e.id, () => api.updateEvent(e.id, { published: !e.published }), e.published ? `Unpublished “${e.title}”.` : `Published “${e.title}”.`)}>
                        {e.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button className="button ghost" onClick={() => setEditing(e)}>Edit</button>
                      <button
                        className="button ghost danger"
                        disabled={busyId === e.id}
                        onClick={() => window.confirm(`Delete “${e.title}”${e.rsvpCount ? ` and its ${e.rsvpCount} RSVPs? Attendees are told it was cancelled` : ''}? This can’t be undone.`) && run(e.id, () => api.deleteEvent(e.id), `Deleted “${e.title}”.`)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {showing && (
                    <tr className="expanded"><td colSpan={cols} style={{ padding: 0 }}><Attendees eventId={e.id} /></td></tr>
                  )}
                </Fragment>
              );
            })}
            <TableState cols={cols} loading={loading} error={events ? '' : loadError} hasRows={visible.length > 0} empty={events?.length ? 'No events match.' : 'No events yet — create the first one.'} onRetry={load} />
          </tbody>
        </table>
      </div>
    </>
  );
}

function Attendees({ eventId }: { eventId: string }) {
  const describe = useApiError();
  const [attendees, setAttendees] = useState<EventAttendee[]>();
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.getEvent(eventId)
      .then((detail) => live && setAttendees(detail.attendees))
      .catch((err) => live && setError(describe(err)));
    return () => {
      live = false;
    };
  }, [eventId, describe]);

  if (error) return <p className="empty-row">{error}</p>;
  if (!attendees) return <p className="empty-row"><span className="spinner small" aria-label="Loading attendees" /></p>;
  if (attendees.length === 0) return <p className="empty-row">No RSVPs yet.</p>;
  return (
    <ul className="attendees">
      {attendees.map((a) => (
        <li key={a.userId}>
          <Thumb src={a.avatarUrl} alt={a.name} round />
          <div><strong>{a.name}</strong><small>RSVPed {relative(a.createdAt)}</small></div>
        </li>
      ))}
    </ul>
  );
}

type EventFormState = { title: string; description: string; location: string; startsAt: string; capacity: number; published: boolean; lat: string; lng: string };

function EventForm({ event, onCancel, onSaved }: { event: EventRecord | null; onCancel: () => void; onSaved: (saved: EventRecord, created: boolean) => void }) {
  const describe = useApiError();
  const [form, setForm] = useState<EventFormState>(() => ({
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    startsAt: event ? toLocalInput(event.startsAt) : '',
    capacity: event?.capacity ?? 0,
    published: event?.published ?? false,
    lat: event?.lat != null ? String(event.lat) : '',
    lng: event?.lng != null ? String(event.lng) : '',
  }));
  // undefined = unchanged; data URL = new photo; null = remove.
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const preview = image === undefined ? event?.imageUrl ?? null : image;

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
    if (!form.title.trim() || !form.description.trim() || !form.location.trim() || !form.startsAt) return setError('Fill in the title, description, location and start time.');
    const startsAt = new Date(form.startsAt);
    if (!event && startsAt.getTime() < Date.now()) return setError('Pick a time in the future.');
    const lat = parseCoord(form.lat);
    const lng = parseCoord(form.lng);
    if ((lat === null) !== (lng === null)) return setError('Enter both latitude and longitude, or leave both empty.');
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return setError('Latitude must be between -90 and 90.');
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return setError('Longitude must be between -180 and 180.');
    setBusy(true);
    setError('');
    try {
      const body: EventInput = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        startsAt: startsAt.toISOString(),
        capacity: form.capacity,
        published: form.published,
        lat,
        lng,
        ...(image !== undefined ? { image } : {}),
      };
      const saved = event ? await api.updateEvent(event.id, body) : await api.createEvent(body);
      onSaved(saved, !event);
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit}>
      <div className="panel-head"><h2>{event ? `Edit “${event.title}”` : 'New event'}</h2></div>
      <div className="form-grid">
        <label className="field wide">Title<input value={form.title} maxLength={100} onChange={(e) => set('title', e.target.value)} placeholder="Sunday meadow meetup" /></label>
        <label className="field wide">Description<textarea rows={3} value={form.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} placeholder="Off-leash hour for dogs who already play well." /></label>
        <label className="field">Location<input value={form.location} maxLength={160} onChange={(e) => set('location', e.target.value)} placeholder="Riverside Lawn, Indiranagar" /></label>
        <label className="field">Starts<input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></label>
        <label className="field">Capacity<input type="number" min={0} max={10000} value={form.capacity} onChange={(e) => set('capacity', Math.max(0, Math.floor(Number(e.target.value) || 0)))} /><small>0 = no cap{event?.rsvpCount ? ` · ${event.rsvpCount} already going` : ''}</small></label>
        <label className="field">Latitude <small>optional</small><input inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="12.9716" /></label>
        <label className="field">Longitude <small>optional</small><input inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="77.5946" /></label>
        <div className="field">
          <small>Lets members find it by distance.</small>
          <button type="button" className="button ghost file-button" onClick={locate} disabled={locating}><Icon name="locate" size={15} /> {locating ? 'Locating…' : 'Use my location'}</button>
        </div>
        <PhotoField label="Photo" value={preview} onChange={setImage} />
        <label className="check"><input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} /> Published — visible to everyone and open for RSVPs</label>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel}>Cancel</button>
        <button className="button" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : form.published ? 'Create & publish' : 'Save draft'}</button>
      </div>
    </form>
  );
}
