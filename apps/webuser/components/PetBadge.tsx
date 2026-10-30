'use client';

import Link from 'next/link';
import { userPet } from '@proot/shared';
import { useSession } from '../lib/session';
import { Icon } from './Icon';

/** Hero badge on home: the signed-in dog, or the demo dog for guests. */
export function PetBadge() {
  const { pet } = useSession();
  const name = pet?.name ?? userPet.name;
  return (
    <span className="hero-badge">
      {pet?.photo ? <img src={pet.photo} alt="" /> : <span>{name[0]}</span>}
      For {name} · {pet?.breed ?? userPet.breed}
    </span>
  );
}

/** Nudges guests and signed-in users without a dog into onboarding. */
export function OnboardingBanner() {
  const { status, pet } = useSession();
  if (status === 'loading' || pet) return null;
  return (
    <section className="wrap">
      <div className="onboard-banner">
        <span className="icon-tile accent"><Icon name="heart" size={22} /></span>
        <div>
          <strong>{status === 'guest' ? 'Make Proot about your dog.' : 'Finish setting up your dog’s profile.'}</strong>
          <p>Two minutes: basics, health notes, routine, and personality. You’re looking at a demo until then.</p>
        </div>
        <Link className="button primary" href="/onboarding">
          {status === 'guest' ? 'Get started' : 'Continue'} <Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </section>
  );
}

export function PetName({ fallback = userPet.name }: { fallback?: string }) {
  return <>{useSession().pet?.name ?? fallback}</>;
}
