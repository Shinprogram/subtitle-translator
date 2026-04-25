"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, KeyIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/store";
import { MODE_LABELS, type TranslationMode } from "@/lib/prompts";
import type { GeminiModel } from "@/lib/gemini";
import {
  TRANSLATED_FONTS,
  getTranslatedFontVar,
  type TranslatedFontKey,
} from "@/lib/fonts";
import { LANGUAGES, type LanguageKey } from "@/lib/languages";

const MODELS: { value: GeminiModel; label: string }[] = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, recommended)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (higher quality)" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
];

function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={Number.isFinite(value) ? value : min}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) {
          onChange(Math.min(max, Math.max(min, n)));
        }
      }}
    />
  );
}

export function Sidebar() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setApiKey = useStore((s) => s.setApiKey);
  const resetAll = useStore((s) => s.resetAll);
  const status = useStore((s) => s.progress.status);
  const hasTranslations = useStore((s) =>
    s.subtitles.some((e) => e.translated && e.translated.length > 0),
  );
  const isRunning = status === "running";
  const [showKey, setShowKey] = useState(false);

  const handleLanguageChange = (next: LanguageKey) => {
    if (next === settings.targetLanguage) return;
    if (isRunning) {
      toast.error(
        "Cannot change target language while a translation is running",
      );
      return;
    }
    if (hasTranslations) {
      toast.warning(
        "Existing translations were produced for the previous language. " +
          "Use Retry / Start translation to retranslate them.",
      );
    }
    setSettings({ targetLanguage: next });
  };

  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Your API key never leaves your browser except when making a
          translation request.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-key" className="flex items-center gap-2">
          <KeyIcon className="size-4" /> Gemini API key
        </Label>
        <div className="flex gap-2">
          <Input
            id="api-key"
            type={showKey ? "text" : "password"}
            placeholder="AIza..."
            autoComplete="off"
            spellCheck={false}
            value={settings.apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={showKey ? "Hide API key" : "Show API key"}
            onClick={() => setShowKey((s) => !s)}
          >
            {showKey ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Get one at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Google AI Studio
          </a>
          . Stored only in browser localStorage.
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Select
          value={settings.model}
          onValueChange={(v) => setSettings({ model: v as GeminiModel })}
        >
          <SelectTrigger id="model" className="w-full">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target-language">Target language</Label>
        <Select
          value={settings.targetLanguage}
          onValueChange={(v) => handleLanguageChange(v as LanguageKey)}
          disabled={isRunning}
        >
          <SelectTrigger id="target-language" className="w-full">
            <SelectValue placeholder="Select target language" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                <span className="mr-2" aria-hidden>
                  {l.flag}
                </span>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {isRunning
            ? "Locked while a translation is running."
            : "All future chunks will translate into this language."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mode">Translation mode</Label>
        <Select
          value={settings.mode}
          onValueChange={(v) => setSettings({ mode: v as TranslationMode })}
        >
          <SelectTrigger id="mode" className="w-full">
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABELS) as TranslationMode[]).map((k) => (
              <SelectItem key={k} value={k}>
                {MODE_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">Custom prompt</Label>
        <Textarea
          id="prompt"
          rows={5}
          value={settings.userPrompt}
          onChange={(e) => setSettings({ userPrompt: e.target.value })}
          placeholder="Tell the model how to translate..."
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="translated-font">Translated font</Label>
        <Select
          value={settings.translatedFont}
          onValueChange={(v) =>
            setSettings({ translatedFont: v as TranslatedFontKey })
          }
        >
          <SelectTrigger id="translated-font" className="w-full">
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent>
            {TRANSLATED_FONTS.map((f) => (
              <SelectItem
                key={f.value}
                value={f.value}
                style={{ fontFamily: f.cssVar }}
              >
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p
          className="text-xs text-muted-foreground"
          style={{ fontFamily: getTranslatedFontVar(settings.translatedFont) }}
        >
          Preview: Xin chào, hôm nay bạn thế nào?
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="chunk-size">Chunk size</Label>
          <NumberInput
            id="chunk-size"
            min={1}
            max={200}
            value={settings.chunkSize}
            onChange={(n) => setSettings({ chunkSize: n })}
          />
          <p className="text-xs text-muted-foreground">Lines per request</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delay">Delay (ms)</Label>
          <NumberInput
            id="delay"
            min={0}
            max={60000}
            step={500}
            value={settings.delayMs}
            onChange={(n) => setSettings({ delayMs: n })}
          />
          <p className="text-xs text-muted-foreground">Between chunks</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="retries">Max retries per chunk</Label>
        <NumberInput
          id="retries"
          min={0}
          max={5}
          value={settings.maxRetries}
          onChange={(n) => setSettings({ maxRetries: n })}
        />
      </div>

      <Separator />

      <Button
        variant="destructive"
        type="button"
        onClick={() => {
          resetAll();
          toast.success("Cleared subtitles and progress");
        }}
        className="gap-2"
      >
        <Trash2Icon className="size-4" />
        Clear subtitles & progress
      </Button>
    </aside>
  );
}
