# Testing the Subtitle Translator app

## Run the dev server
```bash
PORT=3100 npm run dev
```
Default port 3000 may collide; prefer 3100. App lives at http://localhost:3100.

## Devin Secrets Needed
- (Optional) `GEMINI_API_KEY` — only required when testing the live cloud translation flow. The app itself never reads env vars; the key is pasted into the UI.
- No secrets are needed for Local-AI testing — the mock server pattern below replaces a real Ollama install.

## File drop without an OS picker
The drop zone has a hidden `<input type="file">`. To exercise the parse path without invoking a native file dialog, drop a fixture into `public/` and dispatch a synthetic change event:
```js
const res = await fetch('/sample.srt');
const blob = await res.blob();
const file = new File([blob], 'sample.srt', { type: 'application/x-subrip' });
const input = document.querySelector('input[type="file"]');
const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```
Remove the fixture from `public/` after testing — it's served at runtime.

## Adversarial SRT fixture
A single fixture covers BOM, multi-line, dot-separator timecode, and a malformed block. A correct parser yields exactly 3 rows:
```
\ufeff1\n00:00:01,000 --> 00:00:04,000\nHello world\nThis is a multi-line subtitle\n\nthis-is-malformed\nstill malformed\n\n2\n00:00:05.000 --> 00:00:07,500\nDot separator becomes comma\n\n3\n00:00:08,000 --> 00:00:10,000\nFinal entry\n
```

## State persistence — IMPORTANT
Zustand persist key is **`subtitle-translator-v1`** (dash, not slash). Older versions of this skill had it wrong and tests failed silently. Confirm with:
```js
Object.keys(localStorage)
```
To reset between tests: click the sidebar's `Clear subtitles & progress` or `localStorage.removeItem('subtitle-translator-v1')` then reload.

## Capture `/api/translate` request bodies (assertion-grade) — Cloud mode
Devtools-free way to assert the frontend forwards the right `mode`, `model`, `chunk` etc.:
```js
window.__capturedRequests = [];
const _f = window.fetch;
window.fetch = async function(input, init) {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  const method = init?.method || (typeof input === 'object' && input.method) || 'GET';
  const body = init?.body || (typeof input === 'object' && input.body) || null;
  if (!url.includes('/__requests') && !url.includes('/__reset')) {
    window.__capturedRequests.push({ url, method, body: typeof body === 'string' ? body : null });
  }
  return _f.apply(this, arguments);
};
```
For Cloud mode, look for entries whose URL contains `/api/translate`. The body has fields like `model`, `mode`, `chunk`, `targetLanguage`, `enableFailover`, `failoverModel`.

## Invalid-key error path (no real key required)
Paste any 10+ char string starting with `AIza`. Frontend guard passes; `/api/translate` forwards to Gemini and gets a real `API key not valid` 400/401. Useful for proving the wiring without burning quota.

## Testing Local AI mode (PR #10+) — without a real Ollama install

The Local-AI path dispatches **directly from the browser to a localhost URL**, NOT through `/api/translate`. To prove this without installing Ollama / llama.cpp / LM Studio, run an Ollama-shaped Node mock server and point the app at it.

### Mock Ollama server
Write this to `/tmp/mock-ollama.js`:
```js
const http = require('http');
const PORT = Number(process.env.MOCK_PORT || 31100);
const MODELS = (process.env.MOCK_MODELS || 'mock-model:test').split(',');
const requests = [];
function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    requests.push({ method: req.method, url: req.url, body });
    if (req.method === 'GET' && req.url === '/__requests') return send(res, 200, requests);
    if (req.method === 'POST' && req.url === '/__reset') { requests.length = 0; return send(res, 200, { ok: true }); }
    if (req.method === 'GET' && req.url === '/api/tags') return send(res, 200, { models: MODELS.map(name => ({ name })) });
    if (req.method === 'POST' && req.url === '/api/generate') {
      let parsed; try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: 'bad json' }); }
      const reply = String(parsed.prompt || '').split('\n')
        .map(l => { const m = l.match(/^\s*###\s*(\d+)\s*###\s*(.*)$/); return m ? `###${m[1]}### TR(${m[2]})` : null; })
        .filter(Boolean).join('\n');
      return send(res, 200, { response: reply, done: true });
    }
    return send(res, 404, { error: 'not found' });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`mock-ollama on :${PORT}`));
```
Start with `node /tmp/mock-ollama.js > /tmp/mock-ollama.log 2>&1 &`. Health check via `curl http://127.0.0.1:31100/api/tags`.

Key behavior: the mock's `/api/generate` echoes back `###N### TR(line)` for every marker-tagged line in the prompt, so `parseMarkedResponse` can align and the table will fill with `TR(...)` values — easy visual assertion.

Diagnostic endpoints:
- `GET /__requests` — every request the mock has seen (independent of the in-browser fetch shim).
- `POST /__reset` — clear the request log between tests. Call via `XMLHttpRequest` (sync) or `fetch` from a context that bypasses the shim, otherwise it pollutes `window.__capturedRequests`.

### Asserting direct dispatch (load-bearing)
With the same fetch shim, after **Start translation** in Local mode:
```js
({
  hasApiTranslate: window.__capturedRequests.some(r => /\/api\/translate/.test(r.url)),  // must be FALSE
  hasMockGenerate: window.__capturedRequests.some(r => r.url === 'http://127.0.0.1:31100/api/generate'),  // must be TRUE
})
```
For the captured Ollama body, check: `model`, `system` starts with `"You are a professional subtitle translator"`, `prompt` contains both `###1###` and `###2###`, `stream === false`, `options.temperature` is a number.

### Test Connection sad paths
- 🔴 Offline: URL `http://127.0.0.1:1` (port 1 always refuses).
- 🟡 Model not loaded: real mock URL but a model name that isn't in `MOCK_MODELS`.

## Persist migration testing
When the persist `version` bumps (e.g. v4 → v5 in PR #10), test the migration directly:
```js
const v4 = { state: { settings: { /* full v4 settings */ }, subtitles: [], progress: { status: 'idle', currentChunk: 0, totalChunks: 0, failedChunks: [], lastError: null } }, version: 4 };
localStorage.setItem('subtitle-translator-v1', JSON.stringify(v4));
// then F5
// then read back:
JSON.parse(localStorage.getItem('subtitle-translator-v1'))
```
Assert `version` advanced, all old fields preserved exactly (no value drift), new fields backfilled with the defaults declared by the migration. Also do a smoke check on UI: every v(n-1) field should still show its seeded value in the sidebar.

## Downloads
Chrome on this VM writes to `~/Downloads/`. Export filename is `<basename>.translated.srt`.

## Recording note
The `record_start` / `record_stop` actions used to live on `computer(action=...)`. They appear to have moved to top-level tools (`recording_start` / `recording_stop` / `annotate_recording`) but those are not present in the current tool list either, so browser-based UI testing has to fall back to screenshots + captured request bodies for evidence. Reach out to the user / check the latest tool docs if you need video.

## Next.js version note
Repo is on Next.js 16 (App Router). APIs differ from older versions — check `node_modules/next/dist/docs/` before assuming a feature works the way it does in 14/15.
