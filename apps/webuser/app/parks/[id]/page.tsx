'use client';

import { useParams } from 'next/navigation';
import { formatDistance, timeAgo } from '@proot/shared';
import { Icon } from '../../../components/Icon';
import { CheckinBanner, useCheckin } from '../../../components/community/Checkin';
import { BackLink, ErrorNote, PageLoading, PetPicker, Spinner, UserAvatar } from '../../../components/ui';
import { useLoad, useNear, useRequireUser } from '../../../lib/hooks';
import { api, useSocketEvent } from '../../../lib/session';

export default function ParkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, pet } = useRequireUser({ needPet: true });
  const near = useNear();
  const park = useLoad(() => api.getPark(id), [id, near?.lat, near?.lng], ready);
  const checkin = useCheckin(ready, () => park.reload());

  useSocketEvent('park:presence', ({ parkId }) => {
    if (parkId === id) park.reload();
  });

  if (!ready || !pet) return <PageLoading />;

  const data = park.data;
  const here = checkin.current?.parkId === id;

  return (
    <main className="wrap page-section">
      <BackLink href="/parks">All parks</BackLink>
      <ErrorNote error={park.error} onRetry={park.reload} />
      {!data && !park.error && <Spinner />}
      {data && (
        <div className="detail-grid">
          <div>
            {data.imageUrl ? (
              <img className="detail-image" src={data.imageUrl} alt={data.name} />
            ) : (
              <div className="detail-image card-placeholder"><Icon name="leaf" size={56} /></div>
            )}
          </div>
          <section className="detail-body">
            <span className="chip brand"><span className={data.dogsNow > 0 ? 'live' : undefined}>{data.dogsNow} dog{data.dogsNow === 1 ? '' : 's'} here now</span></span>
            <h1>{data.name}</h1>
            {data.description && <p className="lede">{data.description}</p>}
            <ul className="facts">
              <li><Icon name="pin" /> {data.address}<span>{formatDistance(data.distanceKm)}</span></li>
              {data.hours && <li><Icon name="clock" /> {data.hours}<span>Best hours</span></li>}
            </ul>
            {data.amenities.length > 0 && (
              <div className="amenities park-amenities">{data.amenities.map((a) => <span className="chip" key={a}>{a}</span>)}</div>
            )}

            <div className="park-checkin">
              <PetPicker label="Checking in with" />
              <CheckinBanner checkin={checkin} />
              {!here && (
                <button className="button primary" disabled={checkin.busy} onClick={() => checkin.checkIn(id, pet.id)}>
                  <Icon name="pin" size={17} /> {checkin.current ? `Move ${pet.name} here` : `Check in ${pet.name}`}
                </button>
              )}
            </div>

            <section className="present">
              <h2>Who’s here now</h2>
              {data.present.length === 0 ? (
                <p className="panel-muted">Nobody’s checked in right now. Be the first.</p>
              ) : (
                <ul className="saved-list">
                  {data.present.map((p, i) => (
                    <li key={`${p.petId ?? p.ownerName}-${i}`}>
                      <UserAvatar name={p.petName} url={p.photoUrl} size={34} />
                      <div><strong>{p.petName}</strong><small>with {p.ownerName} · since {timeAgo(p.since)}</small></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
        </div>
      )}
    </main>
  );
}
