import Link from 'next/link';
import { notFound } from 'next/navigation';
import { products, inr } from '@proot/shared';
import { Icon } from '../../../components/Icon';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products.find((item) => item.id === id);
  if (!product) notFound();

  return (
    <main className="wrap page-section">
      <Link className="back-link" href="/shop"><Icon name="arrowLeft" size={16} /> Back to shop</Link>
      <div className="detail-grid">
        <img className="detail-image" src={product.image} alt={product.name} />
        <section className="detail-body">
          <span className="chip brand">{product.category}</span>
          <h1>{product.name}</h1>
          <p className="lede">{product.blurb}</p>
          <p className="detail-price">{inr(product.price)}</p>
          <div className="actions">
            <button className="button primary" disabled><Icon name="bag" size={17} /> Add to bag</button>
            <Link className="button secondary" href="/care">Explore care</Link>
          </div>
          <p className="callout"><Icon name="info" size={16} /> Bag checkout is not available yet.</p>
        </section>
      </div>
    </main>
  );
}
