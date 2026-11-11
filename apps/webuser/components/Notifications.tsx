'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { timeAgo, type NotificationRecord } from '@proot/shared';
import { errorMessage } from '../lib/hooks';
import { api, useRealtime, useSocketEvent } from '../lib/session';
import { Icon } from './Icon';
import { ErrorNote, Spinner } from './ui';

/** Backend links are in-app paths; anything unexpected falls back to the notifications page. */
export function notificationHref(link: string) {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : '/notifications';
}

/** Notifications list with live updates and mark-read, shared by the header menu and /notifications. */
export function useNotifications(enabled: boolean) {
  const { setUnreadNotifications } = useRealtime();
  const [items, setItems] = useState<NotificationRecord[]>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.listNotifications();
      setItems(res.items);
      setUnreadNotifications(res.unread);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [setUnreadNotifications]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  useSocketEvent('notification', (n) => {
    const { unread: _unread, ...record } = n;
    setItems((list) => (list ? [record, ...list.filter((i) => i.id !== record.id)] : list));
  });

  const markRead = useCallback(async (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((list) => list?.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? now } : i)));
    try {
      const res = await api.markNotificationsRead(ids);
      setUnreadNotifications(res.unread);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [setUnreadNotifications]);

  return { items, error, load, markRead };
}

export function NotificationList({ items, onOpen }: { items: NotificationRecord[]; onOpen: (n: NotificationRecord) => void }) {
  if (items.length === 0) return <p className="notif-empty">You’re all caught up.</p>;
  return (
    <ul className="notif-list">
      {items.map((n) => (
        <li key={n.id}>
          <button type="button" className={`notif-item${n.readAt ? '' : ' unread'}`} onClick={() => onOpen(n)}>
            <span className="dot-unread" aria-hidden="true" />
            <span>
              <strong>{n.title}</strong>
              {n.body && <p>{n.body}</p>}
              <small>{timeAgo(n.createdAt)}{n.readAt ? '' : ' · new'}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NotificationsMenu() {
  const router = useRouter();
  const { unreadNotifications } = useRealtime();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { items, error, load, markRead } = useNotifications(open);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openItem(n: NotificationRecord) {
    if (!n.readAt) markRead([n.id]);
    setOpen(false);
    router.push(notificationHref(n.link));
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header-icon"
        aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={20} />
        {unreadNotifications > 0 && <span className="badge-count">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
      </button>
      {open && (
        <div className="notif-menu" role="dialog" aria-label="Notifications">
          <header>
            Notifications
            {unreadNotifications > 0 && <button type="button" className="link-button" onClick={() => markRead()}>Mark all read</button>}
          </header>
          {error ? <div style={{ padding: 12 }}><ErrorNote error={error} onRetry={load} /></div>
            : items ? <NotificationList items={items.slice(0, 8)} onOpen={openItem} />
            : <div className="notif-empty"><Spinner /></div>}
          <footer><Link className="link-button" href="/notifications" onClick={() => setOpen(false)}>See all notifications</Link></footer>
        </div>
      )}
    </div>
  );
}
