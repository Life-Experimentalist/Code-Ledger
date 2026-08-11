# MCP (Model Context Protocol) Tools System

CodeLedger defines a set of tools that read and write your own solve history:
query it, analyse it, and store notes against it. Each tool is a pure function of
its arguments and runs entirely locally against IndexedDB, independent of any UI.

## What ships, and what does not

**You can invoke every tool by hand.** The 🔧 panel in the AI chat view lists
them, runs the one you pick, and puts the result into the chat context. That path
is complete, and it is what "MCP tools" means in the product today.

**The AI cannot invoke them on its own.** The plumbing for provider-driven tool
calling is written — format converters for OpenAI, Claude, Gemini and DeepSeek, a
dispatcher, a result formatter — but nothing switches it on. `BaseAIHandler` sets
`supportsMCPTools = false`, no provider handler overrides it, no handler passes a
tool array to its provider's API, and `processMCPToolCalls()` has no callers
outside its own module. The [Provider Integration Guide](#provider-integration-guide)
below is the contract for finishing that work, not a description of work already
done.

Keep that distinction in mind while reading the rest of this file: the tool
descriptions are accurate, the invocation model is half-built.

## Architecture

### Core Components

1. **[mcp-tools.js](../../src/core/mcp-tools.js)**
   - Defines the 15 tools and their handlers
   - Each tool is a pure function: takes args, returns structured data
   - Tools work independently of any UI context

2. **[mcp-executor.js](../../src/core/mcp-executor.js)**
   - Executes a tool call by id
   - Converts tool definitions to provider-specific formats (OpenAI, Claude, Gemini, DeepSeek)
   - Parses provider tool-call responses back into `(toolId, args)`

3. **[mcp-config.js](../../src/core/mcp-config.js)**
   - Which tools the user has enabled, and whether tools apply in chat, in
     review, or both

4. **[BaseAIHandler.js](../../src/handlers/_base/BaseAIHandler.js)**
   - `supportsMCPTools` — off on the base class, and not overridden anywhere yet
   - `mcpToolFormat` — which of the four wire schemas a provider expects

5. **[MCPToolsSidebar.js](../../src/ui/components/MCPToolsSidebar.js)**
   - Browsing and manual invocation
   - Compact mode: floating button + panel
   - Full mode: sidebar with categories and results display

6. **[AIChatsView.js](../../src/library/views/AIChatsView.js)**
   - Hosts the sidebar toggle and captures tool results into the chat context

## Available MCP Tools

Fifteen in total. The seven analysis tools are documented in full below; the
remaining eight are summarised under
[Knowledge, roadmap and navigation tools](#knowledge-roadmap-and-navigation-tools).

### 1. Query Problems

- **ID**: `query-problems`
- **Purpose**: Search for problems by platform, difficulty, topic, or time
- **Parameters**:
  - `platform` (optional): "leetcode", "geeksforgeeks", etc.
  - `difficulty` (optional): "Easy", "Medium", or "Hard"
  - `topic` (optional): Problem tag/topic
  - `minSolveTime` (optional): Minimum seconds
  - `maxSolveTime` (optional): Maximum seconds
  - `limit` (optional): Max results (default 20)
- **Returns**: Array of problems matching filters

### 2. Get Problem Stats

- **ID**: `get-problem-stats`
- **Purpose**: Get detailed statistics for a single problem
- **Parameters**:
  - `problemId` (required): Problem ID
- **Returns**: Problem metadata + runtime/memory stats + percentiles

### 3. Get Next Problem Suggestion

- **ID**: `get-next-suggestion`
- **Purpose**: Analyze weak topics and suggest next best problem
- **Parameters**: None
- **Returns**: Weak topics ranked by count + suggested problem with rationale

### 4. Analyze Code Quality

- **ID**: `analyze-code-quality`
- **Purpose**: Analyze code for complexity, edge cases, patterns
- **Parameters**:
  - `code` (required): Code to analyze
  - `problemId` (optional): Problem context for better analysis
- **Returns**: Line count, comments, type annotations, estimated complexity, edge cases, suggestions

### 5. Get Trend Analysis

- **ID**: `get-trend-analysis`
- **Purpose**: Analyze solving trends, platform distribution, difficulty progression
- **Parameters**:
  - `days` (optional): Number of days to analyze (default 30)
- **Returns**: Daily breakdown, platform distribution, difficulty distribution

### 6. Find Similar Problems

- **ID**: `find-similar-problems`
- **Purpose**: Find problems similar to a given one
- **Parameters**:
  - `problemId` (required): Problem to find similar for
  - `limit` (optional): Max similar problems (default 5)
- **Returns**: Ranked similar problems with similarity scores

### 7. Get User Profile

- **ID**: `get-user-profile`
- **Purpose**: Comprehensive user context for AI
- **Parameters**: None
- **Returns**: Total problems, top platforms/languages/topics, weak areas, time stats

### Knowledge, roadmap and navigation tools

These eight are registered and executable on the same footing as the seven
above. They are how the chat surface reaches the knowledge bank and the roadmap.

| ID                     | Name                 | Parameters                              | What it does                                                     |
| ---------------------- | -------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `remember`             | Remember Insight     | `content` (req), `topic`, `tags[]`      | Save a note or observation to the persistent knowledge bank      |
| `recall`               | Recall Insights      | `topic`, `limit`                        | Read insights back, optionally filtered by topic                 |
| `forget`               | Forget Insight       | `id` (req)                              | Delete one insight by id                                         |
| `set-roadmap`          | Set Roadmap          | `problems[]` (req), `name`              | Save a study roadmap as slugs or `{slug, title, difficulty}`      |
| `get-roadmap-progress` | Get Roadmap Progress | none                                    | How far through the active roadmap, and what is next             |
| `get-chats`            | Get Saved Chats      | `problemSlug`, `limit`                  | Retrieve saved conversations, optionally filtered by problem     |
| `delete-chat`          | Delete Chat          | `id` (req)                              | Delete a saved chat — confirm with the user before calling       |
| `open-problem`         | Open Problem         | `url` (req), `platform`                 | Open a LeetCode/GFG/Codeforces problem in a new tab              |

## Provider Integration Guide

### For AI Providers: Enable MCP Support

**Not yet done for any provider.** This is the contract a provider handler must
satisfy for the AI to call tools on its own. Today every handler leaves
`supportsMCPTools` at its default of `false`, so none of the code below runs.

Two things must be true before switching a provider on, or it will fail quietly:

- The provider's API must actually receive the tool array. Prepending a prose
  list of tool names to the prompt is worse than saying nothing — the model will
  emit tool calls that no code executes, and the user gets an answer built on a
  result that was never fetched.
- `getAvailableMCPToolsForAI()` in `mcp-config.js` filters by
  `tool.id || tool.name`, which the `openai` and `deepseek` shapes do not carry
  at the top level (the name is nested under `function`). Those two formats
  resolve to an empty tool list until that filter is fixed.

In your provider handler (`src/handlers/ai/{provider}/index.js`):

```javascript
export class MyAIHandler extends BaseAIHandler {
  constructor() {
    super("myprovider", "MyProvider");

    // Enable MCP support
    this.supportsMCPTools = true;

    // Set format for provider's tool calling API
    this.mcpToolFormat = "openai"; // or "claude", "gemini", "deepseek"
  }

  async review(code, problemContext) {
    // ... existing review logic ...

    // Get MCP tools for provider's format
    const tools = await this.getSupportedMCPTools();

    // Pass tools to your provider's API
    // Provider returns tool calls in its format
    const toolCalls = providerResponse.tool_calls || [];

    // Process tool calls
    const toolResults = await this.processMCPToolCalls(toolCalls);

    // Include results in next message for context
    const enhancedPrompt = prompt + toolResults;
  }
}
```

### Provider Tool Call Formats

**OpenAI Format:**

```javascript
{
  type: "function",
  function: {
    name: "query-problems",
    description: "Search for problems...",
    parameters: {
      type: "object",
      properties: { /* properties */ }
    }
  }
}
```

**Claude Format:**

```javascript
{
  name: "query-problems",
  description: "Search for problems...",
  input_schema: {
    type: "object",
    properties: { /* properties */ }
  }
}
```

**Gemini Format:**

```javascript
{
  name: "query-problems",
  description: "Search for problems...",
  parameters: {
    type: "OBJECT",
    properties: { /* properties */ }
  }
}
```

## Using MCP Tools in Chat

1. **Manual invocation** — click the 🔧 icon in the AI chat header
   - Browse available tools by category
   - Click a tool to execute it
   - The result appears in the sidebar and joins the chat context

2. **Alongside chat commands** — `/mycode` and `/problem` supply the problem and
   your solution; a tool result supplies the analysis. They compose.

Provider-driven invocation — the model deciding on its own to call
`get-next-suggestion` — is the unbuilt half described at the top of this file.

## Architecture notes

- **Modal-agnostic**: a tool is a function of its arguments, so the same tool
  runs from the chat sidebar, from settings, or from a background context.
- **One definition, four wire formats**: tools are declared once and converted
  per provider, so adding a provider does not mean redeclaring the tools.
- **Extensible**: a new tool is a handler plus a JSON Schema entry.
- **No server**: everything reads IndexedDB locally. Tools work offline and send
  nothing anywhere.
- **User control**: each tool can be disabled individually, and tool use can be
  turned off for chat and for review separately.

Schemas are plain JSON Schema objects. There is no TypeScript in this project —
the type gate is `tsc --checkJs` over untyped JS, which does not validate these
shapes; the executor checks required arguments at call time instead.

## Adding a New MCP Tool

1. Create handler function in `src/core/mcp-tools.js`:

```javascript
export async function myTool(arg1, arg2) {
  try {
    // Fetch data, compute results
    return { ok: true, data: /* result */ };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
```

2. Add to `MCP_TOOLS` array with schema:

```javascript
{
  id: "my-tool",
  name: "My Tool",
  description: "Does something useful",
  parameters: {
    type: "object",
    properties: {
      arg1: { type: "string", description: "..." },
      arg2: { type: "number", description: "..." }
    },
    required: ["arg1"]
  },
  handler: myTool
}
```

3. Update `MCPToolsSidebar.js` to display results:

```javascript
case "my-tool":
  return html`<div>/* render result */</div>`;
```

The tool is then invocable from the sidebar. It becomes reachable by a provider
only once that provider is wired up per the guide above.

## Testing MCP Tools

```javascript
// Direct tool execution
import { executeMCPTool } from "/core/mcp-executor.js";

const result = await executeMCPTool("query-problems", {
  platform: "leetcode",
  difficulty: "Medium",
  limit: 10,
});
```

## Future Enhancements

- [ ] Wire provider-driven invocation up for at least one provider end to end
- [ ] Fix the `openai`/`deepseek` name lookup in `getAvailableMCPToolsForAI()`
- [ ] MCP server for external Claude/Cursor integration
- [ ] Tool caching for frequently-run queries
- [ ] Rate limiting per tool
- [ ] Tool result history / bookmarking
- [ ] Custom tool creation UI
- [ ] Tool chaining (output of one → input of next)

## See Also

- [Chat Commands](../../src/lib/chat-variables.js): `/mycode`, `/problem`, `/explain`, etc.
- [AI Handlers](../../src/handlers/ai/): Provider-specific implementations
- [AI Chat Storage](../../src/core/ai-chat-storage.js): Chat persistence
