import Link from 'next/link';
import { events } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { LiveEvents } from '../../components/LiveEvents';

export default function EventsPage() {
  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">Events</p>
        <h1>Small gatherings, this district.</h1>
        <p className="lede">Meetups with a cap, so it stays calm and comfortable for every dog.</p>
      </header>
      <LiveEvents />
      <p className="eyebrow curated-label">Proot picks</p>
      <div className="card-grid">
        {events.map((event) => (
          <Link className="card" href={`/events/${event.id}`} key={event.id}>
            <div className="card-media">
              <img src={event.image} alt={event.title} />
              <span className="chip"><Icon name="calendar" size={13} /> {event.when}</span>
            </div>
            <div className="card-body">
              <h2>{event.title}</h2>
              <div className="card-meta">
                <span><Icon name="pin" size={14} /> {event.where}</span>
              </div>
              <p className="card-text">{event.blurb}</p>
              <div className="card-foot">
                <span className="chip brand">{event.spots} spots</span>
                <span className="card-cta">{event.neighborhood} <Icon name="arrowRight" size={15} /></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
