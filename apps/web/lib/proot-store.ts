import {
  analyzeMealFromName,
  careServices,
  events,
  mealCatalog,
  nearbyPets,
  parks,
  products,
  todayActivity,
  userPet,
  type MealAnalysis,
} from "@proot/shared";

export type NutritionEntry = MealAnalysis & {
  id: string;
  photo?: string | null;
  at: string;
};

export type ProotStore = {
  userPet: typeof userPet;
  products: typeof products;
  careServices: typeof careServices;
  events: typeof events;
  parks: typeof parks;
  nearbyPets: typeof nearbyPets;
  mealCatalog: typeof mealCatalog;
  todayActivity: typeof todayActivity;
  nutritionLog: NutritionEntry[];
};

// In-memory store — seeded from shared data on each cold start.
// On Vercel's serverless/edge runtime the filesystem is read-only, so we keep
// state in module-scope memory. Writes survive warm invocations within the same
// lambda instance but reset on cold starts (acceptable for demo data).
let _store: ProotStore = {
  userPet,
  products,
  careServices,
  events,
  parks,
  nearbyPets,
  mealCatalog,
  todayActivity,
  nutritionLog: [],
};

export async function readStore(): Promise<ProotStore> {
  return _store;
}

export async function writeStore(store: ProotStore): Promise<void> {
  _store = store;
}

export async function getCatalog() {
  const store = await readStore();
  return {
    userPet: store.userPet,
    products: store.products,
    careServices: store.careServices,
    events: store.events,
    parks: store.parks,
    nearbyPets: store.nearbyPets,
    todayActivity: store.todayActivity,
    mealCatalog: store.mealCatalog,
  };
}

export async function listNutritionLog() {
  const store = await readStore();
  return store.nutritionLog;
}

export async function addNutritionLog(input: {
  name: string;
  photo?: string | null;
  at?: string;
}) {
  const store = await readStore();
  const analysis = analyzeMealFromName(input.name);

  const entry: NutritionEntry = {
    ...analysis,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    photo: input.photo ?? null,
    at: input.at ?? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };

  store.nutritionLog = [entry, ...store.nutritionLog];
  await writeStore(store);
  return entry;
}
