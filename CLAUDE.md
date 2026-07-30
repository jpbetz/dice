# CLAUDE.md

Guidance for Claude Code agents working in this repository.

## Orientation

Read [docs/GOALS.md](docs/GOALS.md) before feature work — it is the design
authority (goals, invariants, priorities, superseded decisions).
[docs/ROADMAP.md](docs/ROADMAP.md) sequences the work;
[docs/UX.md](docs/UX.md) holds component specs.

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
(interpretation system registry) · `js/urlgroups.js` (#g= codec) ·
`js/net.js` (SSE/fetch client) · `tests/` (unit + fuzz + `e2e/`).
