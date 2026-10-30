import { promises as fs } from "node:fs";
import path from "node:path";
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

const seedStore: ProotStore = {
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

function getStorePath() {
  return path.join(process.cwd(), "data", "proot-db.json");
}

export async function readStore(): Promise<ProotStore> {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  try {
    const raw = await fs.readFile(storePath, "utf8");
    if (!raw.trim()) {
      await writeStore(seedStore);
      return seedStore;
    }

    const parsed = JSON.parse(raw) as Partial<ProotStore>;
    return {
      ...seedStore,
      ...parsed,
      nutritionLog: parsed.nutritionLog ?? [],
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      await writeStore(seedStore);
      return seedStore;
    }

    throw error;
  }
}

export async function writeStore(store: ProotStore) {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
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
