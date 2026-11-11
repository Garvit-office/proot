'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDistance, timeAgo, type DiscoverPet, type Match } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, LocationPrompt, Notice, PageHead, PageLoading, PetPicker, Spinner, UserAvatar } from '../../components/ui';
import { errorMessage, useLoad, useRequireUser } from '../../lib/hooks';
import { api, useSocketEvent } from '../../lib/session';

export default function FriendsPage() {
  const { ready, pet, user } = useRequireUser({ needPet: true });
  const petId = pet?.id;
  const discover = useLoad(() => api.discoverPets(petId!), [petId], ready && Boolean(petId));
  const pending = useLoad(() => api.pendingGreetings(), [], ready);
  const matches = useLoad(() => api.listMatches(), [], ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matched, setMatched] = useState<Match | null>(null);

  useSocketEvent('match:new', (m) => {
    matches.setData((list) => (list ? [m, ...list.filter((x) => x.id !== m.id)] : list));
    pending.reload();
  });
  useSocketEvent('match:removed', ({ id }) => {
    matches.setData((list) => list?.filter((m) => m.id !== id));
  });
  useSocketEvent('message:new', (msg) => {
    matches.setData((list) =>
      list?.map((m) =>
        m.id === msg.matchId
          ? { ...m, lastMessage: msg, unreadCount: msg.senderId === user?.id ? m.unreadCount : m.unreadCount + 1 }
          : m,
      ),
    );
  });

  async function greet(fromPetId: string, to: DiscoverPet, liked: boolean, from: 'discover' | 'incoming') {
    setBusy(true);
    setError('');
    try {
      const res = await api.greet({ fromPetId, toPetId: to.id, liked });
      if (from === 'discover') discover.setData((list) => list?.filter((p) => p.id !== to.id));
      if (res.matched && res.match) {
        setMatched(res.match);
        const match = res.match;
        matches.setData((list) => (list ? [match, ...list.filter((m) => m.id !== match.id)] : list));
      }
      pending.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !pet) return <PageLoading />;

  const current = discover.data?.[0];
  const incoming = pending.data?.incoming ?? [];
  const outgoing = pending.data?.outgoing ?? [];

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Friends nearby" title="A slow hello." lede="One nearby dog at a time. When both sides say hi, you can chat and plan a walk." />
      <LocationPrompt what="dogs near you" />
      <PetPicker label="Browsing as" />
      {matched && (
        <Notice tone="good">
          It’s a match! {matched.myPet.name} and {matched.theirPet.name} both said hi.{' '}
          <Link className="link-button" href={`/friends/chat/${matched.id}`}>Say hello to {matched.otherUser.name}</Link>
        </Notice>
      )}
      <ErrorNote error={error} />

      <div className="split">
        <div>
          <ErrorNote error={discover.error} onRetry={discover.reload} />
          {!discover.data && !discover.error && <Spinner label="Finding dogs nearby…" />}
          {discover.data && !current && (
            <EmptyState
              icon="leaf"
              title="That’s the block for today."
              text="You’ve seen every dog nearby. New neighbours show up after walks."
              action={<button className="button secondary" onClick={discover.reload}><Icon name="refresh" size={16} /> Check again</button>}
            />
          )}
          {current && (
            <article className="card friend-card" key={current.id}>
              <div className="card-media">
                {current.photoUrl ? <img src={current.photoUrl} alt={current.name} /> : <span className="card-placeholder"><Icon name="heart" size={48} /></span>}
                {current.distanceKm != null && <span className="chip"><Icon name="pin" size={13} /> {formatDistance(current.distanceKm)}</span>}
              </div>
              <div className="card-body">
                <p className="panel-muted friend-count">{discover.data!.length} dog{discover.data!.length === 1 ? '' : 's'} nearby to meet</p>
                <h2>{current.name}</h2>
                <div className="card-meta">
                  <span>{current.breed}</span><span>{current.age}</span><span>{current.sex}</span><span>with {current.ownerName}</span>
                </div>
                {current.temperament.length > 0 && (
                  <div className="chip-row">{current.temperament.map((t) => <span className="chip" key={t}>{t}</span>)}</div>
                )}
                {current.bio && <p className="card-text">{current.bio}</p>}
                {current.prompt && current.answer && (
                  <div className="prompt"><strong>{current.prompt}</strong><p>“{current.answer}”</p></div>
                )}
                <div className="actions">
                  <button className="button secondary" disabled={busy} onClick={() => greet(pet.id, current, false, 'discover')}><Icon name="x" size={17} /> Not now</button>
                  <button className="button primary" disabled={busy} onClick={() => greet(pet.id, current, true, 'discover')}><Icon name="heart" size={17} /> Say hi</button>
                </div>
              </div>
            </article>
          )}
        </div>

        <aside className="friends-side">
          <section className="panel">
            <p className="eyebrow">Matches</p>
            <h2>Chats</h2>
            <ErrorNote error={matches.error} onRetry={matches.reload} />
            {!matches.data && !matches.error && <Spinner />}
            {matches.data?.length === 0 && <p className="panel-muted">No matches yet. When a dog says hi back, they’ll show up here.</p>}
            {matches.data && matches.data.length > 0 && (
              <ul className="saved-list">
                {matches.data.map((m) => (
                  <li key={m.id}>
                    <Link className="match-link" href={`/friends/chat/${m.id}`}>
                      <UserAvatar name={m.theirPet.name} url={m.theirPet.photoUrl} size={34} />
                      <div className="grow">
                        <strong>{m.theirPet.name} <span className="muted">& {m.myPet.name}</span></strong>
                        <small>{m.lastMessage ? `${m.lastMessage.senderId === user?.id ? 'You: ' : ''}${m.lastMessage.body}` : `Matched ${timeAgo(m.createdAt)} · say hello`}</small>
                      </div>
                      {m.unreadCount > 0 && <span className="chip accent">{m.unreadCount}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <p className="eyebrow">Said hi to you</p>
            <h2>Waiting on you</h2>
            <ErrorNote error={pending.error} onRetry={pending.reload} />
            {!pending.data && !pending.error && <Spinner />}
            {pending.data && incoming.length === 0 && <p className="panel-muted">No new hellos.</p>}
            {incoming.length > 0 && (
              <ul className="saved-list">
                {incoming.map((p) => (
                  <li key={`${p.id}-${p.toPetId}`}>
                    <UserAvatar name={p.name} url={p.photoUrl} size={34} />
                    <div className="grow"><strong>{p.name}</strong><small>{p.breed} · said hi to {p.toPetName}</small></div>
                    <button className="button primary small" disabled={busy} onClick={() => greet(p.toPetId, p, true, 'incoming')}>Say hi back</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <p className="eyebrow">Sent</p>
            <h2>Your hellos</h2>
            {pending.data && outgoing.length === 0 && <p className="panel-muted">No hellos waiting. Say hi when it feels right.</p>}
            {outgoing.length > 0 && (
              <ul className="saved-list">
                {outgoing.map((p) => (
                  <li key={`${p.id}-${p.fromPetId}`}>
                    <UserAvatar name={p.name} url={p.photoUrl} size={34} />
                    <div className="grow"><strong>{p.name}</strong><small>from {p.fromPetName} · waiting on {p.ownerName}</small></div>
                    <span className="chip warn">Pending</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
