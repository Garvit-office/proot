'use client';

import { useState } from 'react';
import { isAdmin, LISTING_STATUSES, rupees, type ListingStatus, type Product } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { relative } from '../../lib/format';
import { api, useApiError } from '../../lib/session';
import { FlashMessage, Pager, TableState, Thumb, usePagedList, type Flash } from '../../lib/ui';

const STATUS_LABELS: Record<ListingStatus, string> = { ACTIVE: 'Active', DRAFT: 'Draft', SOLD_OUT: 'Sold out', ARCHIVED: 'Archived', REMOVED: 'Removed' };
const STATUS_TONE: Record<ListingStatus, string> = { ACTIVE: 'good', DRAFT: '', SOLD_OUT: 'warn', ARCHIVED: '', REMOVED: 'bad' };

export default function MarketplacePage() {
  return <RequireRole allowed={isAdmin}><Marketplace /></RequireRole>;
}

function Marketplace() {
  const describe = useApiError();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(api.adminProducts, { q, status });
  const [pending, setPending] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  async function moderate(product: Product, next: ListingStatus) {
    const prompts: Partial<Record<ListingStatus, string>> = {
      REMOVED: `Remove “${product.title}” from the marketplace? The seller (${product.seller.name}) is notified and it’s taken out of every cart.`,
      ARCHIVED: `Archive “${product.title}”? It’s hidden from buyers and taken out of every cart.`,
      ACTIVE: `Restore “${product.title}” as an active listing?`,
    };
    if (!window.confirm(prompts[next] ?? `Set “${product.title}” to ${STATUS_LABELS[next]}?`)) return;
    setPending(product.id);
    setFlash(null);
    try {
      const saved = await api.setProductStatus(product.id, next);
      list.patch(product.id, () => saved);
      setFlash({ tone: 'good', text: `“${product.title}” is now ${STATUS_LABELS[saved.status].toLowerCase()}.` });
      if (status) list.reload();
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
          <p className="eyebrow">Marketplace</p>
          <h1>Listings</h1>
        </div>
      </header>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search title or seller" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Every status</option>
          {LISTING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <FlashMessage flash={flash} />
      {list.error && list.items.length > 0 && <p className="alert" role="alert">{list.error}</p>}

      <div className="panel">
        <div className="panel-head"><h2>Listings</h2><span className="count">{list.page ? `${list.page.total} total` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Listing</th><th>Seller</th><th>Price</th><th>Stock</th><th>Status</th><th>Updated</th><th aria-label="Moderation" /></tr></thead>
          <tbody>
            {list.items.map((p) => (
              <tr key={p.id}>
                <td className="strong">
                  <div className="cell-media">
                    <Thumb src={p.images[0]} alt={p.title} />
                    <div>{p.title}<small className="sub">{p.category} · {p.condition}{p.city ? ` · ${p.city}` : ''}</small></div>
                  </div>
                </td>
                <td>{p.seller.name}</td>
                <td>{rupees(p.pricePaise)}</td>
                <td className={p.stock === 0 ? 'muted' : undefined}>{p.stock}</td>
                <td><span className={`pill ${STATUS_TONE[p.status]}`}>{STATUS_LABELS[p.status]}</span></td>
                <td className="muted" title={new Date(p.updatedAt).toLocaleString()}>{relative(p.updatedAt)}</td>
                <td className="row-actions">
                  <div className="inline-actions">
                    {p.status !== 'ACTIVE' && p.status !== 'SOLD_OUT' && (
                      <button className="button ghost" disabled={pending === p.id} onClick={() => moderate(p, 'ACTIVE')}>Restore</button>
                    )}
                    {p.status !== 'ARCHIVED' && p.status !== 'REMOVED' && (
                      <button className="button ghost" disabled={pending === p.id} onClick={() => moderate(p, 'ARCHIVED')}>Archive</button>
                    )}
                    {p.status !== 'REMOVED' && (
                      <button className="button ghost danger" disabled={pending === p.id} onClick={() => moderate(p, 'REMOVED')}>Remove</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            <TableState cols={7} loading={list.loading} error={list.error} hasRows={list.items.length > 0} empty={q || status ? 'No listings match.' : 'No listings yet.'} onRetry={list.reload} />
          </tbody>
        </table>
        {list.page && <Pager total={list.page.total} limit={list.limit} offset={list.offset} onChange={list.setOffset} loading={list.loading} />}
      </div>
    </>
  );
}
