/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where a commit is allowed to land, and in what order.
 *
 * These four functions are pure and live here rather than in the service worker
 * so they can be tested without a chrome stub. The worker imports them under its
 * old private names; nothing else calls them.
 *
 * The reason they were worth separating: two code paths decide where a commit
 * goes — the failover ladder (`getOrderedTargets`) and the replication pass
 * (`pushToMirrors`) — and they disagreed for as long as mirrors have existed.
 * Both now ask `isMirrorEnabled`, so the answer cannot drift again.
 */

/** Identity of a target for de-duplication. Provider defaults to github. */
export function targetKey(target = {}) {
  return `${target.provider || "github"}:${target.owner || ""}/${target.repo || ""}`;
}

/**
 * Is this mirror a live commit destination?
 *
 * `undefined` means yes — mirrors saved before the toggle existed carry no flag.
 * Only an explicit `false` means no, which is what addMirror() writes on every
 * mirror it creates ("Disabled by default", per the Git settings panel).
 */
export function isMirrorEnabled(mirror) {
  return mirror?.enabled !== false;
}

/** Trim a stored target down to {provider, owner, repo}, or null if unusable. */
export function normalizeGitTarget(target) {
  if (!target?.repo) return null;
  return {
    provider: target.provider || "github",
    owner: target.owner || "",
    repo: String(target.repo || "")
      .replace(/\s+/g, "-")
      .trim(),
  };
}

/** The repository the user configured in settings, before any failover. */
export function getDefaultPrimaryTarget(settings = {}) {
  const repo = (settings.github_repo || settings.gitRepo || "").replace(/\s+/g, "-").trim();
  if (!repo) return null;
  return normalizeGitTarget({
    provider: settings.gitProvider || "github",
    owner: settings.github_owner || settings.github_username || "",
    repo,
  });
}

/**
 * The failover ladder: active primary, then the configured primary, then every
 * ENABLED mirror, de-duplicated in that order.
 *
 * A disabled mirror is not a destination. It used to be one here while
 * `pushToMirrors` skipped it, so a mirror the user added and never switched on
 * could take a commit the primary refused — and the promotion branch in
 * `_commitWithFailover` would then write it to `git_active_primary`, making it
 * the permanent target.
 *
 * `git_active_primary` is dropped when it names a currently-disabled mirror.
 * Promotion stores only {provider, owner, repo}, so the flag does not travel
 * with it; without this check, turning a promoted mirror off would not stop
 * commits going there — which is exactly the state the missing filter left
 * people in. Dropping it falls through to the configured primary, which is the
 * recovery we want.
 */
export function getOrderedTargets(settings = {}) {
  const ordered = [];
  const seen = new Set();
  const primary = getDefaultPrimaryTarget(settings);
  const allMirrors = Array.isArray(settings.git_mirrors) ? settings.git_mirrors : [];
  const mirrors = allMirrors.filter(isMirrorEnabled).map(normalizeGitTarget).filter(Boolean);

  const disabledKeys = new Set(
    allMirrors
      .filter((m) => !isMirrorEnabled(m))
      .map(normalizeGitTarget)
      .filter(Boolean)
      .map(targetKey),
  );
  let active = normalizeGitTarget(settings.git_active_primary || null);
  if (active && disabledKeys.has(targetKey(active))) active = null;

  for (const t of [active, primary, ...mirrors]) {
    if (!t) continue;
    const key = targetKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(t);
  }
  return ordered;
}
