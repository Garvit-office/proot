'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { rupees, type AddressRecord, type CheckoutInput, type ShippingAddress } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { BackLink, EmptyState, ErrorNote, PageHead, PageLoading, PaymentStatus, Spinner } from '../../components/ui';
import { useLoad, useRequireUser } from '../../lib/hooks';
import { usePayment } from '../../lib/payments';
import { api, useRealtime } from '../../lib/session';

const EMPTY: ShippingAddress = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

function validate(a: ShippingAddress) {
  if (!a.fullName.trim()) return 'Add the recipient’s name.';
  if (!/^[+\d][\d\s()-]{6,19}$/.test(a.phone.trim())) return 'Enter a valid phone number.';
  if (a.line1.trim().length < 3) return 'Add the street address.';
  if (a.city.trim().length < 2) return 'Add the city.';
  if (a.state.trim().length < 2) return 'Add the state.';
  if (!/^\d{6}$/.test(a.pincode.trim())) return 'PIN codes have 6 digits.';
  return '';
}

export default function CheckoutPage() {
  const router = useRouter();
  const { ready, user } = useRequireUser();
  const { setCartCount } = useRealtime();
  const cart = useLoad(() => api.getCart(), [], ready);
  const addresses = useLoad(() => api.listAddresses(), [], ready);
  const [choice, setChoice] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<ShippingAddress>(EMPTY);
  const [save, setSave] = useState(true);
  const [formError, setFormError] = useState('');
  const orderIdRef = useRef<string | null>(null);

  const payment = usePayment({
    onSettled: () => {
      if (orderIdRef.current) router.push(`/orders/${orderIdRef.current}`);
    },
  });

  // Default to the default address (or the first), else the new-address form.
  useEffect(() => {
    if (choice !== null || !addresses.data) return;
    const list = addresses.data;
    setChoice((list.find((a) => a.isDefault) ?? list[0])?.id ?? 'new');
  }, [addresses.data, choice]);

  useEffect(() => {
    if (user && !form.fullName && !form.phone) setForm((f) => ({ ...f, fullName: user.name, phone: user.phone, city: user.city }));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <PageLoading />;

  function placeOrder(event: FormEvent) {
    event.preventDefault();
    let body: CheckoutInput;
    if (choice && choice !== 'new') body = { addressId: choice };
    else {
      const problem = validate(form);
      if (problem) return setFormError(problem);
      body = { address: form, saveAddress: save };
    }
    setFormError('');
    payment.pay(async () => {
      const res = await api.checkout(body);
      orderIdRef.current = res.order.id;
      setCartCount(0);
      return res.payment;
    });
  }

  const set = (key: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const data = cart.data;
  const blocked = data?.items.some((i) => !i.available);

  return (
    <main className="wrap page-section">
      <BackLink href="/cart">Back to cart</BackLink>
      <PageHead eyebrow="Checkout" title="Where should it go?" />
      <ErrorNote error={cart.error || addresses.error} onRetry={() => { cart.reload(); addresses.reload(); }} />
      {(!data || !addresses.data) && !cart.error && !addresses.error && <Spinner />}
      {data && data.items.length === 0 && !orderIdRef.current && (
        <EmptyState icon="cart" title="Your cart is empty." action={<Link className="button primary" href="/shop">Browse the shop</Link>} />
      )}
      {data && data.items.length > 0 && addresses.data && (
        <form className="split" onSubmit={placeOrder} noValidate>
          <section className="panel form-grid">
            <h2>Delivery address</h2>
            <div className="address-options" role="radiogroup" aria-label="Saved addresses">
              {addresses.data.map((a: AddressRecord) => (
                <label key={a.id} className={`address-option${choice === a.id ? ' selected' : ''}`}>
                  <input type="radio" name="address" checked={choice === a.id} onChange={() => setChoice(a.id)} />
                  <span>
                    <strong>{a.label || 'Address'}{a.isDefault && <span className="chip brand">Default</span>}</strong>
                    <small>{a.fullName} · {a.phone}</small>
                    <small>{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</small>
                  </span>
                </label>
              ))}
              <label className={`address-option${choice === 'new' ? ' selected' : ''}`}>
                <input type="radio" name="address" checked={choice === 'new'} onChange={() => setChoice('new')} />
                <span><strong><Icon name="plus" size={14} /> A new address</strong></span>
              </label>
            </div>
            {choice === 'new' && (
              <div className="form-grid">
                <div className="field-row">
                  <label className="field">Full name<input autoComplete="name" value={form.fullName} onChange={set('fullName')} /></label>
                  <label className="field">Phone<input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></label>
                </div>
                <label className="field">Address line 1<input autoComplete="address-line1" value={form.line1} onChange={set('line1')} /></label>
                <label className="field">Address line 2 <span className="field-hint">Optional</span><input autoComplete="address-line2" value={form.line2} onChange={set('line2')} /></label>
                <div className="field-row">
                  <label className="field">City<input autoComplete="address-level2" value={form.city} onChange={set('city')} /></label>
                  <label className="field">State<input autoComplete="address-level1" value={form.state} onChange={set('state')} /></label>
                  <label className="field">PIN code<input inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={set('pincode')} /></label>
                </div>
                <label className="check-field"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save this address for next time</label>
              </div>
            )}
            <ErrorNote error={formError} />
          </section>
          <aside className="panel order-summary">
            <h2>Order</h2>
            <ul className="summary-items">
              {data.items.map((i) => (
                <li key={i.product.id}><span>{i.quantity} × {i.product.title}</span><span>{rupees(i.lineTotalPaise)}</span></li>
              ))}
            </ul>
            <dl>
              <div><dt>Subtotal</dt><dd>{rupees(data.subtotalPaise)}</dd></div>
              <div><dt>Shipping</dt><dd>{data.shippingPaise === 0 ? 'Free' : rupees(data.shippingPaise)}</dd></div>
              <div className="total-row"><dt>Total</dt><dd>{rupees(data.totalPaise)}</dd></div>
            </dl>
            {blocked && <ErrorNote error="Some items are no longer available. Update your cart first." />}
            <PaymentStatus state={payment.state} />
            <button type="submit" className="button primary block" disabled={payment.busy || blocked}>
              <Icon name="card" size={17} /> {payment.busy ? 'Processing…' : `Pay ${rupees(data.totalPaise)}`}
            </button>
            <p className="panel-muted small">Secure payment by Razorpay. Unpaid orders are held for a short while, then released.</p>
          </aside>
        </form>
      )}
    </main>
  );
}
