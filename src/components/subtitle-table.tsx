"use client";

import { memo, useMemo, useState } from "react";
import { useStore } from "@/store";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ORIGINAL_FONT_VAR,
  getTranslatedFontVar,
  type TranslatedFontKey,
} from "@/lib/fonts";
import { cn } from "@/lib/utils";

type RowProps = {
  index: number;
  original: string;
  translated: string;
  start: string;
  end: string;
  fontKey: TranslatedFontKey;
  onChange: (index: number, value: string) => void;
};

const SubtitleCard = memo(function SubtitleCard({
  index,
  original,
  translated,
  start,
  end,
  fontKey,
  onChange,
}: RowProps) {
  const translatedFontFamily = getTranslatedFontVar(fontKey);

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md md:p-4",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono font-medium text-foreground/80">
          #{index}
        </span>
        <span className="font-mono">
          {start} → {end}
        </span>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Original
          </p>
          <p
            className="whitespace-pre-wrap text-sm text-muted-foreground"
            style={{ fontFamily: ORIGINAL_FONT_VAR }}
          >
            {original}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Translated
          </p>
          <Textarea
            value={translated}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder="—"
            rows={Math.max(2, translated.split("\n").length)}
            className="min-h-16 resize-y text-base leading-relaxed text-foreground"
            style={{ fontFamily: translatedFontFamily }}
          />
        </div>
      </div>
    </article>
  );
});

export function SubtitleTable() {
  const subtitles = useStore((s) => s.subtitles);
  const updateTranslated = useStore((s) => s.updateTranslated);
  const translatedFont = useStore((s) => s.settings.translatedFont);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return subtitles;
    const q = query.toLowerCase();
    return subtitles.filter(
      (s) =>
        s.text.toLowerCase().includes(q) ||
        s.translated.toLowerCase().includes(q),
    );
  }, [subtitles, query]);

  const translatedCount = useMemo(
    () => subtitles.filter((s) => s.translated.trim().length > 0).length,
    [subtitles],
  );

  if (subtitles.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Upload an .srt file to get started.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{subtitles.length} lines</Badge>
          <Badge variant="outline">{translatedCount} translated</Badge>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search original or translation..."
          className="max-w-xs"
        />
      </div>
      <div
        className="min-h-0 flex-1 space-y-3 overflow-auto pr-1"
        data-testid="subtitle-list"
      >
        {filtered.map((s) => (
          <SubtitleCard
            key={s.index}
            index={s.index}
            original={s.text}
            translated={s.translated}
            start={s.start}
            end={s.end}
            fontKey={translatedFont}
            onChange={updateTranslated}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No rows match your search.
          </div>
        ) : null}
      </div>
    </div>
  );
}
