// Prompt templates and translation modes.

import type { LanguageKey } from "@/lib/languages";
import { LANGUAGE_HINTS, LANGUAGE_NAMES } from "@/lib/languages";

export type TranslationMode = "romance" | "xianxia" | "comedy" | "auto";

export const MODE_LABELS: Record<TranslationMode, string> = {
  romance: "Romance (ngôn tình)",
  xianxia: "Xianxia (tu tiên)",
  comedy: "Comedy (hài)",
  auto: "Auto (context-aware)",
};

// Genre flavor only — kept language-neutral so it composes with any target
// language. Per-language tone (politeness, pronouns, register) lives in
// LANGUAGE_HINTS.
export const MODE_HINTS: Record<TranslationMode, string> = {
  romance:
    "Genre: romance / ngôn tình. Keep the emotional, intimate register; " +
    "preserve emotional beats and pet names.",
  xianxia:
    "Genre: xianxia / cultivation. Preserve established cultivation terms " +
    "(Jindan/Kim Đan, Yuanying/Nguyên Anh, qi/linh khí, dantian/đan điền, " +
    "daoist/đạo hữu, senior/tiền bối, etc.) using the conventions of the " +
    "target language. Tone is classical / wuxia.",
  comedy:
    "Genre: comedy / slice-of-life. Keep the rhythm fast, preserve punchlines, " +
    "loosely localize idioms when needed to keep the joke working.",
  auto:
    "Auto-detect the genre from context and choose the most fitting register.",
};

// Language-neutral default user prompt. The actual target language is injected
// by buildSystemPrompt via the dedicated language directive line, so the user
// prompt no longer hardcodes "Vietnamese".
export const DEFAULT_USER_PROMPT =
  `Translate naturally and faithfully — preserve meaning over word-for-word literal mapping. ` +
  `Keep proper nouns (names, places, brands) intact in their original form when there is no widely-accepted localized form. ` +
  `Never merge or split lines — every input line must correspond to exactly one output line.`;

// Previous default user prompt (Vietnamese-locked). Kept here so we can
// migrate persisted state and replace it with the new neutral default.
export const LEGACY_VIETNAMESE_DEFAULT_USER_PROMPT =
  `Dịch phụ đề sau sang tiếng Việt tự nhiên, sát nghĩa, dễ đọc. ` +
  `Giữ nguyên danh xưng riêng, tên người, địa danh. ` +
  `Tuyệt đối KHÔNG gộp hay tách dòng — mỗi dòng input phải tương ứng chính xác một dòng output.`;

// Base system instruction enforces the contract:
// - explicit target language directive
// - line-by-line output
// - N lines in => N lines out
// - numeric markers preserved so we can re-align
export function buildSystemPrompt(params: {
  userPrompt: string;
  modeHint: string;
  lineCount: number;
  targetLanguage: LanguageKey;
}): string {
  const { userPrompt, modeHint, lineCount, targetLanguage } = params;
  const languageName = LANGUAGE_NAMES[targetLanguage];
  const languageHint = LANGUAGE_HINTS[targetLanguage];

  return [
    "You are a professional subtitle translator for film and TV.",
    `Translate the following subtitles into ${languageName}.`,
    `The output MUST be written entirely in ${languageName}; do not output any other language.`,
    "",
    userPrompt.trim(),
    modeHint.trim(),
    languageHint.trim(),
    "",
    "STRICT RULES:",
    `- Input contains exactly ${lineCount} lines, each prefixed with a marker of the form ###N### (N is the 1-based line number).`,
    `- Output MUST contain exactly ${lineCount} lines, each preserving its corresponding ###N### marker at the start of the line.`,
    "- Never merge, split, delete, add, or reorder lines.",
    "- Do not output any commentary, headings, code fences, or markdown — only the translated lines.",
    "- If a line is empty or non-translatable (e.g. a sound cue), still output the corresponding line; you may keep it as-is.",
  ].join("\n");
}

/** Prefix each subtitle line with a marker so we can re-align the response. */
export function markChunk(lines: string[]): string {
  return lines
    .map((l, i) => `###${i + 1}### ${l.replace(/\n/g, " ⏎ ")}`)
    .join("\n");
}

/** Parse response lines back into an array, tolerant of extra prose around them. */
export function parseMarkedResponse(
  response: string,
  expected: number,
): string[] {
  const text = response.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  const out: string[] = new Array(expected).fill("");
  const seen = new Set<number>();

  const re = /^\s*#{2,}\s*(\d+)\s*#{2,}\s*(.*)$/;
  for (const raw of lines) {
    const m = raw.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 1 || n > expected) continue;
    // Restore literal newlines we escaped as ⏎ on the way in.
    const value = m[2].replace(/\s*⏎\s*/g, "\n").trim();
    out[n - 1] = value;
    seen.add(n);
  }

  if (seen.size !== expected) {
    throw new Error(
      `Translation alignment failed: got ${seen.size}/${expected} marked lines`,
    );
  }
  return out;
}
