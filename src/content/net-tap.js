/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Network tap — runs in the MAIN world.
 *
 * LeetCode, GFG and Codeforces all put the verdict in the DOM, so their
 * handlers can read it from the isolated world. NeetCode and takeuforward do
 * not: both are React apps that POST the submission to their own judge and
 * render the result straight out of the JSON response. An isolated-world
 * content script cannot see that call — it has its own `window`, so patching
 * `fetch` there patches nothing the page will ever use.
 *
 * So this file runs in the page's own world (`"world": "MAIN"`, Chrome 111+ /
 * Firefox 128+, and the Firefox build already requires 142) and wraps `fetch`
 * and `XMLHttpRequest`. It is deliberately the dumbest thing that works:
 *
 *   - It forwards ONLY urls matching ENDPOINTS below. Everything else is
 *     passed through untouched and never read.
 *   - It never forwards request headers. That is where the session cookie and
 *     the bearer token live, and the handler has no use for either.
 *   - It never modifies a request or a response. The page gets the same
 *     promise it would have got, resolving with the same object.
 *
 * Messages go over `window.postMessage`, which the page can also send. The
 * receiving handler must treat every message as a claim, not a fact — see
 * `readTappedSolve()` in each platform's submission-detector.
 *
 * Plain script, not a module: content scripts are not ES modules, so this file
 * has no imports and defines nothing on `window`.
 */

(() => {
  "use strict";

  /** Marker so double-injection (SPA soft navigation) is a no-op. */
  const FLAG = "__codeLedgerNetTap";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const CHANNEL = "codeledger-net-tap";

  /**
   * The only requests worth looking at: a judge submitting, or a judge being
   * polled for the verdict of something already submitted. Substring match on
   * the full url, so a path change that keeps the endpoint name still works.
   */
  const ENDPOINTS = [
    // NeetCode — its own judge. Firebase callable, single request, verdict in
    // the response body.
    "/api/executeCodeFunctionHttp",
    // takeuforward (TUF+) — asynchronous: submit returns a handle, the verdict
    // arrives from a GET poll against check-submit.
    "/v1/plus/judge/submit",
    "/v1/plus/judge/check-submit",
    // takeuforward problem metadata. Worth tapping rather than requesting
    // ourselves: the judge authenticates with a bearer token the extension
    // never sees, and without it the API redacts `difficulty` and
    // `topic_tags` to the literal string "Subscribe to TUF+". The page's own
    // request has the token, so this is the only way to read the real values.
    "/v2/plus/problem/",
  ];

  /** Response bodies are small verdict payloads; anything larger is not one. */
  const MAX_BODY = 512 * 1024;

  function isWatched(url) {
    if (typeof url !== "string") return false;
    for (const e of ENDPOINTS) if (url.indexOf(e) !== -1) return true;
    return false;
  }

  function post(url, requestBody, responseBody, status) {
    try {
      window.postMessage(
        {
          source: CHANNEL,
          url: String(url),
          status: Number(status) || 0,
          requestBody: typeof requestBody === "string" ? requestBody.slice(0, MAX_BODY) : null,
          responseBody: typeof responseBody === "string" ? responseBody.slice(0, MAX_BODY) : null,
          at: Date.now(),
        },
        window.location.origin,
      );
    } catch (_) {
      /* a body that will not structured-clone is a body we cannot use */
    }
  }

  /** `fetch(input, init)` — input may be a string, URL, or Request. */
  function urlOf(input) {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    try {
      return String(input);
    } catch (_) {
      return "";
    }
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      const url = urlOf(input);
      const promise = nativeFetch.apply(this, arguments);
      if (!isWatched(url)) return promise;

      const reqBody = init && typeof init.body === "string" ? init.body : null;
      return promise.then((res) => {
        // Read the clone. Touching `res` itself would consume the body the
        // page is about to read, which would break the page.
        try {
          res
            .clone()
            .text()
            .then((text) => post(url, reqBody, text, res.status))
            .catch(() => {});
        } catch (_) {}
        return res;
      });
    };
  }

  const XHR = window.XMLHttpRequest;
  if (typeof XHR === "function" && XHR.prototype) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__clUrl = typeof url === "string" ? url : "";
      } catch (_) {}
      return open.apply(this, arguments);
    };

    XHR.prototype.send = function (body) {
      try {
        if (isWatched(this.__clUrl)) {
          const reqBody = typeof body === "string" ? body : null;
          this.addEventListener("load", () => {
            let text = null;
            try {
              // responseType "" and "text" are the only ones with a usable
              // `responseText`; reading it on any other throws.
              if (!this.responseType || this.responseType === "text") text = this.responseText;
              else if (this.responseType === "json") text = JSON.stringify(this.response);
            } catch (_) {}
            post(this.__clUrl, reqBody, text, this.status);
          });
        }
      } catch (_) {}
      return send.apply(this, arguments);
    };
  }
})();
