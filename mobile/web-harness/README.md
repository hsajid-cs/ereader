# Web test harness

Renders the real app in Chromium (via React Native Web) against a real backend, to check layout
and flows that unit tests cannot: pagination fill, figure pages, highlights, the stats chart.

Native-only modules are replaced by shims in `shims/` **only** when `EREADER_WEB_HARNESS=1` (see
`../metro.config.js`); normal builds are unaffected. Known gaps in the browser: React Native Web's
`Text` has no `onLongPress` (word selection is covered by the jest UI tests instead), and the
Skia drawing layer and PDF WebView are stubbed.

```bash
# 1. backend running, e.g. on :4001 (see the root README)
# 2. build and serve the web bundle
EREADER_WEB_HARNESS=1 EXPO_PUBLIC_API_URL=http://localhost:4001 npx expo export --platform web --output-dir /tmp/webdist
(cd /tmp/webdist && python3 -m http.server 8099 &)
# 3. seed a user with an EPUB (cover, image page, highlights, note, bookmark, a reading session)
npm i --no-save playwright-core jszip
node web-harness/seed.mjs                 # prints {"email": ...}
# 4. drive the UI and write screenshots
EMAIL=<email from step 3> OUT=/tmp/shots CHROMIUM=/path/to/chrome node web-harness/drive.mjs
```

Page-fit check: `EMAIL=<email> CHROMIUM=/path/to/chrome node web-harness/fit.mjs` opens the book under 16 combinations of
font size, line spacing, margins and serif/sans, flips through every page and prints how far text extends past the
page limit (`worstOverflowPx`, negative means it fits). It guards the line-based paginator against regressions.
