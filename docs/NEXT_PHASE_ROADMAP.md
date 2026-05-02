# CodeLedger Next Phase Roadmap 🚀

**Current Status**: Graph flexibility + AI chat infrastructure complete
**Next Focus**: Critical bug fixes + AI advanced features + MCP integration

---

## Phase 1: Critical Bug Fixes (THIS WEEK) 🔥

### 1.1 LeetCode Commit on Accept Not Firing
**Priority**: CRITICAL | **Effort**: 4h | **Owner**: @VK

**Problem**: Service worker doesn't receive `problem:solved` event when user submits code on LeetCode

**Root Causes to Investigate**:
- Platform handler may not detect "Accepted" status correctly
- MutationObserver not triggering on submit
- Event emission timing issue (race condition)
- Handler initialization delay

**Solution Approach**:
1. Add detailed logging to LeetCode handler detection
2. Log when submission state changes to "Accepted"
3. Log when `problem:solved` event fires
4. Check service worker receives event
5. Verify IndexedDB save completes
6. Verify GitHub commit is attempted

**Testing**:
- Submit solution on LeetCode
- Check browser console logs
- Verify problem added to library
- Verify GitHub repo has new commit

---

### 1.2 Graph Node Selection Cascade Glow
**Priority**: HIGH | **Effort**: 3h | **Owner**: @VK

**Problem**: Selected node doesn't visually highlight connected nodes/edges

**Implementation**:
1. **Modify GraphView `handleSelectNode()`**:
   - On selection, compute 1-hop neighbor set
   - Store in state: `selectedNodeId`, `connectedNodeIds`

2. **Update rendering**:
   - Main pass: Draw selected node with FULL opacity/brightness
   - Draw connected nodes with 50% glow
   - Draw edges to connected nodes with 50% glow
   - Draw other nodes/edges at normal opacity

3. **Multi-click support** (Future):
   - Ctrl+Click adds to selection
   - Selected set glows, others fade

**Files to Modify**:
- `src/library/views/GraphView.js` (rendering logic)

---

### 1.3 Unified Problem Modal Component
**Priority**: HIGH | **Effort**: 6h | **Owner**: @VK

**Problem**: Each platform handler creates own problem modal; inconsistent UX

**Solution**:
1. Create abstract ProblemData schema (platform-agnostic):
   ```js
   {
     id, titleSlug, title, platform, url,
     difficulty, tags, description, hints,
     codeStubs: { lang: code },
     tests: [{ input, output, explanation }],
     constraints, examples,
     metadata: { likes, dislikes, acRate }
   }
   ```

2. Create `src/library/components/ProblemModal.js`:
   - Unified component for all platforms
   - Tabs: Overview, Code, AI Chat, Similar, Analysis
   - Handlers transform platform-specific data before passing

3. Each handler transforms data:
   ```js
   // LeetCode
   const data = {
     id: problem.id,
     titleSlug: problem.titleSlug,
     ...platformSpecificMapping
   };
   eventBus.emit("showProblemModal", data);
   ```

4. Library listens for event and renders unified modal

**Files to Create**:
- `src/library/components/UnifiedProblemModal.js`

**Files to Modify**:
- All platform handlers (transform before emit)
- `library.js` (render modal)

---

## Phase 2: AI Advanced Features (WEEK 2-3) 🤖

### 2.1 AI Command Palette (Top Priority)
**Priority**: HIGH | **Effort**: 5h | **Owner**: @VK

**Features**:
1. **Command Dropdown**:
   - Opens on `/` keystroke
   - Fuzzy search as user types
   - Shows description + usage
   - Arrow keys to navigate, Enter to select

2. **Commands Implemented**:
   - `/mycode` → Insert user's code
   - `/problem` → Insert problem statement
   - `/test` → Extract test cases as JSON
   - `/explain` → Request step-by-step explanation
   - `/optimize` → Suggest optimizations
   - `/mermaid` → Generate diagram
   - `/math` → LaTeX math helper
   - `/similar` → Similar problems with patterns
   - `/complexity` → Detailed complexity analysis

3. **UI Component**: `AICommandPalette.js`
   - Positioned below textarea
   - Keyboard-accessible
   - Shows command history

**Files to Create**:
- `src/ui/components/AICommandPalette.js`

**Files to Modify**:
- `src/ui/components/MultiLineAIChatInput.js` (keyboard event)
- `src/lib/chat-variables.js` (extend with new commands)

---

### 2.2 Math & LaTeX Support
**Priority**: HIGH | **Effort**: 4h | **Owner**: @VK

**Features**:
1. **MathJax Integration**:
   - Include MathJax CDN or local library
   - Render `$...$` (inline) and `$$...$$` (block)

2. **Modify AIMarkdownRenderer**:
   ```js
   // Input: "The complexity is $O(n^2)$ or $$\int_0^1 x dx$$"
   // Output: Rendered math with proper LaTeX formatting
   ```

3. **Math command**:
   - `/math problem-area-circle` → Insert circle formula + explanation
   - Context-aware math suggestions based on problem type

**Files to Modify**:
- `src/ui/components/AIMarkdownRenderer.js` (MathJax rendering)
- `src/lib/chat-variables.js` (add `/math` command)

---

### 2.3 Mermaid Diagram Generation
**Priority**: HIGH | **Effort**: 6h | **Owner**: @VK

**Features**:
1. **Diagram Types**:
   - `graph` (flowchart) - algorithm flows
   - `sequenceDiagram` - interactions
   - `classDiagram` - OOP design
   - `stateDiagram` - state machines
   - `timeline` - scheduling

2. **AI Integration**:
   - `/mermaid` command triggers diagram generation
   - AI generates mermaid code based on problem
   - Rendered inline in chat

3. **Editor**:
   - Mermaid syntax highlighting in code blocks
   - Live preview for diagrams
   - Download diagram as PNG/SVG

**Files to Modify**:
- `src/ui/components/AIMarkdownRenderer.js` (render mermaid blocks)
- `src/lib/chat-variables.js` (add `/mermaid` command)

---

## Phase 3: MCP Integration (WEEK 3-4) 🧠

### 3.1 MCP Tool Suite
**Priority**: HIGH | **Effort**: 8h | **Owner**: @VK

**Tools**:

1. **`query_problems`** tool:
   - Query by topic, difficulty, platform, pass rate
   - Returns: `[{ id, title, difficulty, tags, acceptance }]`

2. **`get_problem_stats`** tool:
   - Detailed stats: solve time, trends, pass rate
   - Returns: `{ solveTime, passRate, difficulty, platform, timing }`

3. **`next_problem_suggestion`** tool:
   - Analyze weak topics from solved
   - Suggest next best problem
   - Explain why recommended

4. **`code_quality_analysis`** tool:
   - Time/space complexity
   - Edge case coverage
   - Improvement suggestions
   - Caching: avoid re-analyzing

5. **`get_learning_trends`** tool:
   - Improvement over time
   - Difficulty progression
   - Platform variety
   - Topics mastered/weak

**Files to Create**:
- `src/mcp/tools/query-problems.js`
- `src/mcp/tools/get-stats.js`
- `src/mcp/tools/suggest-next.js`
- `src/mcp/tools/analyze-code.js`
- `src/mcp/tools/get-trends.js`
- `src/mcp/tools/index.js` (tool registry)

**Files to Modify**:
- `src/core/storage.js` (query methods for new use cases)
- `handler-registry.js` (expose problem data to MCP)

---

### 3.2 MCP Context Injection
**Priority**: HIGH | **Effort**: 3h | **Owner**: @VK

**Provide IndexedDB snapshot to Claude**:
```json
{
  "userProfile": {
    "totalSolved": 120,
    "platform": ["leetcode", "geeksforgeeks"],
    "weakTopics": [
      { "topic": "Bit Manipulation", "solveCount": 2, "avgScore": 0.6 },
      { "topic": "Dynamic Programming", "solveCount": 5, "avgScore": 0.7 }
    ],
    "strongTopics": [
      { "topic": "Array", "solveCount": 30, "avgScore": 0.95 },
      { "topic": "String", "solveCount": 25, "avgScore": 0.92 }
    ],
    "solveTimeStats": {
      "easy": { avg: 8, min: 2, max: 45 },
      "medium": { avg: 22, min: 5, max: 120 },
      "hard": { avg: 45, min: 15, max: 180 }
    },
    "recentProblems": [{ id, title, difficulty, solveTime }]
  }
}
```

---

## Phase 4: Enhanced AIChatsView (WEEK 4) 📚

### 4.1 New Chat Creation
**Features**:
- "+ New Chat" button in AIChatsView
- Modal to select problem
- Optional custom title
- Pre-fill with problem context

### 4.2 Problem Attachment
- Link multiple problems to conversation
- Cross-reference solutions
- Show related problems sidebar

### 4.3 Export & Sharing
- Download as markdown
- Generate shareable links
- Include diagrams and math

---

## Implementation Timeline

```
Week 1:
  [ ] Fix LeetCode commit on accept
  [ ] Implement node glow cascade
  [ ] Create unified problem modal

Week 2:
  [ ] AI command palette with dropdown
  [ ] MathJax/LaTeX rendering
  [ ] Basic Mermaid diagram support

Week 3:
  [ ] MCP tool suite (query, stats, suggestions)
  [ ] MCP context injection
  [ ] Enhanced AIChatsView

Week 4:
  [ ] Polish & optimization
  [ ] Comprehensive testing
  [ ] Documentation updates
  [ ] User feedback integration
```

---

## Resource Estimates

| Feature               | Hours        | Priority | Impact             |
| --------------------- | ------------ | -------- | ------------------ |
| Fix commit on accept  | 4            | CRITICAL | Unblocks auto-save |
| Node glow cascade     | 3            | HIGH     | UX improvement     |
| Unified problem modal | 6            | HIGH     | Consistency        |
| Command palette       | 5            | HIGH     | AI usability       |
| Math/LaTeX            | 4            | HIGH     | Problem clarity    |
| Mermaid diagrams      | 6            | HIGH     | Visualization      |
| MCP integration       | 11           | HIGH     | AI capabilities    |
| Enhanced AIChatsView  | 5            | MEDIUM   | Workflow           |
| **Total**             | **44 hours** |          | **Major upgrade**  |

---

## Success Criteria

✅ LeetCode commits fire on every accepted submission
✅ Graph node selection highlights connected nodes with glow
✅ Problem modals identical across all platforms
✅ AI command palette with 10+ useful commands
✅ Math expressions render beautifully in all AI responses
✅ Mermaid diagrams generate for algorithm explanations
✅ Claude can suggest next problem based on weak topics
✅ AIChatsView shows rich chat history with exports

---

## Notes

- All new code follows existing CodeLedger patterns
- Full backward compatibility maintained
- Watch task runs for hot reload during development
- Tests added for new MCP tools
- Documentation updated as features complete

**Ready to start Phase 1?** Let me know which feature to begin with!
