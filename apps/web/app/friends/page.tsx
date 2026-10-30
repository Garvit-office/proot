"use client";

import { useState } from "react";
import { nearbyPets } from "@proot/shared";

export default function FriendsPage() {
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<string[]>([]);
  const pet = nearbyPets[index];

  function skip() {
    setIndex((i) => Math.min(i + 1, nearbyPets.length));
  }

  function like() {
    if (!pet) return;
    setMatches((m) => [...m, pet.name]);
    skip();
  }

  return (
    <main className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-hero">
        <p className="kicker">Friends nearby</p>
        <h1>A slow hello.</h1>
        <p>
          Not a feed. One dog at a time, with a prompt — like a careful first
          date for Maple.
        </p>
      </div>
      <div className="grid grid-2">
        <div className="swipe card">
          {pet ? (
            <>
              <img src={pet.image} alt={pet.name} />
              <div className="pad">
                <span className="kicker">
                  {pet.distanceKm} km · {pet.breed} · {pet.age}
                </span>
                <h3>
                  {pet.name}
                </h3>
                <p className="meta">{pet.bio}</p>
                <div className="prompt">
                  <strong>{pet.prompt}</strong>
                  {pet.answer}
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={skip}>
                    Not now
                  </button>
                  <button className="btn sage" onClick={like}>
                    Say hi
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="pad">
              <h3>That’s the block for today.</h3>
              <p className="meta" style={{ marginTop: 8 }}>
                Come back after a walk.
              </p>
            </div>
          )}
        </div>
        <aside>
          <p className="kicker">Matches</p>
          <h2 style={{ margin: "8px 0 16px" }}>Dogs Maple liked</h2>
          {matches.length === 0 ? (
            <p className="muted">None yet. Say hi when it feels right.</p>
          ) : (
            <ul className="stack">
              {matches.map((name) => (
                <li key={name} className="card pad">
                  {name} · waiting on their human
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
