import { todayActivity, userPet } from "@proot/shared";

export default function ActivityPage() {
  return (
    <main className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-hero">
        <p className="kicker">{userPet.name} · activity</p>
        <h1>Everything, in order.</h1>
        <p>
          Walks from care, meals from photos, play at home, and bookings — one
          timeline so you can see the day as she lived it.
        </p>
      </div>
      <div className="stat-row">
        <div className="stat">
          <span className="kicker">Walk</span>
          <b>2.1 km</b>
        </div>
        <div className="stat">
          <span className="kicker">Rest</span>
          <b>11.4 h</b>
        </div>
        <div className="stat">
          <span className="kicker">Play</span>
          <b>14 min</b>
        </div>
        <div className="stat">
          <span className="kicker">Food</span>
          <b>310 kcal</b>
        </div>
      </div>
      <div className="timeline" style={{ marginTop: 28 }}>
        {todayActivity.map((item) => (
          <div className="timeline-item" key={item.id}>
            <span className="meta">{item.at}</span>
            <div>
              <span className="kicker">{item.type}</span>
              <h3 style={{ fontSize: 26 }}>{item.title}</h3>
              <p className="meta">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
