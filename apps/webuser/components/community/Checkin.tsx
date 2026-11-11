'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { timeAgo, type CheckinRecord } from '@proot/shared';
import { errorMessage } from '../../lib/hooks';
import { api, useSession } from '../../lib/session';
import { Icon } from '../Icon';
import { ErrorNote } from '../ui';

export type CheckinState = ReturnType<typeof useCheckin>;

/** The signed-in user's current park check-in, with check in / check out actions. */
export function useCheckin(enabled: boolean, onChange?: () => void) {
  const [current, setCurrent] = useState<CheckinRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.currentCheckin().then(setCurrent).catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const checkIn = useCallback(async (parkId: string, petId: string) => {
    setBusy(true);
    setError('');
    try {
      setCurrent(await api.checkIn(parkId, petId));
      onChange?.();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t check in.'));
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  const checkOut = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await api.checkOut();
      setCurrent(null);
      onChange?.();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t check out.'));
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  return { current, busy, error, checkIn, checkOut, reload: load };
}

export function CheckinBanner({ checkin }: { checkin: CheckinState }) {
  const { pets } = useSession();
  const { current } = checkin;
  return (
    <>
      <ErrorNote error={checkin.error} />
      {current && (
        <div className="onboard-banner checkin-banner">
          <span className="icon-tile"><Icon name="pin" size={20} /></span>
          <div>
            <strong>
              {(() => {
                const name = pets.find((p) => p.id === current.petId)?.name;
                return name ? `${name} is` : 'You’re';
              })()} at{' '}
              <Link href={`/parks/${current.parkId}`}>{current.parkName}</Link>
            </strong>
            <p>Checked in {timeAgo(current.checkedInAt)}. Other dog owners can see you’re here.</p>
          </div>
          <button className="button secondary" onClick={checkin.checkOut} disabled={checkin.busy}>
            {checkin.busy ? 'One moment…' : 'Check out'}
          </button>
        </div>
      )}
    </>
  );
}
