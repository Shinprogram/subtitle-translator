"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloudIcon, FileTextIcon } from "lucide-react";
import { toast } from "sonner";
import { parseSrt } from "@/lib/srt";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";

export function FileUpload() {
  const setSubtitles = useStore((s) => s.setSubtitles);
  const fileName = useStore((s) => s.settings.fileName);
  const subtitleCount = useStore((s) => s.subtitles.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.srt$/i.test(file.name)) {
        toast.error("Unsupported file", {
          description: "Please upload an .srt file.",
        });
        return;
      }
      try {
        const text = await file.text();
        const entries = parseSrt(text);
        if (entries.length === 0) {
          toast.error("Empty subtitle file", {
            description: "No valid subtitle blocks were found.",
          });
          return;
        }
        setSubtitles(entries, file.name);
        toast.success(`Loaded ${entries.length} subtitle entries`, {
          description: file.name,
        });
      } catch (e) {
        toast.error("Failed to parse SRT file", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [setSubtitles],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-muted/30"
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".srt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {subtitleCount > 0 ? (
        <div className="flex flex-col items-center gap-3">
          <FileTextIcon className="size-8 text-primary" />
          <div>
            <p className="font-medium">{fileName || "Subtitle loaded"}</p>
            <p className="text-sm text-muted-foreground">
              {subtitleCount} entries — click or drop another file to replace
            </p>
          </div>
          <Button variant="outline" size="sm" type="button">
            Replace file
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <UploadCloudIcon className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Drop .srt file here, or click to browse</p>
            <p className="text-sm text-muted-foreground">
              Files are parsed entirely in your browser.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
