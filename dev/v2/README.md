# CodeLedger v2 Build System

The `dev/v2/` system is the next-generation build orchestration for CodeLedger. It replaces the ad-hoc scripts with a modular, structured CLI that supports versioned releases and clear separation of concerns.

## Architecture

```
dev/v2/
├── cli.js                    # Main entry point (dispatches to tasks)
├── core/
│   ├── context.js           # Version/path factory (read-only config)
│   ├── logger.js            # ANSI-colored output (no external deps)
│   ├── validator.js         # Version & CHANGELOG validation
│   └── packager.js          # Zip creation (Chrome/Firefox/Source)
└── tasks/
    ├── build.js             # CSS + extension distributions
    ├── publish.js           # Build + package zips
    └── release.js           # Full release workflow (validate → build → package → commit → tag → push)
```

## Usage

All commands are invoked via npm scripts or directly:

### Build CSS + Extension

```bash
npm run build
# or
node dev/v2/cli.js build

# Skip CSS recompilation (for fast iteration)
node dev/v2/cli.js build --skip-css
```

### Package Release Zips

Creates versioned zips in `releases/1.3.0/` (or current version):

```bash
npm run publish
# or
node dev/v2/cli.js publish
```

Produces:

- `codeledger-chromium-v1.3.0.zip`
- `codeledger-firefox-v1.3.0.zip`
- `codeledger-source-v1.3.0.zip`

### Full Release

Orchestrates: validate → build → package → commit → tag → push

```bash
npm run release

# Preview without executing git operations
npm run release -- --dry-run
```

## Release Workflow

1. **Validate**
   - Checks `package.json` version === the version in both `src/manifest-chromium.json` and `src/manifest-firefox.json`
   - Verifies `docs/CHANGELOG.md` has entry for the version

2. **Build**
   - Compiles Tailwind CSS
   - Builds extension distributions with esbuild

3. **Package**
   - Creates Chrome zip (all files)
   - Creates Firefox zip (excludes `side_panel` from manifest)
   - Creates source zip (src/, dev/, docs/, worker/, package.json, tsconfig.json)
   - All zips stored in `releases/VERSION/` subdirectory

4. **Git Operations** (if not `--dry-run`)
   - Stages all changes: `git add -A`
   - Commits: `git commit -m "chore: release vX.Y.Z"`
   - Tags: `git tag vX.Y.Z`
   - Pushes: `git push origin main vX.Y.Z`
   - Triggers GitHub Actions (`.github/workflows/release.yml`) to create release + upload artifacts

## Key Features

### Versioned Release Directories

Artifacts are organized by version:

```
releases/
├── 1.2.0/
│   ├── codeledger-chromium-v1.2.0.zip
│   ├── codeledger-firefox-v1.2.0.zip
│   └── codeledger-source-v1.2.0.zip
└── 1.3.0/
   ├── codeledger-chromium-v1.3.0.zip
    ├── codeledger-firefox-v1.3.0.zip
    └── codeledger-source-v1.3.0.zip
```

Older releases are preserved; new releases are added in separate folders.

### Centralized Context

`dev/v2/core/context.js` provides:

- `rootDir` — project root
- `version` — from package.json
- `tag` — e.g., "v1.3.0"
- `releaseVersionDir` — e.g., "releases/1.3.0/"
- `pkg` — parsed package.json
- `manifest` — parsed src/manifest-chromium.json

All tasks use the same context to ensure consistency.

### Modular Logger

`dev/v2/core/logger.js` provides:

- `step(msg)` — cyan step indicator
- `ok(msg)` — green success checkmark
- `error(msg)` — red error prefix
- `warn(msg)` — yellow warning prefix
- `info(msg)` — blue info prefix
- `dim(msg)` — dimmed secondary info
- `section(title)` — bold section header
- `dryRun(cmd)` — preview command without executing

Uses ANSI color codes (no external dependencies like chalk).

## Backward Compatibility

Old scripts in `dev/` (e.g., `dev/run-dev.js`, `dev/clean.js`) are **untouched**. The v2 system is entirely new and doesn't interfere with existing workflows:

- `npm run dev` → still uses `dev/run-dev.js`
- `npm run watch` → still uses `dev/watch.js`
- `npm run clean` → still uses `dev/clean.js`
- `npm run lint` → still uses tsc
- `npm run validate:openapi` → still uses `dev/validate-openapi.js`

Only these scripts now use v2:

- `npm run build` → `dev/v2/cli.js build`
- `npm run package` → `dev/v2/cli.js publish`
- `npm run package:chrome` → `dev/v2/cli.js publish`
- `npm run package:firefox` → `dev/v2/cli.js publish`
- `npm run publish` → `dev/v2/cli.js publish`
- `npm run release` → `dev/v2/cli.js release`

## Extending the System

To add a new task:

1. Create `dev/v2/tasks/my-task.js`:

   ```js
   export async function taskMyTask(ctx, logger, options = {}) {
     logger.section("My Task");
     logger.step("Doing something");
     // ... your logic ...
     logger.ok("Done");
   }
   ```

2. Register in `dev/v2/cli.js`:

   ```js
   import { taskMyTask } from "./tasks/my-task.js";
   const TASKS = {
     build: taskBuild,
     publish: taskPublish,
     release: taskRelease,
     myTask: taskMyTask, // ← add here
   };
   ```

3. Call via CLI:
   ```bash
   node dev/v2/cli.js myTask
   ```

## Debugging

Enable debug output:

```bash
DEBUG=1 npm run release
```

Shows full error stack traces.

## References

- **Context factory**: [dev/v2/core/context.js](../core/context.js)
- **Logger**: [dev/v2/core/logger.js](../core/logger.js)
- **Validator**: [dev/v2/core/validator.js](../core/validator.js)
- **Packager**: [dev/v2/core/packager.js](../core/packager.js)
- **Build task**: [dev/v2/tasks/build.js](../tasks/build.js)
- **Publish task**: [dev/v2/tasks/publish.js](../tasks/publish.js)
- **Release task**: [dev/v2/tasks/release.js](../tasks/release.js)
- **CLI entry point**: [dev/v2/cli.js](../cli.js)
