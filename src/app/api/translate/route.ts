import type { NextRequest } from "next/server";
import { generateContent, GeminiApiError, type GeminiModel } from "@/lib/gemini";
import {
  buildSystemPrompt,
  markChunk,
  parseMarkedResponse,
  MODE_HINTS,
  type TranslationMode,
} from "@/lib/prompts";

export const runtime = "nodejs";
// Translation chunks can take a while; give them room.
export const maxDuration = 60;

type TranslateRequestBody = {
  apiKey: string;
  lines: string[];
  mode: TranslationMode;
  userPrompt: string;
  model?: GeminiModel;
  temperature?: number;
  maxRetries?: number;
};

function isModeKey(v: unknown): v is TranslationMode {
  return v === "romance" || v === "xianxia" || v === "comedy" || v === "auto";
}

function validate(body: unknown): TranslateRequestBody | string {
  if (!body || typeof body !== "object") return "Invalid request body";
  const b = body as Record<string, unknown>;
  if (typeof b.apiKey !== "string" || b.apiKey.trim().length < 10) {
    return "Missing or invalid apiKey";
  }
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return "`lines` must be a non-empty array";
  }
  if (b.lines.some((l) => typeof l !== "string")) {
    return "`lines` must be strings";
  }
  if (!isModeKey(b.mode)) {
    return "Invalid `mode`";
  }
  if (typeof b.userPrompt !== "string") {
    return "Invalid `userPrompt`";
  }
  return {
    apiKey: b.apiKey,
    lines: b.lines as string[],
    mode: b.mode,
    userPrompt: b.userPrompt,
    model: (b.model as GeminiModel | undefined) ?? "gemini-2.5-flash",
    temperature: typeof b.temperature === "number" ? b.temperature : 0.3,
    maxRetries: typeof b.maxRetries === "number" ? b.maxRetries : 2,
  };
}

function errorResponse(
  status: number,
  kind: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return Response.json({ error: { kind, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "bad_request", "Invalid JSON body");
  }

  const parsed = validate(body);
  if (typeof parsed === "string") {
    return errorResponse(400, "bad_request", parsed);
  }

  const { apiKey, lines, mode, userPrompt, model, temperature, maxRetries } =
    parsed;

  const systemInstruction = buildSystemPrompt(
    userPrompt || "",
    MODE_HINTS[mode],
    lines.length,
  );
  const userText = markChunk(lines);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= (maxRetries ?? 0); attempt++) {
    try {
      const response = await generateContent({
        apiKey,
        model: model ?? "gemini-2.5-flash",
        systemInstruction,
        userText,
        temperature,
        signal: request.signal,
      });
      const translated = parseMarkedResponse(response, lines.length);
      return Response.json({ translated });
    } catch (e) {
      lastError = e;
      // Don't retry auth errors — they won't succeed on retry.
      if (e instanceof GeminiApiError && e.detail.kind === "invalid_key") {
        return errorResponse(401, "invalid_key", e.detail.message);
      }
      // Respect server-provided retry-after on rate limits.
      if (e instanceof GeminiApiError && e.detail.kind === "rate_limit") {
        const wait =
          e.detail.retryAfterMs ?? Math.min(15000, 1000 * 2 ** attempt);
        if (attempt < (maxRetries ?? 0)) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        return errorResponse(429, "rate_limit", e.detail.message, {
          retryAfterMs: e.detail.retryAfterMs,
        });
      }
      // Alignment / network / server: exponential backoff then retry.
      if (attempt < (maxRetries ?? 0)) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
    }
  }

  if (lastError instanceof GeminiApiError) {
    const statusByKind: Record<string, number> = {
      rate_limit: 429,
      invalid_key: 401,
      server: 502,
      network: 502,
      unknown: 500,
    };
    return errorResponse(
      statusByKind[lastError.detail.kind] ?? 500,
      lastError.detail.kind,
      lastError.detail.message,
    );
  }
  const message =
    lastError instanceof Error ? lastError.message : "Unknown error";
  return errorResponse(500, "mismatch", message);
}
