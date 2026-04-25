// Target-language registry. Selecting a target language drives the
// translation prompt's language directive and a per-language tone hint.

export type LanguageKey = "en" | "vi" | "zh" | "ja" | "ko";

export const LANGUAGE_NAMES: Record<LanguageKey, string> = {
  en: "English",
  vi: "Vietnamese",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
};

export const LANGUAGE_FLAGS: Record<LanguageKey, string> = {
  en: "🇬🇧",
  vi: "🇻🇳",
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
};

// Per-language tone / register guidance, applied on top of the genre mode hint.
export const LANGUAGE_HINTS: Record<LanguageKey, string> = {
  en: "Use fluent, concise spoken English. Match the rhythm of natural dialogue.",
  vi:
    "Dùng tiếng Việt tự nhiên, hội thoại, có cảm xúc khi cần. " +
    "Ưu tiên đại từ xưng hô phù hợp ngữ cảnh (anh/em, ông/bà, v.v.).",
  zh: "使用自然的简体中文口语对白，避免过度书面或正式的语气。",
  ja:
    "Use natural spoken Japanese suited to anime/drama dialogue. " +
    "Pick an appropriate politeness level (casual vs polite) per character and context; do not mix.",
  ko:
    "Use natural spoken Korean suited to drama dialogue. " +
    "Respect speech levels (반말 vs 존댓말) consistently per character and context.",
};

export const LANGUAGES: { value: LanguageKey; label: string; flag: string }[] =
  (Object.keys(LANGUAGE_NAMES) as LanguageKey[]).map((k) => ({
    value: k,
    label: LANGUAGE_NAMES[k],
    flag: LANGUAGE_FLAGS[k],
  }));

export function isLanguageKey(v: unknown): v is LanguageKey {
  return (
    v === "en" ||
    v === "vi" ||
    v === "zh" ||
    v === "ja" ||
    v === "ko"
  );
}
