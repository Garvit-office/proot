'use client';

import { useRouter } from 'next/navigation';
import type { NotificationRecord } from '@proot/shared';
import { NotificationList, notificationHref, useNotifications } from '../../components/Notifications';
import { ErrorNote, PageHead, PageLoading, Spinner } from '../../components/ui';
import { useRequireUser } from '../../lib/hooks';
import { useRealtime } from '../../lib/session';

export default function NotificationsPage() {
  const { ready } = useRequireUser();
  const router = useRouter();
  const { unreadNotifications } = useRealtime();
  const { items, error, load, markRead } = useNotifications(ready);

  if (!ready) return <PageLoading />;

  function open(n: NotificationRecord) {
    if (!n.readAt) markRead([n.id]);
    router.push(notificationHref(n.link));
  }

  return (
    <main className="wrap page-section">
      <PageHead
        eyebrow="Notifications"
        title="What’s new."
        lede="Orders, bookings, events and hellos from the neighborhood."
        actions={unreadNotifications > 0 ? <button className="button secondary" onClick={() => markRead()}>Mark all read</button> : undefined}
      />
      <ErrorNote error={error} onRetry={load} />
      {items ? <div className="panel notif-page"><NotificationList items={items} onOpen={open} /></div> : !error && <Spinner />}
    </main>
  );
}
