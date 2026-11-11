'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage } from '@proot/shared';
import { Icon } from '../../../../components/Icon';
import { BackLink, EmptyState, ErrorNote, PageLoading, Spinner, UserAvatar } from '../../../../components/ui';
import { errorMessage, formatTime, useLoad, useRequireUser } from '../../../../lib/hooks';
import { api, useSocketEvent } from '../../../../lib/session';

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function ChatPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();
  const { ready, user } = useRequireUser({ needPet: true });
  const matches = useLoad(() => api.listMatches(), [], ready);
  const messages = useLoad(async () => {
    const list = await api.listMessages(matchId);
    api.markMatchRead(matchId).catch(() => {});
    return mergeMessages([], list);
  }, [matchId], ready);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [olderBusy, setOlderBusy] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [removed, setRemoved] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages.data?.[messages.data.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  useSocketEvent('message:new', (msg) => {
    if (msg.matchId !== matchId) return;
    messages.setData((list) => mergeMessages(list ?? [], [msg]));
    if (msg.senderId !== user?.id) api.markMatchRead(matchId).catch(() => {});
  });
  useSocketEvent('match:removed', ({ id }) => {
    if (id === matchId) setRemoved(true);
  });

  const match = matches.data?.find((m) => m.id === matchId);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError('');
    try {
      const msg = await api.sendMessage(matchId, body);
      messages.setData((list) => mergeMessages(list ?? [], [msg]));
      setDraft('');
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t send that message.'));
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    const first = messages.data?.[0];
    if (!first) return;
    setOlderBusy(true);
    try {
      const older = await api.listMessages(matchId, first.createdAt);
      if (older.length === 0) setNoMore(true);
      messages.setData((list) => mergeMessages(list ?? [], older));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOlderBusy(false);
    }
  }

  async function unmatch() {
    if (!match || !window.confirm(`Unmatch ${match.myPet.name} and ${match.theirPet.name}? The chat will be deleted for both of you.`)) return;
    try {
      await api.unmatch(matchId);
      router.replace('/friends');
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t unmatch.'));
    }
  }

  if (!ready) return <PageLoading />;

  if (removed || (matches.data && !match)) {
    return (
      <main className="wrap page-section">
        <BackLink href="/friends">Friends</BackLink>
        <EmptyState icon="chat" title="This chat is no longer available" text="The match was removed." />
      </main>
    );
  }

  return (
    <main className="wrap page-section chat-page">
      <BackLink href="/friends">Friends</BackLink>
      <section className="panel chat">
        <header className="chat-head">
          {match ? (
            <>
              <UserAvatar name={match.theirPet.name} url={match.theirPet.photoUrl} size={44} />
              <div className="grow">
                <h1>{match.theirPet.name}</h1>
                <p>{match.theirPet.breed} · with {match.otherUser.name} · matched with {match.myPet.name}</p>
              </div>
              <button className="button ghost small" onClick={unmatch}>Unmatch</button>
            </>
          ) : (
            <Spinner />
          )}
        </header>

        <div className="chat-body" aria-live="polite">
          <ErrorNote error={messages.error} onRetry={messages.reload} />
          {!messages.data && !messages.error && <Spinner label="Loading messages…" />}
          {messages.data && messages.data.length >= 50 && !noMore && (
            <button className="link-button chat-older" onClick={loadOlder} disabled={olderBusy}>{olderBusy ? 'Loading…' : 'Load earlier messages'}</button>
          )}
          {messages.data?.length === 0 && (
            <p className="panel-muted chat-empty">You matched! Suggest a walk or a park to meet at.</p>
          )}
          {messages.data?.map((m, i) => {
            const prev = messages.data![i - 1];
            const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
            const mine = m.senderId === user?.id;
            return (
              <div key={m.id}>
                {showDay && <p className="chat-day">{dayLabel(m.createdAt)}</p>}
                <div className={`bubble${mine ? ' mine' : ''}`}>
                  <p>{m.body}</p>
                  <small>{formatTime(m.createdAt)}{mine && m.readAt ? ' · Seen' : ''}</small>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <form className="chat-form" onSubmit={send}>
          <input
            className="input"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={match ? `Message ${match.otherUser.name}…` : 'Message…'}
            aria-label="Message"
          />
          <button className="button primary" disabled={sending || !draft.trim()} aria-label="Send"><Icon name="send" size={17} /></button>
        </form>
        <ErrorNote error={error} />
      </section>
    </main>
  );
}
