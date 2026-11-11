'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { api, useSession } from './session';

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Pages that need an account send guests to /onboarding (and back here afterwards).
 * With `needPet`, signed-in users without a dog are sent to set one up.
 * `ready` is true once the page may render its signed-in content.
 */
export function useRequireUser({ needPet = false }: { needPet?: boolean } = {}) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { status, pet } = session;
  const missingPet = needPet && status === 'ready' && !pet;

  useEffect(() => {
    if (status === 'guest') router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
    else if (missingPet) router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [status, missingPet, router, pathname]);

  return { ...session, ready: status === 'ready' && !missingPet };
}

/**
 * Load data with loading / error state. `fn` runs whenever `deps` change while `enabled`.
 * `setData` lets realtime updates patch the result in place.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList, enabled = true) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const result = await fnRef.current();
      if (id === seq.current) setData(result);
    } catch (err) {
      if (id === seq.current) setError(errorMessage(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reload, ...deps]);

  return { data, setData, error, loading, reload };
}

/** Ask the browser for a position and store it on the account. */
export function useUpdateLocation() {
  const { setUser } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Your browser can’t share a location.');
      return Promise.resolve(false);
    }
    setBusy(true);
    setError('');
    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const me = await api.updateLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setUser(me);
            resolve(true);
          } catch (err) {
            setError(errorMessage(err, 'Couldn’t save your location.'));
            resolve(false);
          } finally {
            setBusy(false);
          }
        },
        (err) => {
          setBusy(false);
          setError(err.code === err.PERMISSION_DENIED ? 'Location access was blocked. Allow it in your browser settings to see what’s near you.' : 'Couldn’t get your location. Try again.');
          resolve(false);
        },
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
      );
    });
  }, [setUser]);

  return { request, busy, error };
}

/** The signed-in user's saved position, for distance sorting. */
export function useNear() {
  const { user } = useSession();
  return user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : undefined;
}

export function formatWhen(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  return new Date(iso).toLocaleString([], opts);
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
