'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { rupees, type Booking } from '@proot/shared';
import { Icon } from '../Icon';
import { BookingStatusChip, UserAvatar } from '../ui';
import { formatWhen } from '../../lib/hooks';

/** One booking row, shared by the customer and provider lists. */
export function BookingCard({ booking, viewer, children }: { booking: Booking; viewer: 'customer' | 'provider'; children?: ReactNode }) {
  const other = viewer === 'customer' ? booking.provider : booking.customer;
  return (
    <li className="panel booking-card">
      <div className="booking-main">
        {booking.service.imageUrl ? <img className="row-thumb" src={booking.service.imageUrl} alt="" /> : <span className="row-thumb"><Icon name="heart" /></span>}
        <div className="grow">
          <div className="booking-title">
            {viewer === 'customer' ? <Link href={`/care/${booking.service.id}`}><h3>{booking.service.title}</h3></Link> : <h3>{booking.service.title}</h3>}
            <BookingStatusChip status={booking.status} />
            {booking.isPaid ? <span className="chip good">Paid</span> : booking.status === 'REQUESTED' ? <span className="chip warn">Unpaid</span> : null}
          </div>
          <div className="card-meta">
            <span><Icon name="clock" size={14} /> {formatWhen(booking.startsAt)}</span>
            <span><Icon name="heart" size={14} /> {booking.pet?.name ?? 'Dog removed'}</span>
            <span><UserAvatar name={other.name} url={other.avatarUrl} size={18} /> {viewer === 'customer' ? `with ${other.name}` : other.name}</span>
            {viewer === 'provider' && booking.customer.phone && <span>{booking.customer.phone}</span>}
            <span className="price">{rupees(booking.pricePaise)}</span>
          </div>
          {booking.address && <p className="booking-detail"><Icon name="pin" size={14} /> {booking.address}</p>}
          {booking.notes && <p className="booking-detail">“{booking.notes}”</p>}
        </div>
      </div>
      {children}
    </li>
  );
}
