import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

import { Octokit } from "octokit";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { CONSTANTS } from "../../src/core/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const mapPath = path.join(repoRoot, "src/data/canonical-map.json");

const owner = process.env.GITHUB_REPOSITORY?.split("/")?.[0] || "";
const repo = process.env.GITHUB_REPOSITORY?.split("/")?.[1] || "";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY is required");
}

if (!token) {
    throw new Error("GITHUB_TOKEN is required");
}

const octokit = new Octokit({ auth: token });

const votesRequired = Number.parseInt(
    process.env.CANONICAL_VOTES_REQUIRED ||
    process.env.CANONICAL_MIN_UPVOTES ||
    String(CONSTANTS.CANONICAL_VOTES_REQUIRED ?? 5),
    10,
);

const geminiModel =
    process.env.GEMINI_MODEL ||
    process.env.CANONICAL_GEMINI_MODEL ||
    "gemini-2.5-flash";

function normalizeEntries(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.entries)) return json.entries;
    return [];
}

function normalizeAliases(entry = {}) {
    if (Array.isArray(entry.aliases)) {
        return entry.aliases.filter((alias) => alias?.platform && alias?.slug);
    }

    if (entry.platforms && typeof entry.platforms === "object") {
        return Object.entries(entry.platforms)
            .filter(([, slug]) => !!slug)
            .map(([platform, slug]) => ({ platform, slug }));
    }

    if (entry.aliases && typeof entry.aliases === "object") {
        return Object.entries(entry.aliases)
            .filter(([, slug]) => !!slug)
            .map(([platform, slug]) => ({ platform, slug }));
    }

    return [];
}

function slugify(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function extractRequestPayload(issue) {
    const body = issue.body || "";
    const blockMatch = body.match(/<!--\s*codeledger-canonical-request\s*-->[\s\S]*?```json\s*([\s\S]*?)\s*```/i);
    if (blockMatch?.[1]) {
        try {
            const parsed = JSON.parse(blockMatch[1]);
            if (parsed && typeof parsed === "object") return parsed;
        } catch (_) {
            // fall through to text parsing
        }
    }

    const titleMatch = body.match(/\*\*Canonical Title\*\*:\s*(.+)$/im);
    const topicMatch = body.match(/\*\*Topic\*\*:\s*(.+)$/im);
    const aliasMatches = [...body.matchAll(/\*\*(.+?)\*\*:\s*`([^`]+)`/g)];
    const aliases = aliasMatches
        .map((match) => ({ platform: match[1].toLowerCase(), slug: match[2].trim() }))
        .filter((alias) => alias.platform && alias.slug)
        .slice(0, 4);

    return {
        canonicalId: slugify(titleMatch?.[1] || issue.title.replace(/^\[Canonical\]\s*/i, "")),
        canonicalTitle: titleMatch?.[1]?.trim() || issue.title,
        topic: topicMatch?.[1]?.trim() || "arrays",
        aliases,
    };
}

async function listOpenCanonicalIssues() {
    return octokit.paginate(
        octokit.rest.issues.listForRepo,
        {
            owner,
            repo,
            state: "open",
            labels: "canonical-mapping",
            per_page: 100,
        },
        (response) => response.data.filter((issue) => !issue.pull_request),
    );
}

async function listIssueReactions(issueNumber) {
    const reactions = [];
    for (let page = 1; page <= 10; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await octokit.request(
            "GET /repos/{owner}/{repo}/issues/{issue_number}/reactions",
            {
                owner,
                repo,
                issue_number: issueNumber,
                per_page: 100,
                page,
                headers: {
                    accept: "application/vnd.github+json",
                },
            },
        );
        reactions.push(...res.data);
        if (res.data.length < 100) break;
    }
    return reactions;
}

const userCache = new Map();
async function getUser(login) {
    if (!login) return null;
    if (userCache.has(login)) return userCache.get(login);
    const user = await octokit.request("GET /users/{username}", { username: login });
    userCache.set(login, user.data);
    return user.data;
}

async function countValidUpvotes(issue) {
    const reactions = await listIssueReactions(issue.number);
    const issueCreatedAt = new Date(issue.created_at).getTime();
    const seen = new Set();
    let count = 0;

    for (const reaction of reactions) {
        if (reaction.content !== "+1") continue;
        const login = reaction.user?.login;
        if (!login || seen.has(login)) continue;
        seen.add(login);

        const user = await getUser(login).catch(() => null);
        if (!user) continue;
        if (user.type === "Bot" || /\[bot\]$/i.test(user.login || "")) continue;
        if (user.created_at && new Date(user.created_at).getTime() > issueCreatedAt) continue;
        count += 1;
    }

    return count;
}

function buildValidationPrompt(issue, payload, voteCount) {
    return [
        "You are validating whether a GitHub issue describes a canonical DSA problem mapping.",
        "Return only valid JSON with this shape:",
        '{"decision":"yes"|"no","reason":"...","canonicalId":"...","canonicalTitle":"...","topic":"...","difficulty":"Easy|Medium|Hard","pattern":"...","tags":["..."],"aliases":[{"platform":"leetcode","slug":"..."}],"confidence":0.0}',
        "Be conservative. Only answer yes if the issue clearly describes the same algorithmic problem across the provided aliases.",
        `Issue number: ${issue.number}`,
        `Issue title: ${issue.title}`,
        `Vote count: ${voteCount} (minimum required: ${votesRequired})`,
        `Canonical payload: ${JSON.stringify(payload, null, 2)}`,
        `Issue body:\n${issue.body || ""}`,
    ].join("\n\n");
}

function parseJsonResponse(text) {
    const trimmed = String(text || "").trim();
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        const block = trimmed.match(/\{[\s\S]*\}/);
        if (block?.[0]) return JSON.parse(block[0]);
        throw new Error("Gemini response was not valid JSON");
    }
}

function collectGeminiKeys() {
    const collected = [];
    const seen = new Set();

    const add = (value) => {
        for (const part of String(value || "").split(/[\n,]/)) {
            const key = part.trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            collected.push(key);
        }
    };

    add(process.env.GEMINI_API_KEYS);
    add(process.env.GEMINI_API_KEY);
    add(process.env.CANONICAL_GEMINI_API_KEYS);

    for (const [name, value] of Object.entries(process.env)) {
        if (!/^GEMINI_API_KEY_\d+$/i.test(name)) continue;
        add(value);
    }

    return collected;
}

function rotateKeys(keys, seed) {
    if (!keys.length) return [];
    const start = Math.abs(Number(seed) || 0) % keys.length;
    return [...keys.slice(start), ...keys.slice(0, start)];
}

async function validateWithGemini(issue, payload, voteCount) {
    const keys = rotateKeys(collectGeminiKeys(), issue.number);
    if (!keys.length) {
        throw new Error("No Gemini API keys configured. Set GEMINI_API_KEYS or GEMINI_API_KEY_1..N.");
    }

    const prompt = buildValidationPrompt(issue, payload, voteCount);
    let lastErr = null;

    for (const key of keys) {
        const client = new GoogleGenerativeAI(key);
        const model = client.getGenerativeModel({ model: geminiModel });

        try {
            const result = await model.generateContent(prompt);
            const text = result.response?.text?.() || "";
            const parsed = parseJsonResponse(text);
            if (!parsed || typeof parsed !== "object") {
                throw new Error("Gemini response did not contain an object");
            }
            return parsed;
        } catch (err) {
            lastErr = err;
            const msg = String(err?.message || err || "");
            const isRateLimit = /429|rate limit|RESOURCE_EXHAUSTED|quota/i.test(msg);
            if (!isRateLimit) {
                continue;
            }
        }
    }

    throw lastErr || new Error("Gemini validation failed with all available keys.");
}

function buildCanonicalEntry(issue, payload, voteCount, validation) {
    const aliasesFromPayload = Array.isArray(payload.aliases) ? payload.aliases : [];
    const aliasesFromValidation = Array.isArray(validation.aliases) ? validation.aliases : [];
    const aliases = [...aliasesFromPayload, ...aliasesFromValidation]
        .filter((alias) => alias?.platform && alias?.slug)
        .map((alias) => ({
            platform: String(alias.platform).toLowerCase(),
            slug: String(alias.slug).trim(),
            ...(alias.id !== undefined && alias.id !== null ? { id: alias.id } : {}),
        }))
        .filter((alias, index, arr) =>
            index === arr.findIndex((item) => item.platform === alias.platform && item.slug === alias.slug),
        );

    const difficulty = String(validation.difficulty || "").trim();
    if (!/^(easy|medium|hard)$/i.test(difficulty)) {
        throw new Error("Gemini returned an invalid difficulty. Expected Easy, Medium, or Hard.");
    }

    return {
        canonicalId: String(validation.canonicalId || payload.canonicalId || slugify(payload.canonicalTitle || issue.title)),
        canonicalTitle: String(validation.canonicalTitle || payload.canonicalTitle || issue.title),
        topic: String(validation.topic || payload.topic || "arrays"),
        difficulty: difficulty[0].toUpperCase() + difficulty.slice(1).toLowerCase(),
        pattern: String(validation.pattern || "unknown").trim() || "unknown",
        tags: Array.isArray(validation.tags) ? validation.tags.filter(Boolean).map(String) : [],
        aliases,
        voteCount: Number.isFinite(validation.voteCount) ? validation.voteCount : voteCount,
        confirmedBy: "gemini-validator",
        addedAt: new Date().toISOString().slice(0, 10),
    };
}

async function loadCanonicalMap() {
    const raw = await fs.readFile(mapPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("canonical-map.json must be an object with an entries array");
    }
    if (!Array.isArray(parsed.entries)) {
        throw new Error("canonical-map.json is missing entries[]");
    }
    return parsed;
}

function hasCanonicalConflict(entries, candidate) {
    return entries.some((entry) => {
        if (entry.canonicalId && entry.canonicalId === candidate.canonicalId) return true;
        if (String(entry.canonicalTitle || "").toLowerCase() === String(candidate.canonicalTitle || "").toLowerCase()) return true;

        const existingAliases = normalizeAliases(entry);
        return candidate.aliases.some((alias) =>
            existingAliases.some((existing) => existing.platform === alias.platform && existing.slug === alias.slug),
        );
    });
}

async function comment(issueNumber, body) {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

async function closeIssue(issueNumber) {
    await octokit.rest.issues.update({ owner, repo, issue_number: issueNumber, state: "closed" });
}

async function commitCanonicalMap(updated) {
    await fs.writeFile(mapPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

    await octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        sha: process.env.GITHUB_SHA,
        state: "success",
        context: "canonical-map-validator",
        description: "Canonical map validated and updated",
    }).catch(() => { });

    const run = (cmd, args) => new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd: repoRoot, env: process.env }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || stdout || err.message}`));
                return;
            }
            resolve({ stdout, stderr });
        });
    });

    await run("git", ["config", "user.name", "github-actions[bot]"]);
    await run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    await run("git", ["add", "src/data/canonical-map.json"]);

    try {
        await run("git", ["commit", "-m", "feat: merge canonical mapping from GitHub issues"]);
    } catch (err) {
        if (/nothing to commit/i.test(String(err.message || ""))) return false;
        throw err;
    }

    await run("git", ["push", "origin", `HEAD:${process.env.GITHUB_REF_NAME || "main"}`]);
    return true;
}

async function processIssue(issue) {
    const voteCount = await countValidUpvotes(issue);
    if (voteCount < votesRequired) {
        return { status: "skipped", reason: `Waiting for ${votesRequired - voteCount} more valid upvote(s).` };
    }

    const payload = extractRequestPayload(issue);
    const map = await loadCanonicalMap();
    const existingEntries = normalizeEntries(map);

    const validation = await validateWithGemini(issue, payload, voteCount);
    if (String(validation.decision || "").toLowerCase() !== "yes") {
        return { status: "rejected", reason: validation.reason || "Gemini returned no." };
    }

    const candidate = buildCanonicalEntry(issue, payload, voteCount, validation);
    if (hasCanonicalConflict(existingEntries, candidate)) {
        await comment(issue.number, `Canonical mapping already exists for **${candidate.canonicalTitle}**. The issue will be closed.`);
        await closeIssue(issue.number);
        return { status: "already-exists" };
    }

    existingEntries.push(candidate);
    map.entries = existingEntries;
    if (typeof map.version !== "number") map.version = 3;

    const committed = await commitCanonicalMap(map);
    await comment(
        issue.number,
        committed
            ? `Gemini approved this canonical mapping with ${voteCount} valid upvote(s). The canonical index has been updated.`
            : `Canonical mapping was validated, but no repository changes were needed.`,
    );
    if (committed) {
        await closeIssue(issue.number);
    }

    return { status: committed ? "merged" : "no-change" };
}

async function main() {
    const issues = await listOpenCanonicalIssues();
    if (!issues.length) {
        console.log("No open canonical mapping issues found.");
        return;
    }

    const results = [];
    for (const issue of issues) {
        // eslint-disable-next-line no-await-in-loop
        const result = await processIssue(issue).catch((err) => ({ status: "error", reason: err.message }));
        results.push({ issue: issue.number, ...result });
        console.log(`Issue #${issue.number}: ${result.status}${result.reason ? ` - ${result.reason}` : ""}`);
    }

    const merged = results.filter((item) => item.status === "merged").length;
    const alreadyExists = results.filter((item) => item.status === "already-exists").length;
    const rejected = results.filter((item) => item.status === "rejected").length;
    const skipped = results.filter((item) => item.status === "skipped").length;
    const errors = results.filter((item) => item.status === "error").length;

    console.log(JSON.stringify({ merged, alreadyExists, rejected, skipped, errors }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});