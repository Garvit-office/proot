import Link from 'next/link';
import { notFound } from 'next/navigation';
import { careServices, inr } from '@proot/shared';
import { Icon } from '../../../components/Icon';

export default async function CareDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = careServices.find((item) => item.id === id);
  if (!service) notFound();

  return (
    <main className="wrap page-section">
      <Link className="back-link" href="/care"><Icon name="arrowLeft" size={16} /> All care</Link>
      <div className="detail-grid">
        <img className="detail-image" src={service.image} alt={service.title} />
        <section className="detail-body">
          <span className="chip brand">{service.category}</span>
          <h1>{service.title}</h1>
          <p className="lede">{service.blurb}</p>
          <ul className="facts">
            <li><Icon name="users" /> {service.pro}<span>Your pro</span></li>
            <li><Icon name="star" /> {service.rating} rating<span>{service.reviews} reviews</span></li>
            <li><Icon name="clock" /> {service.duration}<span>Per visit</span></li>
          </ul>
          <p className="detail-price"><small>From</small> {inr(service.priceFrom)}</p>
          <div className="actions">
            <button className="button primary" disabled><Icon name="calendar" size={17} /> Book a visit</button>
          </div>
          <p className="callout"><Icon name="info" size={16} /> Online booking is not available yet.</p>
        </section>
      </div>
    </main>
  );
}
