'use client';

import Link from 'next/link';
import { useState } from 'react';
import { rupees, type ListingStatus, type Product } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, PageHead, PageLoading, Spinner } from '../../components/ui';
import { errorMessage, useLoad, useRequireUser } from '../../lib/hooks';
import { api, useSocketEvent } from '../../lib/session';

const STATUS: Record<ListingStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Live', tone: 'good' },
  DRAFT: { label: 'Draft', tone: '' },
  SOLD_OUT: { label: 'Sold out', tone: 'warn' },
  ARCHIVED: { label: 'Archived', tone: '' },
  REMOVED: { label: 'Removed by Proot', tone: 'bad' },
};

const FILTERS: { key: 'all' | ListingStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ACTIVE', label: 'Live' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'SOLD_OUT', label: 'Sold out' },
  { key: 'ARCHIVED', label: 'Archived' },
];

export default function SellingPage() {
  const { ready } = useRequireUser();
  const { data, setData, error, reload } = useLoad(() => api.listProducts({ mine: true, limit: 50 }), [], ready);
  const [filter, setFilter] = useState<'all' | ListingStatus>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useSocketEvent('product:updated', (p) => {
    setData((page) => page && {
      ...page,
      items: p.deleted ? page.items.filter((i) => i.id !== p.id) : page.items.map((i) => (i.id === p.id ? { ...i, stock: p.stock, status: p.status as ListingStatus } : i)),
    });
  });

  function replace(product: Product) {
    setData((page) => page && { ...page, items: page.items.map((i) => (i.id === product.id ? product : i)) });
  }

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setActionError('');
    try {
      await fn();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (p: Product, status: 'ACTIVE' | 'ARCHIVED') => run(p.id, async () => replace(await api.updateProduct(p.id, { status })));
  const remove = (p: Product) => {
    if (!window.confirm(`Delete “${p.title}”? This can’t be undone.`)) return;
    run(p.id, async () => {
      await api.deleteProduct(p.id);
      setData((page) => page && { ...page, total: page.total - 1, items: page.items.filter((i) => i.id !== p.id) });
    });
  };

  if (!ready) return <PageLoading />;
  const items = data?.items.filter((p) => filter === 'all' || p.status === filter) ?? [];

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Selling"
        title="Your listings"
        lede="Sell food, toys and gear to dog people nearby."
        actions={<>
          <Link className="button secondary" href="/selling/orders"><Icon name="truck" size={16} /> Orders to ship</Link>
          <Link className="button primary" href="/selling/new"><Icon name="plus" size={16} /> New listing</Link>
        </>}
      />
      <ErrorNote error={error} onRetry={reload} />
      <ErrorNote error={actionError} />
      {!data && !error && <Spinner label="Loading your listings…" />}
      {data && data.items.length === 0 && (
        <EmptyState icon="store" title="You haven’t listed anything yet." text="Outgrown harness? Spare bag of kibble? List it in a minute." action={<Link className="button primary" href="/selling/new">Create a listing</Link>} />
      )}
      {data && data.items.length > 0 && (
        <>
          <div className="tabs" role="tablist">
            {FILTERS.map((f) => {
              const count = f.key === 'all' ? data.items.length : data.items.filter((p) => p.status === f.key).length;
              return (
                <button key={f.key} role="tab" aria-selected={filter === f.key} className={`option${filter === f.key ? ' selected' : ''}`} onClick={() => setFilter(f.key)}>
                  {f.label} <small>{count}</small>
                </button>
              );
            })}
          </div>
          {items.length === 0 ? <p className="panel-muted">No listings here.</p> : (
            <ul className="list">
              {items.map((p) => (
                <li key={p.id} className="panel row-card listing-row">
                  {p.images[0] ? <img className="row-thumb" src={p.images[0]} alt="" /> : <span className="row-thumb"><Icon name="package" /></span>}
                  <div className="grow">
                    <h3>{p.status === 'ACTIVE' || p.status === 'SOLD_OUT' ? <Link href={`/shop/${p.id}`}>{p.title}</Link> : p.title}</h3>
                    <p>{rupees(p.pricePaise)} · {p.stock} in stock · {p.category}</p>
                  </div>
                  <span className={`chip ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
                  <div className="row-actions">
                    {p.status !== 'REMOVED' && <Link className="button secondary small" href={`/selling/${p.id}/edit`}><Icon name="edit" size={14} /> Edit</Link>}
                    {p.status === 'ARCHIVED' || p.status === 'DRAFT' ? (
                      <button className="button secondary small" disabled={busy === p.id} onClick={() => setStatus(p, 'ACTIVE')}>Publish</button>
                    ) : p.status !== 'REMOVED' ? (
                      <button className="button secondary small" disabled={busy === p.id} onClick={() => setStatus(p, 'ARCHIVED')}>Archive</button>
                    ) : null}
                    <button className="button danger small" disabled={busy === p.id} onClick={() => remove(p)} aria-label={`Delete ${p.title}`}><Icon name="trash" size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
