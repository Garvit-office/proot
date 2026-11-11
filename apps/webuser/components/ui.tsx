'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BOOKING_STATUS_LABELS, ORDER_STATUS_LABELS, type BookingStatus, type OrderStatus } from '@proot/shared';
import type { PaymentState } from '../lib/payments';
import { useUpdateLocation } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Icon, type IconName } from './Icon';
import { PetAvatar } from './ProfileDrawer';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </p>
  );
}

/** Full-page placeholder while the session or first load resolves. */
export function PageLoading({ label }: { label?: string }) {
  return (
    <main className="wrap page-section">
      <Spinner label={label} />
    </main>
  );
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <p className="callout error" role="alert">
      <Icon name="info" size={16} /> <span>{error}</span>
      {onRetry && <button type="button" className="link-button retry" onClick={onRetry}>Try again</button>}
    </p>
  );
}

export function Notice({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' }) {
  return (
    <p className={`callout${tone ? ` ${tone}` : ''}`} role="status">
      <Icon name={tone === 'good' ? 'check' : 'info'} size={16} /> <span>{children}</span>
    </p>
  );
}

export function EmptyState({ icon = 'leaf', title, text, action }: { icon?: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel empty">
      <span className="icon-tile accent"><Icon name={icon} size={22} /></span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function PageHead({ eyebrow, title, lede, actions }: { eyebrow: string; title: ReactNode; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={`page-head${actions ? ' with-actions' : ''}`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}

const ORDER_TONES: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'warn', PAID: 'brand', SHIPPED: 'brand', DELIVERED: 'good', CANCELLED: 'bad', REFUNDED: 'bad',
};
const BOOKING_TONES: Record<BookingStatus, string> = {
  REQUESTED: 'warn', CONFIRMED: 'brand', DECLINED: 'bad', COMPLETED: 'good', CANCELLED: 'bad',
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <span className={`chip ${ORDER_TONES[status]}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function BookingStatusChip({ status }: { status: BookingStatus }) {
  return <span className={`chip ${BOOKING_TONES[status]}`}>{BOOKING_STATUS_LABELS[status]}</span>;
}

/** Shown on pages that sort by distance when the account has no saved position. */
export function LocationPrompt({ what = 'what’s near you' }: { what?: string }) {
  const { user } = useSession();
  const { request, busy, error } = useUpdateLocation();
  if (!user || user.lat != null) return null;
  return (
    <div className="onboard-banner location-prompt">
      <span className="icon-tile"><Icon name="navigation" size={20} /></span>
      <div>
        <strong>Share your location to see {what}.</strong>
        <p>{error || 'We use it for distances and nearby dogs. Only an approximate position is saved to your account.'}</p>
      </div>
      <button className="button primary" onClick={() => request()} disabled={busy}>
        {busy ? 'Locating…' : 'Use my location'}
      </button>
    </div>
  );
}

/** Which of my dogs a page is acting for. Hidden when there's only one. */
export function PetPicker({ label = 'Browsing as' }: { label?: string }) {
  const { pets, pet, selectPet } = useSession();
  if (pets.length < 2 || !pet) return null;
  return (
    <div className="pet-picker">
      <span>{label}</span>
      <div className="pet-switch" role="radiogroup" aria-label={label}>
        {pets.map((p) => (
          <button key={p.id} role="radio" aria-checked={p.id === pet.id} className={p.id === pet.id ? 'active' : undefined} onClick={() => selectPet(p.id)}>
            <PetAvatar pet={p} size={24} /> {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Messages for a usePayment() flow. */
export function PaymentStatus({ state }: { state: PaymentState }) {
  switch (state.phase) {
    case 'starting':
      return <Spinner label="Preparing secure payment…" />;
    case 'open':
      return <Notice>Complete the payment in the Razorpay window.</Notice>;
    case 'verifying':
      return <Spinner label="Confirming your payment…" />;
    case 'paid':
      return <Notice tone="good">Payment received. Thank you!</Notice>;
    case 'dismissed':
      return <Notice tone="warn">Payment window closed. Nothing was charged — you can pay any time.</Notice>;
    case 'error':
      return <ErrorNote error={state.message} />;
    default:
      return null;
  }
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav className="pager" aria-label="Pages">
      <button className="button secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        <Icon name="arrowLeft" size={16} /> Previous
      </button>
      <span>Page {page} of {pages}</span>
      <button className="button secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
        Next <Icon name="arrowRight" size={16} />
      </button>
    </nav>
  );
}

/** A small star rating display or input. */
export function Stars({ value, onChange, size = 16 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className={`stars${onChange ? ' input' : ''}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} className={n <= value ? 'on' : undefined} onClick={() => onChange(n)}>
            <Icon name="star" size={size} />
          </button>
        ) : (
          <span key={n} className={n <= Math.round(value) ? 'on' : undefined}><Icon name="star" size={size} /></span>
        ),
      )}
    </span>
  );
}

export function UserAvatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    <img className="pet-avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="pet-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>{name[0]?.toUpperCase()}</span>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="back-link" href={href}><Icon name="arrowLeft" size={16} /> {children}</Link>;
}
