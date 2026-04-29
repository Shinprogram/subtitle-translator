// OpenAI-compatible provider — covers llama.cpp `server`, LM Studio, KoboldCpp,
// vLLM, oobabooga's openai extension, and any other server that implements
// `POST /v1/chat/completions` and `GET /v1/models` in the OpenAI shape.
//
// We use chat-completions (not /v1/completions) because every modern local
// runner exposes it and it cleanly carries a system message.

import { ProviderError } from "../types";
import type { LocalGenerateInput, LocalProvider } from "./types";

type ChatCompletionsResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  error?: { message?: string; type?: string; code?: string | number };
};

type ModelsResponse = {
  data?: { id?: string }[];
};

export const openaiProvider: LocalProvider = {
  id: "openai",

  async generate(input: LocalGenerateInput): Promise<string> {
    const { baseUrl, model, systemInstruction, userText, temperature, maxTokens, signal } =
      input;

    if (!model.trim()) {
      throw new ProviderError({
        kind: "invalid_key",
        message:
          "Set the local model name in the sidebar (must match what the server reports at /v1/models).",
      });
    }

    const body = {
      model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userText },
      ],
      temperature,
      stream: false,
      ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
    };

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          // Some local servers ignore this; some require *anything* present.
          // Send a placeholder so dual-mode setups (e.g. LiteLLM) don't 401.
          authorization: "Bearer local",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw networkError(e, baseUrl);
    }

    let json: ChatCompletionsResponse | null = null;
    try {
      json = (await res.json()) as ChatCompletionsResponse;
    } catch {
      // fall through
    }

    if (!res.ok) {
      const message = json?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError({ kind: "invalid_key", message }, res.status);
      }
      if (res.status === 404) {
        throw new ProviderError(
          {
            kind: "invalid_key",
            message: `${message} — is "${model}" loaded? Check GET ${baseUrl}/v1/models.`,
          },
          res.status,
        );
      }
      if (res.status === 429) {
        throw new ProviderError({ kind: "rate_limit", message }, res.status);
      }
      throw new ProviderError({ kind: "server", message }, res.status);
    }

    const text = (json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) {
      throw new ProviderError({
        kind: "server",
        message:
          "Empty response from local server (no choices[0].message.content).",
      });
    }
    return text;
  },

  async listModels(params): Promise<string[]> {
    const { baseUrl, signal } = params;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/models`, {
        signal,
        headers: { authorization: "Bearer local" },
      });
    } catch (e) {
      throw networkError(e, baseUrl);
    }
    if (!res.ok) {
      // Some servers don't implement /v1/models at all — surface a server
      // error so the caller can show "model list unavailable" without
      // failing the connection test outright.
      throw new ProviderError(
        { kind: "server", message: `Models endpoint HTTP ${res.status}` },
        res.status,
      );
    }
    const json = (await res.json()) as ModelsResponse;
    return (json.data ?? [])
      .map((m) => m.id ?? "")
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
