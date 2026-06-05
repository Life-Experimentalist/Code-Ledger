# Autonomous MCP and AI System

## Overview

CodeLedger now features a fully autonomous MCP (Model Context Protocol) system where:

1. **AI providers automatically know about available MCPs**
2. **Users can enable/disable individual tools**
3. **Settings auto-commit with every problem solve**
4. **GitHub infrastructure fully autonomous**

## MCP Auto-Invocation

### How It Works

When an AI provider generates a review or chat response:

1. **Initialization**: `BaseAIHandler._buildMCPToolsContext()` checks if MCP should be used
   - Checks global config: `useInChat` or `useInReview`
   - Checks provider support: `supportsMCPTools` flag
   - Fetches enabled tools from `getMCPConfig()`

2. **Context Building**: Prepends available tools to the prompt

   ```
   [AVAILABLE_MCP_TOOLS]
   - Query Problems: Search for problems by platform/difficulty/topic/time
   - Get Problem Stats: Detailed statistics for a single problem
   - Get Next Suggestion: Analyze weak topics and suggest next problem
   ... (all enabled tools listed)
   [END_MCP_TOOLS]
   ```

3. **Provider Decision**: AI provider decides when/which tools to invoke
   - Included in system prompt
   - Provider can see when tools are available
   - Provider autonomously calls tools when helpful

4. **Tool Execution**: When provider calls a tool
   - Executor validates tool ID exists
   - Executes tool handler with arguments
   - Returns structured result
   - Formats result for AI context

### Enabling MCP Tools

Users control which tools are available in **Settings → MCP Tools**:

- **Global Settings**:
  - "Use MCP in Chat" — Tools available during chat
  - "Use MCP in Review" — Tools available during AI review
  - "Cache Tool Results" — Cache results for 5 minutes

- **Individual Tools**: Per-tool toggle
  - Each of 7 tools can be individually enabled/disabled
  - Tools grouped by category (Context, Suggestions, Analysis)

### Tool Categories

**Context Tools** (default enabled):

- `query-problems` — Search problems
- `get-problem-stats` — Problem analytics
- `find-similar-problems` — Similar problem suggestions
- `get-user-profile` — User context

**Suggestions** (default enabled):

- `get-next-suggestion` — Smart difficulty progression

**Analysis** (default enabled):

- `analyze-code-quality` — Code complexity & patterns
- `get-trend-analysis` — 30-day trends

## Settings Auto-Commit

### Flow

```
User changes setting in UI
    ↓
Storage.setSettings() called
    ↓
On next problem commit:
  1. Check needsSettingsCommit()
  2. Extract portable settings via getConfigFileForCommit()
  3. Include .codeledger/config.json in commit tree
  4. After successful commit: clearSettingsCommitFlag()
```

### Portable Settings (Auto-Committed)

Settings automatically committed to GitHub repo:

- Theme configuration (preset, mode, accent)
- Behavior bank settings (enabled, telemetry, debug)
- AI settings (copyable, auto-review)
- Git settings (Pages settings, topic tags, co-author)
- MCP configuration (which tools enabled)

**NOT committed** (security):

- OAuth tokens
- API keys
- Personal access tokens
- Authentication credentials

### Cross-Device Sync

After push to GitHub:

1. On another device, user syncs settings
2. Pulls `.codeledger/config.json` from repo
3. Merges remote settings (remote wins except critical keys)
4. Local critical keys (github_owner, github_repo) preserved

## GitHub Handler Refactoring

### New Modular Structure

Instead of monolithic `index.js`, split into focused modules:

**[src/handlers/git/github/api-client.js]**

- Pure GitHub API wrapper functions
- Handles auth, error handling, retries
- Functions: `apiFetch`, `getCurrentUser`, `getRepoRef`, `createTree`, `createCommit`, etc.
- Single responsibility: API communication

**[src/handlers/git/github/infra-builder.js]**

- Builds infrastructure files (README, LICENSE, .github/workflows, Pages)
- Generates GitHub Pages HTML with optional verification
- Normalizes repo topics
- Functions: `buildInfraFiles`, `resolveRepoTopics`
- Single responsibility: File generation

**[src/handlers/git/github/pages-template.js]** (existing)

- GitHub Pages HTML/CSS template
- Actions workflow template
- README template

**[src/handlers/git/github/index.js]** (refactored - now ~200 lines)

- Main GitHubHandler class
- Orchestrates API calls using modules
- Implements BaseGitHandler interface
- Delegates to api-client.js and infra-builder.js
- Single responsibility: Orchestration

### Benefits

✅ **Maintainability**: Each module has clear responsibility
✅ **Testability**: Modules can be tested independently
✅ **Reusability**: API client can be used by other handlers
✅ **Readability**: Shorter, focused files
✅ **Scalability**: Easy to add features without bloating handler

### Code Organization

```
github/
├── index.js              (120 lines) - Handler orchestration
├── api-client.js         (200 lines) - GitHub API calls
├── infra-builder.js      (250 lines) - File generation
└── pages-template.js     (1000+ lines) - Templates
```

## GitHub Actions Autonomy

### Automatic Repository Setup

When creating a new repo:

1. **Initial Commit**: Infrastructure files automatically included
   - `.gitignore`
   - `LICENSE` (Apache-2.0)
   - `README.md`
   - `.github/workflows/update-stats.yml`
   - `.codeledger/config.json`

2. **Subsequent Commits**:
   - Solution files added
   - `index.json` auto-updated
   - Settings config auto-included if changed
   - Infrastructure files updated (index.html only)

3. **GitHub Pages Auto-Enabled**:
   - Set to serve from `main` branch root
   - Dashboard auto-regenerated on each commit
   - Optional verification summary visible

### Workflow: update-stats.yml

Trigger: On every commit to `main`
Action: Generates or validates `index.html`
Schedule: Optional daily runs for off-peak re-generation

Features:

- Auto-run on every commit
- No user action required
- Regenerates Pages dashboard
- Verifies file integrity

## System Architecture Diagram

```
User solves problem
    ↓
Problem:solved event → service-worker
    ↓
1. Check MCP config → get enabled tools
2. Build problem files
3. Check settings changed → build config file
4. Commit all files via GitHubHandler
    ├→ api-client: Create tree, commit, update ref
    └→ infra-builder: Add infrastructure if needed
5. Clear settings commit flag
6. GitHub Pages auto-updates (via Actions)
    ↓
User checks Settings → MCP Tools
    ↓
Toggles tools on/off
    ↓
Next time AI provider generates review:
1. Builds MCP tools context (enabled only)
2. Includes in prompt to provider
3. Provider decides which tools to call
4. Tools execute autonomously
5. Results included in AI response
```

## Configuration Flow

### Settings Persistence

```
Settings changed in UI
    ↓
Storage.setSettings(updates)
    ↓
markSettingsPendingCommit() called
    ↓
Next problem commit:
  - getConfigFileForCommit() checks if needed
  - Includes .codeledger/config.json
  - clearSettingsCommitFlag() after success
```

### MCP Configuration

```
User toggles tool in Settings → MCP Tools
    ↓
setMCPToolEnabled(toolId, true/false)
    ↓
updateMCPConfig() saves to mcp.config
    ↓
On next commit:
  - mcp.config included in portable settings
  - Synced to .codeledger/config.json
```

## Autonomous Features

✅ **Auto-commit settings** — No manual sync needed
✅ **Auto-invoke MCP tools** — AI decides when to use
✅ **Auto-generate Pages** — Dashboard stays current
✅ **Auto-setup repo** — All infrastructure created automatically
✅ **Auto-enable Pages** — No GitHub UI clicks needed
✅ **Auto-normalize topics** — Consistent repo presentation
✅ **Auto-co-author** — Optional trailer on commits

## User Control

Users can:

- ✅ Enable/disable individual MCP tools
- ✅ Toggle global MCP usage (chat/review)
- ✅ Override AI model per provider
- ✅ Configure GitHub Pages options
- ✅ Customize co-author trailer
- ✅ Set extra repo topics
- ✅ Configure sync intervals

Users don't need to:

- ❌ Manually commit settings
- ❌ Invoke MCP tools manually (AI does it)
- ❌ Regenerate Pages dashboard
- ❌ Set up GitHub Actions
- ❌ Manage infrastructure files

## Testing

All autonomous systems type-checked via:

```bash
npm run lint
```

Manual testing checklist:

- [ ] Change setting → verify next commit includes config.json
- [ ] Enable/disable MCP tool → verify setting persisted
- [ ] AI generates review → verify MCP tools in prompt if enabled
- [ ] Create new repo → verify all infrastructure files created
- [ ] Check GitHub Pages → verify dashboard updated
- [ ] Pull repo on new device → verify settings synced

## Future Enhancements

- [ ] MCP tool result caching (5-min in-memory cache)
- [ ] Provider-specific MCP format auto-detection
- [ ] MCP tool chaining (output of one → input of next)
- [ ] Tool usage analytics (which tools most helpful)
- [ ] Custom MCP tool creation UI
- [ ] MCP tool scheduling (run specific tool at time X)
- [ ] Multi-provider MCP orchestration

## See Also

- [MCP Tools](mcp-tools.md) — 7 available tools reference
- [CLAUDE.md](../CLAUDE.md) — Architecture overview
- [CodeLedger extension docs](../README.md)
