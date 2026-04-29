// Shared types for the multi-provider AI translation layer.

export type ProviderId = "gemini" | "gemma";

export type SpeedTier = "Fast" | "Balanced" | "High Quality";

export type ProviderErrorDetail =
  | { kind: "invalid_key"; message: string }
  | { kind: "rate_limit"; message: string; retryAfterMs?: number }
  | { kind: "server"; message: string }
  | { kind: "network"; message: string }
  | { kind: "unknown"; message: string };

/** Normalized error shape — every provider throws this. */
export class ProviderError extends Error {
  constructor(
    public detail: ProviderErrorDetail,
    public status?: number,
  ) {
    super(detail.message);
    this.name = "ProviderError";
  }
}

export type GenerateInput = {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userText: string;
  temperature?: number;
  signal?: AbortSignal;
};

/**
 * A provider is a thin adapter around a remote LLM API. It owns transport
 * (fetch + headers + body shape) and translates the remote error vocabulary
 * into our normalized {@link ProviderError}.
 */
export interface AiProvider {
  readonly id: ProviderId;
  generate(input: GenerateInput): Promise<string>;
}
