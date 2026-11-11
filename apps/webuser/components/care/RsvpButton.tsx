'use client';

import { useState } from 'react';
import type { EventRecord } from '@proot/shared';
import { Icon } from '../Icon';
import { errorMessage } from '../../lib/hooks';
import { api } from '../../lib/session';

export function spotsLeft(e: Pick<EventRecord, 'capacity' | 'rsvpCount'>) {
  return e.capacity > 0 ? Math.max(0, e.capacity - e.rsvpCount) : null;
}

export function SpotsChip({ event }: { event: EventRecord }) {
  const left = spotsLeft(event);
  const full = left === 0 && !event.rsvped;
  return (
    <span className={`chip ${full ? 'bad' : left !== null && left <= 3 ? 'warn' : 'brand'}`}>
      {left === null ? `${event.rsvpCount} going` : full ? 'Full' : `${left} spot${left === 1 ? '' : 's'} left`}
    </span>
  );
}

/** RSVP / cancel toggle. Calls onChange with the updated event. */
export function RsvpButton({ event, onChange }: { event: EventRecord; onChange: (e: EventRecord) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = spotsLeft(event) === 0 && !event.rsvped;
  const past = new Date(event.startsAt).getTime() < Date.now();

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      onChange(event.rsvped ? await api.cancelRsvp(event.id) : await api.rsvp(event.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rsvp">
      <button className={`button ${event.rsvped ? 'secondary' : 'primary'}`} disabled={busy || full || past} onClick={toggle}>
        {event.rsvped ? <><Icon name="check" size={16} /> Going · cancel</> : full ? 'Full' : past ? 'Started' : busy ? 'Saving…' : 'RSVP'}
      </button>
      {error && <small className="field-error" role="alert">{error}</small>}
    </div>
  );
}
