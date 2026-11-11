'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDistance, rupees, type ListingStatus } from '@proot/shared';
import { Icon } from '../../../components/Icon';
import { BackLink, ErrorNote, Notice, PageLoading, UserAvatar } from '../../../components/ui';
import { errorMessage, useLoad, useNear } from '../../../lib/hooks';
import { QuantityInput } from '../../../components/shop/QuantityInput';
import { api, useRealtime, useSession, useSocketEvent } from '../../../lib/session';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, user } = useSession();
  const { setCartCount } = useRealtime();
  const near = useNear();
  const { data: product, setData, error, reload } = useLoad(() => api.getProduct(id), [id], status !== 'loading');
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [added, setAdded] = useState(false);

  useSocketEvent('product:updated', (p) => {
    if (p.id !== id) return;
    if (p.deleted) setData((cur) => cur && { ...cur, status: 'REMOVED', stock: 0 });
    else setData((cur) => cur && { ...cur, stock: p.stock, status: p.status as ListingStatus });
  });

  if (error && !product) {
    return (
      <main className="wrap page-section">
        <BackLink href="/shop">All products</BackLink>
        <ErrorNote error={error} onRetry={reload} />
      </main>
    );
  }
  if (!product) return <PageLoading label="Loading listing…" />;

  const own = user?.id === product.seller.id;
  const available = product.status === 'ACTIVE' && product.stock > 0;
  const maxQty = Math.max(1, product.stock);
  const distance = product.distanceKm ?? (near && product.lat != null && product.lng != null ? haversine(near, { lat: product.lat, lng: product.lng }) : null);

  async function addToCart(goToCart: boolean) {
    if (status !== 'ready') {
      router.push(`/onboarding?next=${encodeURIComponent(`/shop/${id}`)}`);
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const cart = await api.getCart();
      const existing = cart.items.find((item) => item.product.id === id)?.quantity ?? 0;
      const next = await api.setCartItem(id, Math.min(product!.stock, existing + qty));
      setCartCount(next.count);
      setAdded(true);
      if (goToCart) router.push('/cart');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap page-section">
      <BackLink href="/shop">All products</BackLink>
      <div className="detail-grid">
        <div className="gallery">
          {product.images.length ? (
            <img className="detail-image" src={product.images[Math.min(active, product.images.length - 1)]} alt={product.title} />
          ) : (
            <div className="detail-image card-placeholder"><Icon name="package" size={56} /></div>
          )}
          {product.images.length > 1 && (
            <div className="gallery-thumbs">
              {product.images.map((src, i) => (
                <button key={src} className={i === active ? 'active' : undefined} onClick={() => setActive(i)} aria-label={`Photo ${i + 1}`}>
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <section className="detail-body">
          <div className="chip-row">
            <span className="chip brand">{product.category}</span>
            <span className="chip">{product.condition}</span>
            {product.status !== 'ACTIVE' && <span className="chip bad">{product.status === 'SOLD_OUT' ? 'Sold out' : product.status === 'DRAFT' ? 'Draft' : 'Not available'}</span>}
          </div>
          <h1>{product.title}</h1>
          <p className="lede product-desc">{product.description}</p>
          <ul className="facts">
            <li><UserAvatar name={product.seller.name} url={product.seller.avatarUrl} size={24} /> {product.seller.name}<span>Seller</span></li>
            {(product.city || distance != null) && <li><Icon name="pin" /> {product.city || 'Nearby'}<span>{formatDistance(distance)}</span></li>}
            <li><Icon name="package" /> {available ? `${product.stock} in stock` : 'Out of stock'}<span>{product.stock > 0 && product.stock <= 3 ? 'Selling fast' : ''}</span></li>
          </ul>
          <p className="detail-price">{rupees(product.pricePaise)}</p>

          {own ? (
            <div className="actions">
              <Notice>This is your listing.</Notice>
              <Link className="button secondary" href={`/selling/${product.id}/edit`}><Icon name="edit" size={16} /> Edit listing</Link>
            </div>
          ) : (
            <>
              {available && (
                <div className="qty-row">
                  <span className="muted">Quantity</span>
                  <QuantityInput value={qty} max={maxQty} onChange={setQty} />
                </div>
              )}
              <div className="actions">
                <button className="button primary" disabled={!available || busy} onClick={() => addToCart(false)}>
                  <Icon name="cart" size={17} /> {busy ? 'Adding…' : 'Add to cart'}
                </button>
                <button className="button secondary" disabled={!available || busy} onClick={() => addToCart(true)}>
                  Buy now <Icon name="arrowRight" size={16} />
                </button>
              </div>
              {added && <Notice tone="good">Added to your cart. <Link href="/cart" className="link-button">View cart</Link></Notice>}
              <ErrorNote error={actionError} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
