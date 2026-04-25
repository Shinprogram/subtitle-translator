# Testing the Subtitle Translator app

## Run the dev server
```bash
PORT=3100 npm run dev
```
Default port 3000 may collide; prefer 3100. App lives at http://localhost:3100.

## Devin Secrets Needed
- (Optional) `GEMINI_API_KEY` — only required when testing the live translation flow. The app itself never reads env vars; the key is pasted into the UI.

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

## Capture `/api/translate` request bodies (assertion-grade)
Devtools-free way to assert the frontend forwards the right `mode`, `model`, `chunk` etc.:
```js
window.__capturedRequests = [];
const _f = window.fetch;
window.fetch = async function(...a) {
  if (typeof a[0] === 'string' && a[0].includes('/api/translate')) {
    const b = JSON.parse(a[1].body);
    window.__capturedRequests.push({ mode: b.mode, model: b.model, lineCount: (b.lines||[]).length, lines: b.lines });
  }
  return _f.apply(this, a);
};
```
Then click `Start translation` and read `window.__capturedRequests`.

## Invalid-key error path (no real key required)
Paste any 10+ char string starting with `AIza`. Frontend guard passes; `/api/translate` forwards to Gemini and gets a real `API key not valid` 400/401. Useful for proving the wiring without burning quota.

## Downloads
Chrome on this VM writes to `~/Downloads/`. Export filename is `<basename>.translated.srt`.

## State persistence
Zustand persist key is `subtitle-translator/v1` in localStorage. To reset between tests: click the sidebar's `Clear subtitles & progress` or `localStorage.removeItem('subtitle-translator/v1')` then reload.

## Next.js version note
Repo is on Next.js 16 (App Router). APIs differ from older versions — check `node_modules/next/dist/docs/` before assuming a feature works the way it does in 14/15.
