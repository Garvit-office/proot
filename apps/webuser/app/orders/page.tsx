'use client';

import Link from 'next/link';
import { rupees } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, OrderStatusChip, PageHead, PageLoading, Spinner } from '../../components/ui';
import { formatWhen, useLoad, useRequireUser } from '../../lib/hooks';
import { api, useSocketEvent } from '../../lib/session';

export default function OrdersPage() {
  const { ready, user } = useRequireUser();
  const { data, setData, error, reload } = useLoad(() => api.listOrders(), [], ready);

  useSocketEvent('order:updated', (order) => {
    if (order.buyer.id !== user?.id) return;
    setData((list) => {
      if (!list) return list;
      return list.some((o) => o.id === order.id) ? list.map((o) => (o.id === order.id ? order : o)) : [order, ...list];
    });
  });

  if (!ready) return <PageLoading />;

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Orders" title="Your orders" actions={<Link className="button secondary" href="/shop"><Icon name="bag" size={16} /> Shop</Link>} />
      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner label="Loading orders…" />}
      {data && data.length === 0 && (
        <EmptyState icon="package" title="No orders yet." text="When you buy something it shows up here." action={<Link className="button primary" href="/shop">Browse the shop</Link>} />
      )}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((order) => (
            <li key={order.id}>
              <Link className="panel row-card order-row" href={`/orders/${order.id}`}>
                <div className="thumb-stack">
                  {order.items.slice(0, 3).map((item) =>
                    item.imageUrl ? <img key={item.id} className="row-thumb" src={item.imageUrl} alt="" /> : <span key={item.id} className="row-thumb"><Icon name="package" /></span>,
                  )}
                </div>
                <div className="grow">
                  <h3>{order.items.map((i) => i.title).join(', ')}</h3>
                  <p>Placed {formatWhen(order.placedAt, { day: 'numeric', month: 'short', year: 'numeric' })} · {order.items.reduce((n, i) => n + i.quantity, 0)} item(s)</p>
                </div>
                <div className="row-actions order-row-side">
                  <OrderStatusChip status={order.status} />
                  <strong>{rupees(order.totalPaise)}</strong>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
