import Link from 'next/link';
import { Icon, type IconName } from '../components/Icon';
import { OnboardingBanner, PetBadge, PetName } from '../components/PetBadge';

const highlights = [
  { label: 'Distance', value: '2.1 km', meta: 'walked today' },
  { label: 'Meals', value: '310 kcal', meta: 'logged' },
  { label: 'Nearby', value: '11', meta: 'dogs at Cubbon' },
  { label: 'Next', value: 'Sun', meta: 'meadow meetup' },
];

const features: { href: string; icon: IconName; title: string; text: string; accent?: boolean }[] = [
  { href: '/shop', icon: 'bag', title: 'Fewer, better things', text: 'Everyday essentials chosen to last.' },
  { href: '/care', icon: 'heart', title: 'Help at home', text: 'Walks, grooming, and wellness visits.', accent: true },
  { href: '/events', icon: 'calendar', title: 'Small gatherings', text: 'Capped meetups that stay calm for every dog.' },
  { href: '/parks', icon: 'leaf', title: 'Parks nearby', text: 'Shade, water, and who’s there right now.', accent: true },
  { href: '/friends', icon: 'users', title: 'A slow hello', text: 'Meet nearby dogs one at a time.' },
  { href: '/nutrition', icon: 'bowl', title: 'Photo-first meals', text: 'Snap dinner and keep a simple daily log.', accent: true },
];

export default function Page() {
  return (
    <main>
      <OnboardingBanner />
      <section className="hero wrap">
        <div className="hero-copy">
          <PetBadge />
          <h1>The neighborhood, <em>held in one place.</em></h1>
          <p className="lede">
            Products, care, events, parks, friends, and a photo-first log for every meal — all for the dog at the center of your day.
          </p>
          <div className="actions">
            <Link className="button primary" href="/nutrition">
              <Icon name="camera" /> Log a meal
            </Link>
            <Link className="button secondary" href="/care">
              Book care <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <div className="trust">
            <span><Icon name="check" size={16} /> Vetted local pros</span>
            <span><Icon name="check" size={16} /> Capped, calm meetups</span>
            <span><Icon name="check" size={16} /> Daily activity log</span>
          </div>
        </div>

        <div className="hero-art">
          <img
            src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1200&q=80"
            alt="Maple dog portrait"
          />
          <div className="today-card">
            <header><PetName />’s today <small>Updated just now</small></header>
            <div className="stats">
              {highlights.map((item) => (
                <div key={item.label} className="stat-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.meta}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <p className="eyebrow">A day with <PetName /></p>
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
            <h2>What’s in <PetName />’s bowl tonight?</h2>
            <p>Snap a photo and get a quick, simulated check before dinner.</p>
          </div>
          <Link className="button" href="/nutrition">Start a meal log <Icon name="arrowRight" size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
