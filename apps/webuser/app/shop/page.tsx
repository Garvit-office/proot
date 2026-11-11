'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PRODUCT_CATEGORIES, formatDistance, rupees, type ProductCategory, type ProductQuery } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, LocationPrompt, PageHead, Pager, Spinner } from '../../components/ui';
import { useLoad, useNear } from '../../lib/hooks';
import { api, useSession, useSocketEvent } from '../../lib/session';

const LIMIT = 12;
type Sort = NonNullable<ProductQuery['sort']>;
const SORTS: { value: Sort; label: string }[] = [
  { value: 'new', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'distance', label: 'Nearest' },
];

export default function ShopPage() {
  const { status } = useSession();
  const near = useNear();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [sort, setSort] = useState<Sort>('new');
  const [offset, setOffset] = useState(0);

  // Debounce typing into the search box.
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => setOffset(0), [query, category, sort]);

  const effectiveSort: Sort = sort === 'distance' && !near ? 'new' : sort;
  const { data, setData, error, reload } = useLoad(
    () => api.listProducts({ q: query || undefined, category: category || undefined, sort: effectiveSort, lat: near?.lat, lng: near?.lng, limit: LIMIT, offset }),
    [query, category, effectiveSort, near?.lat, near?.lng, offset],
    status !== 'loading',
  );

  useSocketEvent('product:updated', (p) => {
    setData((page) => page && {
      ...page,
      items: p.deleted ? page.items.filter((item) => item.id !== p.id) : page.items.map((item) => (item.id === p.id ? { ...item, stock: p.stock, status: p.status as typeof item.status } : item)),
    });
  });

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Shop"
        title="Fewer, better things."
        lede="Everyday essentials from shops and neighbours near you."
        actions={status === 'ready' ? <Link className="button secondary" href="/selling"><Icon name="store" size={16} /> Sell something</Link> : undefined}
      />
      {sort === 'distance' && <LocationPrompt what="the nearest listings" />}
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search listings" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div className="tabs" role="tablist" aria-label="Category">
        {(['', ...PRODUCT_CATEGORIES] as const).map((c) => (
          <button key={c || 'all'} role="tab" aria-selected={category === c} className={`option${category === c ? ' selected' : ''}`} onClick={() => setCategory(c)}>
            {c || 'All'}
          </button>
        ))}
      </div>

      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner label="Loading listings…" />}
      {data && data.items.length === 0 && (
        <EmptyState icon="bag" title="Nothing matches yet." text={query || category ? 'Try another search or category.' : 'No listings are live right now. Check back soon.'} />
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="shop-count muted">{data.total} listing{data.total === 1 ? '' : 's'}</p>
          <div className="card-grid">
            {data.items.map((product) => {
              const out = product.stock <= 0 || product.status !== 'ACTIVE';
              return (
                <Link className="card" href={`/shop/${product.id}`} key={product.id}>
                  <div className="card-media">
                    {product.images[0] ? <img src={product.images[0]} alt={product.title} /> : <span className="card-placeholder"><Icon name="package" size={40} /></span>}
                    <span className="chip">{product.category}</span>
                  </div>
                  <div className="card-body">
                    <h2>{product.title}</h2>
                    <div className="card-meta">
                      <span>{product.seller.name}</span>
                      {product.condition !== 'New' && <span>{product.condition}</span>}
                      {product.distanceKm != null && <span><Icon name="pin" size={13} /> {formatDistance(product.distanceKm)}</span>}
                    </div>
                    <div className="card-foot">
                      <span className="price">{rupees(product.pricePaise)}</span>
                      {out ? <span className="chip bad">Sold out</span> : product.stock <= 3 ? <span className="chip warn">Only {product.stock} left</span> : <span className="card-cta">View <Icon name="arrowRight" size={15} /></span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <Pager total={data.total} limit={LIMIT} offset={offset} onChange={(o) => { setOffset(o); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </>
      )}
    </main>
  );
}
