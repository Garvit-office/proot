'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { rupees, type FulfilmentStatus, type Order } from '@proot/shared';
import { Icon } from '../../../components/Icon';
import { BackLink, ErrorNote, OrderStatusChip, PageLoading, PaymentStatus } from '../../../components/ui';
import { errorMessage, formatWhen, useLoad, useRequireUser } from '../../../lib/hooks';
import { usePayment } from '../../../lib/payments';
import { api, useSocketEvent } from '../../../lib/session';

const STEPS = [
  { key: 'PLACED', label: 'Placed' },
  { key: 'PAID', label: 'Paid' },
  { key: 'SHIPPED', label: 'Shipped' },
  { key: 'DELIVERED', label: 'Delivered' },
] as const;

function stepIndex(order: Order) {
  switch (order.status) {
    case 'PENDING_PAYMENT': return 0;
    case 'PAID': return 1;
    case 'SHIPPED': return 2;
    case 'DELIVERED': return 3;
    default: return order.paidAt ? 1 : 0;
  }
}

const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = { PENDING: 'Preparing', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
const FULFILMENT_TONE: Record<FulfilmentStatus, string> = { PENDING: 'warn', SHIPPED: 'brand', DELIVERED: 'good', CANCELLED: 'bad' };

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { ready } = useRequireUser();
  const { data: order, setData, error, reload } = useLoad(() => api.getOrder(id), [id], ready);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const payment = usePayment({ onPaid: () => reload() });

  useSocketEvent('order:updated', (o) => {
    if (o.id === id) setData(o);
  });

  if (!ready) return <PageLoading />;
  if (error && !order) {
    return (
      <main className="wrap page-section">
        <BackLink href="/orders">All orders</BackLink>
        <ErrorNote error={error} onRetry={reload} />
      </main>
    );
  }
  if (!order) return <PageLoading label="Loading order…" />;

  async function cancel() {
    if (!window.confirm(order!.status === 'PAID' ? 'Cancel this order? You’ll be refunded.' : 'Cancel this order?')) return;
    setBusy(true);
    setActionError('');
    try {
      setData(await api.cancelOrder(id));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const current = stepIndex(order);
  const stopped = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const canCancel = order.status === 'PENDING_PAYMENT' || (order.status === 'PAID' && order.items.every((i) => i.fulfilment === 'PENDING'));
  const a = order.shippingAddress;

  return (
    <main className="wrap page-section">
      <BackLink href="/orders">All orders</BackLink>
      <header className="page-head with-actions">
        <div>
          <p className="eyebrow">Order · {order.id.slice(0, 8).toUpperCase()}</p>
          <h1>{rupees(order.totalPaise)}</h1>
          <p className="lede">Placed {formatWhen(order.placedAt)}{order.paidAt ? ` · paid ${formatWhen(order.paidAt)}` : ''}</p>
        </div>
        <OrderStatusChip status={order.status} />
      </header>

      <ol className={`order-timeline${stopped ? ' stopped' : ''}`} aria-label="Order progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i <= current ? 'done' : undefined} aria-current={i === current ? 'step' : undefined}>
            <span>{i <= current ? <Icon name="check" size={13} /> : i + 1}</span>
            {s.label}
          </li>
        ))}
        {stopped && <li className="bad"><span><Icon name="x" size={13} /></span>{order.status === 'REFUNDED' ? 'Refunded' : 'Cancelled'}</li>}
      </ol>

      <div className="split">
        <section className="panel">
          <h2>Items</h2>
          <ul className="list order-items">
            {order.items.map((item) => (
              <li key={item.id} className="row-card">
                {item.imageUrl ? <img className="row-thumb" src={item.imageUrl} alt="" /> : <span className="row-thumb"><Icon name="package" /></span>}
                <div className="grow">
                  <h3>{item.productId ? <Link href={`/shop/${item.productId}`}>{item.title}</Link> : item.title}</h3>
                  <p>{item.quantity} × {rupees(item.unitPaise)} · sold by {item.seller.name}</p>
                </div>
                <span className={`chip ${FULFILMENT_TONE[item.fulfilment]}`}>{FULFILMENT_LABEL[item.fulfilment]}</span>
              </li>
            ))}
          </ul>
        </section>
        <aside className="panel order-summary">
          <dl>
            <div><dt>Subtotal</dt><dd>{rupees(order.subtotalPaise)}</dd></div>
            <div><dt>Shipping</dt><dd>{order.shippingPaise === 0 ? 'Free' : rupees(order.shippingPaise)}</dd></div>
            <div className="total-row"><dt>Total</dt><dd>{rupees(order.totalPaise)}</dd></div>
          </dl>
          <div className="ship-to">
            <h3>Ship to</h3>
            <p><strong>{a.fullName}</strong> · {a.phone}<br />{[a.line1, a.line2].filter(Boolean).join(', ')}<br />{a.city}, {a.state} {a.pincode}</p>
          </div>
          <PaymentStatus state={payment.state} />
          <ErrorNote error={actionError} />
          {order.status === 'PENDING_PAYMENT' && (
            <button className="button primary block" disabled={payment.busy} onClick={() => payment.pay(() => api.payOrder(id))}>
              <Icon name="card" size={17} /> {payment.busy ? 'Processing…' : `Pay ${rupees(order.totalPaise)} now`}
            </button>
          )}
          {canCancel && <button className="button secondary block" disabled={busy || payment.busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Cancel order'}</button>}
        </aside>
      </div>
    </main>
  );
}
