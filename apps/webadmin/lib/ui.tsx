'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminListQuery, Page } from '@proot/shared';
import { useApiError } from './session';

export type Flash = { tone: 'error' | 'good'; text: string } | null;

export function FlashMessage({ flash }: { flash: Flash }) {
  if (!flash) return null;
  return <p className={`alert ${flash.tone}`} role={flash.tone === 'error' ? 'alert' : 'status'}>{flash.text}</p>;
}

export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Loads one page of an admin list endpoint. Resets to the first page when the search or status
 * changes, ignores responses that arrive out of order, and exposes `patch` for optimistic edits.
 */
export function usePagedList<T extends { id: string }>(
  fetcher: (query: AdminListQuery) => Promise<Page<T>>,
  { q, status, limit = 25 }: { q: string; status: string; limit?: number },
) {
  const describe = useApiError();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<T>>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const debouncedQ = useDebounced(q.trim());

  useEffect(() => setOffset(0), [debouncedQ, status]);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    fetcher({ q: debouncedQ || undefined, status: status || undefined, limit, offset })
      .then((res) => {
        if (id !== requestId.current) return;
        setPage(res);
        setError('');
        // Removing the last row of a later page leaves it empty: step back.
        if (res.items.length === 0 && offset > 0 && res.total > 0) setOffset(Math.max(0, offset - limit));
      })
      .catch((err) => id === requestId.current && setError(describe(err)))
      .finally(() => id === requestId.current && setLoading(false));
  }, [fetcher, debouncedQ, status, limit, offset, describe]);

  useEffect(reload, [reload]);

  const patch = useCallback((itemId: string, update: (item: T) => T) => {
    setPage((p) => (p ? { ...p, items: p.items.map((item) => (item.id === itemId ? update(item) : item)) } : p));
  }, []);

  return { page, items: page?.items ?? [], error, loading, offset, setOffset, limit, reload, patch };
}

export function Pager({ total, limit, offset, onChange, loading }: { total: number; limit: number; offset: number; onChange: (offset: number) => void; loading?: boolean }) {
  if (total <= limit) return null;
  const from = offset + 1;
  const to = Math.min(total, offset + limit);
  return (
    <div className="pager">
      <span className="count">{from}–{to} of {total}</span>
      <button className="button ghost" disabled={loading || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
      <button className="button ghost" disabled={loading || to >= total} onClick={() => onChange(offset + limit)}>Next</button>
    </div>
  );
}

/** Table body placeholder rows for loading / error / empty. Returns null once there are rows. */
export function TableState({ cols, loading, error, empty, hasRows, onRetry }: { cols: number; loading: boolean; error: string; empty: string; hasRows: boolean; onRetry?: () => void }) {
  if (hasRows) return null;
  if (error) {
    return (
      <tr><td colSpan={cols} className="empty-row">
        {error} {onRetry && <button className="button ghost" onClick={onRetry}>Try again</button>}
      </td></tr>
    );
  }
  if (loading) return <tr><td colSpan={cols} className="empty-row"><span className="spinner small" aria-label="Loading" /></td></tr>;
  return <tr><td colSpan={cols} className="empty-row">{empty}</td></tr>;
}

export function Thumb({ src, alt, round }: { src: string | null | undefined; alt: string; round?: boolean }) {
  return src
    ? <img className={`thumb${round ? ' round' : ''}`} src={src} alt={alt} loading="lazy" />
    : <span className={`thumb placeholder${round ? ' round' : ''}`} aria-hidden="true">{alt.trim()[0]?.toUpperCase() ?? '·'}</span>;
}

/** Segmented single-choice filter. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : undefined} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Reads an image file, scales it to fit `max` px on its long side, and returns a JPEG data URL. */
export async function fileToDataUrl(file: File, max = 1600, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That image could not be read.'));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the image.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Photo picker for forms. `value` is the preview (existing URL or new data URL, or null).
 * `onChange` gets a data URL for a new image or null to remove.
 */
export function PhotoField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="field wide">
      {label}
      <div className="photo-field">
        {value ? <img src={value} alt="" className="photo-preview" /> : <span className="photo-preview placeholder">No photo</span>}
        <div className="photo-actions">
          <label className="button ghost file-button">
            {busy ? 'Processing…' : value ? 'Replace photo' : 'Upload photo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  onChange(await fileToDataUrl(file));
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not use that image.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {value && <button type="button" className="button ghost danger" onClick={() => onChange(null)}>Remove</button>}
          <small>PNG, JPEG or WebP. Large photos are scaled down before upload.</small>
          {error && <small className="field-error">{error}</small>}
        </div>
      </div>
    </div>
  );
}

/** Asks the browser for the current position. */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This browser can’t share a location.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Couldn’t get your location.')),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

/** Parses an optional coordinate input. '' → null, invalid → NaN. */
export function parseCoord(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}
