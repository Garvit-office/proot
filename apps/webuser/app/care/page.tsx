import { careServices, inr } from '@proot/shared';
import Link from 'next/link';
import { Icon } from '../../components/Icon';

export default function CarePage() {
  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">Care</p>
        <h1>Help that comes to the door.</h1>
        <p className="lede">Walks, grooming, and wellness visits with people who know dogs.</p>
      </header>
      <div className="card-grid">
        {careServices.map((service) => (
          <Link className="card" href={`/care/${service.id}`} key={service.id}>
            <div className="card-media">
              <img src={service.image} alt={service.title} />
              <span className="chip">{service.category}</span>
            </div>
            <div className="card-body">
              <h2>{service.title}</h2>
              <div className="card-meta">
                <span className="rating"><Icon name="star" size={14} /> {service.rating}</span>
                <span>({service.reviews} reviews)</span>
                <span><Icon name="clock" size={14} /> {service.duration}</span>
              </div>
              <p className="card-text">{service.blurb}</p>
              <div className="card-foot">
                <span className="price"><small>From </small>{inr(service.priceFrom)}</span>
                <span className="card-cta">{service.pro} <Icon name="arrowRight" size={15} /></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <p className="callout"><Icon name="info" size={16} /> Online booking is not available yet. Contact details will appear here when the service is enabled.</p>
    </main>
  );
}
