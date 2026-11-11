'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProductForm } from '../../../../components/shop/ProductForm';
import { BackLink, ErrorNote, PageHead, PageLoading } from '../../../../components/ui';
import { useLoad, useRequireUser } from '../../../../lib/hooks';
import { api } from '../../../../lib/session';

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, user } = useRequireUser();
  const { data: product, error, reload } = useLoad(() => api.getProduct(id), [id], ready);

  if (!ready || (!product && !error)) return <PageLoading />;
  const notMine = product && user && product.seller.id !== user.id && user.role !== 'ADMIN';

  return (
    <main className="wrap page-section narrow-page">
      <BackLink href="/selling">Your listings</BackLink>
      <PageHead eyebrow="Selling" title={product ? `Edit “${product.title}”` : 'Edit listing'} />
      <ErrorNote error={error} onRetry={reload} />
      {notMine && <ErrorNote error="You can only edit your own listings." />}
      {product && !notMine && (
        <ProductForm
          initial={product}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await api.updateProduct(id, input);
            router.push('/selling');
          }}
        />
      )}
    </main>
  );
}
