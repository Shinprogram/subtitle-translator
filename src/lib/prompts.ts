// Prompt templates and translation modes.

export type TranslationMode = "romance" | "xianxia" | "comedy" | "auto";

export const MODE_LABELS: Record<TranslationMode, string> = {
  romance: "Romance (ngôn tình)",
  xianxia: "Xianxia (tu tiên)",
  comedy: "Comedy (hài)",
  auto: "Auto (context-aware)",
};

export const MODE_HINTS: Record<TranslationMode, string> = {
  romance:
    "Thể loại ngôn tình / lãng mạn. Giữ giọng văn tình cảm, bay bổng, dùng đại từ xưng hô phù hợp (chàng/nàng, anh/em).",
  xianxia:
    "Thể loại tu tiên / huyền huyễn. Giữ nguyên các thuật ngữ tu luyện đã phổ biến (Kim Đan, Nguyên Anh, linh khí, đan điền, đạo hữu, tiền bối, v.v.), giọng văn cổ trang.",
  comedy:
    "Thể loại hài hước / đời thường. Giữ nhịp nhanh, giữ punchline, có thể Việt hoá thoáng để giữ tính hài.",
  auto: "Tự phát hiện ngữ cảnh và chọn giọng văn phù hợp nhất.",
};

export const DEFAULT_USER_PROMPT =
  `Dịch phụ đề sau sang tiếng Việt tự nhiên, sát nghĩa, dễ đọc. ` +
  `Giữ nguyên danh xưng riêng, tên người, địa danh. ` +
  `Tuyệt đối KHÔNG gộp hay tách dòng — mỗi dòng input phải tương ứng chính xác một dòng output.`;

// Base system instruction enforces the contract:
// - line-by-line output
// - N lines in => N lines out
// - numeric markers preserved so we can re-align
export function buildSystemPrompt(
  userPrompt: string,
  modeHint: string,
  lineCount: number,
): string {
  return [
    "Bạn là chuyên gia dịch phụ đề phim/truyện. Hướng dẫn:",
    userPrompt.trim(),
    modeHint.trim(),
    "",
    "QUY TẮC BẮT BUỘC:",
    `- Input có đúng ${lineCount} dòng, đánh dấu ###N### ở đầu mỗi dòng (N là số thứ tự).`,
    `- Output PHẢI có đúng ${lineCount} dòng, giữ nguyên marker ###N### ở đầu mỗi dòng tương ứng.`,
    "- TUYỆT ĐỐI không được gộp, tách, xóa, thêm dòng. Không đổi thứ tự.",
    "- Không thêm bất kỳ chú thích, tiêu đề, hay markdown nào ngoài các dòng dịch.",
    "- Nếu một dòng rỗng hoặc không cần dịch (ví dụ ký tự âm thanh), vẫn phải xuất dòng tương ứng, có thể giữ nguyên.",
  ].join("\n");
}

/** Prefix each subtitle line with a marker so we can re-align the response. */
export function markChunk(lines: string[]): string {
  return lines
    .map((l, i) => `###${i + 1}### ${l.replace(/\n/g, " ⏎ ")}`)
    .join("\n");
}

/** Parse response lines back into an array, tolerant of extra prose around them. */
export function parseMarkedResponse(
  response: string,
  expected: number,
): string[] {
  const text = response.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  const out: string[] = new Array(expected).fill("");
  const seen = new Set<number>();

  const re = /^\s*#{2,}\s*(\d+)\s*#{2,}\s*(.*)$/;
  for (const raw of lines) {
    const m = raw.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 1 || n > expected) continue;
    // Restore literal newlines we escaped as ⏎ on the way in.
    const value = m[2].replace(/\s*⏎\s*/g, "\n").trim();
    out[n - 1] = value;
    seen.add(n);
  }

  if (seen.size !== expected) {
    throw new Error(
      `Translation alignment failed: got ${seen.size}/${expected} marked lines`,
    );
  }
  return out;
}
