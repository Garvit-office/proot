'use client';

import Link from 'next/link';
import { formatDistance, formatDuration, type HomeResponse } from '@proot/shared';
import { Icon, type IconName } from '../components/Icon';
import { PetAvatar } from '../components/ProfileDrawer';
import { BookingStatusChip, ErrorNote, LocationPrompt, PageLoading, PetPicker, Spinner } from '../components/ui';
import { formatWhen, useLoad } from '../lib/hooks';
import { api, useSession, useSocketEvent } from '../lib/session';

const features: { href: string; icon: IconName; title: string; text: string; accent?: boolean }[] = [
  { href: '/shop', icon: 'bag', title: 'A neighborhood market', text: 'Buy from local sellers, or list what your dog has outgrown.' },
  { href: '/care', icon: 'heart', title: 'Help at home', text: 'Book walkers, groomers, trainers and vets near you.', accent: true },
  { href: '/events', icon: 'calendar', title: 'Small gatherings', text: 'Capped meetups that stay calm for every dog.' },
  { href: '/parks', icon: 'leaf', title: 'Parks nearby', text: 'Shade, water, and who’s there right now.', accent: true },
  { href: '/friends', icon: 'users', title: 'A slow hello', text: 'Meet nearby dogs one at a time, then chat.' },
  { href: '/nutrition', icon: 'bowl', title: 'Photo-first meals', text: 'Snap dinner, get a quick review, keep a daily log.', accent: true },
];

export default function Page() {
  const { status } = useSession();
  if (status === 'loading') return <PageLoading />;
  if (status === 'guest') return <Marketing />;
  return <Dashboard />;
}

function Marketing() {
  return (
    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="hero-badge"><span><Icon name="heart" size={13} /></span> For dogs and the people who walk them</span>
          <h1>The neighborhood, <em>held in one place.</em></h1>
          <p className="lede">
            A local market, trusted care, calm meetups, parks with live check-ins, new friends, and a photo-first meal log — all around the dog at the center of your day.
          </p>
          <div className="actions">
            <Link className="button primary" href="/onboarding">
              Get started <Icon name="arrowRight" size={16} />
            </Link>
            <Link className="button secondary" href="/onboarding">I have an account</Link>
          </div>
          <div className="trust">
            <span><Icon name="check" size={16} /> Secure payments with Razorpay</span>
            <span><Icon name="check" size={16} /> Capped, calm meetups</span>
            <span><Icon name="check" size={16} /> Daily activity log</span>
          </div>
        </div>

        <div className="hero-art">
          <img
            src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1200&q=80"
            alt="A golden retriever looking at the camera"
          />
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <p className="eyebrow">What’s inside</p>
            <h2>Care, community, and good walks.</h2>
          </div>
          <p>Everything your dog needs from the neighborhood, organised around their routine.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <Link key={feature.href} className="feature" href={feature.href}>
              <span className={`icon-tile${feature.accent ? ' accent' : ''}`}><Icon name={feature.icon} size={22} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <span className="more">Explore <Icon name="arrowRight" size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap">
        <div className="cta-band">
          <div>
            <h2>Set up your dog’s profile in two minutes.</h2>
            <p>Basics, health notes, routine and personality — then the whole neighborhood fits around them.</p>
          </div>
          <Link className="button" href="/onboarding">Create an account <Icon name="arrowRight" size={16} /></Link>
        </div>
      </section>
    </main>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Dashboard() {
  const { user, pet } = useSession();
  const { data, setData, error, reload } = useLoad<HomeResponse>(() => api.home(pet?.id), [pet?.id, user?.lat, user?.lng]);

  useSocketEvent('park:presence', (p) =>
    setData((d) => (d?.nearestPark?.id === p.parkId ? { ...d, nearestPark: { ...d.nearestPark, dogsNow: p.dogsNow } } : d)),
  );
  useSocketEvent('event:updated', (e) => {
    if (e.deleted) {
      if (data?.nextEvent?.id === e.id) reload();
      return;
    }
    setData((d) => (d?.nextEvent?.id === e.id ? { ...d, nextEvent: { ...d.nextEvent, rsvpCount: e.rsvpCount } } : d));
  });
  useSocketEvent('booking:updated', () => reload());

  return (
    <main className="wrap page-section">
      <header className="dash-head">
        {pet && <PetAvatar pet={pet} size={72} />}
        <div>
          <p className="eyebrow">{greeting()}, {user?.name.split(' ')[0]}</p>
          <h1>{pet ? `${pet.name}’s day` : 'Your neighborhood'}</h1>
        </div>
      </header>

      {!pet && (
        <div className="onboard-banner" style={{ margin: '0 0 28px' }}>
          <span className="icon-tile accent"><Icon name="heart" size={22} /></span>
          <div>
            <strong>Finish setting up your dog’s profile.</strong>
            <p>Two minutes: basics, health notes, routine, and personality. Activity, meals, parks and friends need a dog.</p>
          </div>
          <Link className="button primary" href="/onboarding">Continue <Icon name="arrowRight" size={16} /></Link>
        </div>
      )}

      <PetPicker label="Showing" />
      <LocationPrompt what="parks and dogs near you" />
      <ErrorNote error={error} onRetry={reload} />
      {!data && !error && <Spinner label="Loading your day…" />}
      {data && <DashboardBody data={data} hasPet={Boolean(pet)} />}
    </main>
  );
}

function DashboardBody({ data, hasPet }: { data: HomeResponse; hasPet: boolean }) {
  const { today, nextBooking, nextEvent, nearestPark } = data;
  const target = today.targetKcal ?? 0;
  const pct = target ? Math.min(100, Math.round((today.kcalIn / target) * 100)) : 0;

  return (
    <>
      {hasPet && (
        <section>
          <div className="stats">
            <div className="stat-card">
              <span>Walks</span>
              <strong>{today.walkKm.toFixed(1)} km</strong>
              <small>{today.walkMin ? formatDuration(today.walkMin) : 'Not yet today'}</small>
            </div>
            <div className="stat-card">
              <span>Play</span>
              <strong>{today.playMin} min</strong>
              <small>logged today</small>
            </div>
            <div className="stat-card">
              <span>Sleep</span>
              <strong>{today.sleepHours.toFixed(1)} h</strong>
              <small>logged today</small>
            </div>
            <div className="stat-card">
              <span>Food</span>
              <strong>{today.kcalIn} kcal</strong>
              <small>{target ? `of ~${target} kcal target` : 'eaten today'}</small>
              {target > 0 && <div className={`meter${today.kcalIn > target ? ' over' : ''}`} style={{ marginTop: 8 }}><span style={{ width: `${pct}%` }} /></div>}
            </div>
          </div>
        </section>
      )}

      <div className="dash-grid">
        <article className="panel dash-card">
          <p className="eyebrow">Next booking</p>
          {nextBooking ? (
            <>
              <h2>{nextBooking.service.title}</h2>
              <div className="card-meta">
                <span><Icon name="clock" size={14} /> {formatWhen(nextBooking.startsAt)}</span>
                <span><Icon name="user" size={14} /> {nextBooking.provider.name}</span>
              </div>
              <div><BookingStatusChip status={nextBooking.status} />{!nextBooking.isPaid && <span className="chip warn" style={{ marginLeft: 6 }}>Unpaid</span>}</div>
              <Link className="link-button" href="/bookings">View bookings <Icon name="arrowRight" size={13} /></Link>
            </>
          ) : (
            <>
              <p className="panel-muted">Nothing booked. Walkers, groomers and vets are a tap away.</p>
              <Link className="link-button" href="/care">Find care <Icon name="arrowRight" size={13} /></Link>
            </>
          )}
        </article>

        <article className="panel dash-card">
          <p className="eyebrow">Next event</p>
          {nextEvent ? (
            <>
              <h2>{nextEvent.title}</h2>
              <div className="card-meta">
                <span><Icon name="clock" size={14} /> {formatWhen(nextEvent.startsAt)}</span>
                <span><Icon name="pin" size={14} /> {nextEvent.location}</span>
              </div>
              <div>
                {nextEvent.rsvped ? <span className="chip good"><Icon name="check" size={13} /> You’re going</span> : <span className="chip brand">{nextEvent.rsvpCount} going</span>}
              </div>
              <Link className="link-button" href={`/events/${nextEvent.id}`}>See event <Icon name="arrowRight" size={13} /></Link>
            </>
          ) : (
            <>
              <p className="panel-muted">No upcoming events right now.</p>
              <Link className="link-button" href="/events">Browse events <Icon name="arrowRight" size={13} /></Link>
            </>
          )}
        </article>

        <article className="panel dash-card">
          <p className="eyebrow">Nearest park</p>
          {nearestPark ? (
            <>
              <h2>{nearestPark.name}</h2>
              <div className="card-meta">
                {nearestPark.distanceKm != null && <span><Icon name="pin" size={14} /> {formatDistance(nearestPark.distanceKm)}</span>}
                <span className={nearestPark.dogsNow > 0 ? 'live' : undefined}>{nearestPark.dogsNow} dog{nearestPark.dogsNow === 1 ? '' : 's'} there now</span>
              </div>
              <p className="panel-muted">{data.dogsNearbyNow} dog{data.dogsNearbyNow === 1 ? '' : 's'} checked in nearby right now.</p>
              <Link className="link-button" href={`/parks/${nearestPark.id}`}>Open park <Icon name="arrowRight" size={13} /></Link>
            </>
          ) : (
            <>
              <p className="panel-muted">Share your location to find the closest park.</p>
              <Link className="link-button" href="/parks">All parks <Icon name="arrowRight" size={13} /></Link>
            </>
          )}
        </article>
      </div>

      <nav className="quick-links" aria-label="Shortcuts">
        <Link href="/nutrition"><Icon name="camera" /> Log a meal</Link>
        <Link href="/activity"><Icon name="activity" /> Log a walk</Link>
        <Link href="/friends"><Icon name="users" /> Meet dogs</Link>
        <Link href="/shop"><Icon name="bag" /> Shop</Link>
        <Link href="/selling/new"><Icon name="store" /> Sell something</Link>
        <Link href="/care"><Icon name="heart" /> Book care</Link>
      </nav>
    </>
  );
}
