/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-contained floating draggable timer overlay.
 * Content-script safe — no framework, no bundler, no Tailwind.
 * Returns a controller: { getElapsed, pause, resume, reset, destroy }
 */

const SESSION_KEY = (slug) => `cl_timer_${slug || "generic"}`;

function loadState(slug) {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY(slug)) || "null"); } catch { return null; }
}
function saveState(slug, st) {
  try { sessionStorage.setItem(SESSION_KEY(slug), JSON.stringify(st)); } catch {}
}

function fmt(ms) {
  const t = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function createFloatingTimer(slug = "", opts = {}) {
  const { autoStart = true, position = { bottom: "20px", right: "20px" } } = opts;

  // Restore or initialize state
  let state = loadState(slug) || { elapsed: 0, running: false, startMs: null };

  // If we have a pending start time (page was reloaded while running), accumulate
  if (state.running && state.startMs) {
    state.elapsed += Date.now() - state.startMs;
    state.startMs = Date.now();
  }
  if (autoStart && !state.running) {
    state.running = true;
    state.startMs = Date.now();
  }
  saveState(slug, state);

  // ── DOM build ───────────────────────────────────────────────────────────────

  const root = document.createElement("div");
  root.id = "cl-floating-timer";
  root.setAttribute("data-slug", slug);
  Object.assign(root.style, {
    position: "fixed",
    bottom: position.bottom,
    right: position.right,
    zIndex: "2147483647",
    background: "rgba(10,10,20,0.92)",
    border: "1px solid rgba(6,182,212,0.3)",
    borderRadius: "10px",
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "13px",
    color: "#e2e8f0",
    boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.1)",
    userSelect: "none",
    cursor: "grab",
    transition: "opacity 0.2s",
    backdropFilter: "blur(8px)",
  });

  const icon = document.createElement("span");
  icon.textContent = "⏱";
  icon.style.cssText = "font-size:12px;opacity:0.7;";

  const display = document.createElement("span");
  display.id = "cl-timer-display";
  display.style.cssText = "min-width:46px;font-variant-numeric:tabular-nums;letter-spacing:0.05em;color:#06b6d4;font-weight:600;";
  display.textContent = fmt(state.elapsed);

  const btnPlay = document.createElement("button");
  btnPlay.id = "cl-timer-play";
  btnPlay.style.cssText = _btnStyle();
  btnPlay.title = state.running ? "Pause" : "Resume";

  const btnReset = document.createElement("button");
  btnReset.style.cssText = _btnStyle();
  btnReset.title = "Reset timer";
  btnReset.innerHTML = _svgReset();

  const btnClose = document.createElement("button");
  btnClose.style.cssText = _btnStyle() + "opacity:0.4;";
  btnClose.title = "Hide timer";
  btnClose.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  root.append(icon, display, btnPlay, btnReset, btnClose);
  _setPlayIcon(btnPlay, state.running);

  document.body.appendChild(root);

  // ── Ticker ──────────────────────────────────────────────────────────────────

  let rafId = null;

  function tick() {
    if (!state.running) return;
    const now = Date.now();
    const totalMs = state.elapsed + (now - (state.startMs || now));
    display.textContent = fmt(totalMs);
    rafId = requestAnimationFrame(tick);
  }

  if (state.running) rafId = requestAnimationFrame(tick);

  // ── Controls ─────────────────────────────────────────────────────────────

  function pause() {
    if (!state.running) return;
    state.elapsed += Date.now() - (state.startMs || Date.now());
    state.running = false;
    state.startMs = null;
    cancelAnimationFrame(rafId);
    display.textContent = fmt(state.elapsed);
    saveState(slug, state);
    _setPlayIcon(btnPlay, false);
    btnPlay.title = "Resume";
  }

  function resume() {
    if (state.running) return;
    state.running = true;
    state.startMs = Date.now();
    saveState(slug, state);
    _setPlayIcon(btnPlay, true);
    btnPlay.title = "Pause";
    rafId = requestAnimationFrame(tick);
  }

  function reset() {
    cancelAnimationFrame(rafId);
    state = { elapsed: 0, running: false, startMs: null };
    saveState(slug, state);
    display.textContent = fmt(0);
    _setPlayIcon(btnPlay, false);
    btnPlay.title = "Start";
  }

  function getElapsed() {
    if (state.running) {
      return state.elapsed + (Date.now() - (state.startMs || Date.now()));
    }
    return state.elapsed;
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    root.remove();
  }

  btnPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    state.running ? pause() : resume();
  });

  btnReset.addEventListener("click", (e) => { e.stopPropagation(); reset(); });

  btnClose.addEventListener("click", (e) => {
    e.stopPropagation();
    pause();
    root.style.opacity = "0";
    setTimeout(() => { root.style.display = "none"; }, 200);
  });

  // ── Drag ─────────────────────────────────────────────────────────────────

  let dragging = false, ox = 0, oy = 0;

  root.addEventListener("mousedown", (e) => {
    if (e.target !== root && e.target !== icon && e.target !== display) return;
    dragging = true;
    root.style.cursor = "grabbing";
    const rect = root.getBoundingClientRect();
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const x = e.clientX - ox;
    const y = e.clientY - oy;
    root.style.left = x + "px";
    root.style.top = y + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    root.style.cursor = "grab";
  });

  return { getElapsed, pause, resume, reset, destroy };
}

function _btnStyle() {
  return "background:none;border:none;color:#94a3b8;cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:color 0.15s;";
}

function _setPlayIcon(btn, running) {
  btn.innerHTML = running ? _svgPause() : _svgPlay();
}

function _svgPlay() {
  return `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="2,1 10,5.5 2,10"/></svg>`;
}

function _svgPause() {
  return `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1.5" y="1" width="3" height="9" rx="1"/><rect x="6.5" y="1" width="3" height="9" rx="1"/></svg>`;
}

function _svgReset() {
  return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 2.7-6.4"/><polyline points="3 3 3 9 9 9"/></svg>`;
}
