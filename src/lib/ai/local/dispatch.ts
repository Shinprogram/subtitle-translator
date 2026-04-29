// Local-AI dispatcher: given a LocalApiType, return the provider that handles
// that wire shape. Adding a new local API type = one new file under ./ + one
// entry in PROVIDERS here.

import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import {
  LOCAL_DEFAULTS,
  normalizeBaseUrl,
  type LocalApiType,
  type LocalProvider,
} from "./types";

const PROVIDERS: Record<LocalApiType, LocalProvider> = {
  ollama: ollamaProvider,
  openai: openaiProvider,
};

export function getLocalProvider(type: LocalApiType): LocalProvider {
  return PROVIDERS[type];
}

/**
 * Convenience: build a single generate() call from settings-shaped inputs,
 * applying URL normalization and falling back to defaults on missing fields.
 */
export async function generateLocal(params: {
  apiType: LocalApiType;
  apiUrl: string;
  model: string;
  systemInstruction: string;
  userText: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<string> {
  const provider = getLocalProvider(params.apiType);
  return provider.generate({
    baseUrl: normalizeBaseUrl(params.apiUrl),
    model: params.model,
    systemInstruction: params.systemInstruction,
    userText: params.userText,
    temperature: Number.isFinite(params.temperature)
      ? params.temperature
      : LOCAL_DEFAULTS.temperature,
    maxTokens: Number.isFinite(params.maxTokens) ? params.maxTokens : 0,
    signal: params.signal,
  });
}
