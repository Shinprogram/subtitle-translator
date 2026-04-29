// Connection diagnostics for the local-AI panel.
//
// Reports a coarse status the UI maps to a colored dot:
//   "online"        🟢  — server replied AND the configured model is in its list
//   "model_missing" 🟡  — server replied but the model isn't in the listed set
//   "unknown_model" 🟡  — server doesn't expose a model list endpoint, can't tell
//   "timeout"       🟡  — request exceeded the timeout budget
//   "offline"       🔴  — fetch failed / DNS / connection refused / non-2xx
//
// Latency is wall-clock around the probe request. Best-effort — local servers
// are diverse and we don't want this to block anyone.

import { ProviderError } from "../types";
import { getLocalProvider } from "./dispatch";
import { normalizeBaseUrl, type LocalApiType } from "./types";

export type ConnectionStatus =
  | "online"
  | "model_missing"
  | "unknown_model"
  | "timeout"
  | "offline";

export type ConnectionResult = {
  status: ConnectionStatus;
  /** Round-trip ms for the probe. 0 if it never started. */
  latencyMs: number;
  /** Models advertised by the server, when available. Empty when unknown. */
  models: string[];
  /** Human-readable detail for the UI. */
  message: string;
};

export async function testConnection(params: {
  apiType: LocalApiType;
  apiUrl: string;
  model: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ConnectionResult> {
  const baseUrl = normalizeBaseUrl(params.apiUrl);
  const timeoutMs = params.timeoutMs ?? 5000;

  // Wire an internal timeout abort + propagate the caller's abort.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  const onCallerAbort = () => ctrl.abort("caller-aborted");
  params.signal?.addEventListener("abort", onCallerAbort);

  const t0 = performance.now();
  try {
    const provider = getLocalProvider(params.apiType);
    const models = await provider.listModels({
      baseUrl,
      signal: ctrl.signal,
    });
    const latencyMs = Math.round(performance.now() - t0);

    if (!params.model.trim()) {
      return {
        status: models.length > 0 ? "online" : "unknown_model",
        latencyMs,
        models,
        message:
          models.length > 0
            ? `Reachable. ${models.length} model(s) available — pick one.`
            : `Reachable, but no models listed.`,
      };
    }

    if (models.length === 0) {
      return {
        status: "unknown_model",
        latencyMs,
        models,
        message:
          "Reachable, but the server didn't advertise a model list. Translation will still attempt to run.",
      };
    }

    const wanted = params.model.trim();
    const present = models.some(
      (m) => m === wanted || m.toLowerCase() === wanted.toLowerCase(),
    );
    if (present) {
      return {
        status: "online",
        latencyMs,
        models,
        message: `Reachable. Model "${wanted}" is loaded.`,
      };
    }
    return {
      status: "model_missing",
      latencyMs,
      models,
      message: `Reachable, but "${wanted}" isn't in the model list.`,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    if (ctrl.signal.aborted && ctrl.signal.reason === "timeout") {
      return {
        status: "timeout",
        latencyMs,
        models: [],
        message: `No response after ${timeoutMs}ms.`,
      };
    }
    if (err instanceof ProviderError) {
      // listModels throws server errors when the endpoint is missing — surface
      // those as "unknown_model" rather than "offline" so the user knows the
      // host is reachable but the model-list endpoint isn't there.
      if (err.detail.kind === "server") {
        return {
          status: "unknown_model",
          latencyMs,
          models: [],
          message: `Reachable, but model list unavailable: ${err.detail.message}`,
        };
      }
      return {
        status: "offline",
        latencyMs,
        models: [],
        message: err.detail.message,
      };
    }
    return {
      status: "offline",
      latencyMs,
      models: [],
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener("abort", onCallerAbort);
  }
}
