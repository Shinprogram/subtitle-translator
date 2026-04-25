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
import type { GeminiModel } from "@/lib/gemini";
import type { TranslatedFontKey } from "@/lib/fonts";
import { isLanguageKey, type LanguageKey } from "@/lib/languages";

export type TranslatorStatus =
  | "idle"
  | "running"
  | "paused"
  | "done"
  | "error";

export type Settings = {
  apiKey: string;
  model: GeminiModel;
  mode: TranslationMode;
  userPrompt: string;
  chunkSize: number;
  delayMs: number;
  maxRetries: number;
  fileName: string;
  translatedFont: TranslatedFontKey;
  targetLanguage: LanguageKey;
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
  model: "gemini-2.5-flash",
  mode: "auto",
  userPrompt: DEFAULT_USER_PROMPT,
  chunkSize: 40,
  delayMs: 3000,
  maxRetries: 2,
  fileName: "",
  translatedFont: "inter",
  targetLanguage: "vi",
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
      version: 3,
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
