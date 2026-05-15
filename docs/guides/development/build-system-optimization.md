# CodeLedger Build System - Optimization Report

## Issues Fixed

### 1. **Missing `dist/chromium` Directory on `npm run watch`**
**Root Cause:** The `watch.js` script lacked an initial build phase. File watchers were set up, but no initial build occurred, so directories were never created until the first file change was detected.

**Solution:** Modified `watch.js` to execute an initial build before starting file watchers.

### 2. **Inefficient CSS Rebuilds**
**Root Cause:** The watch script always ran full `build:dist` regardless of file type, causing unnecessary CSS rebuilds even for JS-only changes.

**Solution:** Added intelligent file detection:
- CSS changes → run `build:css` only
- JS/TS changes → run `build:fast` (skip CSS step)

## Changes Made

### 1. `dev/watch.js`
- Added `runInitialBuild()` function that executes `npm run build:fast` before watchers start
- Exit with error if initial build fails (prevents confusing state)
- Now intelligently routes builds: CSS-only changes use `build:css`, others use `build:fast`

### 2. `dev/build.js`
- Added `--skip-css` argument support (replaces environment variable approach for Windows compatibility)
- Automatically ensures CSS is built first on full builds (unless `--skip-css` flag present)
- Better error handling for CSS build failures

### 3. `package.json` - New npm Scripts

| Script            | Purpose                                    | Speed     |
| ----------------- | ------------------------------------------ | --------- |
| `build:css`       | Compile Tailwind CSS only                  | ⚡ Fast    |
| `build:dist`      | Full build (CSS + dist)                    | ⚡ Full    |
| `build:fast`      | Fast build (dist only, skip CSS)           | ✨ Fastest |
| `build`           | Complete build for production              | Standard  |
| `watch`           | Development mode with auto-rebuild         | Dev mode  |
| `package`         | Package extension (calls full build first) | Standard  |
| `package:chrome`  | Build + package Chrome extension           | Standard  |
| `package:firefox` | Build + package Firefox extension          | Standard  |

## Performance Improvements

### Before
```
npm run watch
↓
watch.js starts
↓
Waits for file change (no initial build)
↓
First change detected
↓
Full rebuild (CSS + JS + copy)
```

### After
```
npm run watch
↓
Initial build:fast runs (~2-3s)
↓
Directories created, watchers start
↓
CSS change → build:css only (~0.5s)
↓
JS change → build:fast (~1-2s)
```

## Workflow Optimization

### Development Mode
```bash
npm run watch          # Auto-rebuild on changes, minimal overhead
npm run dev            # Full dev mode with watcher + server
```

### Production Build
```bash
npm run build          # Full build with CSS optimization
npm run package        # Full build + create release zips
npm run package:chrome # Chrome extension only
npm run package:firefox # Firefox extension only
```

### Verification
```bash
npm run lint          # TypeScript type checking
npm validate:openapi  # Validate OpenAPI schema
```

## Technical Details

### --skip-css Flag
- Used by `build:fast` to skip Tailwind CSS compilation
- Useful during rapid development when CSS hasn't changed
- Arguments pass through to build.js via `process.argv`

### Debounce
- File watchers debounce for 300ms (avoids rebuilding on rapid changes)
- Prevents cascade rebuilds during multi-file changes

### Version Sync
- `build.js` automatically syncs `package.json` version with `src/core/constants.js`
- Ensures single source of truth for versioning

## Verified Working ✓

- Initial build on `npm run watch`: **✓ Creates dist/chromium**
- File watching: **✓ Detects changes**
- CSS-only optimization: **✓ Skips rebuild for non-CSS changes**
- Windows compatibility: **✓ No environment variable issues**
- Manual builds: **✓ Full and fast variants work**
