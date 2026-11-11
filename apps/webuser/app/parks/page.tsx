'use client';

import Link from 'next/link';
import { formatDistance, type Park } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { CheckinBanner, useCheckin } from '../../components/community/Checkin';
import { EmptyState, ErrorNote, LocationPrompt, PageHead, PageLoading, PetPicker, Spinner } from '../../components/ui';
import { useLoad, useNear, useRequireUser } from '../../lib/hooks';
import { api, useSocketEvent } from '../../lib/session';

function byDistance(a: Park, b: Park) {
  if (a.distanceKm == null && b.distanceKm == null) return a.name.localeCompare(b.name);
  if (a.distanceKm == null) return 1;
  if (b.distanceKm == null) return -1;
  return a.distanceKm - b.distanceKm;
}

export default function ParksPage() {
  const { ready, pet } = useRequireUser({ needPet: true });
  const near = useNear();
  const parks = useLoad(() => api.listParks(near).then((list) => [...list].sort(byDistance)), [near?.lat, near?.lng], ready);
  const checkin = useCheckin(ready, () => parks.reload());

  useSocketEvent('park:presence', ({ parkId, dogsNow }) => {
    parks.setData((list) => list?.map((p) => (p.id === parkId ? { ...p, dogsNow } : p)));
  });

  if (!ready || !pet) return <PageLoading />;

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Parks" title="Where the dogs are." lede="Off-leash lawns and quiet corners near you, with a live count of who’s there right now." />
      <LocationPrompt what="parks near you" />
      <PetPicker label="Checking in with" />
      <CheckinBanner checkin={checkin} />

      <ErrorNote error={parks.error} onRetry={parks.reload} />
      {!parks.data && !parks.error && <Spinner label="Finding parks…" />}
      {parks.data && parks.data.length === 0 && (
        <EmptyState icon="leaf" title="No parks listed yet" text="We haven’t mapped parks in your area. Check back soon." />
      )}
      {parks.data && parks.data.length > 0 && (
        <div className="card-grid">
          {parks.data.map((park) => {
            const here = checkin.current?.parkId === park.id;
            return (
              <article className="card park-card" key={park.id}>
                <Link href={`/parks/${park.id}`} className="card-media">
                  {park.imageUrl ? <img src={park.imageUrl} alt={park.name} /> : <span className="card-placeholder"><Icon name="leaf" size={40} /></span>}
                  <span className="chip"><span className={park.dogsNow > 0 ? 'live' : undefined}>{park.dogsNow} dog{park.dogsNow === 1 ? '' : 's'} now</span></span>
                </Link>
                <div className="card-body">
                  <h2><Link href={`/parks/${park.id}`}>{park.name}</Link></h2>
                  <div className="card-meta">
                    {park.distanceKm != null && <span><Icon name="pin" size={14} /> {formatDistance(park.distanceKm)}</span>}
                    {park.hours && <span><Icon name="clock" size={14} /> {park.hours}</span>}
                  </div>
                  {park.amenities.length > 0 && (
                    <div className="amenities">{park.amenities.map((a) => <span className="chip" key={a}>{a}</span>)}</div>
                  )}
                  <div className="card-foot">
                    <Link className="card-cta" href={`/parks/${park.id}`}>Who’s there <Icon name="arrowRight" size={15} /></Link>
                    {here ? (
                      <button className="button secondary small" disabled={checkin.busy} onClick={checkin.checkOut}>Check out</button>
                    ) : (
                      <button className="button primary small" disabled={checkin.busy} onClick={() => checkin.checkIn(park.id, pet.id)}>
                        Check in {pet.name}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
