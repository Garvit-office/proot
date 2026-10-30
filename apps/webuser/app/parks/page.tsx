import { parks } from '@proot/shared';
import { Icon } from '../../components/Icon';

export default function ParksPage() {
  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">Parks</p>
        <h1>Where to go this hour.</h1>
        <p className="lede">Nearby loops with water, shade, and room to wander.</p>
      </header>
      <div className="summary-bar">
        <Icon name="pin" size={20} />
        <p><strong>Maple’s usual radius</strong> · Three dog-friendly parks within 3.1 km.</p>
      </div>
      <div className="card-grid">
        {parks.map((park) => (
          <article className="card" key={park.id}>
            <div className="card-media">
              <img src={park.image} alt={park.name} />
              <span className="chip">{park.distanceKm} km away</span>
            </div>
            <div className="card-body">
              <h2>{park.name}</h2>
              <div className="card-meta">
                <span><Icon name="clock" size={14} /> {park.hours}</span>
              </div>
              <div className="amenities">
                {park.amenities.map((amenity) => <span key={amenity} className="chip">{amenity}</span>)}
              </div>
              <div className="card-foot">
                <span className="live">{park.dogsNow} dogs there now</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
