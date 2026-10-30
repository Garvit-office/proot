"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { products } from "@proot/shared";

const cats = ["All", "Food", "Toys", "Care", "Home"] as const;

export default function ShopPage() {
  const [cat, setCat] = useState<(typeof cats)[number]>("All");
  const list = useMemo(
    () => (cat === "All" ? products : products.filter((p) => p.category === cat)),
    [cat],
  );

  return (
    <main className="wrap">
      <div className="page-hero">
        <p className="kicker">Shop</p>
        <h1>Things that last.</h1>
        <p>A short shelf. No seasonal novelty. Prices in rupees for this neighborhood.</p>
      </div>
      <div className="filter-row">
        {cats.map((c) => (
          <button
            key={c}
            className="pill"
            data-on={cat === c}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-3" style={{ paddingBottom: 64 }}>
        {list.map((p) => (
          <Link className="card" href={`/shop/${p.id}`} key={p.id}>
            <img className="cover" src={p.image} alt={p.name} />
            <div className="pad">
              <span className="kicker">{p.category}</span>
              <h3>{p.name}</h3>
              <p className="meta">{p.blurb}</p>
              <p className="price">₹{p.price * 80}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
