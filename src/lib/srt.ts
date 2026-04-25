// SRT parser and serializer.
// Handles multi-line subtitles, stray blank lines, BOM, CRLF, and malformed blocks.

export type SubtitleEntry = {
  index: number;
  start: string;
  end: string;
  text: string;
  translated: string;
};

const TIME_RE =
  /^(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/;

function normalizeTimecode(tc: string): string {
  // Always use comma as separator per SRT spec.
  return tc.replace(".", ",");
}

export function parseSrt(input: string): SubtitleEntry[] {
  if (!input) return [];
  // Strip BOM and normalize line endings.
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const entries: SubtitleEntry[] = [];
  let i = 0;
  let fallbackIndex = 1;

  while (i < lines.length) {
    // Skip blank separator lines between blocks.
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) break;

    // Block start. The first line is either an integer index or a timecode.
    const indexLine = lines[i];
    let timeLine: string | undefined;
    let parsedIndex: number | null = null;

    const maybeIndex = indexLine.trim();
    if (/^\d+$/.test(maybeIndex) && i + 1 < lines.length) {
      parsedIndex = parseInt(maybeIndex, 10);
      timeLine = lines[i + 1];
      i += 2;
    } else {
      // Index missing — try to treat current line as a timecode.
      timeLine = indexLine;
      i += 1;
    }

    if (!timeLine) {
      // Malformed tail — bail out gracefully.
      break;
    }

    const m = timeLine.trim().match(TIME_RE);
    if (!m) {
      // Malformed block: skip until next blank line to resync.
      while (i < lines.length && lines[i].trim() !== "") i++;
      continue;
    }

    const start = normalizeTimecode(m[1]);
    const end = normalizeTimecode(m[2]);

    // Collect text lines until the next blank line.
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }

    entries.push({
      index: parsedIndex ?? fallbackIndex,
      start,
      end,
      text: textLines.join("\n"),
      translated: "",
    });
    fallbackIndex++;
  }

  // Re-index sequentially (SRT indices should be monotonic).
  return entries.map((e, idx) => ({ ...e, index: idx + 1 }));
}

export function serializeSrt(entries: SubtitleEntry[]): string {
  const blocks = entries.map((e, i) => {
    const text = (e.translated.trim() ? e.translated : e.text).replace(
      /\r\n?/g,
      "\n",
    );
    return `${i + 1}\n${e.start} --> ${e.end}\n${text}`;
  });
  // Trailing newline per common convention.
  return blocks.join("\n\n") + "\n";
}

/** Split subtitles into fixed-size chunks (preserves ordering). */
export function chunkSubtitles<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
