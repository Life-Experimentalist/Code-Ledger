# CodeLedger — AMO Source Build Instructions

## What gets generated

Only **one file** in the extension is generated from source:

| Generated file | Source input | Tool |
|---|---|---|
| `src/ui/styles/compiled.css` | `src/index.css` + Tailwind class scanning | `@tailwindcss/cli` |

All JavaScript files ship exactly as written — no bundler, no transpiler, no minification of JS.

---

## Requirements

| Tool | Required version | Install |
|---|---|---|
| Node.js | ≥ 18.0.0 | https://nodejs.org |
| npm | ≥ 10.0.0 | bundled with Node.js |

Tested on: Windows 11, macOS 14, Ubuntu 22.04.

---

## Steps to reproduce the extension

```bash
# 1. Install dependencies
npm install

# 2. Compile Tailwind CSS (the only generated file)
npm run build:css
```

After these two commands, `src/ui/styles/compiled.css` will match the file
included in the submitted extension zip exactly.

The extension can then be loaded unpacked from the `src/` directory, or
packaged with:

```bash
# Produces releases/<version>/codeledger-firefox-v<version>.zip
npm run package:firefox
```

---

## Verifying the output

To confirm the compiled CSS matches the extension zip:

1. Extract `codeledger-firefox-v<version>.zip`
2. Compare `ui/styles/compiled.css` from the zip against
   `src/ui/styles/compiled.css` produced by `npm run build:css`

All other files in the zip are copied verbatim from `src/` with no processing.
