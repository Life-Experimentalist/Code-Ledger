# CodeLedger — AMO Source Build Instructions

## What gets generated

Eight files in the extension are produced by a build step rather than written by
hand. Everything else ships exactly as it appears in `src/` — no bundler, no
transpiler, no minification of any file CodeLedger itself wrote.

| Generated file | Source input | Tool | Minified |
|---|---|---|---|
| `src/ui/styles/compiled.css` | `src/index.css` + Tailwind class scanning | `@tailwindcss/cli` | yes |
| `src/vendor/preact-bundle.js` | `preact`, `preact/hooks`, `htm` from npm | esbuild | yes |
| `src/vendor/preact.js` | `preact/dist/preact.module.js` | copied verbatim from npm | as published |
| `src/vendor/htm.js` | `htm/dist/htm.module.js` | copied verbatim from npm | as published |
| `src/vendor/vis-network-bundle.js` | `vis-network/standalone` from npm | esbuild | yes |
| `src/vendor/chart-bundle.js` | `chart.js/auto` from npm, via `src/vendor/chart-entry.js` | esbuild | no |
| `src/vendor/chart-source.js` | `chart.js/dist/chart.umd.min.js` | wrapped as a string constant | as published |
| `src/vendor/refresh-badges-source.js` | `src/core/gamification.js` + `src/core/badge-svg.js` | esbuild, wrapped as a string constant | no |

Every one of those files carries a header naming the script that wrote it and
the npm version it came from, so a reviewer can check any single file without
reading this document.

Two of them hold generated code as a **string** rather than as executable code,
because they are written into the user's own GitHub repository rather than run
inside the extension: `chart-source.js` is the chart library the GitHub Pages
report loads, and `refresh-badges-source.js` is a Node script that recomputes
badges in the user's GitHub Actions runner. Neither is evaluated by the
extension.

Nothing is fetched at runtime. The extension's CSP is `script-src 'self'`, and
there is no `eval()` or `new Function()` anywhere in `src/`, `src/vendor/`
included.

---

## Requirements

| Tool | Required version | Install |
|---|---|---|
| Node.js | ≥ 18.0.0 | https://nodejs.org |
| npm | ≥ 10.0.0 | bundled with Node.js |

Tested on: Windows 11, macOS 14, Ubuntu 22.04.

`esbuild` and `@tailwindcss/cli` are devDependencies — `npm install` is the only
setup step.

---

## Steps to reproduce the extension

```bash
# 1. Install dependencies (exact versions, from package-lock.json)
npm ci

# 2. Regenerate every generated file
npm run build:css              # → src/ui/styles/compiled.css
npm run vendor:preact          # → src/vendor/preact-bundle.js, preact.js, htm.js
npm run vendor:vis             # → src/vendor/vis-network-bundle.js
npm run vendor:chart           # → src/vendor/chart-bundle.js
npm run vendor:chart-source    # → src/vendor/chart-source.js
npm run vendor:refresh-script  # → src/vendor/refresh-badges-source.js

# 3. Assemble the package tree
npm run build:dist             # → dist/firefox/ and dist/chromium/
```

After step 2, each of those files matches the copy in the submitted zip.

`npm run vendor:refresh-script -- --check` rebuilds without writing and exits
non-zero if the committed bundle differs from its sources. `test/refresh-script.test.js`
runs exactly that, so a stale copy of that one fails the test suite rather than
shipping.

The extension **cannot** be loaded unpacked from `src/`. Neither manifest in
that directory is named `manifest.json` — the build picks
`src/manifest-firefox.json` or `src/manifest-chromium.json` per target and
writes it out as `manifest.json`. Load `dist/firefox` (about:debugging) or
`dist/chromium` (chrome://extensions) instead.

To produce the submitted archive:

```bash
npm run package:firefox
```

That writes `releases/<version>/codeledger-firefox-v<version>.zip` — along with
the Chrome and source archives, since all three come out of the same publish
step.

---

## Verifying the output

To confirm a generated file matches the extension zip:

1. Extract `codeledger-firefox-v<version>.zip`
2. Run the commands above against a clean `npm ci`
3. Compare, for example, `vendor/vis-network-bundle.js` from the zip against
   `src/vendor/vis-network-bundle.js`

esbuild output is deterministic for a fixed esbuild version and fixed inputs;
`package-lock.json` pins both the libraries and esbuild itself, which is why
step 1 is `npm ci` rather than `npm install`.

Every file in the zip that is not in the table above is copied byte-for-byte
from `src/` with no processing.
