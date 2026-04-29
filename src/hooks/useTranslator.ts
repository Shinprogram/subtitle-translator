"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { chunkSubtitles } from "@/lib/srt";
import { useStore } from "@/store";
import {
  getFailoverModel,
  getModelDef,
  isModelId,
  ProviderError,
} from "@/lib/ai/translate";
import { generateLocal } from "@/lib/ai/local/dispatch";
import {
  buildSystemPrompt,
  markChunk,
  parseMarkedResponse,
  MODE_HINTS,
} from "@/lib/prompts";

type ApiError = { error?: { kind?: string; message?: string } };

/**
 * Controller for the batch translation pipeline.
 *
 * Responsibilities:
 *  - Split the loaded subtitles into chunks of `settings.chunkSize`.
 *  - POST each chunk to `/api/translate` sequentially, with `settings.delayMs`
 *    between requests.
 *  - Track progress / pause / resume / retry state in the Zustand store.
 */
export function useTranslator() {
  const subtitles = useStore((s) => s.subtitles);
  const settings = useStore((s) => s.settings);
  const progress = useStore((s) => s.progress);
  const setProgress = useStore((s) => s.setProgress);
  const applyChunkTranslation = useStore((s) => s.applyChunkTranslation);

  // Mutable flags we don't want to re-render on.
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      stopRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const runFromChunk = useCallback(
    async (startChunk: number, retryOnly: number[] | null = null) => {
      if (runningRef.current) return;
      if (subtitles.length === 0) {
        toast.error("No subtitles loaded");
        return;
      }
      if (settings.connectionMode === "cloud" && !settings.apiKey) {
        toast.error("Please enter your Gemini API key first");
        return;
      }

      const isLocal = settings.connectionMode === "local";

      // Local mode has its own preflight requirements; cloud uses apiKey.
      if (isLocal && !settings.localModelName.trim()) {
        toast.error("Set a local model name in the sidebar (e.g. gemma3:4b).");
        return;
      }

      runningRef.current = true;
      stopRef.current = false;

      const chunks = chunkSubtitles(subtitles, settings.chunkSize);
      setProgress({
        status: "running",
        totalChunks: chunks.length,
        lastError: null,
      });

      // Indices we plan to process: either a specific retry list, or a range.
      const plan =
        retryOnly && retryOnly.length > 0
          ? retryOnly.filter((i) => i >= 0 && i < chunks.length)
          : Array.from(
              { length: chunks.length - startChunk },
              (_, i) => startChunk + i,
            );

      for (const ci of plan) {
        if (stopRef.current) break;

        setProgress({ currentChunk: ci });

        const chunk = chunks[ci];
        const lines = chunk.map((e) => e.text);
        const startAt = ci * settings.chunkSize;

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
          let translated: string[];
          if (isLocal) {
            translated = await runLocalChunkWithRetries({
              lines,
              settings,
              signal: ctrl.signal,
            });
          } else {
            const failoverModel = settings.enableFailover
              ? getFailoverModel(settings.model)
              : null;
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                apiKey: settings.apiKey,
                lines,
                mode: settings.mode,
                userPrompt: settings.userPrompt,
                targetLanguage: settings.targetLanguage,
                model: settings.model,
                failoverModel,
                maxRetries: settings.maxRetries,
              }),
              signal: ctrl.signal,
            });

            if (!res.ok) {
              const data: ApiError = await res.json().catch(() => ({}));
              const kind = data.error?.kind ?? "unknown";
              const message =
                data.error?.message ??
                `Translation failed (HTTP ${res.status})`;

              if (kind === "invalid_key") {
                toast.error("Invalid Gemini API key", { description: message });
                setProgress({
                  status: "error",
                  lastError: message,
                  failedChunks: Array.from(
                    new Set([...useStore.getState().progress.failedChunks, ci]),
                  ),
                });
                break;
              }
              if (kind === "rate_limit") {
                toast.error("Rate limit exceeded", { description: message });
              } else {
                toast.error("Translation error", { description: message });
              }
              setProgress({
                failedChunks: Array.from(
                  new Set([...useStore.getState().progress.failedChunks, ci]),
                ),
                lastError: message,
              });
              continue;
            }

            const data = (await res.json()) as {
              translated: string[];
              modelUsed?: string;
              failedOver?: boolean;
            };
            if (!Array.isArray(data.translated)) {
              throw new Error("Malformed response from server");
            }

            if (data.failedOver && data.modelUsed) {
              const fallbackLabel = isModelId(data.modelUsed)
                ? getModelDef(data.modelUsed).label
                : data.modelUsed;
              toast.warning(
                `Chunk ${ci + 1}: primary model failed; translated with ${fallbackLabel} instead.`,
              );
            }

            translated = data.translated;
          }

          applyChunkTranslation(startAt, translated);

          // Successful retry removes this chunk from the failure list.
          const cur = useStore.getState().progress.failedChunks;
          if (cur.includes(ci)) {
            setProgress({ failedChunks: cur.filter((x) => x !== ci) });
          }
        } catch (e) {
          if (ctrl.signal.aborted) break;
          const message = e instanceof Error ? e.message : String(e);
          // Local-mode terminal errors (model not pulled, missing config) should
          // stop the run instead of marking every remaining chunk failed.
          const terminal =
            isLocal &&
            e instanceof ProviderError &&
            e.detail.kind === "invalid_key";
          toast.error("Translation error", { description: message });
          setProgress({
            failedChunks: Array.from(
              new Set([...useStore.getState().progress.failedChunks, ci]),
            ),
            lastError: message,
            ...(terminal ? { status: "error" as const } : {}),
          });
          if (terminal) break;
        }

        if (stopRef.current) break;

        // Pacing between requests (skip after the last chunk).
        const isLast = ci === plan[plan.length - 1];
        if (!isLast && settings.delayMs > 0) {
          await new Promise((r) => setTimeout(r, settings.delayMs));
        }
      }

      runningRef.current = false;

      const state = useStore.getState().progress;
      if (stopRef.current) {
        setProgress({ status: "paused" });
        return;
      }
      if (state.failedChunks.length > 0) {
        setProgress({ status: "error" });
        toast.warning(
          `Finished with ${state.failedChunks.length} failed chunk(s). Click Retry to try them again.`,
        );
      } else {
        setProgress({ status: "done", currentChunk: chunks.length });
        toast.success("Translation complete");
      }
    },
    [subtitles, settings, setProgress, applyChunkTranslation],
  );

  const start = useCallback(() => {
    void runFromChunk(0);
  }, [runFromChunk]);

  const resume = useCallback(() => {
    void runFromChunk(progress.currentChunk);
  }, [progress.currentChunk, runFromChunk]);

  const pause = useCallback(() => {
    stopRef.current = true;
    abortRef.current?.abort();
  }, []);

  const retryFailed = useCallback(() => {
    const failed = [...useStore.getState().progress.failedChunks];
    if (failed.length === 0) return;
    void runFromChunk(0, failed);
  }, [runFromChunk]);

  return {
    start,
    pause,
    resume,
    retryFailed,
    isRunning: progress.status === "running",
    isPaused: progress.status === "paused",
    hasFailures: progress.failedChunks.length > 0,
  };
}

/**
 * Local-mode equivalent of the server's `runModel` retry loop. Lives in the
 * client because local mode bypasses `/api/translate` entirely — the browser
 * talks to localhost directly, so this loop has to live here.
 *
 * Auth-shaped errors (missing model, unloaded model) are terminal and bubble
 * up immediately. Rate-limit and server errors get exponential backoff.
 */
async function runLocalChunkWithRetries(params: {
  lines: string[];
  settings: ReturnType<typeof useStore.getState>["settings"];
  signal: AbortSignal;
}): Promise<string[]> {
  const { lines, settings, signal } = params;
  const systemInstruction = buildSystemPrompt({
    userPrompt: settings.userPrompt || "",
    modeHint: MODE_HINTS[settings.mode],
    lineCount: lines.length,
    targetLanguage: settings.targetLanguage,
  });
  const userText = markChunk(lines);

  const maxRetries = Math.max(0, settings.maxRetries);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new Error("aborted");
    try {
      const response = await generateLocal({
        apiType: settings.localApiType,
        apiUrl: settings.localApiUrl,
        model: settings.localModelName,
        systemInstruction,
        userText,
        temperature: settings.localTemperature,
        maxTokens: settings.localMaxTokens,
        signal,
      });
      return parseMarkedResponse(response, lines.length);
    } catch (e) {
      lastError = e;
      if (e instanceof ProviderError && e.detail.kind === "invalid_key") {
        throw e;
      }
      if (attempt < maxRetries) {
        const backoff =
          e instanceof ProviderError &&
          e.detail.kind === "rate_limit" &&
          e.detail.retryAfterMs
            ? e.detail.retryAfterMs
            : 500 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
