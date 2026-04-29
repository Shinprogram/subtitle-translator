// Ollama provider — talks to a local Ollama daemon.
//
// Reference: https://github.com/ollama/ollama/blob/main/docs/api.md
//
// Notes:
// - We use /api/generate (not /api/chat) because it cleanly separates `system`
//   and `prompt`, which works well across base + instruct models.
// - We always set `stream: false` because we re-align the marker protocol on
//   the full response (see prompts.ts). Streaming would require token-level
//   reassembly for no real UX gain on a chunk-at-a-time pipeline.
// - CORS: a default `ollama serve` does NOT allow browser origins. The README
//   documents `OLLAMA_ORIGINS=*` as the easiest fix.

import { ProviderError } from "../types";
import type { LocalGenerateInput, LocalProvider } from "./types";

type OllamaGenerateResponse = {
  response?: string;
  done?: boolean;
  done_reason?: string;
  error?: string;
};

type OllamaTagsResponse = {
  models?: { name?: string; model?: string }[];
};

export const ollamaProvider: LocalProvider = {
  id: "ollama",

  async generate(input: LocalGenerateInput): Promise<string> {
    const { baseUrl, model, systemInstruction, userText, temperature, maxTokens, signal } =
      input;

    if (!model.trim()) {
      throw new ProviderError({
        kind: "invalid_key",
        message: "Set the local model name in the sidebar (e.g. gemma3:4b).",
      });
    }

    const body = {
      model,
      system: systemInstruction,
      prompt: userText,
      stream: false,
      options: {
        temperature,
        ...(maxTokens > 0 ? { num_predict: maxTokens } : {}),
      },
    };

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw networkError(e, baseUrl);
    }

    let json: OllamaGenerateResponse | null = null;
    try {
      json = (await res.json()) as OllamaGenerateResponse;
    } catch {
      // fall through
    }

    if (!res.ok) {
      const message = json?.error ?? `Ollama HTTP ${res.status} ${res.statusText}`;
      // 404 typically = model not pulled. Treat as invalid_key (terminal,
      // user must fix something) so we don't waste retries.
      if (res.status === 404) {
        throw new ProviderError(
          {
            kind: "invalid_key",
            message: `${message} — did you run \`ollama pull ${model}\`?`,
          },
          res.status,
        );
      }
      if (res.status === 429) {
        throw new ProviderError({ kind: "rate_limit", message }, res.status);
      }
      if (res.status >= 500) {
        throw new ProviderError({ kind: "server", message }, res.status);
      }
      throw new ProviderError({ kind: "server", message }, res.status);
    }

    const text = (json?.response ?? "").trim();
    if (!text) {
      throw new ProviderError({
        kind: "server",
        message: "Empty response from Ollama (model may have produced no tokens).",
      });
    }
    return text;
  },

  async listModels(params): Promise<string[]> {
    const { baseUrl, signal } = params;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/tags`, { signal });
    } catch (e) {
      throw networkError(e, baseUrl);
    }
    if (!res.ok) {
      throw new ProviderError(
        { kind: "server", message: `Ollama tags HTTP ${res.status}` },
        res.status,
      );
    }
    const json = (await res.json()) as OllamaTagsResponse;
    return (json.models ?? [])
      .map((m) => m.name ?? m.model ?? "")
      .filter((s): s is string => Boolean(s));
  },
};

function networkError(e: unknown, baseUrl: string): ProviderError {
  const reason = e instanceof Error ? e.message : String(e);
  return new ProviderError({
    kind: "network",
    message: `Could not reach ${baseUrl}: ${reason}. Is the local server running and CORS allowed for this origin?`,
  });
}
