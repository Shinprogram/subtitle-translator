"use client";

import { useCallback, useState } from "react";
import { CheckCircle2Icon, CircleIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/store";
import {
  testConnection,
  type ConnectionResult,
  type ConnectionStatus,
} from "@/lib/ai/local/connection-test";
import { LOCAL_API_TYPES, type LocalApiType } from "@/lib/ai/local/types";

const STATUS_DOT: Record<ConnectionStatus, string> = {
  online: "bg-emerald-500",
  model_missing: "bg-amber-500",
  unknown_model: "bg-amber-500",
  timeout: "bg-amber-500",
  offline: "bg-red-500",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  online: "Connected",
  model_missing: "Model not loaded",
  unknown_model: "Reachable",
  timeout: "Timeout",
  offline: "Offline",
};

function NumberField({
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
      inputMode="decimal"
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

export function LocalAiPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const isRunning = useStore((s) => s.progress.status === "running");

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  const onTest = useCallback(async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await testConnection({
        apiType: settings.localApiType,
        apiUrl: settings.localApiUrl,
        model: settings.localModelName,
      });
      setResult(r);
    } finally {
      setTesting(false);
    }
  }, [settings.localApiType, settings.localApiUrl, settings.localModelName]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="local-api-url">Local API URL</Label>
        <Input
          id="local-api-url"
          type="url"
          placeholder="http://localhost:11434"
          autoComplete="off"
          spellCheck={false}
          value={settings.localApiUrl}
          onChange={(e) => setSettings({ localApiUrl: e.target.value })}
          disabled={isRunning}
        />
        <p className="text-xs text-muted-foreground">
          Where your local AI server is listening. The browser sends requests
          here directly — nothing routes through this app&apos;s server.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="local-api-type">API type</Label>
        <Select
          value={settings.localApiType}
          onValueChange={(v) => setSettings({ localApiType: v as LocalApiType })}
          disabled={isRunning}
        >
          <SelectTrigger id="local-api-type" className="w-full">
            <SelectValue placeholder="Select API type" />
          </SelectTrigger>
          <SelectContent>
            {LOCAL_API_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Use <strong>OpenAI-compatible</strong> for llama.cpp server, LM
          Studio, KoboldCpp, vLLM, oobabooga.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="local-model">Model name</Label>
        <Input
          id="local-model"
          type="text"
          placeholder={
            settings.localApiType === "ollama"
              ? "gemma3:4b"
              : "your-model-id"
          }
          autoComplete="off"
          spellCheck={false}
          value={settings.localModelName}
          onChange={(e) => setSettings({ localModelName: e.target.value })}
          disabled={isRunning}
        />
        <p className="text-xs text-muted-foreground">
          Free-form. Must match what your local server reports (use{" "}
          <em>Test connection</em> to fetch the list).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="local-temp">Temperature</Label>
          <NumberField
            id="local-temp"
            min={0}
            max={2}
            step={0.05}
            value={settings.localTemperature}
            onChange={(n) => setSettings({ localTemperature: n })}
            disabled={isRunning}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="local-max-tokens">Max tokens</Label>
          <NumberField
            id="local-max-tokens"
            min={0}
            max={32768}
            step={64}
            value={settings.localMaxTokens}
            onChange={(n) => setSettings({ localMaxTokens: n })}
            disabled={isRunning}
          />
          <p className="text-[11px] text-muted-foreground">0 = no cap</p>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={onTest}
          disabled={isRunning || testing}
          className="w-full gap-2"
        >
          {testing ? (
            <>
              <LoaderIcon className="size-4 animate-spin" />
              Testing connection...
            </>
          ) : (
            <>
              <CircleIcon className="size-4" />
              Test connection
            </>
          )}
        </Button>

        {result && <ConnectionResultRow result={result} />}
      </div>
    </div>
  );
}

function ConnectionResultRow({ result }: { result: ConnectionResult }) {
  const setSettings = useStore((s) => s.setSettings);
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`inline-block size-2.5 rounded-full ${STATUS_DOT[result.status]}`}
        />
        <span className="font-medium">{STATUS_LABEL[result.status]}</span>
        <span className="ml-auto text-muted-foreground">
          {result.latencyMs}ms
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{result.message}</p>
      {result.models.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {result.models.length} model(s) available
          </summary>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto pl-3">
            {result.models.map((m) => (
              <li key={m} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSettings({ localModelName: m })}
                  className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  title={`Use ${m}`}
                >
                  <CheckCircle2Icon className="size-3 shrink-0 opacity-50" />
                  {m}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
