#!/usr/bin/env node
// Safe helper for GitHub Actions: prints how many Gemini API keys are configured (no key values).
const env = process.env;
function collect() {
    const keys = new Set();
    const add = (val) => String(val || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean).forEach(k => keys.add(k));
    add(env.GEMINI_API_KEYS);
    add(env.GEMINI_API_KEY);
    add(env.CANONICAL_GEMINI_API_KEYS);
    for (const [name, value] of Object.entries(env)) {
        if (!/^GEMINI_API_KEY_\d+$/i.test(name)) continue;
        if (value && value.trim()) keys.add(value.trim());
    }
    return keys;
}

const keys = collect();
console.log(`Detected ${keys.size} configured Gemini API key(s).`);
if (keys.size === 0) process.exitCode = 2;
else process.exitCode = 0;
