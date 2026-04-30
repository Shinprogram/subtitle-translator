/**
 * Public types for the in-browser AI provider (MediaPipe GenAI Web).
 *
 * The actual MediaPipe SDK is heavy (~500 kB plus WASM + GBs of model
 * weights) so it's loaded lazily — these types intentionally don't import
 * from `@mediapipe/tasks-genai` so the rest of the app stays light.
 */

export type BrowserModelStatus =
  | "idle" // No model selected, nothing loaded
  | "loading" // Reading file / initializing WASM / loading weights
  | "ready" // Loaded and ready to generate
  | "generating" // A generateResponse() call is in flight
  | "error"; // Last load attempt failed

export type BrowserDelegate = "GPU" | "CPU";

export type BrowserModelMeta = {
  /** Original filename selected by the user (e.g. `gemma-3n-E2B-it-int4.task`). */
  fileName: string;
  /** File size in bytes (read from the File handle before loading). */
  byteLength: number;
  /** Wall-clock time spent in createFromOptions, milliseconds. */
  loadDurationMs: number;
  /** Which compute path the runtime initialized on. */
  delegate: BrowserDelegate;
};

export type BrowserLoadProgress = {
  /** Phase label shown in the UI. */
  phase: "reading-file" | "initializing-wasm" | "loading-weights" | "warming-up";
  /** 0..1 fraction. May be `null` for indeterminate phases. */
  fraction: number | null;
  /** Optional human-friendly status, e.g. "Reading 1.2 GB of 1.8 GB". */
  detail?: string;
};

export type BrowserGenerateOptions = {
  /** Combined system+user prompt — MediaPipe doesn't separate them. */
  prompt: string;
  maxTokens: number;
  topK: number;
  temperature: number;
  randomSeed?: number;
  /** Honored as a best-effort cancellation between tokens (MediaPipe has no native abort). */
  signal?: AbortSignal;
};

export type BrowserDefaults = {
  maxTokens: number;
  topK: number;
  temperature: number;
  delegate: BrowserDelegate;
};

export const BROWSER_DEFAULTS: BrowserDefaults = {
  maxTokens: 1024,
  topK: 40,
  temperature: 0.3,
  delegate: "GPU",
};

/**
 * Detects whether the current browser exposes a usable WebGPU adapter.
 * MediaPipe GenAI's GPU delegate requires this; CPU fallback exists but
 * is too slow to be useful for translation in practice.
 */
export async function detectWebGpu(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "Not in a browser environment." };
  }
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) {
    return {
      supported: false,
      reason:
        "WebGPU not exposed. Use a desktop Chromium-based browser (Chrome 113+ / Edge 113+).",
    };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason:
          "WebGPU is exposed but no adapter is available (try enabling hardware acceleration).",
      };
    }
    return { supported: true };
  } catch (e) {
    return {
      supported: false,
      reason:
        e instanceof Error
          ? `WebGPU adapter request failed: ${e.message}`
          : "WebGPU adapter request failed.",
    };
  }
}
