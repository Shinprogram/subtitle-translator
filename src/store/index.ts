"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SubtitleEntry } from "@/lib/srt";
import {
  DEFAULT_USER_PROMPT,
  LEGACY_VIETNAMESE_DEFAULT_USER_PROMPT,
  type TranslationMode,
} from "@/lib/prompts";
import {
  DEFAULT_MODEL_ID,
  isModelId,
  type ModelId,
} from "@/lib/ai/translate";
import {
  LOCAL_DEFAULTS,
  type LocalApiType,
} from "@/lib/ai/local/types";
import type { TranslatedFontKey } from "@/lib/fonts";
import { isLanguageKey, type LanguageKey } from "@/lib/languages";

export type ConnectionMode = "cloud" | "local";

function isConnectionMode(v: unknown): v is ConnectionMode {
  return v === "cloud" || v === "local";
}

function isLocalApiType(v: unknown): v is LocalApiType {
  return v === "ollama" || v === "openai";
}

export type TranslatorStatus =
  | "idle"
  | "running"
  | "paused"
  | "done"
  | "error";

export type Settings = {
  apiKey: string;
  model: ModelId;
  mode: TranslationMode;
  userPrompt: string;
  chunkSize: number;
  delayMs: number;
  maxRetries: number;
  fileName: string;
  translatedFont: TranslatedFontKey;
  targetLanguage: LanguageKey;
  /**
   * If true, the server will retry once with a sibling model on the *other*
   * provider after the primary model exhausts its retries (non-auth errors
   * only). Off by default — failover changes the model that translates the
   * affected chunks, which the user should opt into.
   */
  enableFailover: boolean;
  /**
   * Cloud (Gemini/Gemma via /api/translate) vs Local (browser → localhost
   * AI server, no proxy). The five `local*` fields are only meaningful when
   * `connectionMode === "local"`.
   */
  connectionMode: ConnectionMode;
  localApiUrl: string;
  localApiType: LocalApiType;
  /** Free-form. No hardcoded list — must match what the local server reports. */
  localModelName: string;
  localTemperature: number;
  /** 0 (or non-positive) = no cap, let the server use its default. */
  localMaxTokens: number;
};

export type Progress = {
  status: TranslatorStatus;
  currentChunk: number; // 0-based index of next chunk to process
  totalChunks: number;
  failedChunks: number[];
  lastError: string | null;
};

type Store = {
  settings: Settings;
  subtitles: SubtitleEntry[];
  progress: Progress;

  setApiKey: (k: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  setSubtitles: (entries: SubtitleEntry[], fileName?: string) => void;
  updateTranslated: (index: number, value: string) => void;
  applyChunkTranslation: (startAt: number, translated: string[]) => void;
  setProgress: (p: Partial<Progress>) => void;
  resetProgress: () => void;
  resetAll: () => void;
};

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: DEFAULT_MODEL_ID,
  mode: "auto",
  userPrompt: DEFAULT_USER_PROMPT,
  chunkSize: 40,
  delayMs: 3000,
  maxRetries: 2,
  fileName: "",
  translatedFont: "inter",
  targetLanguage: "vi",
  enableFailover: false,
  connectionMode: "cloud",
  localApiUrl: LOCAL_DEFAULTS.apiUrl,
  localApiType: LOCAL_DEFAULTS.apiType,
  localModelName: LOCAL_DEFAULTS.modelName,
  localTemperature: LOCAL_DEFAULTS.temperature,
  localMaxTokens: LOCAL_DEFAULTS.maxTokens,
};

const DEFAULT_PROGRESS: Progress = {
  status: "idle",
  currentChunk: 0,
  totalChunks: 0,
  failedChunks: [],
  lastError: null,
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      subtitles: [],
      progress: DEFAULT_PROGRESS,

      setApiKey: (k) =>
        set((s) => ({ settings: { ...s.settings, apiKey: k } })),

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      setSubtitles: (entries, fileName) =>
        set((s) => ({
          subtitles: entries,
          settings: fileName
            ? { ...s.settings, fileName }
            : s.settings,
          progress: { ...DEFAULT_PROGRESS, totalChunks: 0 },
        })),

      updateTranslated: (index, value) =>
        set((s) => ({
          subtitles: s.subtitles.map((e) =>
            e.index === index ? { ...e, translated: value } : e,
          ),
        })),

      applyChunkTranslation: (startAt, translated) =>
        set((s) => {
          const next = s.subtitles.slice();
          for (let i = 0; i < translated.length; i++) {
            const idx = startAt + i;
            if (idx < next.length) {
              next[idx] = { ...next[idx], translated: translated[i] };
            }
          }
          return { subtitles: next };
        }),

      setProgress: (patch) =>
        set((s) => ({ progress: { ...s.progress, ...patch } })),

      resetProgress: () =>
        set((s) => ({
          progress: { ...DEFAULT_PROGRESS, totalChunks: s.progress.totalChunks },
        })),

      resetAll: () =>
        set((s) => ({
          subtitles: [],
          progress: DEFAULT_PROGRESS,
          settings: { ...s.settings, fileName: "" },
        })),
    }),
    {
      name: "subtitle-translator-v1",
      storage: createJSONStorage(() => localStorage),
      // Persist settings (including API key — per spec it stays client-side),
      // subtitles, and progress so users can resume.
      partialize: (s) => ({
        settings: s.settings,
        subtitles: s.subtitles,
        progress: s.progress,
      }),
      version: 5,
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        const p = persisted as { settings?: Partial<Settings> };
        if (!p.settings) return p;
        // v1 → v2: introduce translatedFont
        if (version < 2 && !("translatedFont" in p.settings)) {
          p.settings = { ...p.settings, translatedFont: "inter" };
        }
        // v2 → v3: introduce targetLanguage and replace the old
        // Vietnamese-locked default user prompt with the language-neutral one.
        if (version < 3) {
          if (
            !("targetLanguage" in p.settings) ||
            !isLanguageKey(p.settings.targetLanguage)
          ) {
            p.settings = { ...p.settings, targetLanguage: "vi" };
          }
          if (p.settings.userPrompt === LEGACY_VIETNAMESE_DEFAULT_USER_PROMPT) {
            p.settings = { ...p.settings, userPrompt: DEFAULT_USER_PROMPT };
          }
        }
        // v3 → v4: introduce enableFailover; coerce unknown model IDs back
        // to the default so users on a stale (now-removed) Gemini ID don't
        // hit a runtime validation error.
        if (version < 4) {
          if (!isModelId(p.settings.model)) {
            p.settings = { ...p.settings, model: DEFAULT_MODEL_ID };
          }
          if (typeof p.settings.enableFailover !== "boolean") {
            p.settings = { ...p.settings, enableFailover: false };
          }
        }
        // v4 → v5: introduce connectionMode + local-AI fields. Default to
        // "cloud" so existing users keep their previous behavior unchanged.
        if (version < 5) {
          if (!isConnectionMode(p.settings.connectionMode)) {
            p.settings = { ...p.settings, connectionMode: "cloud" };
          }
          if (typeof p.settings.localApiUrl !== "string") {
            p.settings = { ...p.settings, localApiUrl: LOCAL_DEFAULTS.apiUrl };
          }
          if (!isLocalApiType(p.settings.localApiType)) {
            p.settings = { ...p.settings, localApiType: LOCAL_DEFAULTS.apiType };
          }
          if (typeof p.settings.localModelName !== "string") {
            p.settings = {
              ...p.settings,
              localModelName: LOCAL_DEFAULTS.modelName,
            };
          }
          if (typeof p.settings.localTemperature !== "number") {
            p.settings = {
              ...p.settings,
              localTemperature: LOCAL_DEFAULTS.temperature,
            };
          }
          if (typeof p.settings.localMaxTokens !== "number") {
            p.settings = {
              ...p.settings,
              localMaxTokens: LOCAL_DEFAULTS.maxTokens,
            };
          }
        }
        return p;
      },
    },
  ),
);

/**
 * Hydration helper — returns true once Zustand has rehydrated from localStorage.
 * Uses `useSyncExternalStore` so the value stays SSR-safe (always `false` on
 * the server) and updates exactly when hydration completes.
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}
