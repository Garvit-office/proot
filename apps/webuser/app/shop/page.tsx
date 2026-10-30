import Link from 'next/link';
import { products, inr } from '@proot/shared';
import { Icon } from '../../components/Icon';

export default function ShopPage() {
  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">Shop</p>
        <h1>Fewer, better things.</h1>
        <p className="lede">Everyday essentials chosen for a long life together.</p>
      </header>
      <div className="card-grid">
        {products.map((product) => (
          <Link className="card" href={`/shop/${product.id}`} key={product.id}>
            <div className="card-media">
              <img src={product.image} alt={product.name} />
              <span className="chip">{product.category}</span>
            </div>
            <div className="card-body">
              <h2>{product.name}</h2>
              <p className="card-text">{product.blurb}</p>
              <div className="card-foot">
                <span className="price">{inr(product.price)}</span>
                <span className="card-cta">View <Icon name="arrowRight" size={15} /></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
