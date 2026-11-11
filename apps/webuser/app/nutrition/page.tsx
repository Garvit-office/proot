'use client';

import { useState } from 'react';
import { localDateKey, verdictTone, type MealAnalyzeResponse } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorNote, PageHead, PageLoading, PetPicker, Spinner } from '../../components/ui';
import { errorMessage, formatTime, useLoad, useRequireUser } from '../../lib/hooks';
import { fileToImageDataUrl } from '../../lib/photo';
import { api } from '../../lib/session';

const SOURCE_LABEL = { ai: 'AI review', rules: 'Estimate' } as const;

export default function NutritionPage() {
  const { ready, pet } = useRequireUser({ needPet: true });
  const petId = pet?.id;
  const today = localDateKey();
  const meals = useLoad(() => api.listMeals(petId!, today, new Date().getTimezoneOffset()), [petId, today], ready && Boolean(petId));

  const [label, setLabel] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<MealAnalyzeResponse | null>(null);
  const [resultLabel, setResultLabel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  async function choosePhoto(file?: File) {
    if (!file) return;
    setError('');
    try {
      setPhoto(await fileToImageDataUrl(file, 1280));
      setResult(null);
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t read that photo.'));
    }
  }

  async function analyze() {
    if (!pet) return;
    if (!photo && !label.trim()) {
      setError('Add a meal photo or a meal name to continue.');
      return;
    }
    setAnalyzing(true);
    setError('');
    setSavedNote('');
    try {
      const res = await api.analyzeMeal({ petId: pet.id, photo, label: label.trim() || undefined });
      setResult(res);
      setResultLabel(label.trim() || res.analysis.label);
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t review that meal.'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!pet || !result) return;
    const finalLabel = resultLabel.trim() || result.analysis.label;
    setSaving(true);
    setError('');
    try {
      await api.saveMeal({ ...result.analysis, label: finalLabel, petId: pet.id, source: result.source, imageId: result.imageId });
      setResult(null);
      setPhoto(null);
      setLabel('');
      setSavedNote(`${finalLabel} saved to ${pet.name}’s log.`);
      meals.reload();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t save that meal.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.deleteMeal(id);
      meals.reload();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t delete that meal.'));
    } finally {
      setDeleting(null);
    }
  }

  if (!ready || !pet) return <PageLoading />;

  const total = meals.data?.totalKcal ?? 0;
  const target = meals.data?.targetKcal ?? 0;
  const pct = target ? Math.min(100, Math.round((total / target) * 100)) : 0;

  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Nutrition" title="Photograph dinner first." lede={`Snap ${pet.name}’s meal for a quick check on calories and ingredients, then keep a simple daily log.`} />
      <PetPicker label="Logging for" />
      <div className="split">
        <section className="panel nutrition-form">
          <label className={`dropzone${photo ? ' has-photo' : ''}`}>
            {photo ? (
              <img className="dropzone-preview" src={photo} alt="Selected meal" />
            ) : (
              <span className="icon-tile accent"><Icon name="camera" size={22} /></span>
            )}
            <strong>{photo ? 'Change photo' : 'Add a meal photo'}</strong>
            {photo ? 'Tap to choose a different image' : 'Tap to choose an image from your device'}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {photo && <button type="button" className="link-button" onClick={() => { setPhoto(null); setResult(null); }}>Remove photo</button>}
          <label className="field">
            Meal name {photo ? <span className="field-hint">(optional with a photo)</span> : null}
            <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. chicken and rice" />
          </label>
          <ErrorNote error={error} />
          {savedNote && <p className="callout good" role="status"><Icon name="check" size={16} /> {savedNote}</p>}
          <button className="button primary block" onClick={analyze} disabled={analyzing}>
            {analyzing ? <><span className="spinner" aria-hidden="true" /> Reviewing…</> : <><Icon name="sparkle" size={17} /> Review meal</>}
          </button>

          {result && (
            <div className="result">
              <div className="result-head">
                {(result.imageUrl ?? photo) && <img className="meal-photo" src={result.imageUrl ?? photo ?? ''} alt="Meal" />}
                <div className="grow">
                  <div className="chip-row">
                    <span className={`chip ${verdictTone[result.analysis.verdict]}`}>{result.analysis.verdict}</span>
                    <span className={`chip ${result.source === 'ai' ? 'brand' : ''}`}>{SOURCE_LABEL[result.source]}</span>
                  </div>
                  <h3>{result.analysis.label}</h3>
                </div>
              </div>
              <div className="macros">
                <div><strong>{result.analysis.kcal}</strong><span>kcal</span></div>
                <div><strong>{result.analysis.proteinG} g</strong><span>protein</span></div>
                <div><strong>{result.analysis.fatG} g</strong><span>fat</span></div>
              </div>
              <p>{result.analysis.notes}</p>
              {result.source === 'rules' && (
                <p className="field-hint">This is a rough built-in estimate, not an AI review or veterinary advice.</p>
              )}
              <label className="field">
                Save as
                <input value={resultLabel} maxLength={80} onChange={(e) => setResultLabel(e.target.value)} />
              </label>
              <button className={`button ${result.analysis.verdict === 'Skip' ? 'secondary' : 'primary'} block`} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : result.analysis.verdict === 'Skip' ? 'Log it anyway' : <><Icon name="check" size={17} /> Save meal</>}
              </button>
            </div>
          )}
        </section>

        <aside className="panel">
          <p className="eyebrow">Today</p>
          <ErrorNote error={meals.error} onRetry={meals.reload} />
          {!meals.data && !meals.error && <Spinner />}
          {meals.data && (
            <>
              <p className="total">{total} <small>/ {target} kcal</small></p>
              <div className={`meter${total > target ? ' over' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={total}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="panel-muted meal-target">
                {total > target ? `${total - target} kcal over ${pet.name}’s suggested intake.` : `${target - total} kcal left of ${pet.name}’s suggested daily intake.`}
              </p>
              {meals.data.items.length === 0 ? (
                <EmptyState icon="bowl" title="No meals yet today" text={`Log ${pet.name}’s first meal to start the day.`} />
              ) : (
                <ul className="saved-list">
                  {meals.data.items.map((meal) => (
                    <li key={meal.id}>
                      {meal.imageUrl ? <img className="mini-avatar" src={meal.imageUrl} alt="" /> : <span className="mini-avatar"><Icon name="bowl" size={15} /></span>}
                      <div className="grow">
                        <strong>{meal.label}</strong>
                        <small>{formatTime(meal.eatenAt)} · {meal.kcal} kcal · {SOURCE_LABEL[meal.source]}</small>
                      </div>
                      <span className={`chip ${verdictTone[meal.verdict]}`}>{meal.verdict}</span>
                      <button className="icon-button" aria-label={`Delete ${meal.label}`} disabled={deleting === meal.id} onClick={() => remove(meal.id)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
