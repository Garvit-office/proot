"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { products } from "@proot/shared";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);
  const [added, setAdded] = useState(false);

  function add() {
    if (!product) return;
    const raw = localStorage.getItem("proot-cart") || "[]";
    const cart: string[] = JSON.parse(raw);
    localStorage.setItem("proot-cart", JSON.stringify([...cart, product.id]));
    setAdded(true);
  }

  if (!product) notFound();

  return (
    <main className="wrap detail" style={{ paddingTop: 40 }}>
      <img className="hero-img" src={product.image} alt={product.name} />
      <div>
        <p className="kicker">{product.category}</p>
        <h1>{product.name}</h1>
        <p className="lede muted" style={{ marginTop: 16 }}>
          {product.blurb}
        </p>
        <p className="price" style={{ fontSize: 22, margin: "20px 0" }}>
          ₹{product.price * 80}
        </p>
        <div className="row">
          <button className="btn" onClick={add}>
            {added ? "Added" : "Add to bag"}
          </button>
          <Link className="btn ghost" href="/shop">
            Back to shop
          </Link>
        </div>
      </div>
    </main>
  );
}
