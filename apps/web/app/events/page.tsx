import Link from "next/link";
import { events } from "@proot/shared";

export default function EventsPage() {
  return (
    <main className="wrap">
      <div className="page-hero">
        <p className="kicker">Events</p>
        <h1>Small gatherings, this district.</h1>
        <p>Meetups with a cap, so it stays calm. RSVP holds a spot for Maple.</p>
      </div>
      <div className="grid grid-3" style={{ paddingBottom: 64 }}>
        {events.map((e) => (
          <Link className="card" href={`/events/${e.id}`} key={e.id}>
            <img className="cover" src={e.image} alt={e.title} />
            <div className="pad">
              <span className="kicker">
                {e.neighborhood} · {e.when}
              </span>
              <h3>{e.title}</h3>
              <p className="meta">
                {e.where} · {e.spots} spots
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
