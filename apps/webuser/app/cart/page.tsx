'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FREE_SHIPPING_PAISE, rupees, type Cart } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { QuantityInput } from '../../components/shop/QuantityInput';
import { EmptyState, ErrorNote, PageHead, PageLoading, Spinner } from '../../components/ui';
import { errorMessage, useLoad, useRequireUser } from '../../lib/hooks';
import { api, useRealtime, useSocketEvent } from '../../lib/session';

export default function CartPage() {
  const { ready } = useRequireUser();
  const { setCartCount } = useRealtime();
  const { data: cart, setData, error, reload } = useLoad(() => api.getCart(), [], ready);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Another device changed the cart, or stock moved: refetch.
  useSocketEvent('cart:updated', () => reload());
  useSocketEvent('product:updated', (p) => {
    if (cart?.items.some((item) => item.product.id === p.id)) reload();
  });

  async function mutate(productId: string, fn: () => Promise<Cart>) {
    setBusy(productId);
    setActionError('');
    try {
      const next = await fn();
      setData(next);
      setCartCount(next.count);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <PageLoading />;

  const unavailable = cart?.items.filter((i) => !i.available) ?? [];
  const toFree = cart ? FREE_SHIPPING_PAISE - cart.subtotalPaise : 0;

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Cart" title="Your cart" />
      <ErrorNote error={error} onRetry={reload} />
      {!cart && !error && <Spinner label="Loading your cart…" />}
      {cart && cart.items.length === 0 && (
        <EmptyState icon="cart" title="Your cart is empty." text="Find something good for your dog." action={<Link className="button primary" href="/shop">Browse the shop</Link>} />
      )}
      {cart && cart.items.length > 0 && (
        <div className="split">
          <section>
            <ErrorNote error={actionError} />
            <ul className="list">
              {cart.items.map((item) => (
                <li key={item.product.id} className={`panel row-card cart-row${item.available ? '' : ' unavailable'}`}>
                  <Link href={`/shop/${item.product.id}`}>
                    {item.product.images[0] ? <img className="row-thumb" src={item.product.images[0]} alt="" /> : <span className="row-thumb"><Icon name="package" /></span>}
                  </Link>
                  <div className="grow">
                    <h3><Link href={`/shop/${item.product.id}`}>{item.product.title}</Link></h3>
                    <p>{item.product.seller.name} · {rupees(item.product.pricePaise)} each</p>
                    {!item.available && (
                      <p className="cart-warn">
                        <Icon name="info" size={14} />{' '}
                        {item.product.status !== 'ACTIVE' || item.product.stock <= 0 ? 'No longer available — remove it to check out.' : `Only ${item.product.stock} left — lower the quantity.`}
                      </p>
                    )}
                  </div>
                  <div className="cart-controls">
                    <QuantityInput
                      value={item.quantity}
                      max={Math.max(item.quantity, item.product.stock)}
                      disabled={busy === item.product.id}
                      onChange={(n) => mutate(item.product.id, () => api.setCartItem(item.product.id, n))}
                    />
                    <strong>{rupees(item.lineTotalPaise)}</strong>
                    <button className="link-button" disabled={busy === item.product.id} onClick={() => mutate(item.product.id, () => api.removeCartItem(item.product.id))}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <aside className="panel order-summary">
            <h2>Summary</h2>
            <dl>
              <div><dt>Subtotal ({cart.count} item{cart.count === 1 ? '' : 's'})</dt><dd>{rupees(cart.subtotalPaise)}</dd></div>
              <div><dt>Shipping</dt><dd>{cart.shippingPaise === 0 ? 'Free' : rupees(cart.shippingPaise)}</dd></div>
              <div className="total-row"><dt>Total</dt><dd>{rupees(cart.totalPaise)}</dd></div>
            </dl>
            {toFree > 0 && <p className="panel-muted small">Add {rupees(toFree)} more for free shipping.</p>}
            {unavailable.length > 0 && <p className="callout error"><Icon name="info" size={16} /> Fix {unavailable.length === 1 ? 'one item' : `${unavailable.length} items`} before checking out.</p>}
            {unavailable.length > 0 ? (
              <button className="button primary block" disabled>Checkout</button>
            ) : (
              <Link className="button primary block" href="/checkout">Checkout <Icon name="arrowRight" size={16} /></Link>
            )}
            <button className="button ghost block" onClick={() => mutate('all', () => api.clearCart())} disabled={busy !== null}>Clear cart</button>
          </aside>
        </div>
      )}
    </main>
  );
}
