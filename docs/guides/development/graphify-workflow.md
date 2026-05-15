# Graphify Workflow for CodeLedger

Use this guide to build, inspect, and share the CodeLedger knowledge graph from the full repository.

## Project Attribution

- CodeLedger repository: https://github.com/Life-Experimentalist/Code-Ledger
- Graphify upstream project: https://github.com/safishamsi/graphify

## What the Current Inference Surface Suggests

Latest full-project run highlights:

- Queue operations form a strong, cohesive cluster (enqueue, cancel, stats, retry flow).
- There is likely coupling between chat storage and MCP tooling that is worth explicit architecture notes.
- Vendor bundle symbols can produce noisy inferred edges (for example generic names like isArray or normalize).
- Community structure is useful, but vendor-heavy nodes can dominate hub rankings.

Use these signals as prompts for architecture validation, not as unquestioned truth.

## Install and Check It Locally

PowerShell:

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
graphify --help
```

If the command is missing:

```powershell
py -3.13 -m pip install graphifyy
```

## Run on the Entire CodeLedger Repository

### 1) Code graph refresh (fast, local, no LLM)

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
graphify update "V:\Code\ProjectCode\CodeLedger"
```

### 2) Re-cluster existing graph after structural changes

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
graphify cluster-only "V:\Code\ProjectCode\CodeLedger"
```

### 3) Explore the graph directly

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
graphify query "How does AI review queue connect to commit flow?"
graphify explain "LeetCodeHandler"
graphify path "EventBus" "createCommit"
```

### 4) Full semantic extraction (docs, papers, images)

For semantic edges across documentation and non-code corpus files, run the assistant command in chat:

```text
/graphify V:\Code\ProjectCode\CodeLedger
```

Use the CLI update command for fast code-only refreshes between semantic runs.

## Where Outputs Are Written

All generated artifacts are in graphify-out at repo root:

- graphify-out/graph.html: interactive graph view
- graphify-out/graph.json: machine-readable graph data
- graphify-out/GRAPH_REPORT.md: report with communities, hubs, and surprising links

Open the interactive graph in PowerShell:

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
Invoke-Item ".\graphify-out\graph.html"
```

## Team Sharing

If you want teammates to inspect the same run output:

- Commit graphify-out/GRAPH_REPORT.md for a human-readable snapshot.
- Commit graphify-out/graph.json for reproducible graph queries.
- Keep graphify-out/graph.html for click-through browsing in PRs and local review.

## Practical Quality Guardrails

- Treat inferred edges that terminate in src/vendor as low-priority until validated.
- Prefer confidence EXTRACTED edges for architecture decisions.
- Re-run graphify update after major refactors, and re-run full semantic extraction after major docs reshapes.