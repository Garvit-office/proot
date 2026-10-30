'use client';

import { useState } from 'react';
import { nearbyPets } from '@proot/shared';
import { Icon } from '../../components/Icon';

export default function FriendsPage() {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const pet = nearbyPets[index];

  function moveNext(like: boolean) {
    if (like && pet) setLiked((current) => [...current, pet.name]);
    setIndex((current) => Math.min(current + 1, nearbyPets.length));
  }

  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">Friends nearby</p>
        <h1>A slow hello.</h1>
        <p className="lede">One nearby dog at a time, with a little room to get to know them.</p>
      </header>
      <div className="split">
        {pet ? (
          <article className="card friend-card">
            <div className="card-media">
              <img src={pet.image} alt={pet.name} />
              <span className="chip"><Icon name="pin" size={13} /> {pet.distanceKm} km away</span>
            </div>
            <div className="card-body">
              <div className="progress" aria-label={`Dog ${index + 1} of ${nearbyPets.length}`}>
                {nearbyPets.map((item, idx) => <span key={item.id} className={idx <= index ? 'done' : undefined} />)}
              </div>
              <h2>{pet.name}</h2>
              <div className="card-meta"><span>{pet.breed}</span><span>{pet.age}</span></div>
              <p className="card-text">{pet.bio}</p>
              <div className="prompt">
                <strong>{pet.prompt}</strong>
                <p>“{pet.answer}”</p>
              </div>
              <div className="actions">
                <button className="button secondary" onClick={() => moveNext(false)}><Icon name="x" size={17} /> Not now</button>
                <button className="button primary" onClick={() => moveNext(true)}><Icon name="heart" size={17} /> Say hi</button>
              </div>
            </div>
          </article>
        ) : (
          <div className="panel empty">
            <span className="icon-tile accent"><Icon name="leaf" size={22} /></span>
            <h2>That’s the block for today.</h2>
            <p>Come back after a walk.</p>
            <button className="button secondary" onClick={() => setIndex(0)}>See dogs again</button>
          </div>
        )}
        <aside className="panel">
          <p className="eyebrow">Saved hellos</p>
          <h2>Dogs you liked</h2>
          {liked.length === 0 ? <p className="panel-muted">No hellos yet. Say hi when it feels right.</p> : (
            <ul className="saved-list">
              {liked.map((name, idx) => (
                <li key={`${name}-${idx}`}>
                  <span className="mini-avatar">{name[0]}</span>
                  <div><strong>{name}</strong><small>Waiting on their human</small></div>
                  <span className="chip warn">Pending</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
