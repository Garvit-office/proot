'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CARE_CATEGORIES, canOfferCare, formatDistance, formatDuration, rupees, type CareCategory, type CareQuery } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, LocationPrompt, PageHead, Spinner } from '../../components/ui';
import { useLoad, useNear } from '../../lib/hooks';
import { api, useSession } from '../../lib/session';

type Sort = NonNullable<CareQuery['sort']>;

export default function CarePage() {
  const { status, user } = useSession();
  const near = useNear();
  const [category, setCategory] = useState<CareCategory | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('rating');

  // Debounce typing before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSort: Sort = sort === 'distance' && !near ? 'rating' : sort;
  const { data, error, loading, reload } = useLoad(
    () => api.listServices({ q: q || undefined, category: category || undefined, sort: effectiveSort, lat: near?.lat, lng: near?.lng }),
    [q, category, effectiveSort, near?.lat, near?.lng],
    status !== 'loading',
  );

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Care"
        title="Help at home."
        lede="Walks, grooming, vet visits, training and sitting from people nearby. Book a slot and pay securely."
        actions={status === 'ready' && (
          <>
            <Link className="button secondary" href="/bookings"><Icon name="calendar" size={16} /> My bookings</Link>
            {canOfferCare(user?.role) && <Link className="button secondary" href="/provider/services"><Icon name="settings" size={16} /> Provider tools</Link>}
          </>
        )}
      />

      {status === 'ready' && <LocationPrompt what="care near you" />}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search care" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search care" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="rating">Top rated</option>
          <option value="price_asc">Lowest price</option>
          <option value="distance" disabled={!near}>Nearest{near ? '' : ' (share location)'}</option>
          <option value="new">Newest</option>
        </select>
      </div>
      <div className="tabs" role="radiogroup" aria-label="Category">
        <button role="radio" aria-checked={!category} className={`option${!category ? ' selected' : ''}`} onClick={() => setCategory('')}>All</button>
        {CARE_CATEGORIES.map((c) => (
          <button key={c} role="radio" aria-checked={category === c} className={`option${category === c ? ' selected' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner label="Finding care nearby…" />}
      {data && data.length === 0 && (
        <EmptyState icon="heart" title="No care matches that." text="Try another category or clear the search." />
      )}
      {data && data.length > 0 && (
        <div className={`card-grid${loading ? ' is-refreshing' : ''}`}>
          {data.map((s) => (
            <Link className="card" href={`/care/${s.id}`} key={s.id}>
              <div className="card-media">
                {s.imageUrl ? <img src={s.imageUrl} alt="" /> : <span className="card-placeholder"><Icon name="heart" size={40} /></span>}
                <span className="chip">{s.category}</span>
              </div>
              <div className="card-body">
                <h2>{s.title}</h2>
                <div className="card-meta">
                  <span>{s.provider.name}</span>
                  {s.ratingCount > 0 ? (
                    <span className="rating"><Icon name="star" size={14} /> {s.ratingAvg.toFixed(1)} ({s.ratingCount})</span>
                  ) : <span>New</span>}
                  <span><Icon name="clock" size={14} /> {formatDuration(s.durationMin)}</span>
                  {s.distanceKm != null && <span><Icon name="pin" size={14} /> {formatDistance(s.distanceKm)}</span>}
                </div>
                <p className="card-text">{s.description}</p>
                <div className="card-foot">
                  <span className="price">{rupees(s.pricePaise)} <small>/ visit</small></span>
                  <span className="card-cta">Book <Icon name="arrowRight" size={15} /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
