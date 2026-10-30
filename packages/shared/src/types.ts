export type Product = {
  id: string;
  name: string;
  category: "Food" | "Toys" | "Care" | "Home";
  price: number;
  blurb: string;
  image: string;
};

export type CareService = {
  id: string;
  title: string;
  pro: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  duration: string;
  category: "Walk" | "Groom" | "Vet" | "Train" | "Sit";
  blurb: string;
  image: string;
};

export type PetEvent = {
  id: string;
  title: string;
  when: string;
  where: string;
  neighborhood: string;
  spots: number;
  image: string;
  blurb: string;
};

export type Park = {
  id: string;
  name: string;
  distanceKm: number;
  hours: string;
  amenities: string[];
  dogsNow: number;
  image: string;
};

export type PetProfile = {
  id: string;
  name: string;
  breed: string;
  age: string;
  bio: string;
  prompt: string;
  answer: string;
  distanceKm: number;
  image: string;
};

export type MealAnalysis = {
  id: string;
  label: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  notes: string;
  verdict: "Good" | "Okay" | "Skip";
};

export type ActivityItem = {
  id: string;
  type: "Walk" | "Meal" | "Play" | "Care" | "Sleep";
  title: string;
  detail: string;
  at: string;
};

export type UserPet = {
  name: string;
  breed: string;
  age: string;
  weightKg: number;
};
