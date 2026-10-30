import { parks } from "@proot/shared";

export default function ParksPage() {
  return (
    <main className="wrap">
      <div className="page-hero">
        <p className="kicker">Parks</p>
        <h1>Where to go this hour.</h1>
        <p>Live-ish counts of dogs already there, plus water and shade.</p>
      </div>
      <div className="map-block">
        <span className="pill">Maple’s usual 2 km</span>
      </div>
      <div className="grid grid-3" style={{ padding: "28px 0 64px" }}>
        {parks.map((p) => (
          <article className="card" key={p.id}>
            <img className="cover" src={p.image} alt={p.name} />
            <div className="pad">
              <span className="kicker">{p.distanceKm} km away</span>
              <h3>{p.name}</h3>
              <p className="meta">{p.hours}</p>
              <p className="meta" style={{ marginTop: 8 }}>
                {p.dogsNow} dogs now · {p.amenities.join(" · ")}
              </p>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
