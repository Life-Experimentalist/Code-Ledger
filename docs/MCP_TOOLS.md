# MCP (Model Context Protocol) Tools System

CodeLedger includes a comprehensive MCP tools system that provides AI providers with powerful context and analysis capabilities. The system is **modal-agnostic** (not tied to any UI) and **provider-specific** (each provider handles invocation differently).

## Architecture

### Core Components

1. **[src/core/mcp-tools.js](src/core/mcp-tools.js)**
   - Defines 7 MCP tools with handlers
   - Each tool is a pure function: takes args, returns structured data
   - Tools work independently of any UI context

2. **[src/core/mcp-executor.js](src/core/mcp-executor.js)**
   - Executes tool calls
   - Converts tool definitions to provider-specific formats (OpenAI, Claude, Gemini, DeepSeek)
   - Processes provider responses and formats results

3. **[src/handlers/_base/BaseAIHandler.js](src/handlers/_base/BaseAIHandler.js)**
   - Added MCP support to all AI providers
   - `supportsMCPTools` flag: provider can enable/disable
   - `mcpToolFormat` property: provider specifies format (openai, claude, gemini, etc.)

4. **[src/ui/components/MCPToolsSidebar.js](src/ui/components/MCPToolsSidebar.js)**
   - UI component for browsing and invoking tools
   - Compact mode: floating button + panel
   - Full mode: sidebar with categories and results display

5. **[src/library/views/AIChatsView.js](src/library/views/AIChatsView.js)**
   - Integrated MCP sidebar toggle button
   - Shows/hides tools panel during chat
   - Captures tool results for context

## Available MCP Tools

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

## Provider Integration Guide

### For AI Providers: Enable MCP Support

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

1. **Manual Invocation**: Click the MCP icon (🔧) in AIChatsView chat header
   - Browse available tools by category
   - Click tool to execute
   - View results in sidebar
   - Results available for AI context

2. **AI Provider Invocation**: Providers can call tools automatically
   - Include tools in system prompt
   - Provider decides when/which tools to use
   - Results automatically attached to context

3. **Combining with Chat Commands**: Use both MCP tools and `/commands`
   - `/mycode` + `/problem` provide problem context
   - MCP tools add data analysis and suggestions
   - Together provide rich context for AI

## Example: Complete Chat Flow

```javascript
// User asks: "What should I practice next?"
//
// 1. AI provider receives message
// 2. Provider sees MCP tools available
// 3. Provider decides to call "get-next-suggestion"
// 4. Tool executes, finds user solved 10 Graph problems but only 2 DP
// 5. Suggests a DP problem from weak area
// 6. Provider includes result in response:
//    "Based on your weak topics, try this DP problem: LongestIncreasingSubsequence"
```

## Architecture Benefits

✅ **Modal-agnostic**: Tools work from anywhere (chat, settings, background)
✅ **Provider-specific**: Each AI provider handles tools their own way
✅ **Extensible**: New tools added by defining handler + schema
✅ **Type-safe**: TypeScript + schema validation
✅ **Offline-capable**: No server required, pure IndexedDB
✅ **User control**: Manual invocation in UI + automatic via AI

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

4. Providers can immediately use the new tool

## Testing MCP Tools

```javascript
// Direct tool execution
import { executeMCPTool } from "/core/mcp-executor.js";

const result = await executeMCPTool("query-problems", {
  platform: "leetcode",
  difficulty: "Medium",
  limit: 10
});
```

## Future Enhancements

- [ ] MCP server for external Claude/Cursor integration
- [ ] Tool caching for frequently-run queries
- [ ] Rate limiting per tool
- [ ] Tool result history / bookmarking
- [ ] Custom tool creation UI
- [ ] Tool chaining (output of one → input of next)

## See Also

- [Existing Chat Commands](../src/lib/chat-variables.js): `/mycode`, `/problem`, `/explain`, etc.
- [AI Handlers](../src/handlers/ai/): Provider-specific implementations
- [AI Chat Storage](../src/core/ai-chat-storage.js): Chat persistence
