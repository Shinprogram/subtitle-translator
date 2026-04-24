# Subtitle Translator

Translate `.srt` subtitle files into Vietnamese (or any target language set in
the prompt) using **Google Gemini**. Built with **Next.js (App Router)**,
**Tailwind CSS v4**, **shadcn/ui**, and **Zustand**.

Key features:

- 🔐 **Client-side API key** — your Gemini API key lives only in `localStorage`
  and is sent per-request to the Next.js API route. It is never stored on the
  server or written to the build.
- 📄 **SRT parser** — handles multi-line blocks, blank lines, BOM, CRLF, and
  malformed entries without crashing.
- 🧩 **Batch translation** — configurable chunk size (default 40 lines) and
  inter-request delay (default 3s). Supports **Pause / Resume / Retry failed**.
- 🎭 **Translation modes** — Romance (ngôn tình), Xianxia (tu tiên), Comedy
  (hài), or Auto. Fully customizable base prompt.
- ✂️ **Alignment enforced** — each line is tagged with `###N###` markers so the
  model's response is re-aligned; we refuse any response whose line count
  doesn't match the input.
- ✍️ **Editable table** — inline edit any translated line; changes persist in
  state and are preserved on export.
- 💾 **Export** — download the translated `.srt` with original timestamps and
  indices preserved.
- 🌓 **Dark mode** and drag-and-drop upload.
- ♻️ **Resumable** — progress and subtitles are persisted to `localStorage`.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, paste your Gemini API key (get one at
<https://aistudio.google.com/apikey>), upload an `.srt`, and click **Start
translation**.

## Project layout

```
src/
├─ app/
│  ├─ api/translate/route.ts   # Server route — proxies Gemini
│  ├─ layout.tsx               # Theme provider + toaster
│  └─ page.tsx                 # App shell (sidebar + main)
├─ components/
│  ├─ ui/                      # shadcn primitives
│  ├─ sidebar.tsx              # API key, prompt, chunk/delay config
│  ├─ file-upload.tsx          # Drag-and-drop SRT upload
│  ├─ subtitle-table.tsx       # Editable subtitle table
│  ├─ translation-controls.tsx # Start/Pause/Resume/Retry/Export + progress
│  ├─ theme-provider.tsx
│  └─ theme-toggle.tsx
├─ hooks/
│  └─ useTranslator.ts         # Batch translation controller
├─ lib/
│  ├─ srt.ts                   # Parser / serializer / chunker
│  ├─ gemini.ts                # Typed Gemini REST wrapper
│  └─ prompts.ts               # Mode hints + marker protocol
└─ store/
   └─ index.ts                 # Zustand store with persist()
```

## Security notes

- The Gemini API key is **never** stored in source or environment variables. It
  is read from the browser on each request and forwarded to Gemini in the
  `x-goog-api-key` header. Rotate your key whenever you're done.
- `/api/translate` validates its input and never logs the key. The route is
  stateless — no database, no disk writes.
- Subtitles and progress are stored in `localStorage` only.

## Deploy on Vercel

This is a standard Next.js App Router project with no required environment
variables. Import the repo into Vercel and deploy — no configuration needed.
