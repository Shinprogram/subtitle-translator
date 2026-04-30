"use client";

/**
 * Singleton manager around `LlmInference` from `@mediapipe/tasks-genai`.
 *
 * Why a singleton: the SDK allocates a WebGPU device + ~GBs of model weights
 * inside a WASM heap. Trying to hold two instances at once will OOM the GPU
 * on any consumer device. We expose `loadModel` / `unloadModel` / `generate`,
 * and the only mutable global state is `currentInstance`.
 *
 * Why dynamic import: the SDK pulls a ~500 kB JS bundle plus WASM. Users in
 * cloud or local mode never need it, so it's loaded the first time the user
 * clicks "Load model" — never at startup, never during SSR.
 */

import {
  BROWSER_DEFAULTS,
  type BrowserDelegate,
  type BrowserGenerateOptions,
  type BrowserLoadProgress,
  type BrowserModelMeta,
} from "./types";

// Pin the CDN URL to the npm package version that was installed alongside
// this code. The JS API and WASM bytes ship together, so any drift would
// break loads silently — keep this in sync with package.json on every
// dependency bump.
const MEDIAPIPE_VERSION = "0.10.27";
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@${MEDIAPIPE_VERSION}/wasm`;

// MediaPipe types kept opaque here so the rest of the app doesn't have to
// import the heavyweight package transitively.
type LlmInferenceLike = {
  generateResponse(prompt: string): Promise<string>;
  close(): void;
};

let currentInstance: LlmInferenceLike | null = null;
let currentMeta: BrowserModelMeta | null = null;
/**
 * The native `generateResponse()` Promise we are currently awaiting, or
 * `null` if no generation is in flight. This is kept *separate* from the
 * one returned to the caller so that aborting the caller's wait does not
 * also clear `busy` while the underlying WASM/WebGPU work is still running.
 *
 * Invariants:
 *   - `inflightPromise === null`  ⇒  no work is in flight, safe to start.
 *   - `inflightPromise !== null`  ⇒  work is in flight; do NOT start another
 *      `generateResponse()` and do NOT call `instance.close()` until it
 *      settles. Otherwise we risk concurrent calls or use-after-close.
 */
let inflightPromise: Promise<string> | null = null;

export class BrowserRuntimeError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BrowserRuntimeError";
  }
}

/** Returns the currently loaded model's metadata, or null if none is loaded. */
export function getCurrentModel(): BrowserModelMeta | null {
  return currentMeta;
}

/** True iff a model is loaded and idle (not currently generating). */
export function isReady(): boolean {
  return currentInstance !== null && inflightPromise === null;
}

/**
 * Unloads the current model. If a generation is in flight (e.g. the caller
 * already aborted but MediaPipe hasn't finished), waits for it to settle
 * before calling `instance.close()` to avoid a use-after-close in the WASM
 * heap. The caller's wait can still be raced against an abort signal — but
 * this function will not race the runtime.
 */
export async function unloadModel(): Promise<void> {
  if (inflightPromise) {
    // Don't surface the result/error to our caller — they only care that
    // the runtime has quiesced.
    await inflightPromise.catch(() => {});
  }
  if (currentInstance) {
    try {
      currentInstance.close();
    } catch {
      // Best-effort; the runtime is being torn down regardless.
    }
  }
  currentInstance = null;
  currentMeta = null;
}

export type LoadOptions = {
  file: File;
  delegate: BrowserDelegate;
  maxTokens: number;
  topK: number;
  temperature: number;
  onProgress?: (p: BrowserLoadProgress) => void;
};

/**
 * Loads a `.task` (MediaPipe LLM) file into a fresh `LlmInference` instance.
 * Any previously loaded model is unloaded first — only one model can be
 * resident at a time.
 */
export async function loadModel(opts: LoadOptions): Promise<BrowserModelMeta> {
  // unloadModel waits for any in-flight generation to settle before closing
  // the previous instance, so we don't need a separate guard here.
  await unloadModel();

  const startTotal = performance.now();
  const onProgress = opts.onProgress ?? (() => {});

  // Phase 1: read the file into an ArrayBuffer. For a 1-2 GB model this is
  // the dominant cost on most machines, so we surface byte-level progress.
  onProgress({ phase: "reading-file", fraction: 0, detail: "Reading model file…" });
  const buffer = await readFileWithProgress(opts.file, (loaded) => {
    onProgress({
      phase: "reading-file",
      fraction: opts.file.size > 0 ? loaded / opts.file.size : null,
      detail: `${formatBytes(loaded)} / ${formatBytes(opts.file.size)}`,
    });
  });

  // Phase 2: load the SDK + WASM fileset. Done after the file read so that a
  // big file failing fast (e.g. user picked a 10 GB file by mistake) doesn't
  // pay the SDK cost first.
  onProgress({
    phase: "initializing-wasm",
    fraction: null,
    detail: "Initializing MediaPipe runtime…",
  });
  const { FilesetResolver, LlmInference } = await import("@mediapipe/tasks-genai");
  const fileset = await FilesetResolver.forGenAiTasks(MEDIAPIPE_WASM_URL);

  // Phase 3: hand the buffer to LlmInference. This is the GPU upload + graph
  // construction — slow on first call (~5-30s for a 2B-class model), no
  // built-in progress callback unfortunately.
  onProgress({
    phase: "loading-weights",
    fraction: null,
    detail: `Allocating ${opts.delegate} buffers…`,
  });

  let instance: LlmInferenceLike;
  try {
    instance = (await LlmInference.createFromOptions(fileset, {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(buffer),
        delegate: opts.delegate,
      },
      maxTokens: opts.maxTokens,
      topK: opts.topK,
      temperature: opts.temperature,
      randomSeed: 1,
    })) as unknown as LlmInferenceLike;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new BrowserRuntimeError(
      `Failed to initialize the model: ${msg}. Confirm this is a MediaPipe ` +
        `.task LLM file (e.g. gemma-3n-E2B-it-int4.task) and that your ` +
        `device has enough RAM/VRAM.`,
      e,
    );
  }

  const meta: BrowserModelMeta = {
    fileName: opts.file.name,
    byteLength: opts.file.size,
    loadDurationMs: Math.round(performance.now() - startTotal),
    delegate: opts.delegate,
  };
  currentInstance = instance;
  currentMeta = meta;

  onProgress({ phase: "warming-up", fraction: 1, detail: "Ready" });
  return meta;
}

/**
 * Runs a single prompt through the loaded model. MediaPipe doesn't natively
 * support cancellation mid-generation, so we cannot actually stop the WASM
 * work once it has started. What we *can* do is:
 *
 *   1. Reject this call's awaiter promptly when the abort signal fires.
 *   2. Keep `inflightPromise` set until the underlying `generateResponse()`
 *      actually settles, so a fast caller cannot start another generation
 *      or call `unloadModel()` while the runtime is still busy.
 *
 * The caller observes (1); the next caller / unloader observes (2).
 */
export async function generate(
  opts: BrowserGenerateOptions,
): Promise<string> {
  if (!currentInstance) {
    throw new BrowserRuntimeError(
      "No model is loaded. Pick a .task file in the Browser AI panel first.",
    );
  }
  if (inflightPromise) {
    throw new BrowserRuntimeError(
      "Another generation is already in progress.",
    );
  }
  if (opts.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Note: max tokens / temperature / topK can't be changed per-call without
  // calling setOptions(), which would tear down the cache. We applied them
  // at load time; per-call overrides are deferred until users actually
  // need them.
  const responsePromise = currentInstance.generateResponse(opts.prompt);
  // Reset `inflightPromise` only when the *underlying* work settles — not
  // when this function returns, which may happen earlier on abort.
  inflightPromise = responsePromise;
  responsePromise
    .catch(() => {
      // Errors are surfaced to the caller below; here we only care about
      // settlement so we can release the runtime.
    })
    .finally(() => {
      // Guard against the (impossible-but-cheap) case where two generations
      // managed to overlap; only clear if we are still pointing at this one.
      if (inflightPromise === responsePromise) {
        inflightPromise = null;
      }
    });

  if (opts.signal) {
    return await Promise.race([
      responsePromise,
      new Promise<never>((_, reject) => {
        opts.signal!.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("Aborted before completion", "AbortError"),
            ),
          { once: true },
        );
      }),
    ]);
  }
  return await responsePromise;
}

async function readFileWithProgress(
  file: File,
  onProgress: (loaded: number) => void,
): Promise<ArrayBuffer> {
  // Stream-based read so multi-GB files don't block the main thread on the
  // FileReader.readAsArrayBuffer codepath. ReadableStream.getReader() is
  // available in every browser that has WebGPU, so no fallback is needed.
  if (typeof file.stream !== "function") {
    return file.arrayBuffer();
  }
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received);
  }
  const total = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    total.set(c, offset);
    offset += c.byteLength;
  }
  // Detach so the chunks can be GC'd promptly.
  chunks.length = 0;
  return total.buffer;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/** For tests / dev — re-export defaults so consumers don't import twice. */
export { BROWSER_DEFAULTS };
