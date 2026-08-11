# Automatic Behaviour: Settings, Repo Infrastructure, and MCP

This page covers what CodeLedger does without being asked: committing your
settings, building out your repository, and keeping the Pages dashboard current.

It also covers the one thing that is **not** automatic despite the plumbing
being present — AI providers invoking MCP tools on their own.

## MCP invocation: manual today, not automatic

**What works:** the 🔧 panel in the AI chat view lists every enabled tool, runs
the one you pick, and drops the result into the chat context.

**What does not:** the AI deciding for itself to call a tool. The pieces are all
written — `_buildMCPToolsContext()`, per-provider format converters, an executor,
a result formatter — but nothing turns them on. `BaseAIHandler` sets
`supportsMCPTools = false`; no provider handler overrides it; no handler passes a
tool array to its provider's API; and `processMCPToolCalls()` has no callers
outside its own module.

Flipping the flag by itself would make things worse rather than better. It
prepends a list of tool names to the prompt, so the model starts emitting tool
calls that no code executes and then answers as though it had the results. A
provider is only genuinely wired up once it also sends the tool array to its API
and routes the response back through the executor. See
[MCP Tools → Provider Integration Guide](mcp-tools.md#provider-integration-guide).

### Enabling MCP Tools

Which tools are available is under **Settings → AI → MCP Tools**:

- **Global**:
  - "Use in Chat" — tools offered during chat
  - "Use in Review" — tools offered during AI review

- **Individual tools**: each of the 15 tools has its own toggle, grouped by
  category (Context, Suggestions, Analysis, Knowledge, Roadmap, Chats,
  Navigation). All are on by default.

Both settings are honoured by the manual path, so turning a tool off removes it
from the sidebar.

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

Settings automatically committed to your GitHub repo:

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

## GitHub Handler Structure

The handler is split into focused modules rather than one file:

**[api-client.js](../../src/handlers/git/github/api-client.js)**

- Pure GitHub API wrapper functions
- Handles auth, error handling, retries
- Functions: `apiFetch`, `getCurrentUser`, `getRepoRef`, `createTree`, `createCommit`, etc.
- Single responsibility: API communication

**[infra-builder.js](../../src/handlers/git/github/infra-builder.js)**

- Builds infrastructure files (README, LICENSE, .github/workflows, Pages)
- Generates GitHub Pages HTML with optional verification
- Normalizes repo topics
- Functions: `buildInfraFiles`, `resolveRepoTopics`

**[commit-builder.js](../../src/handlers/git/github/commit-builder.js)**

- Assembles the file list for one commit

**[permissions.js](../../src/handlers/git/github/permissions.js)**

- Works out what the current token is actually allowed to do, so a missing
  scope surfaces as a clear message rather than a raw 403

**[pages-template.js](../../src/handlers/git/github/pages-template.js)**

- GitHub Pages HTML/CSS template, Actions workflow template, README template

**[index.js](../../src/handlers/git/github/index.js)**

- The `GitHubHandler` class: implements `BaseGitHandler` and orchestrates the
  modules above

### Code Organization

```
github/
├── index.js              (~450 lines) - Handler orchestration
├── api-client.js         (~250 lines) - GitHub API calls
├── commit-builder.js     (~65 lines)  - Commit file assembly
├── permissions.js        (~150 lines) - Token capability checks
├── infra-builder.js      (~570 lines) - File generation
└── pages-template.js     (~1290 lines) - Templates
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
1. Build problem files
2. Check settings changed → build config file
3. Commit all files via GitHubHandler
    ├→ api-client: Create tree, commit, update ref
    └→ infra-builder: Add infrastructure if needed
4. Clear settings commit flag
5. GitHub Pages auto-updates (via Actions)
```

MCP tools are not part of this path. They run when you open the chat view and
pick one.

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
User toggles tool in Settings → AI → MCP Tools
    ↓
setMCPToolEnabled(toolId, true/false)
    ↓
updateMCPConfig() saves to mcp.config
    ↓
On next commit:
  - mcp.config included in portable settings
  - Synced to .codeledger/config.json
```

## What happens without you

- **Settings commit themselves** — no manual sync step
- **Pages regenerate** — the dashboard stays current
- **Repo sets itself up** — infrastructure files created on first commit
- **Pages get enabled** — no clicks in the GitHub UI
- **Topics get normalized** — consistent repo presentation
- **Co-author trailer** — optional, added on commit

## User Control

You can:

- Enable/disable individual MCP tools
- Toggle tool availability for chat and for review separately
- Override the AI model per provider
- Configure GitHub Pages options
- Customize the co-author trailer
- Set extra repo topics
- Configure sync intervals

You don't need to:

- Manually commit settings
- Regenerate the Pages dashboard
- Set up GitHub Actions
- Manage infrastructure files

## Testing

Type gate:

```bash
npm run lint
```

Manual testing checklist:

- [ ] Change setting → verify next commit includes config.json
- [ ] Enable/disable MCP tool → verify setting persisted and the sidebar updates
- [ ] Create new repo → verify all infrastructure files created
- [ ] Check GitHub Pages → verify dashboard updated
- [ ] Pull repo on new device → verify settings synced

## Future Enhancements

- [ ] Wire provider-driven tool invocation up end to end for one provider
- [ ] MCP tool result caching
- [ ] MCP tool chaining (output of one → input of next)
- [ ] Tool usage analytics (which tools most helpful)
- [ ] Custom MCP tool creation UI
- [ ] Multi-provider MCP orchestration

## See Also

- [MCP Tools](mcp-tools.md) — all 15 tools, and the provider integration contract
- [CodeLedger docs index](../README.md)
