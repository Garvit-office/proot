// Pet onboarding: the profile model, option lists, and step validation shared by
// the backend (which re-validates with zod) and both clients (webuser + mobile).

export const PET_SEXES = ["Female", "Male"] as const;
export const DIET_TYPES = ["Kibble", "Wet food", "Raw", "Home-cooked", "Mixed"] as const;
export const ACTIVITY_LEVELS = ["Low", "Moderate", "High"] as const;
export const SOCIAL_LEVELS = ["Loves dogs", "Selective", "Prefers people"] as const;
export const VACCINATIONS = ["Rabies", "DHPP", "Leptospirosis", "Bordetella", "Canine influenza"] as const;
export const TEMPERAMENTS = [
  "Playful",
  "Calm",
  "Curious",
  "Shy",
  "Cuddly",
  "Vocal",
  "Food-motivated",
  "Gentle with kids",
  "Good with cats",
] as const;
export const PET_PROMPTS = [
  "My perfect Sunday is…",
  "You’ll win me over with…",
  "My most controversial opinion…",
  "I’m secretly afraid of…",
] as const;

export const POPULAR_BREEDS = [
  "Indie",
  "Labrador Retriever",
  "Golden Retriever",
  "Beagle",
  "German Shepherd",
  "Shih Tzu",
  "Pug",
  "Cocker Spaniel",
  "Siberian Husky",
  "Dachshund",
  "Border Collie",
  "Mixed breed",
];

export type PetSex = (typeof PET_SEXES)[number];
export type DietType = (typeof DIET_TYPES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type SocialLevel = (typeof SOCIAL_LEVELS)[number];

export const PET_LIMITS = {
  nameMax: 40,
  breedMax: 60,
  weightMin: 0.5,
  weightMax: 120,
  textMax: 280,
  maxAgeYears: 30,
  // Data-URL length; both clients downscale before upload (see the photo helpers in each app).
  photoMaxChars: 1_500_000,
} as const;

/** Everything the onboarding flow collects. Sent as-is to POST /api/pets and PATCH /api/pets/:id. */
export type PetProfileInput = {
  // Basics
  name: string;
  photo: string | null;
  breed: string;
  sex: PetSex;
  // Body
  birthDate: string; // YYYY-MM-DD
  birthDateApprox: boolean;
  weightKg: number;
  neutered: boolean;
  // Health (optional)
  vaccinations: string[];
  allergies: string;
  conditions: string;
  vetName: string;
  vetPhone: string;
  microchipId: string;
  // Routine
  dietType: DietType;
  mealsPerDay: number;
  activityLevel: ActivityLevel;
  // Personality
  temperament: string[];
  social: SocialLevel;
  bio: string;
  prompt: string;
  answer: string;
};

/** The in-progress form. Numbers stay strings until the step validates so inputs can be cleared. */
export type PetDraft = Omit<PetProfileInput, "sex" | "weightKg" | "dietType" | "activityLevel" | "social" | "neutered"> & {
  sex: PetSex | null;
  weightKg: string;
  neutered: boolean | null;
  dietType: DietType | null;
  activityLevel: ActivityLevel | null;
  social: SocialLevel | null;
  ageMode: "birthday" | "approx";
  ageYears: string;
  ageMonths: string;
};

export const ONBOARDING_STEPS = [
  { id: "basics", title: "Meet your dog", eyebrow: "Basics" },
  { id: "body", title: "Age and size", eyebrow: "Body" },
  { id: "health", title: "Health notes", eyebrow: "Health · optional" },
  { id: "routine", title: "Daily routine", eyebrow: "Routine" },
  { id: "personality", title: "Their personality", eyebrow: "Personality" },
  { id: "review", title: "Looks right?", eyebrow: "Review" },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
export type DraftErrors = Partial<Record<keyof PetDraft, string>>;

export function emptyPetDraft(): PetDraft {
  return {
    name: "",
    photo: null,
    breed: "",
    sex: null,
    birthDate: "",
    birthDateApprox: false,
    ageMode: "birthday",
    ageYears: "",
    ageMonths: "",
    weightKg: "",
    neutered: null,
    vaccinations: [],
    allergies: "",
    conditions: "",
    vetName: "",
    vetPhone: "",
    microchipId: "",
    dietType: null,
    mealsPerDay: 2,
    activityLevel: null,
    temperament: [],
    social: null,
    bio: "",
    prompt: PET_PROMPTS[0],
    answer: "",
  };
}

/** Prefill the form from a saved pet, for editing. */
export function draftFromPet(pet: PetProfileInput): PetDraft {
  const age = ageParts(pet.birthDate);
  return {
    ...pet,
    weightKg: String(pet.weightKg),
    ageMode: pet.birthDateApprox ? "approx" : "birthday",
    ageYears: String(age.years),
    ageMonths: String(age.months),
  };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || isoDate(date) !== value ? null : date;
}

export function birthDateFromAge(years: number, months: number, today = new Date()) {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  date.setUTCMonth(date.getUTCMonth() - (years * 12 + months));
  return isoDate(date);
}

export function ageParts(birthDate: string, today = new Date()) {
  const born = parseIsoDate(birthDate);
  if (!born) return { years: 0, months: 0 };
  let months = (today.getUTCFullYear() - born.getUTCFullYear()) * 12 + today.getUTCMonth() - born.getUTCMonth();
  if (today.getUTCDate() < born.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** "3 years", "1 year, 4 months", "9 weeks"… */
export function formatAge(birthDate: string, today = new Date()) {
  const { years, months } = ageParts(birthDate, today);
  if (years === 0 && months === 0) {
    const born = parseIsoDate(birthDate);
    const weeks = born ? Math.max(1, Math.floor((today.getTime() - born.getTime()) / 604_800_000)) : 0;
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  const y = years ? `${years} year${years === 1 ? "" : "s"}` : "";
  const m = months ? `${months} month${months === 1 ? "" : "s"}` : "";
  return years >= 3 ? y : [y, m].filter(Boolean).join(", ");
}

export function sizeFromWeight(weightKg: number) {
  if (weightKg < 10) return "Small";
  if (weightKg < 25) return "Medium";
  if (weightKg < 40) return "Large";
  return "Giant";
}

const activityFactor: Record<ActivityLevel, number> = { Low: 1.4, Moderate: 1.6, High: 2.0 };

/**
 * Rough maintenance energy: RER (70 × kg^0.75) × a life-stage/activity factor.
 * Shown as a starting point in onboarding and nutrition, never as veterinary advice.
 */
export function estimateDailyKcal(weightKg: number, activity: ActivityLevel, neutered: boolean, birthDate?: string) {
  if (!(weightKg > 0)) return 0;
  const rer = 70 * Math.pow(weightKg, 0.75);
  const puppy = birthDate ? ageParts(birthDate).years < 1 : false;
  const factor = puppy ? 2.5 : activityFactor[activity] - (neutered ? 0.2 : 0);
  return Math.round((rer * factor) / 10) * 10;
}

function resolvedBirthDate(draft: PetDraft) {
  if (draft.ageMode === "birthday") return draft.birthDate;
  return birthDateFromAge(Number(draft.ageYears || 0), Number(draft.ageMonths || 0));
}

/** Validate one step. An empty object means the step can advance. */
export function validateStep(step: OnboardingStepId, draft: PetDraft, today = new Date()): DraftErrors {
  const errors: DraftErrors = {};

  if (step === "basics") {
    const name = draft.name.trim();
    if (!name) errors.name = "What’s your dog called?";
    else if (name.length > PET_LIMITS.nameMax) errors.name = `Keep it under ${PET_LIMITS.nameMax} characters.`;
    if (!draft.breed.trim()) errors.breed = "Pick a breed, or choose “Mixed breed”.";
    else if (draft.breed.trim().length > PET_LIMITS.breedMax) errors.breed = "That breed name is too long.";
    if (!draft.sex) errors.sex = "Choose one.";
    if (draft.photo && draft.photo.length > PET_LIMITS.photoMaxChars) errors.photo = "That photo is too large — try another.";
  }

  if (step === "body") {
    if (draft.ageMode === "birthday") {
      const born = parseIsoDate(draft.birthDate);
      if (!born) errors.birthDate = "Add a birthday (YYYY-MM-DD).";
      else if (born.getTime() > today.getTime()) errors.birthDate = "That date is in the future.";
      else if (ageParts(draft.birthDate, today).years > PET_LIMITS.maxAgeYears) errors.birthDate = "That seems a little too long ago.";
    } else {
      const years = Number(draft.ageYears || 0);
      const months = Number(draft.ageMonths || 0);
      if (!Number.isInteger(years) || years < 0 || years > PET_LIMITS.maxAgeYears) errors.ageYears = `Years should be 0–${PET_LIMITS.maxAgeYears}.`;
      if (!Number.isInteger(months) || months < 0 || months > 11) errors.ageMonths = "Months should be 0–11.";
      if (!errors.ageYears && !errors.ageMonths && years === 0 && months === 0) errors.ageYears = "Add an approximate age.";
    }
    const weight = Number(draft.weightKg.replace(",", "."));
    if (!draft.weightKg.trim() || Number.isNaN(weight)) errors.weightKg = "Add a weight in kg.";
    else if (weight < PET_LIMITS.weightMin || weight > PET_LIMITS.weightMax) errors.weightKg = `Weight should be ${PET_LIMITS.weightMin}–${PET_LIMITS.weightMax} kg.`;
    if (draft.neutered === null) errors.neutered = "Choose one.";
  }

  if (step === "health") {
    for (const key of ["allergies", "conditions"] as const) {
      if (draft[key].length > PET_LIMITS.textMax) errors[key] = `Keep it under ${PET_LIMITS.textMax} characters.`;
    }
    if (draft.vetPhone && !/^[+\d][\d\s()-]{5,19}$/.test(draft.vetPhone.trim())) errors.vetPhone = "That doesn’t look like a phone number.";
    if (draft.microchipId && !/^[A-Za-z0-9]{9,15}$/.test(draft.microchipId.trim())) errors.microchipId = "Microchip IDs are 9–15 letters or digits.";
  }

  if (step === "routine") {
    if (!draft.dietType) errors.dietType = "Choose what they mostly eat.";
    if (!(draft.mealsPerDay >= 1 && draft.mealsPerDay <= 4)) errors.mealsPerDay = "1–4 meals a day.";
    if (!draft.activityLevel) errors.activityLevel = "Choose an activity level.";
  }

  if (step === "personality") {
    if (!draft.social) errors.social = "How do they feel about other dogs?";
    if (draft.bio.length > PET_LIMITS.textMax) errors.bio = `Keep it under ${PET_LIMITS.textMax} characters.`;
    if (draft.answer.length > PET_LIMITS.textMax) errors.answer = `Keep it under ${PET_LIMITS.textMax} characters.`;
  }

  if (step === "review") {
    for (const s of ONBOARDING_STEPS) {
      if (s.id !== "review") Object.assign(errors, validateStep(s.id, draft, today));
    }
  }

  return errors;
}

/** First step with a problem, so review can send the user back to fix it. */
export function firstInvalidStep(draft: PetDraft): OnboardingStepId | null {
  for (const s of ONBOARDING_STEPS) {
    if (s.id !== "review" && Object.keys(validateStep(s.id, draft)).length) return s.id;
  }
  return null;
}

/** Convert a fully validated draft into the API payload. */
export function draftToInput(draft: PetDraft): PetProfileInput {
  const { ageMode, ageYears, ageMonths, ...rest } = draft;
  return {
    ...rest,
    name: draft.name.trim(),
    breed: draft.breed.trim(),
    sex: draft.sex!,
    birthDate: resolvedBirthDate(draft),
    birthDateApprox: ageMode === "approx",
    weightKg: Math.round(Number(draft.weightKg.replace(",", ".")) * 10) / 10,
    neutered: draft.neutered!,
    allergies: draft.allergies.trim(),
    conditions: draft.conditions.trim(),
    vetName: draft.vetName.trim(),
    vetPhone: draft.vetPhone.trim(),
    microchipId: draft.microchipId.trim().toUpperCase(),
    dietType: draft.dietType!,
    activityLevel: draft.activityLevel!,
    social: draft.social!,
    bio: draft.bio.trim(),
    answer: draft.answer.trim(),
  };
}

export function toggleIn(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
