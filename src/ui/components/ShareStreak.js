/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Posting the streak somewhere.
 *
 * The picture is the same `streakCard` that goes into the README, drawn here
 * into a canvas so it can leave as a PNG — nothing is uploaded anywhere to make
 * that happen, and the share buttons are the plain intent URLs each site
 * publishes. Close the dialog and no request has been made.
 *
 * The wording is editable before it goes out. A generated sentence is a
 * starting point, not something to put in someone's mouth.
 */

import { h, useState, useMemo } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { streakCard, badgeUrl } from "../../core/badge-svg.js";
import { shareSummary, shareLink, shareTargets, cardFilename } from "../../core/share-streak.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("ShareStreak");

const CARD_W = 420;
const CARD_H = 200;

/** The card as an inline image — no network, no third party. */
function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Rasterise the card at 2x.
 *
 * Deliberately the un-animated card: a canvas draws whatever frame the image is
 * on, and the animated one starts with an empty progress bar and invisible
 * numbers. Exporting that would produce a blank-looking picture perhaps one
 * time in three.
 *
 * @param {object} snapshot
 * @param {string} username
 * @returns {Promise<Blob>}
 */
async function cardPng(snapshot, username) {
  const svg = streakCard(snapshot, { username, animate: false });
  const img = new Image();
  img.src = svgDataUri(svg);
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * 2;
  canvas.height = CARD_H * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("could not encode the card"))),
      "image/png",
    );
  });
}

export function ShareStreak({ snapshot, settings, onClose }) {
  const s = settings || {};
  const username = s.github_owner || s.github_username || s.gitUser || "";
  const [text, setText] = useState(() => shareSummary(snapshot));
  const [status, setStatus] = useState("");

  const preview = useMemo(
    () => svgDataUri(streakCard(snapshot, { username })),
    [snapshot, username],
  );
  const link = shareLink(s);
  const targets = shareTargets(text, link);

  // The published card, addressable from anywhere. Only offered when the badges
  // are actually being committed — a link to a file the repo does not contain is
  // a broken image in somebody's portfolio.
  const published =
    s.gamificationBadges !== false && !!s.github_pages_url && !s.github_repo_private;
  const cardUrl = published ? badgeUrl(s.github_pages_url, "card", snapshot) : "";

  const say = (msg) => {
    setStatus(msg);
    setTimeout(() => setStatus((cur) => (cur === msg ? "" : cur)), 2500);
  };

  const download = async () => {
    try {
      const blob = await cardPng(snapshot, username);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = cardFilename(snapshot);
      a.click();
      URL.revokeObjectURL(url);
      say("Saved");
    } catch (e) {
      dbg.warn("card download failed:", e?.message || e);
      say("Could not save the card");
    }
  };

  const copyImage = async () => {
    // Firefox only grew image clipboard support recently, and a failed write
    // throws rather than returning false. Either way the user still gets the
    // card — it lands in downloads instead of the clipboard.
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      await download();
      return;
    }
    try {
      const blob = await cardPng(snapshot, username);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      say("Card copied");
    } catch (e) {
      dbg.warn("clipboard image failed, saving instead:", e?.message || e);
      await download();
    }
  };

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      say(`${label} copied`);
    } catch (e) {
      dbg.warn("clipboard text failed:", e?.message || e);
      say("Clipboard refused — copy it by hand");
    }
  };

  return html`
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick=${(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div
        class="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0d0d14] border border-white/10 shadow-2xl"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <span class="text-base font-semibold text-white">Share your streak</span>
          <button
            onClick=${() => onClose?.()}
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div class="p-5 space-y-4">
          <img
            src=${preview}
            alt="Your streak card"
            width=${CARD_W}
            height=${CARD_H}
            class="w-full max-w-[420px] mx-auto rounded-xl"
          />

          <label class="block">
            <span class="block text-xs font-medium text-slate-400 mb-1.5">Say it how you like</span>
            <textarea
              rows="3"
              value=${text}
              onInput=${(e) => setText(e.target.value)}
              class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 leading-snug resize-y focus:outline-none focus:border-cyan-500/40"
            ></textarea>
          </label>

          <div class="flex flex-wrap gap-2">
            <button
              onClick=${copyImage}
              class="px-3 py-1.5 text-xs rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 transition-colors"
            >
              Copy card
            </button>
            <button
              onClick=${download}
              class="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
            >
              Save PNG
            </button>
            <button
              onClick=${() => copy(link ? `${text}\n${link}` : text, "Text")}
              class="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
            >
              Copy text
            </button>
            ${cardUrl
              ? html`
                  <button
                    onClick=${() => copy(cardUrl, "Image address")}
                    title=${cardUrl}
                    class="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
                  >
                    Copy image address
                  </button>
                `
              : ""}
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-500">Post to</span>
            ${targets.map(
              (t) => html`
                <a
                  key=${t.id}
                  href=${t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
                >
                  ${t.label}
                </a>
              `,
            )}
          </div>

          <p class="text-[11px] text-slate-500 leading-snug">
            ${link
              ? html`The post carries your text and
                  <span class="text-slate-400 break-all">${link}</span>. Attach the card yourself —
                  copy or save it above, then drop it into the composer.`
              : `None of these sites can be handed a picture from here, so copy or save the card above and drop it into the composer yourself. Your repository is not linked because it is private or not set up yet.`}
          </p>

          ${status ? html`<p class="text-[11px] text-cyan-300">${status}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}
