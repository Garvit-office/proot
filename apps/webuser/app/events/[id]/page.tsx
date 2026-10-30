import Link from 'next/link';
import { notFound } from 'next/navigation';
import { events } from '@proot/shared';
import { Icon } from '../../../components/Icon';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = events.find((item) => item.id === id);
  if (!event) notFound();

  return (
    <main className="wrap page-section">
      <Link className="back-link" href="/events"><Icon name="arrowLeft" size={16} /> All events</Link>
      <div className="detail-grid">
        <img className="detail-image" src={event.image} alt={event.title} />
        <section className="detail-body">
          <span className="chip brand">{event.neighborhood}</span>
          <h1>{event.title}</h1>
          <p className="lede">{event.blurb}</p>
          <ul className="facts">
            <li><Icon name="calendar" /> {event.when}<span>When</span></li>
            <li><Icon name="pin" /> {event.where}<span>Where</span></li>
            <li><Icon name="users" /> {event.spots} spaces listed<span>Capacity</span></li>
          </ul>
          <div className="actions">
            <button className="button primary" disabled><Icon name="check" size={17} /> RSVP</button>
          </div>
          <p className="callout"><Icon name="info" size={16} /> RSVPs are not available yet.</p>
        </section>
      </div>
    </main>
  );
}
