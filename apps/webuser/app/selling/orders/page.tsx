'use client';

import Link from 'next/link';
import { useState } from 'react';
import { rupees, type FulfilmentStatus, type Order } from '@proot/shared';
import { Icon } from '../../../components/Icon';
import { BackLink, EmptyState, ErrorNote, OrderStatusChip, PageHead, PageLoading, Spinner } from '../../../components/ui';
import { errorMessage, formatWhen, useLoad, useRequireUser } from '../../../lib/hooks';
import { api, useSocketEvent } from '../../../lib/session';

const FULFILMENT: Record<FulfilmentStatus, { label: string; tone: string }> = {
  PENDING: { label: 'To ship', tone: 'warn' },
  SHIPPED: { label: 'Shipped', tone: 'brand' },
  DELIVERED: { label: 'Delivered', tone: 'good' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

type Tab = 'open' | 'all';

export default function SellingOrdersPage() {
  const { ready, user } = useRequireUser();
  const { data, setData, error, reload } = useLoad(() => api.listSellingOrders(), [], ready);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [tab, setTab] = useState<Tab>('open');

  // The push carries the full order; keep only my line items, like /orders/selling does.
  useSocketEvent('order:updated', (order) => {
    const mine = order.items.filter((i) => i.seller.id === user?.id);
    if (!mine.length) return;
    const trimmed: Order = { ...order, items: mine };
    setData((list) => {
      if (!list) return list;
      return list.some((o) => o.id === order.id) ? list.map((o) => (o.id === order.id ? trimmed : o)) : [trimmed, ...list];
    });
  });

  async function advance(order: Order, itemId: string, fulfilment: 'SHIPPED' | 'DELIVERED') {
    setBusy(itemId);
    setActionError('');
    try {
      const updated = await api.updateOrderItem(order.id, itemId, fulfilment);
      setData((list) => list?.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <PageLoading />;

  const isOpen = (o: Order) => (o.status === 'PAID' || o.status === 'SHIPPED') && o.items.some((i) => i.fulfilment === 'PENDING' || i.fulfilment === 'SHIPPED');
  const orders = data?.filter((o) => tab === 'all' || isOpen(o)) ?? [];

  return (
    <main className="wrap page-section">
      <BackLink href="/selling">Your listings</BackLink>
      <PageHead eyebrow="Selling" title="Orders to fulfil" lede="Mark items shipped when they leave, and delivered when they arrive." />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'open'} className={`option${tab === 'open' ? ' selected' : ''}`} onClick={() => setTab('open')}>Needs action <small>{data?.filter(isOpen).length ?? ''}</small></button>
        <button role="tab" aria-selected={tab === 'all'} className={`option${tab === 'all' ? ' selected' : ''}`} onClick={() => setTab('all')}>All</button>
      </div>
      <ErrorNote error={error} onRetry={reload} />
      <ErrorNote error={actionError} />
      {!data && !error && <Spinner label="Loading orders…" />}
      {data && orders.length === 0 && (
        <EmptyState icon="truck" title={tab === 'open' ? 'Nothing to ship right now.' : 'No orders yet.'} text="Orders for your listings appear here once they’re placed." action={<Link className="button secondary" href="/selling">Your listings</Link>} />
      )}
      <ul className="list">
        {orders.map((order) => {
          const shippable = order.status === 'PAID' || order.status === 'SHIPPED';
          const a = order.shippingAddress;
          return (
            <li key={order.id} className="panel seller-order">
              <header>
                <div>
                  <strong>Order {order.id.slice(0, 8).toUpperCase()}</strong>
                  <small className="muted"> · {formatWhen(order.placedAt)} · {order.buyer.name}</small>
                </div>
                <OrderStatusChip status={order.status} />
              </header>
              <ul className="list">
                {order.items.map((item) => (
                  <li key={item.id} className="row-card">
                    {item.imageUrl ? <img className="row-thumb" src={item.imageUrl} alt="" /> : <span className="row-thumb"><Icon name="package" /></span>}
                    <div className="grow">
                      <h3>{item.title}</h3>
                      <p>{item.quantity} × {rupees(item.unitPaise)} = {rupees(item.quantity * item.unitPaise)}</p>
                    </div>
                    <span className={`chip ${FULFILMENT[item.fulfilment].tone}`}>{FULFILMENT[item.fulfilment].label}</span>
                    {shippable && item.fulfilment === 'PENDING' && (
                      <button className="button primary small" disabled={busy === item.id} onClick={() => advance(order, item.id, 'SHIPPED')}><Icon name="truck" size={14} /> Mark shipped</button>
                    )}
                    {shippable && item.fulfilment === 'SHIPPED' && (
                      <button className="button secondary small" disabled={busy === item.id} onClick={() => advance(order, item.id, 'DELIVERED')}><Icon name="check" size={14} /> Mark delivered</button>
                    )}
                  </li>
                ))}
              </ul>
              {shippable && (
                <p className="ship-to muted"><Icon name="pin" size={14} /> {a.fullName}, {a.phone} — {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</p>
              )}
              {order.status === 'PENDING_PAYMENT' && <p className="muted small">Waiting for the buyer to pay. Don’t ship yet.</p>}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
