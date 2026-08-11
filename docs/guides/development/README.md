# Development Guides

Operational and implementation guidance for the extension codebase.

## Files

- [Adding Platform Handler](adding-platform-handler.md)
- [Build System Optimization](build-system-optimization.md)
- [Handlers Overview](handlers.md)
- [Handler Contract](handlers-spec.md)
- [Graphify Workflow](graphify-workflow.md)
- [Quick Reference](quick-reference.md)

There is no local server to run. The extension is loaded unpacked from
`dist/chromium` or `dist/firefox`, and it talks to the deployed worker over the
network; `npm run dev` builds once and then watches `src/`.
