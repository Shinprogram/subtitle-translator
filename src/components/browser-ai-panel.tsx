"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CpuIcon,
  DownloadIcon,
  FileIcon,
  LoaderIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
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
  BrowserRuntimeError,
  formatBytes,
  generate as runtimeGenerate,
  getCurrentModel,
  loadModel,
  unloadModel,
} from "@/lib/ai/browser/runtime";
import {
  BROWSER_DEFAULTS,
  detectWebGpu,
  type BrowserDelegate,
  type BrowserLoadProgress,
  type BrowserModelMeta,
} from "@/lib/ai/browser/types";

type WebGpuState =
  | { kind: "checking" }
  | { kind: "supported" }
  | { kind: "unsupported"; reason: string };

const PHASE_LABEL: Record<BrowserLoadProgress["phase"], string> = {
  "reading-file": "Reading file",
  "initializing-wasm": "Initializing runtime",
  "loading-weights": "Loading weights",
  "warming-up": "Warming up",
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

export function BrowserAiPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const isRunning = useStore((s) => s.progress.status === "running");

  const [webgpu, setWebgpu] = useState<WebGpuState>({ kind: "checking" });
  const [modelMeta, setModelMeta] = useState<BrowserModelMeta | null>(
    () => getCurrentModel(),
  );
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<BrowserLoadProgress | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // One-shot WebGPU probe on mount. Doing it here rather than at module load
  // so SSR isn't affected and the probe is opt-in to this panel being shown.
  useEffect(() => {
    let cancelled = false;
    detectWebGpu().then((r) => {
      if (cancelled) return;
      setWebgpu(
        r.supported
          ? { kind: "supported" }
          : { kind: "unsupported", reason: r.reason ?? "WebGPU unavailable." },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".task")) {
        toast.error("Pick a .task file (MediaPipe LLM model).");
        return;
      }
      if (webgpu.kind !== "supported" && settings.browserDelegate === "GPU") {
        toast.error("WebGPU isn't available in this browser.", {
          description:
            webgpu.kind === "unsupported"
              ? webgpu.reason
              : "Wait for the WebGPU check to finish, or switch the delegate to CPU.",
        });
        return;
      }
      setLoading(true);
      setProgress(null);
      try {
        const meta = await loadModel({
          file,
          delegate: settings.browserDelegate,
          maxTokens: settings.browserMaxTokens,
          topK: settings.browserTopK,
          temperature: settings.browserTemperature,
          onProgress: (p) => setProgress(p),
        });
        setModelMeta(meta);
        setSettings({ browserModelFileName: meta.fileName });
        toast.success(`Model loaded: ${meta.fileName}`, {
          description: `${formatBytes(meta.byteLength)} · ${meta.delegate} · ${(
            meta.loadDurationMs / 1000
          ).toFixed(1)}s`,
        });
      } catch (e) {
        const msg =
          e instanceof BrowserRuntimeError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        toast.error("Failed to load model", { description: msg });
        setModelMeta(null);
      } finally {
        setLoading(false);
        setProgress(null);
      }
    },
    [
      settings.browserDelegate,
      settings.browserMaxTokens,
      settings.browserTopK,
      settings.browserTemperature,
      setSettings,
      webgpu,
    ],
  );

  const onPickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onUnload = useCallback(async () => {
    try {
      await unloadModel();
      setModelMeta(null);
      setSettings({ browserModelFileName: "" });
      toast.success("Model unloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [setSettings]);

  const onTestTranslation = useCallback(async () => {
    if (!modelMeta) return;
    setTesting(true);
    setTestResult(null);
    try {
      const text = await runtimeGenerate({
        prompt:
          'Translate the following English line to the target language. ' +
          'Respond with only the translation, no quotes, no labels:\n' +
          'Hello, world.',
        maxTokens: 64,
        topK: settings.browserTopK,
        temperature: settings.browserTemperature,
      });
      setTestResult(text.trim());
    } catch (e) {
      setTestResult(
        e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`,
      );
    } finally {
      setTesting(false);
    }
  }, [modelMeta, settings.browserTopK, settings.browserTemperature]);

  const sizeLabel = modelMeta ? formatBytes(modelMeta.byteLength) : "—";
  const lastFileName = settings.browserModelFileName;

  return (
    <div className="space-y-3">
      {webgpu.kind === "unsupported" && (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">WebGPU unavailable</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              {webgpu.reason} On Android / Termux use{" "}
              <strong>Local mode</strong> with Ollama instead.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Model file</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".task"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            // Reset the input so picking the same file twice still fires onChange.
            if (e.target) e.target.value = "";
            void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={onPickClick}
          disabled={loading || isRunning}
          className="w-full justify-start gap-2"
        >
          <FileIcon className="size-4" />
          {modelMeta
            ? "Replace model…"
            : lastFileName
              ? `Re-pick ${lastFileName}`
              : "Select .task file…"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Pick a MediaPipe-compatible <code>.task</code> LLM model (e.g.{" "}
          <a
            href="https://huggingface.co/litert-community"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            LiteRT Community on Hugging Face
          </a>
          ). Files stay on your device — nothing is uploaded.
        </p>
        {!modelMeta && lastFileName && (
          <p className="text-[11px] text-muted-foreground">
            Browsers can&apos;t persist file blobs across reload. Re-pick{" "}
            <code className="rounded bg-muted px-1">{lastFileName}</code> to
            continue where you left off.
          </p>
        )}
      </div>

      <ModelStatusRow
        loading={loading}
        progress={progress}
        modelMeta={modelMeta}
        sizeLabel={sizeLabel}
        lastFileName={lastFileName}
      />

      {modelMeta && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onTestTranslation}
            disabled={testing || isRunning}
            className="gap-2"
          >
            {testing ? (
              <>
                <LoaderIcon className="size-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <ZapIcon className="size-4" />
                Test
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onUnload}
            disabled={loading || testing || isRunning}
            className="gap-2"
          >
            <Trash2Icon className="size-4" />
            Unload
          </Button>
        </div>
      )}

      {testResult && (
        <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
          <p className="text-muted-foreground">Test response:</p>
          <p className="mt-1 whitespace-pre-wrap font-mono text-[11px]">
            {testResult}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="browser-delegate">Compute</Label>
        <Select
          value={settings.browserDelegate}
          onValueChange={(v) =>
            setSettings({ browserDelegate: v as BrowserDelegate })
          }
          disabled={loading || isRunning || !!modelMeta}
        >
          <SelectTrigger id="browser-delegate" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GPU">
              <span className="flex items-center gap-2">
                <ZapIcon className="size-3.5" />
                <span>GPU (WebGPU)</span>
              </span>
            </SelectItem>
            <SelectItem value="CPU">
              <span className="flex items-center gap-2">
                <CpuIcon className="size-3.5" />
                <span>CPU (slower)</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          GPU is much faster but needs WebGPU. Re-load the model after changing.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="browser-temp" className="text-xs">
            Temperature
          </Label>
          <NumberField
            id="browser-temp"
            value={settings.browserTemperature}
            min={0}
            max={2}
            step={0.05}
            onChange={(n) => setSettings({ browserTemperature: n })}
            disabled={loading || isRunning || !!modelMeta}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="browser-topk" className="text-xs">
            Top-K
          </Label>
          <NumberField
            id="browser-topk"
            value={settings.browserTopK}
            min={1}
            max={200}
            step={1}
            onChange={(n) => setSettings({ browserTopK: n })}
            disabled={loading || isRunning || !!modelMeta}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="browser-maxtok" className="text-xs">
            Max tokens
          </Label>
          <NumberField
            id="browser-maxtok"
            value={settings.browserMaxTokens}
            min={64}
            max={8192}
            step={64}
            onChange={(n) => setSettings({ browserMaxTokens: n })}
            disabled={loading || isRunning || !!modelMeta}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        All three are fixed once the model is loaded — MediaPipe bakes them
        into the inference graph at <code>createFromOptions()</code> time.
        Unload to change them.{" "}
        {modelMeta ? null : `Defaults: ${BROWSER_DEFAULTS.temperature} / ${BROWSER_DEFAULTS.topK} / ${BROWSER_DEFAULTS.maxTokens}.`}
      </p>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          <DownloadIcon className="mr-1 inline size-3" /> Where to find{" "}
          <code>.task</code> models
        </summary>
        <ul className="mt-1.5 space-y-1 pl-3 text-muted-foreground">
          <li>
            <a
              href="https://huggingface.co/litert-community"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              huggingface.co/litert-community
            </a>{" "}
            — Gemma 3n, Gemma 2 (2B / 9B), Phi-3.5
          </li>
          <li>
            Look for files ending in <code>-int4.task</code> or{" "}
            <code>-int8.task</code>. CPU and GPU variants are different files.
          </li>
        </ul>
      </details>
    </div>
  );
}

function ModelStatusRow({
  loading,
  progress,
  modelMeta,
  sizeLabel,
  lastFileName,
}: {
  loading: boolean;
  progress: BrowserLoadProgress | null;
  modelMeta: BrowserModelMeta | null;
  sizeLabel: string;
  lastFileName: string;
}) {
  let dotClass: string;
  let label: string;
  let detail: string;

  if (loading) {
    dotClass = "bg-amber-500 animate-pulse";
    const phase = progress ? PHASE_LABEL[progress.phase] : "Loading";
    label = phase;
    if (progress?.fraction != null) {
      label = `${phase} · ${Math.round(progress.fraction * 100)}%`;
    }
    detail = progress?.detail ?? "Working…";
  } else if (modelMeta) {
    dotClass = "bg-emerald-500";
    label = "Ready";
    detail = `${modelMeta.fileName} · ${sizeLabel} · ${modelMeta.delegate} · loaded in ${(
      modelMeta.loadDurationMs / 1000
    ).toFixed(1)}s`;
  } else if (lastFileName) {
    dotClass = "bg-red-500";
    label = "No model loaded";
    detail = `Re-pick ${lastFileName} to continue.`;
  } else {
    dotClass = "bg-red-500";
    label = "No model loaded";
    detail = "Pick a .task file to start.";
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center gap-2">
        {loading ? (
          <LoaderIcon className="size-3.5 animate-spin text-amber-600 dark:text-amber-400" />
        ) : (
          <span
            aria-hidden
            className={`inline-block size-2.5 rounded-full ${dotClass}`}
          />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <p className="mt-1 break-all text-muted-foreground">{detail}</p>
    </div>
  );
}
