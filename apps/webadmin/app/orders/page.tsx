'use client';

import { Fragment, useState } from 'react';
import { isAdmin, ORDER_STATUS_LABELS, ORDER_STATUSES, rupees, type FulfilmentStatus, type Order, type OrderStatus } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { dateTime } from '../../lib/format';
import { api, useApiError } from '../../lib/session';
import { FlashMessage, Pager, TableState, Thumb, usePagedList, type Flash } from '../../lib/ui';

const STATUS_TONE: Record<OrderStatus, string> = { PENDING_PAYMENT: 'warn', PAID: 'brand', SHIPPED: 'brand', DELIVERED: 'good', CANCELLED: '', REFUNDED: 'bad' };
const FULFILMENT_LABELS: Record<FulfilmentStatus, string> = { PENDING: 'To ship', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
const FULFILMENT_TONE: Record<FulfilmentStatus, string> = { PENDING: 'warn', SHIPPED: 'brand', DELIVERED: 'good', CANCELLED: '' };

export default function OrdersPage() {
  return <RequireRole allowed={isAdmin}><Orders /></RequireRole>;
}

function Orders() {
  const describe = useApiError();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(api.adminOrders, { q, status });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function setOrderStatus(order: Order, next: 'SHIPPED' | 'DELIVERED' | 'CANCELLED') {
    const short = order.id.slice(0, 8);
    const prompt = next === 'CANCELLED'
      ? order.status === 'PAID'
        ? `Cancel order ${short} for ${order.buyer.name}? ${rupees(order.totalPaise)} will be refunded to the buyer and the stock returned. This can’t be undone.`
        : `Cancel order ${short} for ${order.buyer.name}? It hasn’t been paid, so nothing is refunded. This can’t be undone.`
      : `Mark every remaining item in order ${short} as ${next.toLowerCase()}? The buyer is notified.`;
    if (!window.confirm(prompt)) return;
    setPending(order.id);
    setFlash(null);
    try {
      const saved = await api.setOrderStatus(order.id, next);
      list.patch(order.id, () => saved);
      setFlash({ tone: 'good', text: `Order ${short} is now ${ORDER_STATUS_LABELS[saved.status].toLowerCase()}.` });
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
          <h1>Orders</h1>
        </div>
      </header>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search buyer, email or order id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Every status</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <FlashMessage flash={flash} />
      {list.error && list.items.length > 0 && <p className="alert" role="alert">{list.error}</p>}

      <div className="panel">
        <div className="panel-head"><h2>Orders</h2><span className="count">{list.page ? `${list.page.total} total` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th aria-label="Expand" /><th>Order</th><th>Buyer</th><th>Items</th><th>Total</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {list.items.map((o) => {
              const expanded = open.has(o.id);
              const canShip = o.status === 'PAID' && o.items.some((i) => i.fulfilment === 'PENDING');
              const canDeliver = o.status === 'PAID' || o.status === 'SHIPPED';
              const canCancel = o.status === 'PAID' || o.status === 'PENDING_PAYMENT';
              const units = o.items.reduce((n, i) => n + i.quantity, 0);
              return (
                <Fragment key={o.id}>
                  <tr className={expanded ? 'expanded' : undefined}>
                    <td><button className={`expander${expanded ? ' open' : ''}`} onClick={() => toggle(o.id)} aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'}><Icon name="chevron" size={16} /></button></td>
                    <td className="strong"><code>{o.id.slice(0, 8)}</code><small className="sub">{dateTime(o.placedAt)}</small></td>
                    <td>{o.buyer.name}<small className="sub">{o.buyer.email}</small></td>
                    <td>{units} {units === 1 ? 'item' : 'items'}<small className="sub">{o.items[0]?.title}{o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}</small></td>
                    <td className="strong">{rupees(o.totalPaise)}</td>
                    <td><span className={`pill ${STATUS_TONE[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span></td>
                    <td className="row-actions">
                      <div className="inline-actions">
                        {canShip && <button className="button ghost" disabled={pending === o.id} onClick={() => setOrderStatus(o, 'SHIPPED')}>Mark shipped</button>}
                        {canDeliver && <button className="button ghost" disabled={pending === o.id} onClick={() => setOrderStatus(o, 'DELIVERED')}>Mark delivered</button>}
                        {canCancel && <button className="button ghost danger" disabled={pending === o.id} onClick={() => setOrderStatus(o, 'CANCELLED')}>{o.status === 'PAID' ? 'Cancel & refund' : 'Cancel'}</button>}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="expanded">
                      <td />
                      <td colSpan={6}>
                        <div className="detail">
                          <div>
                            <h3>Items</h3>
                            <ul>
                              {o.items.map((item) => (
                                <li key={item.id}>
                                  <Thumb src={item.imageUrl} alt={item.title} />
                                  <div className="grow">
                                    <strong>{item.title}</strong>
                                    <small className="sub">{item.quantity} × {rupees(item.unitPaise)} · sold by {item.seller.name}</small>
                                  </div>
                                  <span className={`pill ${FULFILMENT_TONE[item.fulfilment]}`}>{FULFILMENT_LABELS[item.fulfilment]}</span>
                                  <strong>{rupees(item.unitPaise * item.quantity)}</strong>
                                </li>
                              ))}
                            </ul>
                            <p className="muted" style={{ marginTop: 10 }}>
                              Subtotal {rupees(o.subtotalPaise)} · Shipping {o.shippingPaise ? rupees(o.shippingPaise) : 'free'} · <strong>Total {rupees(o.totalPaise)}</strong>
                            </p>
                          </div>
                          <div>
                            <h3>Ship to</h3>
                            <address>
                              <strong>{o.shippingAddress.fullName}</strong><br />
                              {o.shippingAddress.line1}<br />
                              {o.shippingAddress.line2 && <>{o.shippingAddress.line2}<br /></>}
                              {o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.pincode}<br />
                              {o.shippingAddress.phone}
                            </address>
                            <h3 style={{ marginTop: 14 }}>Buyer</h3>
                            <p className="muted">{o.buyer.name} · <a className="link" href={`mailto:${o.buyer.email}`}>{o.buyer.email}</a></p>
                            <h3 style={{ marginTop: 14 }}>Timeline</h3>
                            <p className="muted">Placed {dateTime(o.placedAt)}{o.paidAt ? ` · Paid ${dateTime(o.paidAt)}` : ''} · Updated {dateTime(o.updatedAt)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <TableState cols={7} loading={list.loading} error={list.error} hasRows={list.items.length > 0} empty={q || status ? 'No orders match.' : 'No orders yet.'} onRetry={list.reload} />
          </tbody>
        </table>
        {list.page && <Pager total={list.page.total} limit={list.limit} offset={list.offset} onChange={list.setOffset} loading={list.loading} />}
      </div>
    </>
  );
}
