"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { events } from "@proot/shared";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const event = events.find((e) => e.id === id);
  const [rsvp, setRsvp] = useState(false);
  if (!event) notFound();

  return (
    <main className="wrap detail" style={{ paddingTop: 40 }}>
      <img className="hero-img" src={event.image} alt={event.title} />
      <div>
        <p className="kicker">{event.neighborhood}</p>
        <h1>{event.title}</h1>
        <p className="muted" style={{ marginTop: 16 }}>
          {event.blurb}
        </p>
        <p style={{ marginTop: 16 }}>
          {event.when}
          <br />
          {event.where}
        </p>
        <p className="meta" style={{ marginTop: 8 }}>
          {event.spots} spots left
        </p>
        <div className="row">
          <button className="btn" onClick={() => setRsvp(true)}>
            {rsvp ? "You’re in" : "Hold a spot"}
          </button>
          <Link className="btn ghost" href="/events">
            All events
          </Link>
        </div>
      </div>
    </main>
  );
}
