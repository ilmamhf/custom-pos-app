# Taste
- Wants the `.commandcode` workspace files (settings, taste/learned preferences) tracked in git and committed with the project, not left as untracked local config. Confidence: 0.6
- Don't delete existing docs/files as "cleanup" even when they look superseded (e.g. an older audit doc) — keep them in their original location unless explicitly asked. Confidence: 0.6
- Prefers terse setup/run docs: ordered commands with a short trailing comment (`flutter run // run flutter app`), no prose explanations or detailed descriptions. Confidence: 0.6
- Wants precise, verified statements about tool/environment failures; don't flatten a specific error (e.g. "engine pipe not ready") into a vague claim like "Docker unavailable" — check the actual state first and report the real cause. Confidence: 0.6
- Tests features hands-on (real accounts, real builds) and pushes back when described behavior doesn't match — don't assert "this button works / does X" from reading code alone; trace the actual runtime path (route guards, mounted widgets) before claiming it works. Confidence: 0.6
- Prefers documentation written in tree/explorer style with the behavior annotated on each leaf (e.g. `- Button "Save Price" → PUT /stores/:id/...`, `- _ProductCard tap → CartNotifier.addProduct`), and one doc per app under `docs/tasks/`. Confidence: 0.55
- Explicitly wants research/diagnosis first ("research first") — verify the failure end-to-end (server/API, then client) and explain the root cause before editing code. Confidence: 0.6
