"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import {
  PlayIcon,
  PauseIcon,
  RefreshCwIcon,
  DownloadIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { useStore } from "@/store";
import { useTranslator } from "@/hooks/useTranslator";
import { serializeSrt, chunkSubtitles } from "@/lib/srt";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export function TranslationControls() {
  const subtitles = useStore((s) => s.subtitles);
  const settings = useStore((s) => s.settings);
  const progress = useStore((s) => s.progress);
  const { start, pause, resume, retryFailed, isRunning, isPaused, hasFailures } =
    useTranslator();

  const totalChunks = useMemo(
    () => chunkSubtitles(subtitles, settings.chunkSize).length,
    [subtitles, settings.chunkSize],
  );
  const currentChunk = Math.min(progress.currentChunk, totalChunks);
  const percent = totalChunks === 0 ? 0 : Math.round((currentChunk / totalChunks) * 100);

  const exportSrt = () => {
    if (subtitles.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const content = serializeSrt(subtitles);
    const blob = new Blob([content], { type: "application/x-subrip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = (settings.fileName || "subtitles.srt").replace(/\.srt$/i, "");
    a.href = url;
    a.download = `${base}.translated.srt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported translated .srt");
  };

  const canStart = subtitles.length > 0 && !isRunning;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        {!isRunning && progress.status !== "paused" && (
          <Button onClick={start} disabled={!canStart} className="gap-2">
            <PlayIcon className="size-4" /> Start translation
          </Button>
        )}
        {isRunning && (
          <Button onClick={pause} variant="secondary" className="gap-2">
            <PauseIcon className="size-4" /> Pause
          </Button>
        )}
        {isPaused && (
          <Button onClick={resume} className="gap-2">
            <PlayIcon className="size-4" /> Resume
          </Button>
        )}
        {hasFailures && !isRunning && (
          <Button
            variant="outline"
            onClick={retryFailed}
            className="gap-2"
          >
            <RefreshCwIcon className="size-4" /> Retry failed (
            {progress.failedChunks.length})
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportSrt}
            disabled={subtitles.length === 0}
            className="gap-2"
          >
            <DownloadIcon className="size-4" /> Export .srt
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              Chunk {currentChunk} / {totalChunks}
            </span>
            <Badge variant="outline" className="capitalize">
              {progress.status}
            </Badge>
          </div>
          <span className="text-muted-foreground">{percent}%</span>
        </div>
        <Progress value={percent} />
        {progress.lastError && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            {progress.lastError}
          </p>
        )}
      </div>
    </div>
  );
}
