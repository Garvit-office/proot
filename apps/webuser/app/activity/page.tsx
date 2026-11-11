'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { LOGGABLE_ACTIVITY_TYPES, formatDuration, localDateKey, type ActivityInput, type ActivityRecord, type ActivityType } from '@proot/shared';
import { Icon, type IconName } from '../../components/Icon';
import { EmptyState, ErrorNote, PageHead, PageLoading, PetPicker, Spinner } from '../../components/ui';
import { errorMessage, formatTime, useLoad, useRequireUser } from '../../lib/hooks';
import { api } from '../../lib/session';

type Loggable = ActivityInput['type'];

const TYPE_ICONS: Record<ActivityType, IconName> = {
  Walk: 'activity', Meal: 'bowl', Play: 'heart', Care: 'sparkle', Sleep: 'moon', Park: 'leaf', Event: 'calendar',
};

const TITLE_HINTS: Record<Loggable, string> = {
  Walk: 'Morning walk', Play: 'Fetch in the yard', Sleep: 'Afternoon nap', Care: 'Brushed teeth',
};

function shiftDay(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d + days));
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayTitle(key: string) {
  const today = localDateKey();
  if (key === today) return 'Today';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

function itemMeta(item: ActivityRecord) {
  return [
    item.distanceKm != null && item.distanceKm > 0 ? `${item.distanceKm} km` : null,
    item.durationMin != null && item.durationMin > 0 ? formatDuration(item.durationMin) : null,
    item.type !== 'Meal' && item.kcal != null ? `${item.kcal} kcal` : null,
  ].filter(Boolean).join(' · ');
}

export default function ActivityPage() {
  const { ready, pet } = useRequireUser({ needPet: true });
  const today = localDateKey();
  const [date, setDate] = useState(today);
  const petId = pet?.id;
  const activity = useLoad(
    () => api.listActivity(petId!, { date, tzOffset: new Date().getTimezoneOffset() }),
    [petId, date],
    ready && Boolean(petId),
  );

  const [type, setType] = useState<Loggable>('Walk');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [time, setTime] = useState(nowTime);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [listError, setListError] = useState('');

  async function log(event: FormEvent) {
    event.preventDefault();
    if (!pet) return;
    const durationMin = duration.trim() ? Number(duration) : null;
    const distanceKm = type === 'Walk' && distance.trim() ? Number(distance) : null;
    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin < 0 || durationMin > 1440)) return setFormError('Duration is whole minutes, up to 24 hours.');
    if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 200)) return setFormError('Distance should be between 0 and 200 km.');
    const occurred = new Date(`${date}T${time || '12:00'}`);
    if (Number.isNaN(occurred.getTime())) return setFormError('Pick a valid time.');
    if (occurred.getTime() > Date.now() + 60_000) return setFormError('That time hasn’t happened yet.');
    setSaving(true);
    setFormError('');
    try {
      await api.logActivity({
        petId: pet.id,
        type,
        title: title.trim() || TITLE_HINTS[type],
        detail: detail.trim(),
        durationMin,
        distanceKm,
        occurredAt: occurred.toISOString(),
      });
      setTitle('');
      setDetail('');
      setDuration('');
      setDistance('');
      setTime(nowTime());
      activity.reload();
    } catch (err) {
      setFormError(errorMessage(err, 'Couldn’t log that activity.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    setListError('');
    try {
      await api.deleteActivity(id);
      activity.reload();
    } catch (err) {
      setListError(errorMessage(err, 'Couldn’t delete that entry.'));
    } finally {
      setDeleting(null);
    }
  }

  if (!ready || !pet) return <PageLoading />;

  const s = activity.data?.summary;
  const stats = s
    ? [
        { label: 'Walked', value: `${s.walkKm} km`, meta: s.walkMin ? formatDuration(s.walkMin) : 'no walks yet' },
        { label: 'Play', value: s.playMin ? formatDuration(s.playMin) : '0 min', meta: 'play and park time' },
        { label: 'Sleep', value: `${s.sleepHours} h`, meta: 'logged naps and nights' },
        { label: 'Food', value: `${s.kcalIn} kcal`, meta: 'from the meal log' },
      ]
    : [];

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Activity" title={`${pet.name}’s day, at a glance.`} lede="Walks, play, naps and care in one timeline. Meals and park visits are added automatically." />
      <PetPicker label="Showing" />

      <div className="day-picker" role="group" aria-label="Choose a day">
        <button className="icon-button" onClick={() => setDate((d) => shiftDay(d, -1))} aria-label="Previous day"><Icon name="arrowLeft" size={16} /></button>
        <strong>{dayTitle(date)}</strong>
        <button className="icon-button" onClick={() => setDate((d) => shiftDay(d, 1))} disabled={date >= today} aria-label="Next day"><Icon name="arrowRight" size={16} /></button>
        <input className="input" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} aria-label="Date" />
        {date !== today && <button className="link-button" onClick={() => setDate(today)}>Back to today</button>}
      </div>

      <ErrorNote error={activity.error} onRetry={activity.reload} />
      {!activity.data && !activity.error && <Spinner />}
      {s && (
        <div className="stats activity-stats">
          {stats.map((item) => (
            <div key={item.label} className="stat-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.meta}</small>
            </div>
          ))}
        </div>
      )}

      <div className="split">
        <section>
          <ErrorNote error={listError} />
          {activity.data && activity.data.items.length === 0 && (
            <EmptyState icon="activity" title="Nothing logged yet" text={`Log a walk, play session, nap or care moment for ${pet.name}.`} />
          )}
          {activity.data && activity.data.items.length > 0 && (
            <ol className="timeline">
              {activity.data.items.map((item) => {
                const meta = itemMeta(item);
                return (
                  <li key={`${item.source}-${item.id}`}>
                    <time dateTime={item.occurredAt}>{formatTime(item.occurredAt)}</time>
                    <span className="dot" data-type={item.type}><Icon name={TYPE_ICONS[item.type]} size={16} /></span>
                    <div className="panel timeline-entry">
                      <div className="grow">
                        <h2>{item.title}</h2>
                        {item.detail && <p>{item.detail}</p>}
                        {meta && <p className="timeline-meta">{item.type} · {meta}</p>}
                      </div>
                      {item.source === 'activity' ? (
                        <button className="icon-button" aria-label={`Delete ${item.title}`} disabled={deleting === item.id} onClick={() => remove(item.id)}>
                          <Icon name="trash" size={15} />
                        </button>
                      ) : (
                        <Link className="link-button" href="/nutrition">Meal log</Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="panel">
          <p className="eyebrow">Log activity</p>
          <h2>What did {pet.name} do?</h2>
          <form className="form-grid activity-form" onSubmit={log} noValidate>
            <div className="options" role="radiogroup" aria-label="Type">
              {LOGGABLE_ACTIVITY_TYPES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} className={`option${type === t ? ' selected' : ''}`} onClick={() => setType(t)}>
                  <Icon name={TYPE_ICONS[t]} size={14} /> {t}
                </button>
              ))}
            </div>
            <label className="field">
              Title
              <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={TITLE_HINTS[type]} />
            </label>
            <div className="field-pair">
              <label className="field">
                Duration (min)
                <input type="number" inputMode="numeric" min={0} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </label>
              {type === 'Walk' ? (
                <label className="field">
                  Distance (km)
                  <input type="number" inputMode="decimal" min={0} max={200} step={0.1} value={distance} onChange={(e) => setDistance(e.target.value)} />
                </label>
              ) : (
                <label className="field">
                  Time
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </label>
              )}
            </div>
            {type === 'Walk' && (
              <label className="field">
                Time
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            )}
            <label className="field">
              Notes <span className="field-hint">(optional)</span>
              <textarea rows={2} maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} />
            </label>
            {date !== today && <p className="field-hint">Logging for {dayTitle(date)}.</p>}
            <ErrorNote error={formError} />
            <button className="button primary block" disabled={saving}>{saving ? 'Saving…' : <><Icon name="plus" size={16} /> Log {type.toLowerCase()}</>}</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
