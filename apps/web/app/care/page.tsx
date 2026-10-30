import Link from "next/link";
import { careServices } from "@proot/shared";

export default function CarePage() {
  return (
    <main className="wrap">
      <div className="page-hero">
        <p className="kicker">Care</p>
        <h1>Help that comes to the door.</h1>
        <p>
          Walks, grooms, sits, and a vet who will sit on your floor — booked like
          a home service, not a clinic queue.
        </p>
      </div>
      <div className="grid grid-2" style={{ paddingBottom: 64 }}>
        {careServices.map((s) => (
          <Link className="card" href={`/care/${s.id}`} key={s.id}>
            <img className="cover" src={s.image} alt={s.title} />
            <div className="pad">
              <span className="kicker">
                {s.category} · {s.duration} · {s.rating} ({s.reviews})
              </span>
              <h3>{s.title}</h3>
              <p className="meta">
                {s.pro} · from ₹{s.priceFrom * 80}
              </p>
              <p className="meta" style={{ marginTop: 8 }}>
                {s.blurb}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
