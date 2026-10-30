'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { canManageEvents, estimateDailyKcal, isAdmin, ROLE_LABELS, sizeFromWeight, type PetRecord } from '@proot/shared';
import { useSession } from '../lib/session';
import { Icon } from './Icon';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';

export function PetAvatar({ pet, size = 36 }: { pet: Pick<PetRecord, 'name' | 'photo'>; size?: number }) {
  return pet.photo ? (
    <img className="pet-avatar" src={pet.photo} alt="" width={size} height={size} />
  ) : (
    <span className="pet-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>{pet.name[0]?.toUpperCase()}</span>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="drawer-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Right-side slide-over with the active dog's full profile and account actions. */
export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, pets, pet, selectPet, signOut } = useSession();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      // Keep Tab inside the panel while it's open.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  const kcal = pet ? estimateDailyKcal(pet.weightKg, pet.activityLevel, pet.neutered, pet.birthDate) : 0;

  // Portalled to <body>: the sticky header's backdrop-filter would otherwise trap position: fixed.
  return createPortal(
    <div className={`drawer-root${open ? ' open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-head">
          <p className="eyebrow">Profile</p>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close profile">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {pet ? (
            <>
              <section className="drawer-hero">
                <PetAvatar pet={pet} size={88} />
                <div>
                  <h2 id="drawer-title">{pet.name}</h2>
                  <p>{pet.breed} · {pet.sex} · {pet.age}{pet.birthDateApprox ? ' (approx.)' : ''}</p>
                </div>
              </section>

              {pets.length > 1 && (
                <div className="pet-switch" role="tablist" aria-label="Your dogs">
                  {pets.map((p) => (
                    <button key={p.id} role="tab" aria-selected={p.id === pet.id} className={p.id === pet.id ? 'active' : undefined} onClick={() => selectPet(p.id)}>
                      <PetAvatar pet={p} size={24} /> {p.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="drawer-stats">
                <div><strong>{pet.weightKg} kg</strong><span>{sizeFromWeight(pet.weightKg)}</span></div>
                <div><strong>~{kcal}</strong><span>kcal / day</span></div>
                <div><strong>{pet.mealsPerDay}×</strong><span>meals</span></div>
              </div>

              {pet.bio && <p className="drawer-bio">{pet.bio}</p>}
              {pet.answer && (
                <div className="prompt">
                  <strong>{pet.prompt}</strong>
                  <p>“{pet.answer}”</p>
                </div>
              )}

              <section className="drawer-section">
                <h3>Personality</h3>
                <div className="chip-row">
                  <span className="chip brand">{pet.social}</span>
                  {pet.temperament.map((t) => <span key={t} className="chip">{t}</span>)}
                </div>
              </section>

              <section className="drawer-section">
                <h3>Routine</h3>
                <dl>
                  <Row label="Diet" value={pet.dietType} />
                  <Row label="Meals" value={`${pet.mealsPerDay} a day`} />
                  <Row label="Activity" value={pet.activityLevel} />
                </dl>
              </section>

              <section className="drawer-section">
                <h3>Health</h3>
                <dl>
                  <Row label="Neutered" value={pet.neutered ? 'Yes' : 'No'} />
                  <Row label="Vaccines" value={pet.vaccinations.length ? pet.vaccinations.join(', ') : 'None recorded'} />
                  <Row label="Allergies" value={pet.allergies} />
                  <Row label="Conditions" value={pet.conditions} />
                  <Row label="Vet" value={[pet.vetName, pet.vetPhone].filter(Boolean).join(' · ')} />
                  <Row label="Microchip" value={pet.microchipId} />
                </dl>
              </section>

              <div className="drawer-actions">
                <Link className="button primary block" href={`/onboarding?edit=${pet.id}`} onClick={onClose}>
                  Edit {pet.name}’s profile
                </Link>
                <Link className="button secondary block" href="/onboarding?new=1" onClick={onClose}>
                  Add another dog
                </Link>
              </div>
            </>
          ) : (
            <div className="empty">
              <span className="icon-tile accent"><Icon name="heart" size={22} /></span>
              <h2 id="drawer-title">No dog yet</h2>
              <p>Tell us about your dog to personalise Proot.</p>
              <Link className="button primary" href="/onboarding" onClick={onClose}>Set up a profile</Link>
            </div>
          )}

          {user && (
            <section className="drawer-section drawer-account">
              <h3>Account</h3>
              <p>
                <strong>{user.name}</strong> <span className={`chip ${isAdmin(user.role) ? 'brand' : canManageEvents(user.role) ? 'warn' : ''}`}>{ROLE_LABELS[user.role]}</span>
                <br /><small>{user.email}</small>
              </p>
              {canManageEvents(user.role) && (
                <div className="drawer-actions role-links">
                  <a className="button secondary block" href={`${ADMIN_URL}/events`} target="_blank" rel="noreferrer">
                    <Icon name="calendar" size={16} /> Manage events
                  </a>
                  {isAdmin(user.role) && (
                    <a className="button secondary block" href={ADMIN_URL} target="_blank" rel="noreferrer">
                      <Icon name="users" size={16} /> Admin console
                    </a>
                  )}
                </div>
              )}
              <button className="button secondary block" onClick={() => { signOut(); onClose(); }}>Sign out</button>
            </section>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
