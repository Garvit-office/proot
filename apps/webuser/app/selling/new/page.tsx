'use client';

import { useRouter } from 'next/navigation';
import { ProductForm } from '../../../components/shop/ProductForm';
import { BackLink, PageHead, PageLoading } from '../../../components/ui';
import { useRequireUser } from '../../../lib/hooks';
import { api } from '../../../lib/session';

export default function NewListingPage() {
  const router = useRouter();
  const { ready } = useRequireUser();
  if (!ready) return <PageLoading />;
  return (
    <main className="wrap page-section narrow-page">
      <BackLink href="/selling">Your listings</BackLink>
      <PageHead eyebrow="Selling" title="New listing" lede="Clear photos and an honest description sell fastest." />
      <ProductForm
        submitLabel="Create listing"
        onSubmit={async (input) => {
          await api.createProduct(input);
          router.push('/selling');
        }}
      />
    </main>
  );
}
