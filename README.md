# Subtitle Translator

Translate `.srt` subtitle files into any of five languages (English,
Vietnamese, Chinese Simplified, Japanese, Korean) using either:

- **Cloud AI** — Google Gemini and Gemma served by Google AI Studio, **or**
- **Local AI** — any local server you run yourself (Ollama, llama.cpp,
  LM Studio, KoboldCpp, vLLM, oobabooga, …) via direct browser → localhost
  calls.

Built with **Next.js (App Router)**, **Tailwind CSS v4**, **shadcn/ui**, and
**Zustand**.

## Highlights

- 🔌 **Two connection modes** — toggle Cloud / Local in the sidebar. Local
  mode bypasses this app's server entirely; the browser talks directly to
  your local AI URL.
- 🔐 **Client-side credentials** — Gemini API keys live only in
  `localStorage` and are sent per-request. They are never stored on the
  server or written to the build.
- 🧩 **Modular providers** — adding a new local API shape is one new file
  under `src/lib/ai/local/`.
- 🧪 **Test connection** — pings your local server, lists advertised models,
  and reports latency so you can see 🟢 Connected / 🟡 Reachable / 🔴 Offline
  before pressing Start.
- 📄 **SRT parser** — handles multi-line blocks, blank lines, BOM, CRLF, and
  malformed entries without crashing.
- 🧩 **Batch translation** — configurable chunk size (default 40 lines) and
  inter-request delay (default 3s). Supports **Pause / Resume / Retry failed**.
- 🎭 **Translation modes** — Romance (ngôn tình), Xianxia (tu tiên), Comedy
  (hài), or Auto. Fully customizable base prompt.
- ✂️ **Alignment enforced** — each line is tagged with `###N###` markers so
  the model's response is re-aligned; we refuse any response whose line count
  doesn't match the input.
- ✍️ **Editable table** — inline edit any translated line; changes persist in
  state and are preserved on export.
- 💾 **Export** — download the translated `.srt` with original timestamps and
  indices preserved.
- 🌓 **Dark mode**, drag-and-drop upload, and responsive 2-column layout.
- ♻️ **Resumable** — progress and subtitles are persisted to `localStorage`.

## Quick start

```bash
git clone https://github.com/Shinprogram/subtitle-translator.git
cd subtitle-translator
npm install
npm run dev
```

Open <http://localhost:3000>, upload an `.srt`, configure either Cloud or
Local mode, and click **Start translation**.

## Cloud mode

1. Pick **Cloud** in the sidebar.
2. Paste your Gemini API key (get one at
   <https://aistudio.google.com/apikey>).
3. Pick a model from the dropdown — Gemini 2.5 Pro / Flash, Gemini 1.5 Pro /
   Flash, Gemma 3n E2B, or Gemma 3n E4B.
4. (Optional) Enable failover to retry once with a sibling model on non-auth
   failures.

The browser POSTs to `/api/translate`, which forwards the request to Google
AI Studio. The key is sent in the `x-goog-api-key` header and is never logged
or persisted server-side.

## Local mode (no API keys, runs offline)

Pick **Local** in the sidebar. You'll see four fields:

| Field           | What it is                                          |
|-----------------|-----------------------------------------------------|
| Local API URL   | Where your local AI server is listening             |
| API type        | Which wire shape the server speaks                  |
| Model name      | Free-form — must match what the server reports      |
| Temperature / Max tokens | Sampling settings (max tokens 0 = no cap)   |

**Model names are not hardcoded.** Type whatever your local server
advertises, or click **Test connection** to fetch the list and pick from it.

### Supported wire formats

#### Ollama (`POST /api/generate`)

Default URL: `http://localhost:11434`. The browser POSTs:

```json
{
  "model": "gemma3:4b",
  "system": "<built system prompt>",
  "prompt": "###1### …",
  "stream": false,
  "options": { "temperature": 0.3 }
}
```

`Test connection` calls `GET /api/tags` to list models.

#### OpenAI-compatible (`POST /v1/chat/completions`)

Use this for **llama.cpp `server`**, **LM Studio**, **KoboldCpp**, **vLLM**,
**oobabooga's openai extension**, and any other server that implements the
OpenAI shape:

```json
{
  "model": "your-model-id",
  "messages": [
    { "role": "system", "content": "<system prompt>" },
    { "role": "user", "content": "###1### …" }
  ],
  "temperature": 0.3,
  "stream": false
}
```

`Test connection` calls `GET /v1/models`.

### CORS — required for browser → localhost

Local AI servers usually don't allow browser origins by default. Pick the
recipe for your runner:

| Runner           | How to allow `http://localhost:3000`                                                |
|------------------|--------------------------------------------------------------------------------------|
| **Ollama**       | `OLLAMA_ORIGINS="*" ollama serve` (or set the env var system-wide)                   |
| **llama.cpp**    | Pass `--host 0.0.0.0` and `--cors` to `server`                                       |
| **LM Studio**    | Settings → Developer → "Enable CORS" toggle                                          |
| **KoboldCpp**    | `--corsallow` flag                                                                   |
| **vLLM**         | `--allow-credentials --allowed-origins "*"` to `vllm serve`                          |
| **oobabooga**    | Add `--api-cors` (or set the OpenAI-extension CORS option in `settings.yaml`)        |

If `Test connection` reports `Offline` with a "Could not reach …" message,
CORS is the most likely cause — open your browser's devtools network tab to
confirm.

### Run on Android / Termux

Both this app **and** your local AI can run inside Termux on Android:

```bash
# 1. Install runtime
pkg install nodejs git

# 2. Clone + install + run the app
git clone https://github.com/Shinprogram/subtitle-translator.git
cd subtitle-translator
npm install
npm run dev          # served at http://localhost:3000

# 3. In a second Termux session, run a local AI (e.g. ollama via proot,
#    or llama.cpp built from source). Whatever URL it listens on, paste
#    that into the sidebar's "Local API URL" field.
```

Tips:

- Termux Chrome can hit `http://localhost:3000` directly — no port-forwarding
  needed.
- If you run the AI server in a separate proot/distro, use that distro's
  loopback address (often still `127.0.0.1` since proot shares the host
  network).
- Lower `Max tokens` and increase `Delay (ms)` if your phone thermal-throttles.

## Project layout

```
src/
├─ app/
│  ├─ api/translate/route.ts   # Cloud-only proxy (Gemini / Gemma)
│  ├─ layout.tsx               # Theme provider + toaster
│  └─ page.tsx                 # App shell (sidebar + main)
├─ components/
│  ├─ ui/                      # shadcn primitives
│  ├─ sidebar.tsx              # Connection toggle + cloud/local panels
│  ├─ local-ai-panel.tsx       # Local AI config + Test connection
│  ├─ file-upload.tsx          # Drag-and-drop SRT upload
│  ├─ subtitle-table.tsx       # Editable subtitle table
│  ├─ translation-controls.tsx # Start/Pause/Resume/Retry/Export + progress
│  ├─ theme-provider.tsx
│  └─ theme-toggle.tsx
├─ hooks/
│  └─ useTranslator.ts         # Batch translation controller
│                              # — dispatches to /api/translate (cloud)
│                              # — or directly to localhost (local)
├─ lib/
│  ├─ srt.ts                   # Parser / serializer / chunker
│  ├─ prompts.ts               # Mode hints + marker protocol
│  ├─ languages.ts             # Target language registry
│  ├─ fonts.ts                 # Translated-font registry
│  └─ ai/
│     ├─ types.ts              # Shared ProviderError shape
│     ├─ models.ts             # Cloud model registry
│     ├─ translate.ts          # Cloud router
│     ├─ providers/            # SERVER-side cloud providers
│     │  ├─ gemini.ts
│     │  ├─ gemma.ts
│     │  └─ google-shared.ts
│     └─ local/                # CLIENT-side local providers
│        ├─ types.ts
│        ├─ ollama.ts
│        ├─ openai.ts
│        ├─ dispatch.ts
│        └─ connection-test.ts
└─ store/
   └─ index.ts                 # Zustand store with persist()
```

## Security notes

- **Cloud:** the Gemini API key is never stored in source or environment
  variables. It is read from the browser on each request and forwarded to
  Google in the `x-goog-api-key` header. Rotate your key whenever you're done.
  `/api/translate` validates its input and never logs the key. The route is
  stateless — no database, no disk writes.
- **Local:** no credentials at all. The browser only talks to URLs you
  configure. Nothing is sent to this app's server when in Local mode.
- Subtitles, settings, and progress are stored in `localStorage` only.

## Deploy on Vercel

This is a standard Next.js App Router project with no required environment
variables. Import the repo into Vercel and deploy — no configuration needed.
Cloud mode works out of the box. Local mode obviously requires a local AI
server reachable from the browser; users can still point it at their own
`http://localhost:11434` even when the static UI is hosted on Vercel.
