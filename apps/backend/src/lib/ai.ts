import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type { MealAnalysis } from '@proot/shared';
import { aiEnabled, appConfig } from '../config.js';

const MealSchema = z.object({
  label: z.string().describe('Short name of the meal as seen, e.g. "Chicken and rice"'),
  kcal: z.number().int().describe('Estimated calories in the portion shown'),
  proteinG: z.number().int().describe('Estimated protein in grams'),
  fatG: z.number().int().describe('Estimated fat in grams'),
  verdict: z.enum(['Good', 'Okay', 'Skip']),
  notes: z.string().describe('One or two plain sentences for the owner, mentioning anything unsafe'),
  isFood: z.boolean().describe('False if the photo does not show food a dog could eat'),
});

const SYSTEM = `You review photos of meals that owners are about to give their dog, and estimate nutrition.
Return your best estimate for the portion actually visible in the photo.
Verdicts:
- "Good": a suitable, balanced meal or a sensible portion for this dog.
- "Okay": fine occasionally or as a small extra, or the portion is noticeably too large/small.
- "Skip": contains anything toxic or risky for dogs (onion, garlic, chives, grapes, raisins, chocolate, xylitol, macadamia, cooked bones, alcohol, caffeine, very fatty or heavily seasoned food), or conflicts with the dog's allergies or conditions.
Keep notes short, warm and practical, and name the specific risk when the verdict is "Skip". This is guidance, not veterinary advice.
If the photo is not of food, set isFood to false and explain briefly in notes.`;

let client: Anthropic | null = null;

export type PetContext = { name: string; breed: string; weightKg: number; age: string; activityLevel: string; allergies: string; conditions: string; dietType: string; targetKcal: number };

/**
 * Ask Claude to analyse a meal photo. Returns null when AI isn't configured or the request fails,
 * so callers can fall back to the rule-based estimate.
 */
export async function analyzeMealPhoto(image: { mime: string; base64: string }, pet: PetContext, hint?: string): Promise<Omit<MealAnalysis, 'id'> | null> {
  if (!aiEnabled()) return null;
  client ??= new Anthropic({ apiKey: appConfig.anthropic.apiKey, timeout: 60_000, maxRetries: 2 });
  const profile = `Dog: ${pet.name}, ${pet.breed}, ${pet.age}, ${pet.weightKg} kg, activity ${pet.activityLevel.toLowerCase()}, usual diet ${pet.dietType.toLowerCase()}.
Suggested daily intake: about ${pet.targetKcal} kcal.
Allergies: ${pet.allergies || 'none noted'}. Conditions: ${pet.conditions || 'none noted'}.${hint ? `\nThe owner calls this meal: "${hint}".` : ''}`;

  try {
    const response = await client.beta.messages.parse({
      model: appConfig.anthropic.model,
      max_tokens: 16000,
      // Re-route automatically if a safety classifier declines (e.g. a false positive on an unusual photo).
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(MealSchema) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mime as 'image/jpeg' | 'image/png' | 'image/webp', data: image.base64 } },
          { type: 'text', text: profile },
        ],
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const out = response.parsed_output;
    if (!out.isFood) {
      return { label: out.label || 'Not a meal', kcal: 0, proteinG: 0, fatG: 0, verdict: 'Skip', notes: out.notes || 'This photo doesn’t look like a meal.' };
    }
    const clamp = (n: number) => Math.max(0, Math.min(Math.round(n), 5000));
    return { label: out.label.slice(0, 80), kcal: clamp(out.kcal), proteinG: clamp(out.proteinG), fatG: clamp(out.fatG), verdict: out.verdict, notes: out.notes.slice(0, 500) };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error('Claude meal analysis: ANTHROPIC_API_KEY was rejected.');
    else if (error instanceof Anthropic.RateLimitError) console.warn('Claude meal analysis: rate limited, using the built-in estimate.');
    else if (error instanceof Anthropic.APIError) console.error(`Claude meal analysis failed (${error.status}): ${error.message}`);
    else console.error('Claude meal analysis failed:', (error as Error).message);
    return null;
  }
}
