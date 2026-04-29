// Client-side local-AI types. Separate from /lib/ai/types.ts (which is shared
// with the server route) only because local providers run in the browser and
// don't go through `/api/translate`. The error vocabulary is intentionally
// the same shape as ProviderError so callers can handle both flavors uniformly.

import { ProviderError } from "../types";

export type LocalApiType = "ollama" | "openai";

export const LOCAL_API_TYPES: { value: LocalApiType; label: string }[] = [
  {
    value: "ollama",
    label: "Ollama (POST /api/generate, GET /api/tags)",
  },
  {
    value: "openai",
    label: "OpenAI-compatible (POST /v1/chat/completions, GET /v1/models)",
  },
];

export type LocalGenerateInput = {
  baseUrl: string;
  model: string;
  systemInstruction: string;
  userText: string;
  temperature: number;
  /** 0 (or any non-positive) means "no cap — server default". */
  maxTokens: number;
  signal?: AbortSignal;
};

export type LocalProvider = {
  readonly id: LocalApiType;
  generate(input: LocalGenerateInput): Promise<string>;
  /**
   * Probe the API and return what models it advertises (best-effort: not all
   * OpenAI-compatible servers implement /v1/models; treat empty list as
   * "unknown" rather than "missing").
   */
  listModels(params: {
    baseUrl: string;
    signal?: AbortSignal;
  }): Promise<string[]>;
};

/** Defaults used when the user hasn't picked anything yet. */
export const LOCAL_DEFAULTS = {
  apiUrl: "http://localhost:11434",
  apiType: "ollama" as LocalApiType,
  modelName: "",
  temperature: 0.3,
  maxTokens: 0,
};

export { ProviderError };

/** Sanitize a user-supplied URL — strip trailing slashes, fall back to default if blank. */
export function normalizeBaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return LOCAL_DEFAULTS.apiUrl;
  return t.replace(/\/+$/, "");
}
