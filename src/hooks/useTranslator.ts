"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { chunkSubtitles } from "@/lib/srt";
import { useStore } from "@/store";

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
      if (!settings.apiKey) {
        toast.error("Please enter your Gemini API key first");
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
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              apiKey: settings.apiKey,
              lines,
              mode: settings.mode,
              userPrompt: settings.userPrompt,
              model: settings.model,
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

          const data = (await res.json()) as { translated: string[] };
          if (!Array.isArray(data.translated)) {
            throw new Error("Malformed response from server");
          }

          applyChunkTranslation(startAt, data.translated);

          // Successful retry removes this chunk from the failure list.
          const cur = useStore.getState().progress.failedChunks;
          if (cur.includes(ci)) {
            setProgress({ failedChunks: cur.filter((x) => x !== ci) });
          }
        } catch (e) {
          if (ctrl.signal.aborted) break;
          const message = e instanceof Error ? e.message : String(e);
          toast.error("Translation error", { description: message });
          setProgress({
            failedChunks: Array.from(
              new Set([...useStore.getState().progress.failedChunks, ci]),
            ),
            lastError: message,
          });
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
