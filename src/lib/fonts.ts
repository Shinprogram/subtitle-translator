import {
  Inter,
  Roboto,
  Open_Sans,
  Noto_Sans,
  Lora,
} from "next/font/google";

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const FONT_VARIABLES = [
  inter.variable,
  roboto.variable,
  openSans.variable,
  notoSans.variable,
  lora.variable,
].join(" ");

export type TranslatedFontKey =
  | "inter"
  | "roboto"
  | "open-sans"
  | "noto-sans"
  | "lora";

export const TRANSLATED_FONTS: {
  value: TranslatedFontKey;
  label: string;
  cssVar: string;
}[] = [
  { value: "inter", label: "Inter", cssVar: "var(--font-inter)" },
  { value: "roboto", label: "Roboto", cssVar: "var(--font-roboto)" },
  { value: "open-sans", label: "Open Sans", cssVar: "var(--font-open-sans)" },
  { value: "noto-sans", label: "Noto Sans", cssVar: "var(--font-noto-sans)" },
  { value: "lora", label: "Lora (serif, romantic feel)", cssVar: "var(--font-lora)" },
];

export function getTranslatedFontVar(key: TranslatedFontKey): string {
  return (
    TRANSLATED_FONTS.find((f) => f.value === key)?.cssVar ?? "var(--font-inter)"
  );
}

/** Original text always uses Inter for consistent readability. */
export const ORIGINAL_FONT_VAR = "var(--font-inter)";
