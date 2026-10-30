"use client";

import { analyzeMealFromName, userPet, type MealAnalysis } from "@proot/shared";
import { useEffect, useMemo, useRef, useState } from "react";

type Logged = MealAnalysis & { id?: string; photo?: string | null; at: string };

export default function NutritionPage() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [analysis, setAnalysis] = useState<MealAnalysis>();
  const [log, setLog] = useState<Logged[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const kcal = useMemo(() => log.reduce((s, m) => s + m.kcal, 0), [log]);

  useEffect(() => {
    async function loadLog() {
      try {
        const res = await fetch("/api/nutrition", { cache: "no-store" });
        if (!res.ok) return;
        const items = (await res.json()) as Logged[];
        setLog(items);
      } finally {
        setHydrated(true);
      }
    }

    loadLog();
  }, []);

  function onFile(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setAnalysis(analyzeMealFromName(file.name));
  }

  async function save() {
    if (!analysis) return;

    const entry = await fetch("/api/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: analysis.label,
        photo: preview ?? null,
      }),
    });

    if (!entry.ok) {
      return;
    }

    const created = (await entry.json()) as Logged;
    setLog((items) => [created, ...items]);
    setPreview(undefined);
    setAnalysis(undefined);
  }

  return (
    <main className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-hero">
        <p className="kicker">Nutritionist</p>
        <h1>Photograph dinner first.</h1>
        <p>
          Snap the bowl before {userPet.name} eats. Proot reads the plate, logs
          calories, and flags what should stay off the floor.
        </p>
      </div>

      <input
        ref={input}
        className="file"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="row" style={{ marginBottom: 24 }}>
        <button className="btn" onClick={() => input.current?.click()}>
          Take or upload a photo
        </button>
      </div>

      {preview && analysis && (
        <div className="meal-preview" style={{ marginBottom: 32 }}>
          <img src={preview} alt="Meal preview" />
          <div>
            <p className="kicker">Reading</p>
            <h3 className="serif" style={{ fontSize: 28 }}>
              {analysis.label}
            </h3>
            <p className={`verdict-${analysis.verdict}`} style={{ margin: "8px 0" }}>
              {analysis.verdict}
            </p>
            <p className="meta">
              {analysis.kcal} kcal · {analysis.proteinG}g protein · {analysis.fatG}g fat
            </p>
            <p style={{ marginTop: 8 }}>{analysis.notes}</p>
            <div className="row">
              <button className="btn sage" onClick={save} disabled={analysis.verdict === "Skip"}>
                {analysis.verdict === "Skip" ? "Don’t feed this" : "Log for Maple"}
              </button>
              <button className="btn ghost" onClick={() => setPreview(undefined)}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 28 }}>
        <div className="stat">
          <span className="kicker">Today</span>
          <b>{kcal}</b>
          <span className="meta">kcal</span>
        </div>
        <div className="stat">
          <span className="kicker">Target</span>
          <b>980</b>
          <span className="meta">for {userPet.weightKg} kg</span>
        </div>
        <div className="stat">
          <span className="kicker">Meals</span>
          <b>{log.length}</b>
          <span className="meta">logged</span>
        </div>
        <div className="stat">
          <span className="kicker">Pet</span>
          <b>{userPet.name}</b>
          <span className="meta">{userPet.age}</span>
        </div>
      </div>

      <p className="kicker">Log</p>
      <div className="timeline" style={{ marginTop: 12 }}>
        {!hydrated ? (
          <p className="muted">Loading meal log…</p>
        ) : log.length === 0 ? (
          <p className="muted">No meals yet today. Photograph the bowl.</p>
        ) : (
          log.map((m, i) => (
            <div className="timeline-item" key={`${m.id ?? m.label}-${i}`}>
              <span className="meta">{m.at}</span>
              <div>
                <strong>{m.label}</strong>
                <p className="meta">
                  {m.kcal} kcal · {m.verdict}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
