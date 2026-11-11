import type { MealAnalysis } from "./contracts.js";

/** Reference meals for the built-in (non-AI) estimate. */
export const mealCatalog: MealAnalysis[] = [
  { id: "chicken-rice", label: "Chicken + rice", kcal: 420, proteinG: 32, fatG: 9, notes: "Balanced, gentle on the stomach. Good portion for a mid-size dog.", verdict: "Good" },
  { id: "kibble", label: "Salmon kibble", kcal: 360, proteinG: 26, fatG: 14, notes: "Complete diet. Check the bag for portion by weight.", verdict: "Good" },
  { id: "table-scraps", label: "Table scraps", kcal: 610, proteinG: 18, fatG: 38, notes: "High fat, and may hide onion, garlic or bones. Better skipped.", verdict: "Skip" },
  { id: "yogurt-treat", label: "Plain yogurt + apple", kcal: 90, proteinG: 6, fatG: 2, notes: "Fine as a small extra, not a meal.", verdict: "Okay" },
];

const RULES: { match: RegExp; meal: number }[] = [
  { match: /onion|garlic|grape|raisin|chocolate|xylitol|pizza|scrap|bone|avocado|macadamia/i, meal: 2 },
  { match: /chicken|rice|turkey|egg|pumpkin/i, meal: 0 },
  { match: /kibble|salmon|fish|dry food|wet food/i, meal: 1 },
  { match: /yogurt|apple|carrot|banana|treat|biscuit/i, meal: 3 },
];

/**
 * Deterministic estimate from a meal name, used when AI analysis is unavailable.
 * Unknown foods get a cautious "Okay" with a note to check, never a random verdict.
 */
export function analyzeMealFromName(name: string): MealAnalysis {
  const rule = RULES.find((r) => r.match.test(name));
  if (rule) return { ...mealCatalog[rule.meal], label: name.trim() || mealCatalog[rule.meal].label };
  return {
    id: "unknown",
    label: name.trim() || "Meal",
    kcal: 300,
    proteinG: 15,
    fatG: 10,
    notes: "We couldn’t recognise this meal, so these numbers are a rough placeholder. Check the label or ask your vet.",
    verdict: "Okay",
  };
}
