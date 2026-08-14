# CLAUDE.md

Guidance for Claude Code agents working in this repository.

## Orientation

Read [docs/GOALS.md](docs/GOALS.md) before feature work — it is the design
authority (goals, invariants, priorities, superseded decisions).
[docs/CUJS.md](docs/CUJS.md) says what people come here to DO — thirteen
numbered journeys, each with the scenario that proves it end to end — and it
is the **only place a CUJ number is assigned**; cite from it, never mint one.
[docs/ROADMAP.md](docs/ROADMAP.md) sequences the work — **start at its THE
ORDER table**, which interleaves the debt track and the owner's track;
[docs/UX.md](docs/UX.md) holds component specs. Shipped work, killed designs
and verified-pattern records live in [docs/SHIPPED.md](docs/SHIPPED.md), and
**a section that says SHIPPED moves there in the commit that ships it** — the
roadmap had grown to 3.7k lines of mostly-landed narrative before the
2026-08-14 cleanup.

[docs/UX-AUDIT.md](docs/UX-AUDIT.md) (2026-08-08) is the state-of-the-UX
read: what is working and by what mechanism, what is weak, and what NOT to
change. Its work items are ROADMAP Tier U. **Two cautions it raises about
this very list:** UX.md's §7 runs in commit order with no map, so "what is
true today" about a surface may need several sections reconciled — start from
the WHAT IS TRUE TODAY table (U4, shipped). And GOALS wins ties, so where the
audit found GOALS itself stale (the launcher carve-out), the doc you read
first is the one that is wrong.

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
- **This shell aliases `cp` and `mv` to their interactive forms**, so an
  overwrite inside a chained command waits forever on a prompt nobody sees
  (measured: one 2-minute timeout, 2026-08-13). Scripts and one-liners use
  `command cp -f`. `zsh` also has `noclobber` set: a heredoc into an existing
  path fails with "file exists" — `rm -f` first, or write somewhere new.

## Layout

`server.js` (zero-dep Node, in-memory rooms, SSE) · `js/main.js` (scene,
engine, ceremonies, UI) · `js/notation.js` (Roll20-dialect parser) ·
`js/rollspec.js` (shared roll mechanics, server + solo) · `js/meanings.js`
(interpretation system registry) · `js/stability.js` (the closed-beta channel:
`?stability=beta` decides what the settings panel OFFERS — towers and stages —
and NEVER what works, because the film is a function of the core and the seed;
UX §7.38) · `js/seed.js` (the dealt starting rack —
priced shelves, dice drawn inside the price) · `js/portable.js` (pools/settings ⇄
portable YAML — the ONLY rack transport; the `#g=` URL codec was dropped
2026-08-04, GOALS §7, and the URL now carries no user state beyond
`?room=`) · `js/net.js` (SSE/fetch client) · `tests/` (unit + fuzz +
`e2e/`) · `tools/forge/` (complex 3D models are BAKED to GLB via pinned
headless Blender, never hand-written as three.js geometry — use the
`/forge-model` skill; docs/FORGE-BAKEOFF.md is the decision record) ·
`js/towerglb.js` (the app's GLB loader — tower models declare dice-in/out
PORTALS as glTF nodes and the engine derives its volumes from them,
docs/TOWER.md; new towers go through `/new-tower`).
