// Shared HTTP plumbing for any provider that uses Google's
// generativelanguage.googleapis.com `generateContent` endpoint.
// Gemini and Gemma both live there but differ in request body shape, so each
// provider builds its own body and hands it to `callGenerateContent` here.

import { ProviderError } from "../types";

type GenerateApiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

export async function callGenerateContent(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<string> {
  const { apiKey, model, body, signal } = params;

  if (!apiKey || apiKey.trim().length < 10) {
    throw new ProviderError({
      kind: "invalid_key",
      message: "Missing or malformed API key",
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new ProviderError({ kind: "network", message });
  }

  let json: GenerateApiResponse | null = null;
  try {
    json = (await res.json()) as GenerateApiResponse;
  } catch {
    // fall through; handled below
  }

  if (!res.ok) {
    const message =
      json?.error?.message ?? `API error ${res.status} ${res.statusText}`;
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new ProviderError({ kind: "invalid_key", message }, res.status);
    }
    if (res.status === 429) {
      const ra = res.headers.get("retry-after");
      const retryAfterMs = ra ? Number(ra) * 1000 : undefined;
      throw new ProviderError(
        { kind: "rate_limit", message, retryAfterMs },
        res.status,
      );
    }
    throw new ProviderError({ kind: "server", message }, res.status);
  }

  if (json?.promptFeedback?.blockReason) {
    throw new ProviderError({
      kind: "server",
      message: `Blocked by safety filter: ${json.promptFeedback.blockReason}`,
    });
  }

  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new ProviderError({
      kind: "server",
      message: "Empty response from model",
    });
  }
  return text;
}
