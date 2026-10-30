'use client';

import { useMemo, useState } from 'react';
import { analyzeMealFromName, userPet, verdictTone, type MealAnalysis } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { usePetName } from '../../lib/session';

type Meal = MealAnalysis & { photo?: string; at: string };

export default function NutritionPage() {
  const petName = usePetName(userPet.name);
  const [label, setLabel] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [analysis, setAnalysis] = useState<MealAnalysis>();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [error, setError] = useState('');
  const totalKcal = useMemo(() => meals.reduce((total, meal) => total + meal.kcal, 0), [meals]);

  function choosePhoto(file?: File) {
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setLabel(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    setAnalysis(analyzeMealFromName(file.name));
    setError('');
  }

  function reviewMeal() {
    if (!label.trim()) {
      setError('Add a meal name or choose a photo to continue.');
      return;
    }
    setAnalysis(analyzeMealFromName(label));
    setError('');
  }

  function saveMeal() {
    if (!analysis || analysis.verdict === 'Skip') return;
    setMeals((items) => [{
      ...analysis,
      label: label.trim() || analysis.label,
      photo,
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }, ...items]);
    setLabel('');
    setPhoto(undefined);
    setAnalysis(undefined);
  }

  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">Nutrition · simulated review</p>
        <h1>Photograph dinner first.</h1>
        <p className="lede">Keep a photo-first meal note for {petName}. The meal feedback is simulated, not veterinary advice.</p>
      </header>
      <div className="split">
        <section className="panel nutrition-form">
          <label className="dropzone">
            <span className="icon-tile accent"><Icon name="camera" size={22} /></span>
            <strong>Add a meal photo</strong>
            Tap to choose an image from your device
            <input type="file" accept="image/*" onChange={(event) => choosePhoto(event.target.files?.[0])} />
          </label>
          <label className="field">
            Meal name
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. salmon kibble" />
          </label>
          {error && <p className="callout error" role="alert"><Icon name="info" size={16} /> {error}</p>}
          <button className="button primary block" onClick={reviewMeal}><Icon name="sparkle" size={17} /> Review meal</button>
          {analysis && (
            <div className="result">
              <div className="result-head">
                {photo && <img className="meal-photo" src={photo} alt="Selected meal" />}
                <div>
                  <span className={`chip ${verdictTone[analysis.verdict]}`}>{analysis.verdict} · simulated</span>
                  <h3>{analysis.label}</h3>
                </div>
              </div>
              <div className="macros">
                <div><strong>{analysis.kcal}</strong><span>kcal</span></div>
                <div><strong>{analysis.proteinG} g</strong><span>protein</span></div>
                <div><strong>{analysis.fatG} g</strong><span>fat</span></div>
              </div>
              <p>{analysis.notes}</p>
              <button className="button primary block" onClick={saveMeal} disabled={analysis.verdict === 'Skip'}>
                {analysis.verdict === 'Skip' ? 'Not recommended' : <><Icon name="check" size={17} /> Save meal</>}
              </button>
            </div>
          )}
        </section>
        <aside className="panel">
          <p className="eyebrow">Today</p>
          <p className="total">{totalKcal} <small>kcal</small></p>
          <p className="panel-muted">{meals.length} meal{meals.length === 1 ? '' : 's'} logged this visit</p>
          {meals.length > 0 && (
            <ul className="saved-list">
              {meals.map((meal, index) => (
                <li key={`${meal.id}-${index}`}>
                  {meal.photo ? <img className="mini-avatar" src={meal.photo} alt="" /> : <span className="mini-avatar"><Icon name="bowl" size={15} /></span>}
                  <div><strong>{meal.label}</strong><small>{meal.at} · {meal.kcal} kcal</small></div>
                  <span className={`chip ${verdictTone[meal.verdict]}`}>{meal.verdict}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
