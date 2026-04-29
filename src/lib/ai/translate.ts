// Central router: pick the right provider for the model id, normalize the
// generate-text contract. New providers plug in here.

import { geminiProvider } from "./providers/gemini";
import { gemmaProvider } from "./providers/gemma";
import { getModelDef, type ModelId } from "./models";
import type { AiProvider, GenerateInput, ProviderId } from "./types";

const PROVIDERS: Record<ProviderId, AiProvider> = {
  gemini: geminiProvider,
  gemma: gemmaProvider,
};

/**
 * Generate text using the provider that owns `model`.
 *
 * - Throws {@link ProviderError} on failure (callers expect that shape).
 * - Falls back to the model's `recommendedTemperature` when the caller
 *   doesn't pass one.
 */
export async function generate(
  input: GenerateInput & { model: ModelId },
): Promise<string> {
  const def = getModelDef(input.model);
  const provider = PROVIDERS[def.provider];
  return provider.generate({
    ...input,
    temperature: input.temperature ?? def.recommendedTemperature,
  });
}

export { ProviderError } from "./types";
export type {
  AiProvider,
  GenerateInput,
  ProviderErrorDetail,
  ProviderId,
  SpeedTier,
} from "./types";
export {
  MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  getModelDef,
  getFailoverModel,
  isModelId,
} from "./models";
export type { ModelDef, ModelId } from "./models";
