"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { careServices } from "@proot/shared";

const slots = ["Tomorrow 07:00", "Tomorrow 10:00", "Wed 18:30", "Thu 08:00"];

export default function CareDetailPage() {
  const { id } = useParams<{ id: string }>();
  const service = careServices.find((s) => s.id === id);
  const [slot, setSlot] = useState(slots[0]);
  const [booked, setBooked] = useState(false);
  if (!service) notFound();

  return (
    <main className="wrap detail" style={{ paddingTop: 40 }}>
      <img className="hero-img" src={service.image} alt={service.title} />
      <div>
        <p className="kicker">
          {service.category} · {service.pro}
        </p>
        <h1>{service.title}</h1>
        <p className="muted" style={{ marginTop: 16 }}>
          {service.blurb}
        </p>
        <p style={{ marginTop: 16 }}>
          {service.duration} · from ₹{service.priceFrom * 80}
        </p>
        <div className="filter-row" style={{ marginTop: 24 }}>
          {slots.map((s) => (
            <button
              key={s}
              className="pill"
              data-on={slot === s}
              onClick={() => setSlot(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn sage" onClick={() => setBooked(true)}>
            {booked ? `Booked · ${slot}` : "Book this slot"}
          </button>
          <Link className="btn ghost" href="/care">
            All care
          </Link>
        </div>
      </div>
    </main>
  );
}
