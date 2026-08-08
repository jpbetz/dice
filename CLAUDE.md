# CLAUDE.md

Guidance for Claude Code agents working in this repository.

## Orientation

Read [docs/GOALS.md](docs/GOALS.md) before feature work — it is the design
authority (goals, invariants, priorities, superseded decisions).
[docs/ROADMAP.md](docs/ROADMAP.md) sequences the work;
[docs/UX.md](docs/UX.md) holds component specs.

[docs/UX-AUDIT.md](docs/UX-AUDIT.md) (2026-08-08) is the state-of-the-UX
read: what is working and by what mechanism, what is weak, and what NOT to
change. Its work items are ROADMAP Tier U. **Two cautions it raises about
this very list:** UX.md's §7 runs in commit order with no map, so "what is
true today" about a surface may need several sections reconciled — start
from the WHAT IS TRUE TODAY table once U4 lands. And GOALS wins ties, so
where the audit found GOALS itself stale (the launcher carve-out), the doc
you read first is the one that is wrong.

## Validation policy — read docs/TESTING.md and follow it

- Repeated validation is **scripted**: `npm test` (unit + fuzz + e2e smoke,
  seconds) plus targeted tags (`node tests/e2e/run.mjs --only <tags>`).
  Do NOT re-verify established behavior by interactively driving a browser —
  that is what made validation runs take 45+ minutes.
- Interactive browser checks are only for judging *new* visuals/UX.
- Every feature ships with an e2e scenario in `tests/e2e/scenarios.mjs`
  (tagged); add `window.__diceDebug` hooks when a scenario needs reach —
  never scrape fragile DOM.
- Full sweep (`npm run test:e2e:full` + interactive pass) is a pre-release
  gate, not a per-step cost.

## Hard rules

- **Port 8123 is the user's live preview table — never start, stop, or test
  against it.** Restart it only when server.js changes, and only from the
  main session. Tests pick their own ephemeral ports (the harness does this
  automatically).
- The app is zero-dependency by design: no npm installs, no build step.
  Three.js and cannon-es are vendored in `vendor/` (never edit). The e2e
  harness is also zero-dep (raw CDP over Node's built-in WebSocket).
- Every first-party file carries the Apache 2.0 header
  ("Copyright 2026 The Dice Table Authors").
- Work in small increments with git commits — long-running agents can die
  mid-task; committed work survives.

## Layout

`server.js` (zero-dep Node, in-memory rooms, SSE) · `js/main.js` (scene,
engine, ceremonies, UI) · `js/notation.js` (Roll20-dialect parser) ·
`js/rollspec.js` (shared roll mechanics, server + solo) · `js/meanings.js`
(interpretation system registry) · `js/seed.js` (the dealt starting rack —
priced shelves, dice drawn inside the price) · `js/portable.js` (pools/settings ⇄
portable YAML — the ONLY rack transport; the `#g=` URL codec was dropped
2026-08-04, GOALS §7, and the URL now carries no user state beyond
`?room=`) · `js/net.js` (SSE/fetch client) · `tests/` (unit + fuzz +
`e2e/`).
