import Link from "next/link";
import {
  careServices,
  events,
  parks,
  products,
  todayActivity,
  userPet,
} from "@proot/shared";

export default function HomePage() {
  return (
    <main>
      <section className="wrap hero">
        <div>
          <p className="kicker">For {userPet.name} · {userPet.breed}</p>
          <h1>The neighborhood, held in one place.</h1>
          <p className="lede">
            Products, at-home care, events, parks, nearby friends, and a photo
            of every meal — so nothing about your dog is guesswork.
          </p>
          <div className="row">
            <Link className="btn" href="/nutrition">
              Log a meal
            </Link>
            <Link className="btn ghost" href="/care">
              Book care
            </Link>
          </div>
          <div className="stat-row">
            <div className="stat">
              <span className="kicker">Today</span>
              <b>2.1 km</b>
              <span className="meta">walked</span>
            </div>
            <div className="stat">
              <span className="kicker">Meals</span>
              <b>310</b>
              <span className="meta">kcal logged</span>
            </div>
            <div className="stat">
              <span className="kicker">Nearby</span>
              <b>{parks[0].dogsNow}</b>
              <span className="meta">dogs in Cubbon</span>
            </div>
            <div className="stat">
              <span className="kicker">Next</span>
              <b>Sun</b>
              <span className="meta">meadow meetup</span>
            </div>
          </div>
        </div>
        <div className="hero-photo">
          <img
            src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1400&q=80"
            alt="A golden mix looking at the camera"
          />
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <p className="kicker">Today</p>
            <h2>Maple’s day so far</h2>
          </div>
          <Link href="/activity">Full log →</Link>
        </div>
        <div className="timeline">
          {todayActivity.map((item) => (
            <div className="timeline-item" key={item.id}>
              <span className="meta">{item.at}</span>
              <div>
                <strong>{item.title}</strong>
                <p className="meta">
                  {item.type} · {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <p className="kicker">Shop</p>
            <h2>Fewer, better things</h2>
          </div>
          <Link href="/shop">All products →</Link>
        </div>
        <div className="grid grid-3">
          {products.slice(0, 3).map((p) => (
            <Link className="card" href={`/shop/${p.id}`} key={p.id}>
              <img className="cover" src={p.image} alt={p.name} />
              <div className="pad">
                <span className="kicker">{p.category}</span>
                <h3>{p.name}</h3>
                <p className="meta">{p.blurb}</p>
                <p className="price">₹{p.price * 80}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <p className="kicker">Care</p>
            <h2>Someone comes to you</h2>
          </div>
          <Link href="/care">Browse pros →</Link>
        </div>
        <div className="grid grid-2">
          {careServices.slice(0, 2).map((s) => (
            <Link className="card" href={`/care/${s.id}`} key={s.id}>
              <img className="cover" src={s.image} alt={s.title} />
              <div className="pad">
                <span className="kicker">
                  {s.category} · {s.pro}
                </span>
                <h3>{s.title}</h3>
                <p className="meta">{s.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <p className="kicker">Around</p>
            <h2>This week, this block</h2>
          </div>
          <Link href="/events">Events →</Link>
        </div>
        <div className="grid grid-3">
          <Link className="card" href={`/events/${events[0].id}`}>
            <img className="cover" src={events[0].image} alt="" />
            <div className="pad">
              <span className="kicker">{events[0].when}</span>
              <h3>{events[0].title}</h3>
            </div>
          </Link>
          <Link className="card" href="/parks">
            <img className="cover" src={parks[0].image} alt="" />
            <div className="pad">
              <span className="kicker">{parks[0].distanceKm} km</span>
              <h3>{parks[0].name}</h3>
            </div>
          </Link>
          <Link className="card" href="/friends">
            <img
              className="cover"
              src="https://images.unsplash.com/photo-1561037404-61cd46aa615b?auto=format&fit=crop&w=1200&q=80"
              alt=""
            />
            <div className="pad">
              <span className="kicker">Friends nearby</span>
              <h3>Otto is 400 m away</h3>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
