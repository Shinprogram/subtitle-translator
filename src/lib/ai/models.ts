// Central model registry. Adding a new model = one entry here + (if it's a
// new provider) one new file under ./providers/. Nothing else has to know.

import type { ProviderId, SpeedTier } from "./types";

export type ModelDef = {
  id: string;
  provider: ProviderId;
  label: string;
  description: string;
  speedTier: SpeedTier;
  /**
   * Provider-specific recommended sampling temperature for subtitle translation.
   * Used when the request doesn't override it.
   */
  recommendedTemperature: number;
};

export const MODEL_REGISTRY = [
  // ----- Gemini (closed) -----
  {
    id: "gemini-2.5-pro",
    provider: "gemini",
    label: "Gemini 2.5 Pro",
    description: "Highest-quality Gemini. Best for nuanced/emotional dialogue.",
    speedTier: "High Quality",
    recommendedTemperature: 0.7,
  },
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    label: "Gemini 2.5 Flash",
    description: "Recommended default. Balances speed and quality.",
    speedTier: "Balanced",
    recommendedTemperature: 0.6,
  },
  {
    id: "gemini-2.0-flash",
    provider: "gemini",
    label: "Gemini 2.0 Flash",
    description: "Fast, lower-latency Gemini.",
    speedTier: "Fast",
    recommendedTemperature: 0.5,
  },
  {
    id: "gemini-1.5-flash",
    provider: "gemini",
    label: "Gemini 1.5 Flash",
    description: "Older fast tier. Useful as a fallback.",
    speedTier: "Fast",
    recommendedTemperature: 0.5,
  },
  {
    id: "gemini-1.5-pro",
    provider: "gemini",
    label: "Gemini 1.5 Pro",
    description: "Older high-quality tier.",
    speedTier: "High Quality",
    recommendedTemperature: 0.7,
  },
  // ----- Gemma (open weights, served via Google AI Studio) -----
  {
    id: "gemma-3n-e2b-it",
    provider: "gemma",
    label: "Gemma 3n E2B",
    description:
      "Smallest, fastest open-weights model. Lower temperature, terse prompts.",
    speedTier: "Fast",
    recommendedTemperature: 0.3,
  },
  {
    id: "gemma-3n-e4b-it",
    provider: "gemma",
    label: "Gemma 3n E4B",
    description:
      "Larger Gemma. Better context retention and format adherence.",
    speedTier: "Balanced",
    recommendedTemperature: 0.4,
  },
] as const satisfies readonly ModelDef[];

export type ModelId = (typeof MODEL_REGISTRY)[number]["id"];

export const DEFAULT_MODEL_ID: ModelId = "gemini-2.5-flash";

const MODEL_BY_ID: Record<string, ModelDef> = Object.fromEntries(
  MODEL_REGISTRY.map((m) => [m.id, m]),
);

export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && v in MODEL_BY_ID;
}

export function getModelDef(id: ModelId): ModelDef {
  return MODEL_BY_ID[id];
}

/**
 * Pick a sibling model on the *other* provider for the optional failover path.
 * Picks something reasonable in the same or higher quality tier.
 */
export function getFailoverModel(id: ModelId): ModelId | null {
  const def = getModelDef(id);
  if (def.provider === "gemini") return "gemma-3n-e4b-it";
  if (def.provider === "gemma") return "gemini-2.5-flash";
  return null;
}
