import type { NextRequest } from "next/server";
import {
  generate,
  ProviderError,
  isModelId,
  DEFAULT_MODEL_ID,
  type ModelId,
} from "@/lib/ai/translate";
import {
  buildSystemPrompt,
  markChunk,
  parseMarkedResponse,
  MODE_HINTS,
  type TranslationMode,
} from "@/lib/prompts";
import { isLanguageKey, type LanguageKey } from "@/lib/languages";

export const runtime = "nodejs";
// Translation chunks can take a while; give them room.
export const maxDuration = 60;

type TranslateRequestBody = {
  apiKey: string;
  lines: string[];
  mode: TranslationMode;
  userPrompt: string;
  targetLanguage: LanguageKey;
  model: ModelId;
  /** Optional sibling model to try once if the primary exhausts its retries. */
  failoverModel: ModelId | null;
  temperature?: number;
  maxRetries: number;
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
  if (!isLanguageKey(b.targetLanguage)) {
    return "Invalid or missing `targetLanguage`";
  }
  const modelRaw = b.model ?? DEFAULT_MODEL_ID;
  if (!isModelId(modelRaw)) {
    return "Invalid `model`";
  }
  let failoverModel: ModelId | null = null;
  if (b.failoverModel != null) {
    if (!isModelId(b.failoverModel)) return "Invalid `failoverModel`";
    failoverModel = b.failoverModel;
  }
  return {
    apiKey: b.apiKey,
    lines: b.lines as string[],
    mode: b.mode,
    userPrompt: b.userPrompt,
    targetLanguage: b.targetLanguage,
    model: modelRaw,
    failoverModel,
    temperature:
      typeof b.temperature === "number" ? b.temperature : undefined,
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

const STATUS_BY_KIND: Record<string, number> = {
  rate_limit: 429,
  invalid_key: 401,
  server: 502,
  network: 502,
  unknown: 500,
};

/**
 * Run one model with retries. Returns either the parsed translated lines or
 * the terminal error. Auth errors short-circuit and never retry.
 */
async function runModel(params: {
  apiKey: string;
  model: ModelId;
  systemInstruction: string;
  userText: string;
  expectedLines: number;
  temperature?: number;
  maxRetries: number;
  signal: AbortSignal;
}): Promise<
  | { ok: true; translated: string[] }
  | { ok: false; error: ProviderError | Error; terminal: boolean }
> {
  const { maxRetries } = params;
  let lastError: ProviderError | Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await generate({
        apiKey: params.apiKey,
        model: params.model,
        systemInstruction: params.systemInstruction,
        userText: params.userText,
        temperature: params.temperature,
        signal: params.signal,
      });
      const translated = parseMarkedResponse(response, params.expectedLines);
      return { ok: true, translated };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Auth: terminal, no retry, no failover.
      if (e instanceof ProviderError && e.detail.kind === "invalid_key") {
        return { ok: false, error: e, terminal: true };
      }
      if (e instanceof ProviderError && e.detail.kind === "rate_limit") {
        const wait =
          e.detail.retryAfterMs ?? Math.min(15000, 1000 * 2 ** attempt);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        return { ok: false, error: e, terminal: false };
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
    }
  }
  return {
    ok: false,
    error: lastError ?? new Error("Unknown error"),
    terminal: false,
  };
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

  const {
    apiKey,
    lines,
    mode,
    userPrompt,
    targetLanguage,
    model,
    failoverModel,
    temperature,
    maxRetries,
  } = parsed;

  const systemInstruction = buildSystemPrompt({
    userPrompt: userPrompt || "",
    modeHint: MODE_HINTS[mode],
    lineCount: lines.length,
    targetLanguage,
  });
  const userText = markChunk(lines);

  // Primary model.
  const primary = await runModel({
    apiKey,
    model,
    systemInstruction,
    userText,
    expectedLines: lines.length,
    temperature,
    maxRetries,
    signal: request.signal,
  });
  if (primary.ok) {
    return Response.json({ translated: primary.translated, modelUsed: model });
  }

  // Optional failover: only if requested AND primary failure isn't a terminal
  // auth error (auth errors apply to the same key on the failover, so trying
  // is pointless and noisy).
  if (failoverModel && !primary.terminal && failoverModel !== model) {
    const fb = await runModel({
      apiKey,
      model: failoverModel,
      systemInstruction,
      userText,
      expectedLines: lines.length,
      temperature,
      maxRetries: 0, // single-shot failover; the primary already burned retries
      signal: request.signal,
    });
    if (fb.ok) {
      return Response.json({
        translated: fb.translated,
        modelUsed: failoverModel,
        failedOver: true,
        primaryError: errorPayload(primary.error),
      });
    }
    // Both failed — surface the failover's error since it's the most recent.
    return errorFromProvider(fb.error);
  }

  return errorFromProvider(primary.error);
}

function errorPayload(e: ProviderError | Error) {
  if (e instanceof ProviderError) {
    return { kind: e.detail.kind, message: e.detail.message };
  }
  return { kind: "unknown", message: e.message };
}

function errorFromProvider(e: ProviderError | Error) {
  if (e instanceof ProviderError) {
    const status = STATUS_BY_KIND[e.detail.kind] ?? 500;
    const extra: Record<string, unknown> = {};
    if (e.detail.kind === "rate_limit" && e.detail.retryAfterMs != null) {
      extra.retryAfterMs = e.detail.retryAfterMs;
    }
    return errorResponse(status, e.detail.kind, e.detail.message, extra);
  }
  return errorResponse(500, "mismatch", e.message);
}
