'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ACTIVITY_LEVELS,
  DIET_TYPES,
  ONBOARDING_STEPS,
  PET_LIMITS,
  PET_PROMPTS,
  PET_SEXES,
  POPULAR_BREEDS,
  SOCIAL_LEVELS,
  TEMPERAMENTS,
  VACCINATIONS,
  draftFromPet,
  draftToInput,
  emptyPetDraft,
  estimateDailyKcal,
  firstInvalidStep,
  formatAge,
  sizeFromWeight,
  toggleIn,
  validateStep,
  type DraftErrors,
  type OnboardingStepId,
  type PetDraft,
  type PetRecord,
} from '@proot/shared';
import { Icon } from '../../components/Icon';
import { PetAvatar } from '../../components/ProfileDrawer';
import { fileToAvatarDataUrl } from '../../lib/photo';
import { useSession } from '../../lib/session';

const DRAFT_KEY = 'proot.onboardingDraft';
const STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);

function loadDraft(): { draft: PetDraft; step: OnboardingStepId } | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeDraft(value: { draft: PetDraft; step: OnboardingStepId } | null) {
  try {
    if (value) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage full (large photo) or blocked: the draft just won't survive a reload.
  }
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="wrap page-section"><p className="panel-muted">Loading…</p></main>}>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');
  const addingAnother = params.get('new') === '1';
  const { status, user, pets, savePet } = useSession();

  const [draft, setDraft] = useState<PetDraft>(emptyPetDraft);
  const [step, setStep] = useState<OnboardingStepId>('basics');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [saved, setSaved] = useState<PetRecord | null>(null);
  const [ready, setReady] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const editing = editId ? pets.find((p) => p.id === editId) ?? null : null;

  // Seed the form once the session is known: an existing pet when editing, else a saved draft.
  useEffect(() => {
    if (ready || status === 'loading') return;
    if (editId) {
      if (status === 'guest') return setReady(true);
      if (editing) setDraft(draftFromPet(editing));
    } else if (!addingAnother) {
      const stored = loadDraft();
      if (stored) {
        setDraft({ ...emptyPetDraft(), ...stored.draft });
        if (STEP_IDS.includes(stored.step)) setStep(stored.step);
      }
    }
    setReady(true);
  }, [status, editId, editing, addingAnother, ready]);

  // Someone who already has a dog and lands here plainly goes home.
  useEffect(() => {
    if (status === 'ready' && user?.onboarded && !editId && !addingAnother && !saved) router.replace('/');
  }, [status, user, editId, addingAnother, saved, router]);

  useEffect(() => {
    if (ready && !editId && !saved) storeDraft({ draft, step });
  }, [draft, step, ready, editId, saved]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, saved, status]);

  function update<K extends keyof PetDraft>(key: K, value: PetDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  const index = STEP_IDS.indexOf(step);
  const meta = ONBOARDING_STEPS[index];

  function go(next: OnboardingStepId) {
    setErrors({});
    setSubmitError('');
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function next(event?: FormEvent) {
    event?.preventDefault();
    const found = validateStep(step, draft);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    if (step === 'review') return submit();
    go(STEP_IDS[index + 1]);
  }

  async function submit() {
    const invalid = firstInvalidStep(draft);
    if (invalid) {
      go(invalid);
      setErrors(validateStep(invalid, draft));
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const pet = await savePet(draftToInput(draft), editing?.id);
      if (!editId) storeDraft(null);
      setSaved(pet);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || !ready) {
    return <main className="wrap page-section"><p className="panel-muted">Loading…</p></main>;
  }

  if (status === 'guest') return <AccountStep headingRef={headingRef} />;

  if (editId && !editing) {
    return (
      <main className="wrap page-section onboarding">
        <div className="panel empty">
          <h1 ref={headingRef} tabIndex={-1}>We couldn’t find that dog.</h1>
          <Link className="button secondary" href="/">Back home</Link>
        </div>
      </main>
    );
  }

  if (saved) return <DoneStep pet={saved} edited={Boolean(editId)} headingRef={headingRef} />;

  return (
    <main className="wrap page-section onboarding">
      <header className="onboarding-head">
        <p className="eyebrow">{editing ? `Editing ${editing.name}` : 'Set up your dog'} · Step {index + 1} of {STEP_IDS.length}</p>
        <ol className="stepper" aria-label="Onboarding progress">
          {ONBOARDING_STEPS.map((s, i) => (
            <li key={s.id} className={i < index ? 'done' : i === index ? 'current' : undefined} aria-current={i === index ? 'step' : undefined}>
              {/* Completed steps stay reachable; later ones unlock as you go. */}
              <button type="button" onClick={() => go(s.id)} disabled={i > index}>
                <span>{i < index ? <Icon name="check" size={13} /> : i + 1}</span>
                {s.eyebrow.split(' ·')[0]}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <form className="panel onboarding-card" onSubmit={next} noValidate>
        <p className="eyebrow">{meta.eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1}>{meta.title}</h1>

        {step === 'basics' && <BasicsStep draft={draft} errors={errors} update={update} />}
        {step === 'body' && <BodyStep draft={draft} errors={errors} update={update} />}
        {step === 'health' && <HealthStep draft={draft} errors={errors} update={update} />}
        {step === 'routine' && <RoutineStep draft={draft} errors={errors} update={update} />}
        {step === 'personality' && <PersonalityStep draft={draft} errors={errors} update={update} />}
        {step === 'review' && <ReviewStep draft={draft} onEdit={go} />}

        {submitError && <p className="callout error" role="alert"><Icon name="info" size={16} /> {submitError}</p>}

        <div className="onboarding-actions">
          {index > 0 ? (
            <button type="button" className="button secondary" onClick={() => go(STEP_IDS[index - 1])}>
              <Icon name="arrowLeft" size={16} /> Back
            </button>
          ) : (
            <Link className="button secondary" href="/">{editing ? 'Cancel' : 'Later'}</Link>
          )}
          {step === 'health' && (
            <button type="button" className="button ghost" onClick={() => go('routine')}>Skip for now</button>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {step === 'review'
              ? saving ? 'Saving…' : editing ? 'Save changes' : `Create ${draft.name.trim() || 'profile'}`
              : <>Continue <Icon name="arrowRight" size={16} /></>}
          </button>
        </div>
      </form>
    </main>
  );
}

type StepProps = {
  draft: PetDraft;
  errors: DraftErrors;
  update: <K extends keyof PetDraft>(key: K, value: PetDraft[K]) => void;
};

function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className={`field${error ? ' invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <small className="field-error" id={`${id}-error`} role="alert">{error}</small> : hint ? <small className="field-hint">{hint}</small> : null}
    </div>
  );
}

function Choice<T extends string>({
  label, options, value, onChange, error, multi,
}: {
  label: string;
  options: readonly T[];
  value: T | T[] | null;
  onChange: (value: T) => void;
  error?: string;
  multi?: boolean;
}) {
  const selected = (option: T) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <fieldset className={`field choice${error ? ' invalid' : ''}`}>
      <legend>{label}</legend>
      <div className="options" role={multi ? 'group' : 'radiogroup'}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={selected(option)}
            className={`option${selected(option) ? ' selected' : ''}`}
            onClick={() => onChange(option)}
          >
            {multi && selected(option) && <Icon name="check" size={14} />} {option}
          </button>
        ))}
      </div>
      {error && <small className="field-error" role="alert">{error}</small>}
    </fieldset>
  );
}

function BasicsStep({ draft, errors, update }: StepProps) {
  const [photoError, setPhotoError] = useState('');

  async function choose(file?: File) {
    if (!file) return;
    try {
      update('photo', await fileToAvatarDataUrl(file));
      setPhotoError('');
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Couldn’t read that photo.');
    }
  }

  return (
    <div className="step-grid">
      <div className="photo-picker">
        <label className="photo-drop">
          {draft.photo ? <img src={draft.photo} alt="Your dog" /> : <Icon name="camera" size={26} />}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => choose(e.target.files?.[0])} aria-label="Add a photo" />
        </label>
        <div>
          <strong>{draft.photo ? 'Looking good.' : 'Add a photo'}</strong>
          <small>{photoError || errors.photo || 'Optional — a clear face shot works best.'}</small>
          {draft.photo && <button type="button" className="link-button" onClick={() => update('photo', null)}>Remove photo</button>}
        </div>
      </div>

      <Field id="pet-name" label="Name" error={errors.name}>
        <input id="pet-name" value={draft.name} maxLength={PET_LIMITS.nameMax} autoComplete="off" placeholder="e.g. Maple" onChange={(e) => update('name', e.target.value)} aria-invalid={Boolean(errors.name)} />
      </Field>

      <Field id="pet-breed" label="Breed" error={errors.breed} hint="Start typing, or pick a common one below.">
        <input id="pet-breed" list="breed-options" value={draft.breed} maxLength={PET_LIMITS.breedMax} placeholder="e.g. Indie" onChange={(e) => update('breed', e.target.value)} aria-invalid={Boolean(errors.breed)} />
        <datalist id="breed-options">{POPULAR_BREEDS.map((b) => <option key={b} value={b} />)}</datalist>
      </Field>
      <div className="options compact">
        {POPULAR_BREEDS.slice(0, 6).concat('Mixed breed').map((b) => (
          <button key={b} type="button" className={`option${draft.breed === b ? ' selected' : ''}`} onClick={() => update('breed', b)}>{b}</button>
        ))}
      </div>

      <Choice label="Sex" options={PET_SEXES} value={draft.sex} onChange={(v) => update('sex', v)} error={errors.sex} />
    </div>
  );
}

function BodyStep({ draft, errors, update }: StepProps) {
  const weight = Number(draft.weightKg);
  return (
    <div className="step-grid">
      <div className="segmented" role="radiogroup" aria-label="How do you know their age?">
        <button type="button" role="radio" aria-checked={draft.ageMode === 'birthday'} className={draft.ageMode === 'birthday' ? 'active' : undefined} onClick={() => update('ageMode', 'birthday')}>I know the birthday</button>
        <button type="button" role="radio" aria-checked={draft.ageMode === 'approx'} className={draft.ageMode === 'approx' ? 'active' : undefined} onClick={() => update('ageMode', 'approx')}>Approximate age</button>
      </div>

      {draft.ageMode === 'birthday' ? (
        <Field id="pet-birthday" label="Birthday" error={errors.birthDate} hint={draft.birthDate && !errors.birthDate ? formatAge(draft.birthDate) + ' old' : undefined}>
          <input id="pet-birthday" type="date" max={new Date().toISOString().slice(0, 10)} value={draft.birthDate} onChange={(e) => update('birthDate', e.target.value)} aria-invalid={Boolean(errors.birthDate)} />
        </Field>
      ) : (
        <div className="field-pair">
          <Field id="pet-years" label="Years" error={errors.ageYears}>
            <input id="pet-years" type="number" inputMode="numeric" min={0} max={PET_LIMITS.maxAgeYears} value={draft.ageYears} onChange={(e) => update('ageYears', e.target.value)} />
          </Field>
          <Field id="pet-months" label="Months" error={errors.ageMonths}>
            <input id="pet-months" type="number" inputMode="numeric" min={0} max={11} value={draft.ageMonths} onChange={(e) => update('ageMonths', e.target.value)} />
          </Field>
        </div>
      )}

      <Field id="pet-weight" label="Weight (kg)" error={errors.weightKg} hint={weight > 0 && !errors.weightKg ? `${sizeFromWeight(weight)} dog` : 'Your best guess is fine — you can update it later.'}>
        <input id="pet-weight" type="number" inputMode="decimal" step="0.1" min={PET_LIMITS.weightMin} max={PET_LIMITS.weightMax} value={draft.weightKg} placeholder="e.g. 18" onChange={(e) => update('weightKg', e.target.value)} aria-invalid={Boolean(errors.weightKg)} />
      </Field>

      <Choice label="Spayed / neutered?" options={['Yes', 'No'] as const} value={draft.neutered === null ? null : draft.neutered ? 'Yes' : 'No'} onChange={(v) => update('neutered', v === 'Yes')} error={errors.neutered} />
    </div>
  );
}

function HealthStep({ draft, errors, update }: StepProps) {
  return (
    <div className="step-grid">
      <p className="panel-muted">Helps walkers, sitters, and vets you book through Proot. Everything here is optional.</p>
      <Choice label="Vaccinations up to date" options={VACCINATIONS} value={draft.vaccinations as (typeof VACCINATIONS)[number][]} onChange={(v) => update('vaccinations', toggleIn(draft.vaccinations, v))} multi />
      <Field id="pet-allergies" label="Allergies" error={errors.allergies}>
        <input id="pet-allergies" value={draft.allergies} maxLength={PET_LIMITS.textMax} placeholder="e.g. chicken, grass pollen" onChange={(e) => update('allergies', e.target.value)} />
      </Field>
      <Field id="pet-conditions" label="Medical conditions or medication" error={errors.conditions}>
        <textarea id="pet-conditions" rows={2} value={draft.conditions} maxLength={PET_LIMITS.textMax} placeholder="e.g. hip dysplasia, daily joint supplement" onChange={(e) => update('conditions', e.target.value)} />
      </Field>
      <div className="field-pair">
        <Field id="pet-vet" label="Vet / clinic">
          <input id="pet-vet" value={draft.vetName} maxLength={80} placeholder="e.g. Dr. Nair" onChange={(e) => update('vetName', e.target.value)} />
        </Field>
        <Field id="pet-vet-phone" label="Vet phone" error={errors.vetPhone}>
          <input id="pet-vet-phone" type="tel" value={draft.vetPhone} placeholder="+91 …" onChange={(e) => update('vetPhone', e.target.value)} aria-invalid={Boolean(errors.vetPhone)} />
        </Field>
      </div>
      <Field id="pet-chip" label="Microchip ID" error={errors.microchipId}>
        <input id="pet-chip" value={draft.microchipId} maxLength={15} placeholder="9–15 letters or digits" onChange={(e) => update('microchipId', e.target.value)} aria-invalid={Boolean(errors.microchipId)} />
      </Field>
    </div>
  );
}

function RoutineStep({ draft, errors, update }: StepProps) {
  const weight = Number(draft.weightKg);
  const kcal = draft.activityLevel ? estimateDailyKcal(weight, draft.activityLevel, Boolean(draft.neutered), draft.birthDate) : 0;
  return (
    <div className="step-grid">
      <Choice label="Mostly eats" options={DIET_TYPES} value={draft.dietType} onChange={(v) => update('dietType', v)} error={errors.dietType} />
      <fieldset className="field choice">
        <legend>Meals a day</legend>
        <div className="stepper-input">
          <button type="button" className="icon-button" onClick={() => update('mealsPerDay', Math.max(1, draft.mealsPerDay - 1))} disabled={draft.mealsPerDay <= 1} aria-label="Fewer meals">−</button>
          <output aria-live="polite">{draft.mealsPerDay}</output>
          <button type="button" className="icon-button" onClick={() => update('mealsPerDay', Math.min(4, draft.mealsPerDay + 1))} disabled={draft.mealsPerDay >= 4} aria-label="More meals">+</button>
        </div>
      </fieldset>
      <Choice label="Activity level" options={ACTIVITY_LEVELS} value={draft.activityLevel} onChange={(v) => update('activityLevel', v)} error={errors.activityLevel} />
      {kcal > 0 && (
        <p className="callout"><Icon name="sparkle" size={16} /> <span>A {draft.activityLevel?.toLowerCase()}-activity {weight} kg dog needs roughly <strong>{kcal} kcal/day</strong> — about {Math.round(kcal / draft.mealsPerDay)} per meal. A starting point, not veterinary advice.</span></p>
      )}
    </div>
  );
}

function PersonalityStep({ draft, errors, update }: StepProps) {
  return (
    <div className="step-grid">
      <Choice label="With other dogs" options={SOCIAL_LEVELS} value={draft.social} onChange={(v) => update('social', v)} error={errors.social} />
      <Choice label="Describe them (pick any)" options={TEMPERAMENTS} value={draft.temperament as (typeof TEMPERAMENTS)[number][]} onChange={(v) => update('temperament', toggleIn(draft.temperament, v))} multi />
      <Field id="pet-bio" label="Short bio" error={errors.bio} hint={`${draft.bio.length}/${PET_LIMITS.textMax} · shown on Friends nearby`}>
        <textarea id="pet-bio" rows={3} value={draft.bio} maxLength={PET_LIMITS.textMax} placeholder="Loves long sniffs and short baths." onChange={(e) => update('bio', e.target.value)} />
      </Field>
      <Field id="pet-prompt" label="Pick a prompt">
        <select id="pet-prompt" value={draft.prompt} onChange={(e) => update('prompt', e.target.value)}>
          {PET_PROMPTS.map((p) => <option key={p}>{p}</option>)}
        </select>
      </Field>
      <Field id="pet-answer" label="Their answer" error={errors.answer}>
        <input id="pet-answer" value={draft.answer} maxLength={PET_LIMITS.textMax} placeholder="Optional" onChange={(e) => update('answer', e.target.value)} />
      </Field>
    </div>
  );
}

function ReviewStep({ draft, onEdit }: { draft: PetDraft; onEdit: (step: OnboardingStepId) => void }) {
  const input = draftToInput(draft);
  const sections: { step: OnboardingStepId; title: string; rows: [string, string][] }[] = [
    { step: 'basics', title: 'Basics', rows: [['Name', input.name], ['Breed', input.breed], ['Sex', input.sex]] },
    { step: 'body', title: 'Body', rows: [['Age', `${formatAge(input.birthDate)}${input.birthDateApprox ? ' (approx.)' : ''}`], ['Weight', `${input.weightKg} kg · ${sizeFromWeight(input.weightKg)}`], ['Neutered', input.neutered ? 'Yes' : 'No']] },
    { step: 'health', title: 'Health', rows: [['Vaccines', input.vaccinations.join(', ') || '—'], ['Allergies', input.allergies || '—'], ['Conditions', input.conditions || '—'], ['Vet', [input.vetName, input.vetPhone].filter(Boolean).join(' · ') || '—'], ['Microchip', input.microchipId || '—']] },
    { step: 'routine', title: 'Routine', rows: [['Diet', input.dietType], ['Meals', `${input.mealsPerDay} a day`], ['Activity', input.activityLevel]] },
    { step: 'personality', title: 'Personality', rows: [['With dogs', input.social], ['Traits', input.temperament.join(', ') || '—'], ['Bio', input.bio || '—'], ...(input.answer ? [[input.prompt, input.answer] as [string, string]] : [])] },
  ];
  return (
    <div className="review">
      <div className="review-hero">
        <PetAvatar pet={input} size={72} />
        <div><h2>{input.name}</h2><p>{input.breed} · {formatAge(input.birthDate)}</p></div>
      </div>
      {sections.map((s) => (
        <section key={s.step} className="review-section">
          <header><h3>{s.title}</h3><button type="button" className="link-button" onClick={() => onEdit(s.step)}>Edit</button></header>
          <dl>{s.rows.map(([k, v]) => <div key={k} className="drawer-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>
      ))}
    </div>
  );
}

function DoneStep({ pet, edited, headingRef }: { pet: PetRecord; edited: boolean; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <main className="wrap page-section onboarding">
      <div className="panel empty done-card">
        <PetAvatar pet={pet} size={96} />
        <h1 ref={headingRef} tabIndex={-1}>{edited ? `${pet.name}’s profile is updated.` : `Welcome to the block, ${pet.name}.`}</h1>
        <p>{edited ? 'Changes are live across Proot.' : 'Your neighborhood is now set up around them. Open the profile any time from the avatar in the top-right.'}</p>
        <div className="actions">
          <Link className="button primary" href="/">Go to home</Link>
          {!edited && <Link className="button secondary" href="/nutrition">Log {pet.name}’s first meal</Link>}
        </div>
      </div>
    </main>
  );
}

function AccountStep({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'signup' && !name.trim()) return setError('Add your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email.');
    if (password.length < 8) return setError('Passwords are at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap page-section onboarding">
      <div className="onboarding-welcome">
        <div>
          <p className="eyebrow">Welcome to Proot</p>
          <h1 ref={headingRef} tabIndex={-1}>Let’s set things up around your dog.</h1>
          <p className="lede">Create an account, then tell us about your dog — basics, health notes, routine, and personality. It takes about two minutes.</p>
          <ul className="trust">
            <li><Icon name="check" size={16} /> Care pros see the notes that matter</li>
            <li><Icon name="check" size={16} /> Daily calorie guide from their size</li>
            <li><Icon name="check" size={16} /> A profile for Friends nearby</li>
          </ul>
        </div>
        <form className="panel onboarding-card" onSubmit={submit} noValidate>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : undefined} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : undefined} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          </div>
          {mode === 'signup' && (
            <Field id="acct-name" label="Your name">
              <input id="acct-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field id="acct-email" label="Email">
            <input id="acct-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="acct-password" label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
            <input id="acct-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="callout error" role="alert"><Icon name="info" size={16} /> {error}</p>}
          <button type="submit" className="button primary block" disabled={busy}>
            {busy ? 'One moment…' : mode === 'signup' ? <>Create account <Icon name="arrowRight" size={16} /></> : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
