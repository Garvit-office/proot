'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { isAdmin, type EventInput, type EventRecord } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { dateTime, toLocalInput } from '../../lib/format';
import { api, useApiError, useSession } from '../../lib/session';

const blank: EventInput = { title: '', description: '', location: '', startsAt: '', capacity: 0, published: false };

export default function EventsPage() {
  return <Suspense><Events /></Suspense>;
}

function Events() {
  const { user } = useSession();
  const describe = useApiError();
  const params = useSearchParams();
  const [events, setEvents] = useState<EventRecord[]>();
  const [editing, setEditing] = useState<EventRecord | 'new' | null>(params.get('new') === '1' ? 'new' : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'good'; text: string } | null>(null);

  const load = useCallback(() => {
    api.listEvents().then((res) => setEvents(res.manageable)).catch((err) => setMessage({ tone: 'error', text: describe(err) }));
  }, [describe]);
  useEffect(load, [load]);

  async function run(id: string, action: () => Promise<unknown>, success: string) {
    setBusyId(id);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'good', text: success });
      load();
    } catch (err) {
      setMessage({ tone: 'error', text: describe(err) });
    } finally {
      setBusyId(null);
    }
  }

  const now = Date.now();
  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">{isAdmin(user?.role) ? 'All events' : 'Your events'}</p>
          <h1>Events</h1>
        </div>
        {editing === null && <button className="button" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> New event</button>}
      </header>

      {message && <p className={`alert ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      {editing !== null && (
        <EventForm
          key={editing === 'new' ? 'new' : editing.id}
          event={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            setMessage({ tone: 'good', text: `${created ? 'Created' : 'Saved'} “${saved.title}”${saved.published ? ' — it’s live.' : ' as a draft.'}` });
            load();
          }}
        />
      )}

      <div className="panel">
        <div className="panel-head"><h2>{isAdmin(user?.role) ? 'Every event' : 'Events you manage'}</h2><span className="count">{events ? `${events.length} total` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Event</th><th>When</th><th>RSVPs</th><th>Status</th>{isAdmin(user?.role) && <th>Owner</th>}<th aria-label="Actions" /></tr></thead>
          <tbody>
            {events?.map((e) => {
              const past = new Date(e.startsAt).getTime() < now;
              return (
                <tr key={e.id}>
                  <td className="strong">{e.title}<small className="sub"><Icon name="pin" size={12} /> {e.location}</small></td>
                  <td className={past ? 'muted' : undefined}>{dateTime(e.startsAt)}</td>
                  <td>{e.rsvpCount}{e.capacity ? ` / ${e.capacity}` : ''}</td>
                  <td><span className={`pill ${past ? '' : e.published ? 'good' : 'warn'}`}>{past ? 'Past' : e.published ? 'Published' : 'Draft'}</span></td>
                  {isAdmin(user?.role) && <td className="muted">{e.managerName ?? '—'}</td>}
                  <td className="row-actions">
                    <button className="button ghost" disabled={busyId === e.id} onClick={() => run(e.id, () => api.updateEvent(e.id, { published: !e.published }), e.published ? `Unpublished “${e.title}”.` : `Published “${e.title}”.`)}>
                      {e.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="button ghost" onClick={() => setEditing(e)}>Edit</button>
                    <button
                      className="button ghost danger"
                      disabled={busyId === e.id}
                      onClick={() => window.confirm(`Delete “${e.title}”${e.rsvpCount ? ` and its ${e.rsvpCount} RSVPs` : ''}? This can’t be undone.`) && run(e.id, () => api.deleteEvent(e.id), `Deleted “${e.title}”.`)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {events && events.length === 0 && <tr><td colSpan={6} className="empty-row">No events yet — create the first one.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EventForm({ event, onCancel, onSaved }: { event: EventRecord | null; onCancel: () => void; onSaved: (saved: EventRecord, created: boolean) => void }) {
  const describe = useApiError();
  const [form, setForm] = useState<EventInput>(() => (event ? { ...event, startsAt: toLocalInput(event.startsAt) } : blank));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.location.trim() || !form.startsAt) return setError('Fill in every field.');
    const startsAt = new Date(form.startsAt);
    if (!event && startsAt.getTime() < Date.now()) return setError('Pick a time in the future.');
    setBusy(true);
    setError('');
    try {
      const body = { ...form, startsAt: startsAt.toISOString() };
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
        <label className="field wide">Description<textarea rows={3} value={form.description} maxLength={1000} onChange={(e) => set('description', e.target.value)} placeholder="Off-leash hour for dogs who already play well." /></label>
        <label className="field">Location<input value={form.location} maxLength={120} onChange={(e) => set('location', e.target.value)} placeholder="Riverside Lawn, Indiranagar" /></label>
        <label className="field">Starts<input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></label>
        <label className="field">Capacity<input type="number" min={0} value={form.capacity} onChange={(e) => set('capacity', Math.max(0, Number(e.target.value) || 0))} /><small>0 = no cap{event?.rsvpCount ? ` · ${event.rsvpCount} already going` : ''}</small></label>
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
