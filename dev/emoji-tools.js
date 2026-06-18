#!/usr/bin/env node
/*
 * Canonical emoji/encoding maintenance utility.
 *
 * Usage:
 *   node dev/emoji-tools.js scan
 *   node dev/emoji-tools.js repair
 *   node dev/emoji-tools.js repair --dry-run
 *   node dev/emoji-tools.js report --file src/popup/popup.html
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CP1252_EXTRA = {
	0x20ac: 0x80,
	0x201a: 0x82,
	0x0192: 0x83,
	0x201e: 0x84,
	0x2026: 0x85,
	0x2020: 0x86,
	0x2021: 0x87,
	0x02c6: 0x88,
	0x2030: 0x89,
	0x0160: 0x8a,
	0x2039: 0x8b,
	0x0152: 0x8c,
	0x017d: 0x8e,
	0x2018: 0x91,
	0x2019: 0x92,
	0x201c: 0x93,
	0x201d: 0x94,
	0x2022: 0x95,
	0x2013: 0x96,
	0x2014: 0x97,
	0x02dc: 0x98,
	0x2122: 0x99,
	0x0161: 0x9a,
	0x203a: 0x9b,
	0x0153: 0x9c,
	0x017e: 0x9e,
	0x0178: 0x9f,
};

const DEFAULT_ROOTS = ["src", "worker", "docs"];
const DEFAULT_EXTENSIONS = new Set([".js", ".html", ".css", ".md", ".json"]);
// Only JS files interpret \u{...} escapes — HTML/CSS/MD need real UTF-8 chars
const ENCODE_EXTENSIONS = new Set([".js"]);
const DEFAULT_SKIP_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"releases",
	"graphify-out",
]);

const DETERMINISTIC_REPLACEMENTS = {
	"ΓÇö": "—",
	"ΓÇô": "–",
	"ΓÇó": "·",
	"ΓÇª": "…",
	"ΓÇª": "…",
	"Γ£¿": "✨",
	"Γ¥î": "❌",
	"Γ£ô": "✅",
	"Γ₂ò": "➕",
	"Γ¡É": "❤️",
	"ΓÜí": "👁",
	"ΓÖ╣": "🔄",
	"ΓöÇ": "─",
	// codeledger additions
	"ΓåÆ": "→",
	"ΓêÆ": "-",
	"Γëê": "≈",
	"Γûú": "▣",
	"├ù": "*",
};

function parseArgs(argv) {
	const args = {
		command: "help",
		roots: [...DEFAULT_ROOTS],
		dryRun: false,
		file: null,
		limit: 200,
	};

	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (!token.startsWith("--")) {
			positional.push(token);
			continue;
		}

		if (token === "--dry-run") {
			args.dryRun = true;
			continue;
		}

		if (token.startsWith("--roots=")) {
			args.roots = token
				.slice("--roots=".length)
				.split(",")
				.map((x) => x.trim())
				.filter(Boolean);
			continue;
		}

		if (token.startsWith("--file=")) {
			args.file = token.slice("--file=".length);
			continue;
		}

		if (token.startsWith("--limit=")) {
			const n = parseInt(token.slice("--limit=".length), 10);
			if (Number.isFinite(n) && n > 0) args.limit = n;
		}
	}

	if (positional.length > 0) {
		args.command = positional[0];
	}

	return args;
}

function toUnicodeEscape(codePoint) {
	return `\\u{${codePoint.toString(16).toUpperCase()}}`;
}

function toByte(ch) {
	const cp = ch.codePointAt(0);
	if (cp <= 0xff) return cp;
	return CP1252_EXTRA[cp] ?? null;
}

function decodeEscapedCodePoints(text) {
	let out = text.replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (match, hex) => {
		const cp = parseInt(hex, 16);
		if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match;
		return String.fromCodePoint(cp);
	});

	out = out.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
		const cp = parseInt(hex, 16);
		if (!Number.isFinite(cp) || cp < 0) return match;
		return String.fromCharCode(cp);
	});

	return out;
}

function fixMojibake(text) {
	let result = "";
	let i = 0;
	let changed = false;

	while (i < text.length) {
		const firstByte = toByte(text[i]);
		if (firstByte == null) {
			result += text[i];
			i += 1;
			continue;
		}

		if (firstByte >= 0xc2 && firstByte <= 0xf4) {
			const expectedLen =
				firstByte >= 0xf0 ? 4 : firstByte >= 0xe0 ? 3 : 2;
			const seq = text.slice(i, i + expectedLen);

			if (seq.length === expectedLen) {
				const bytes = [];
				let ok = true;

				for (let k = 0; k < expectedLen; k++) {
					const b = toByte(seq[k]);
					if (b == null) {
						ok = false;
						break;
					}
					bytes.push(b);
				}

				if (ok) {
					const decoded = Buffer.from(bytes).toString("utf8");
					const singleCp = Array.from(decoded).length < expectedLen;
					if (
						!decoded.includes("�") &&
						singleCp &&
						decoded.codePointAt(0) > 127
					) {
						result += decoded;
						i += expectedLen;
						changed = true;
						continue;
					}
				}
			}
		}

		result += text[i];
		i += 1;
	}

	return { text: result, changed };
}

function normalizeUtf8(text) {
	return text.startsWith("﻿") ? text.slice(1) : text;
}

function applyDeterministicReplacements(text) {
	let out = text;
	for (const [bad, good] of Object.entries(DETERMINISTIC_REPLACEMENTS)) {
		out = out.replaceAll(bad, good);
	}
	return out;
}

function repairText(text) {
	let out = normalizeUtf8(text);
	const before = out;

	out = decodeEscapedCodePoints(out);
	for (let pass = 0; pass < 4; pass++) {
		const fixed = fixMojibake(out);
		out = fixed.text;
		if (!fixed.changed) break;
	}
	out = applyDeterministicReplacements(out);

	return { text: out, changed: out !== before };
}

function walk(dir, files = []) {
	if (!fs.existsSync(dir)) return files;
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!DEFAULT_SKIP_DIRS.has(entry.name)) {
				walk(fullPath, files);
			}
			continue;
		}

		if (!DEFAULT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			continue;
		}
		files.push(fullPath);
	}

	return files;
}

function collectFiles(roots) {
	const files = [];
	for (const root of roots) {
		walk(root, files);
	}
	return files;
}

function collectTargetFiles(args) {
	if (args.file) {
		return fs.existsSync(args.file) ? [args.file] : [];
	}

	return collectFiles(args.roots);
}

function runRepair(args) {
	const files = collectTargetFiles(args);
	if (args.file && files.length === 0) {
		console.error(`File not found: ${args.file}`);
		return 1;
	}

	let changed = 0;

	for (const file of files) {
		let original;
		try {
			original = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}

		const repaired = repairText(original);
		if (!repaired.changed) continue;

		if (!args.dryRun) {
			fs.writeFileSync(file, repaired.text, "utf8");
		}
		changed += 1;
		console.log(`${args.dryRun ? "Would repair" : "Repaired"}: ${file}`);
	}

	console.log(
		`Done. Files ${args.dryRun ? "to repair" : "repaired"}: ${changed}`,
	);
	return 0;
}

function runEncode(args) {
	let files = collectTargetFiles(args);
	if (args.file && files.length === 0) {
		console.error(`File not found: ${args.file}`);
		return 1;
	}

	// Restrict encoding to JS-only; HTML/CSS/MD don't interpret \u{...} escapes
	if (!args.file) {
		files = files.filter((f) => ENCODE_EXTENSIONS.has(path.extname(f).toLowerCase()));
	}

	let changed = 0;

	for (const file of files) {
		let original;
		try {
			original = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}

		let mutated = false;
		let encoded = "";

		for (const ch of original) {
			const cp = ch.codePointAt(0);
			if (cp > 127) {
				encoded += toUnicodeEscape(cp);
				mutated = true;
				continue;
			}
			encoded += ch;
		}

		if (!mutated) continue;

		if (!args.dryRun) {
			fs.writeFileSync(file, encoded, "utf8");
		}

		changed += 1;
		console.log(`${args.dryRun ? "Would encode" : "Encoded"}: ${file}`);
	}

	console.log(
		`Done. Files ${args.dryRun ? "to encode" : "encoded"}: ${changed}`,
	);
	return 0;
}

function runScan(args) {
	const files = collectFiles(args.roots);
	const pattern = /[Γ≡][^\s"'`]{0,24}/g;
	const counts = new Map();

	for (const file of files) {
		let content;
		try {
			content = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}

		for (const match of content.matchAll(pattern)) {
			const token = match[0];
			counts.set(token, (counts.get(token) ?? 0) + 1);
		}
	}

	const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	if (sorted.length === 0) {
		console.log("No suspicious mojibake tokens found.");
		return 0;
	}

	for (const [token, count] of sorted.slice(0, args.limit)) {
		console.log(`${token}\t${count}`);
	}
	console.log(`Found ${sorted.length} unique suspicious token(s).`);
	return 0;
}

function runReport(args) {
	if (!args.file) {
		console.error("Missing --file argument for report command.");
		return 1;
	}

	if (!fs.existsSync(args.file)) {
		console.error(`File not found: ${args.file}`);
		return 1;
	}

	const buffer = fs.readFileSync(args.file);
	const report = [];

	for (let byteOff = 0; byteOff < buffer.length; byteOff++) {
		if (buffer[byteOff] <= 0x7f) continue;

		const b = buffer[byteOff];
		let seqLen = 1;
		if (b >= 0xf0) seqLen = 4;
		else if (b >= 0xe0) seqLen = 3;
		else if (b >= 0xc0) seqLen = 2;

		const seqBytes = Array.from(buffer.slice(byteOff, byteOff + seqLen));
		const hex = seqBytes
			.map((x) => x.toString(16).padStart(2, "0"))
			.join("");
		const decoded = Buffer.from(seqBytes).toString("utf8");
		const cp = decoded.codePointAt(0);

		report.push(
			`@${byteOff} [${hex}] U+${cp.toString(16).padStart(4, "0")} '${decoded}'`,
		);

		byteOff += seqLen - 1;
	}

	if (report.length === 0) {
		console.log(`No non-ASCII bytes found in ${args.file}`);
		return 0;
	}

	const reportPath = path.join(path.dirname(__dirname), "dev", "emoji-report.txt");
	fs.writeFileSync(reportPath, report.join("\n"), "utf8");
	console.log(`Wrote ${report.length} line(s) to ${reportPath}`);
	return 0;
}

function printHelp() {
	console.log(`Emoji/Encoding Toolkit

Commands:
  scan                Find suspicious mojibake tokens.
  repair              Repair text encoding issues in source files.
  encode              Encode non-ASCII characters as \\u{...} escapes.
  report --file=PATH  Write non-ASCII byte report to dev/emoji-report.txt.

Options:
  --roots=src,worker,docs  Override scan/repair roots (default: src,worker,docs).
  --file=PATH              Target a single file for repair/encode/report.
  --dry-run                Show planned repair changes only.
  --limit=N                Limit scan output (default: 200).
`);
}

function main() {
	const args = parseArgs(process.argv.slice(2));

	switch (args.command) {
		case "scan":
			process.exitCode = runScan(args);
			break;
		case "repair":
			process.exitCode = runRepair(args);
			break;
		case "encode":
			process.exitCode = runEncode(args);
			break;
		case "report":
			process.exitCode = runReport(args);
			break;
		default:
			printHelp();
			process.exitCode = 0;
	}
}

main();
