/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Injected script that runs in the main world context to read/write Ace or Monaco editors
 * without violating Content Security Policy (CSP) restriction on inline scripts.
 */
(function () {
  try {
    const scriptEl = document.currentScript;
    if (!scriptEl) return;

    const action = scriptEl.getAttribute("data-action");
    const requestId = scriptEl.getAttribute("data-request-id");
    const responseEvent = `cl-editor-response-${requestId}`;

    if (action === "extract") {
      let code = null;

      // 1. Try Monaco Editor
      if (window.monaco) {
        const active = window.monaco.editor?.getActiveCodeEditor?.()?.getModel?.()?.getValue?.();
        if (typeof active === "string" && active.trim()) {
          code = active;
        } else {
          const editors = window.monaco.editor?.getEditors?.();
          if (editors?.length) {
            for (const ed of editors) {
              const val = ed.getModel?.()?.getValue?.();
              if (typeof val === "string" && val.trim()) {
                code = val;
                break;
              }
            }
          }
          if (!code) {
            const fallback = window.monaco.editor?.getModels()?.[0]?.getValue();
            if (typeof fallback === "string" && fallback.trim()) {
              code = fallback;
            }
          }
        }
      }

      // 2. Try Ace Editor
      if (!code && window.ace) {
        const el =
          document.getElementById("ace-editor") ||
          document.querySelector(".ace_editor") ||
          document.querySelector("#editor");
        if (el) {
          const ed = window.ace.edit(el);
          if (ed) {
            code = ed.getValue();
          }
        }
      }

      window.dispatchEvent(new CustomEvent(responseEvent, { detail: { code } }));
    } else if (action === "apply") {
      const codeToApply = decodeURIComponent(scriptEl.getAttribute("data-code") || "");
      let success = false;

      // 1. Try Monaco Editor
      if (window.monaco) {
        const activeEd = window.monaco.editor?.getActiveCodeEditor?.();
        if (activeEd) {
          const model = activeEd.getModel();
          if (model) {
            model.setValue(codeToApply);
            success = true;
          }
        } else {
          const editors = window.monaco.editor?.getEditors?.();
          if (editors?.length) {
            for (const ed of editors) {
              const model = ed.getModel?.();
              if (model) {
                model.setValue(codeToApply);
                success = true;
                break;
              }
            }
          }
        }
      }

      // 2. Try Ace Editor
      if (!success && window.ace) {
        const el =
          document.getElementById("ace-editor") ||
          document.querySelector(".ace_editor") ||
          document.querySelector("#editor");
        if (el) {
          const ed = window.ace.edit(el);
          if (ed) {
            ed.setValue(codeToApply);
            success = true;
          }
        }
      }

      window.dispatchEvent(new CustomEvent(responseEvent, { detail: { success } }));
    }
  } catch (e) {
    // Fail silently
  }
})();
