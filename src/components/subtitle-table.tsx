"use client";

import { memo, useMemo, useState } from "react";
import { useStore } from "@/store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type RowProps = {
  index: number;
  original: string;
  translated: string;
  start: string;
  end: string;
  onChange: (index: number, value: string) => void;
};

const SubtitleRow = memo(function SubtitleRow({
  index,
  original,
  translated,
  start,
  end,
  onChange,
}: RowProps) {
  return (
    <TableRow>
      <TableCell className="align-top font-mono text-xs text-muted-foreground whitespace-nowrap">
        <div>#{index}</div>
        <div>{start}</div>
        <div>{end}</div>
      </TableCell>
      <TableCell className="align-top whitespace-pre-wrap text-sm">
        {original}
      </TableCell>
      <TableCell className="align-top">
        <Textarea
          value={translated}
          onChange={(e) => onChange(index, e.target.value)}
          placeholder="—"
          rows={Math.max(2, translated.split("\n").length)}
          className="min-h-16 resize-y text-sm"
        />
      </TableCell>
    </TableRow>
  );
});

export function SubtitleTable() {
  const subtitles = useStore((s) => s.subtitles);
  const updateTranslated = useStore((s) => s.updateTranslated);
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
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-32">Index / Time</TableHead>
              <TableHead className="w-1/2">Original</TableHead>
              <TableHead>Translated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <SubtitleRow
                key={s.index}
                index={s.index}
                original={s.text}
                translated={s.translated}
                start={s.start}
                end={s.end}
                onChange={updateTranslated}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
