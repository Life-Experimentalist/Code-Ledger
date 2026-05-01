# Setting up Gemini API keys and repository variables for canonical mapping

Add these repository *Actions variables* or *secrets* to enable the canonical-map validator.

Recommended repository variables (plain text, visible to repo managers):

- `CANONICAL_VOTES_REQUIRED` — integer (default: `5`). Minimum number of valid 👍 reactions required to validate an issue.
- `GEMINI_MODEL` — model id to use (optional, default: `gemini-2.5-flash`).

Recommended repository secrets (keep them as Secrets):

- `GEMINI_API_KEYS` — comma- or newline-separated list of Gemini API keys (recommended if you have many keys).
- `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, ... — alternate way to provide keys (Actions will detect any `GEMINI_API_KEY_<n>` variables).

Notes:

- The validator script accepts either a single `GEMINI_API_KEYS` env var (comma/newline-separated) or multiple `GEMINI_API_KEY_<n>` secrets. It will collect and rotate keys automatically.
- For a quick verification step, add the `check-gemini-keys.mjs` script as a job step (it safely prints how many keys the runner can see without exposing confidential values).
- Also ensure your repository has `CANONICAL_VOTES_REQUIRED` set if you want a non-default threshold.

How to add (GitHub UI):

1. Go to your repository → Settings → Secrets & variables → Actions.
2. Under **Variables**, add `CANONICAL_VOTES_REQUIRED` (type Variable).
3. Under **Secrets**, add `GEMINI_API_KEYS` or `GEMINI_API_KEY_1`, etc. (type Secret).

Example values:

`GEMINI_API_KEYS` (example, DO NOT COMMIT real keys):

```
key-abc123, key-def456, key-ghi789
```

After adding the variables/secrets, run the workflow manually to validate.
