// Minimal Gemini REST wrapper. We use fetch directly to keep the server bundle
// small and to avoid pinning a specific SDK version. Docs:
// https://ai.google.dev/api/generate-content

export type GeminiModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-2.0-flash"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro";

export type GeminiError =
  | { kind: "invalid_key"; message: string }
  | { kind: "rate_limit"; message: string; retryAfterMs?: number }
  | { kind: "server"; message: string }
  | { kind: "network"; message: string }
  | { kind: "unknown"; message: string };

export class GeminiApiError extends Error {
  constructor(
    public detail: GeminiError,
    public status?: number,
  ) {
    super(detail.message);
    this.name = "GeminiApiError";
  }
}

type GenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

export async function generateContent(params: {
  apiKey: string;
  model: GeminiModel;
  systemInstruction: string;
  userText: string;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const { apiKey, model, systemInstruction, userText, temperature, signal } =
    params;

  if (!apiKey || apiKey.trim().length < 10) {
    throw new GeminiApiError({
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
      body: JSON.stringify({
        systemInstruction: {
          role: "system",
          parts: [{ text: systemInstruction }],
        },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: temperature ?? 0.3,
          responseMimeType: "text/plain",
        },
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new GeminiApiError({ kind: "network", message });
  }

  let json: GenerateResponse | null = null;
  try {
    json = (await res.json()) as GenerateResponse;
  } catch {
    // fall through; handled below
  }

  if (!res.ok) {
    const message =
      json?.error?.message ?? `Gemini API error ${res.status} ${res.statusText}`;
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new GeminiApiError({ kind: "invalid_key", message }, res.status);
    }
    if (res.status === 429) {
      const ra = res.headers.get("retry-after");
      const retryAfterMs = ra ? Number(ra) * 1000 : undefined;
      throw new GeminiApiError(
        { kind: "rate_limit", message, retryAfterMs },
        res.status,
      );
    }
    throw new GeminiApiError({ kind: "server", message }, res.status);
  }

  if (json?.promptFeedback?.blockReason) {
    throw new GeminiApiError({
      kind: "server",
      message: `Blocked by safety filter: ${json.promptFeedback.blockReason}`,
    });
  }

  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new GeminiApiError({
      kind: "server",
      message: "Empty response from Gemini",
    });
  }
  return text;
}
