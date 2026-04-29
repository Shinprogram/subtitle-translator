"use client";

import { useState } from "react";
import {
  CloudIcon,
  EyeIcon,
  EyeOffIcon,
  HardDriveIcon,
  KeyIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LocalAiPanel } from "@/components/local-ai-panel";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useStore, type ConnectionMode } from "@/store";
import { MODE_LABELS, type TranslationMode } from "@/lib/prompts";
import {
  MODEL_REGISTRY,
  getModelDef,
  getFailoverModel,
  type ModelId,
  type ProviderId,
} from "@/lib/ai/translate";
import {
  TRANSLATED_FONTS,
  getTranslatedFontVar,
  type TranslatedFontKey,
} from "@/lib/fonts";
import { LANGUAGES, type LanguageKey } from "@/lib/languages";

const PROVIDER_GROUP_LABELS: Record<ProviderId, string> = {
  gemini: "Gemini (closed)",
  gemma: "Gemma (open weights)",
};

// Group the registry by provider, preserving registry order within each group.
const MODELS_BY_PROVIDER: Record<ProviderId, typeof MODEL_REGISTRY[number][]> =
  MODEL_REGISTRY.reduce(
    (acc, m) => {
      (acc[m.provider] ??= []).push(m);
      return acc;
    },
    {} as Record<ProviderId, typeof MODEL_REGISTRY[number][]>,
  );

const SPEED_BADGE_CLASS: Record<string, string> = {
  Fast: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Balanced: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "High Quality": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

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
  const resetAll = useStore((s) => s.resetAll);
  const status = useStore((s) => s.progress.status);
  const isRunning = status === "running";

  const isLocal = settings.connectionMode === "local";

  const handleConnectionModeChange = (next: ConnectionMode) => {
    if (next === settings.connectionMode) return;
    if (isRunning) {
      toast.error("Cannot change connection mode while a translation is running");
      return;
    }
    setSettings({ connectionMode: next });
  };

  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          {isLocal
            ? "Local mode: the browser talks to your localhost AI server directly."
            : "Cloud mode: your Gemini API key never leaves your browser except when making a translation request."}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Connection</Label>
        <ConnectionModeToggle
          mode={settings.connectionMode}
          onChange={handleConnectionModeChange}
          disabled={isRunning}
        />
        <p className="text-xs text-muted-foreground">
          {isLocal
            ? "Direct browser → localhost. No traffic to this app's server."
            : "Routes through this app's /api/translate (Gemini / Gemma)."}
        </p>
      </div>

      {isLocal ? <LocalAiPanel /> : <CloudCredentialsAndModel />}

      <Separator />

      <TranslationOptions />

      <Separator />

      <FontPanel />

      <Separator />

      <ChunkingPanel />

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

function ConnectionModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ConnectionMode;
  onChange: (next: ConnectionMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Connection mode"
      className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1"
    >
      <ConnectionModeButton
        mode="cloud"
        active={mode === "cloud"}
        onClick={() => onChange("cloud")}
        disabled={disabled}
        icon={<CloudIcon className="size-3.5" />}
        label="Cloud"
      />
      <ConnectionModeButton
        mode="local"
        active={mode === "local"}
        onClick={() => onChange("local")}
        disabled={disabled}
        icon={<HardDriveIcon className="size-3.5" />}
        label="Local"
      />
    </div>
  );
}

function ConnectionModeButton({
  mode,
  active,
  onClick,
  disabled,
  icon,
  label,
}: {
  mode: ConnectionMode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-mode={mode}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function CloudCredentialsAndModel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setApiKey = useStore((s) => s.setApiKey);
  const isRunning = useStore((s) => s.progress.status === "running");
  const [showKey, setShowKey] = useState(false);

  return (
    <>
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

      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Select
          value={settings.model}
          onValueChange={(v) => setSettings({ model: v as ModelId })}
          disabled={isRunning}
        >
          <SelectTrigger id="model" className="w-full">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODELS_BY_PROVIDER) as ProviderId[]).map((p) => (
              <SelectGroup key={p}>
                <SelectLabel>{PROVIDER_GROUP_LABELS[p]}</SelectLabel>
                {MODELS_BY_PROVIDER[p].map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span>{m.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SPEED_BADGE_CLASS[m.speedTier]}`}
                      >
                        {m.speedTier}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {getModelDef(settings.model).description}
        </p>
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="grid gap-0.5">
            <Label
              htmlFor="enable-failover"
              className="text-xs font-normal"
            >
              Enable failover
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {getFailoverModel(settings.model)
                ? `On non-auth failures, retry once with ${
                    getModelDef(getFailoverModel(settings.model)!).label
                  }.`
                : "No sibling model available for this selection."}
            </p>
          </div>
          <Switch
            id="enable-failover"
            checked={settings.enableFailover}
            disabled={isRunning || !getFailoverModel(settings.model)}
            onCheckedChange={(c) => setSettings({ enableFailover: c })}
          />
        </div>
      </div>
    </>
  );
}

function TranslationOptions() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const isRunning = useStore((s) => s.progress.status === "running");
  const hasTranslations = useStore((s) =>
    s.subtitles.some((e) => e.translated && e.translated.length > 0),
  );

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
    <>
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
    </>
  );
}

function FontPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  return (
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
  );
}

function ChunkingPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  return (
    <>
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
    </>
  );
}
