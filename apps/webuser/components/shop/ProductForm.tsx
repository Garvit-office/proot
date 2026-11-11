'use client';

import { useState, type FormEvent } from 'react';
import {
  MAX_PRODUCT_IMAGES,
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  toPaise,
  type Product,
  type ProductCategory,
  type ProductCondition,
  type ProductInput,
} from '@proot/shared';
import { errorMessage } from '../../lib/hooks';
import { fileToImageDataUrl } from '../../lib/photo';
import { useSession } from '../../lib/session';
import { Icon } from '../Icon';
import { ErrorNote } from '../ui';

type Status = ProductInput['status'];

const STATUS_OPTIONS: { value: Status; label: string; hint: string }[] = [
  { value: 'ACTIVE', label: 'Live', hint: 'Visible in the shop' },
  { value: 'DRAFT', label: 'Draft', hint: 'Only you can see it' },
  { value: 'ARCHIVED', label: 'Archived', hint: 'Hidden, kept for records' },
];

export function ProductForm({ initial, onSubmit, submitLabel }: { initial?: Product; onSubmit: (input: ProductInput) => Promise<void>; submitLabel: string }) {
  const { user } = useSession();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<ProductCategory>(initial?.category ?? 'Food');
  const [condition, setCondition] = useState<ProductCondition>(initial?.condition ?? 'New');
  const [price, setPrice] = useState(initial ? String(initial.pricePaise / 100) : '');
  const [stock, setStock] = useState(initial ? String(initial.stock) : '1');
  const [status, setStatus] = useState<Status>(
    initial && (initial.status === 'ACTIVE' || initial.status === 'DRAFT' || initial.status === 'ARCHIVED') ? initial.status : 'ACTIVE',
  );
  const [city, setCity] = useState(initial?.city ?? user?.city ?? '');
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PRODUCT_IMAGES - images.length;
    if (room <= 0) return setError(`Up to ${MAX_PRODUCT_IMAGES} photos.`);
    setPhotoBusy(true);
    setError('');
    try {
      const picked = Array.from(files).slice(0, room);
      const urls = await Promise.all(picked.map((f) => fileToImageDataUrl(f, 1600)));
      setImages((list) => [...list, ...urls].slice(0, MAX_PRODUCT_IMAGES));
      if (files.length > room) setError(`Only the first ${room} photo${room === 1 ? '' : 's'} were added — the limit is ${MAX_PRODUCT_IMAGES}.`);
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t read that photo.'));
    } finally {
      setPhotoBusy(false);
    }
  }

  function move(index: number, delta: number) {
    setImages((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const pricePaise = toPaise(price);
    const stockNum = Number(stock);
    if (title.trim().length < 2) return setError('Give the listing a title.');
    if (!Number.isFinite(pricePaise) || pricePaise < 100) return setError('The price must be at least ₹1.');
    if (!Number.isInteger(stockNum) || stockNum < 0) return setError('Stock must be a whole number, 0 or more.');
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        category,
        condition,
        pricePaise,
        stock: stockNum,
        status,
        images,
        city: city.trim() || undefined,
        // New listings are placed at the seller's saved location so buyers can sort by distance.
        ...(initial ? {} : { lat: user?.lat ?? null, lng: user?.lng ?? null }),
      });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="panel form-grid product-form" onSubmit={submit} noValidate>
      <section className="form-grid">
        <div className="photo-editor-head">
          <strong>Photos</strong>
          <small className="field-hint">{images.length}/{MAX_PRODUCT_IMAGES} · the first photo is the cover</small>
        </div>
        <div className="photo-editor">
          {images.map((src, i) => (
            <figure key={`${i}-${src.slice(-24)}`} className={i === 0 ? 'cover' : undefined}>
              <img src={src} alt={`Photo ${i + 1}`} />
              {i === 0 && <span className="chip">Cover</span>}
              <div className="photo-tools">
                <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier"><Icon name="arrowLeft" size={14} /></button>
                <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move later"><Icon name="arrowRight" size={14} /></button>
                <button type="button" className="icon-button" onClick={() => setImages((l) => l.filter((_, j) => j !== i))} aria-label="Remove photo"><Icon name="trash" size={14} /></button>
              </div>
            </figure>
          ))}
          {images.length < MAX_PRODUCT_IMAGES && (
            <label className="photo-add">
              <Icon name="camera" size={22} />
              <span>{photoBusy ? 'Processing…' : 'Add photos'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={photoBusy} onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </section>

      <label className="field">Title<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field">Description<textarea rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="field-row">
        <label className="field">Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
            {PRODUCT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Condition
          <select value={condition} onChange={(e) => setCondition(e.target.value as ProductCondition)}>
            {PRODUCT_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">Price (₹)<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 499" /></label>
        <label className="field">In stock<input type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} /></label>
        <label className="field">City<input value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} /></label>
      </div>
      <fieldset className="field choice">
        <legend>Visibility</legend>
        <div className="options" role="radiogroup">
          {STATUS_OPTIONS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={status === o.value} className={`option${status === o.value ? ' selected' : ''}`} onClick={() => setStatus(o.value)} title={o.hint}>
              {o.label}
            </button>
          ))}
        </div>
        <small className="field-hint">{STATUS_OPTIONS.find((o) => o.value === status)?.hint}{initial?.status === 'SOLD_OUT' ? ' · Currently sold out — add stock to sell again.' : ''}</small>
      </fieldset>
      <ErrorNote error={error} />
      <button type="submit" className="button primary" disabled={saving || photoBusy}>{saving ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
