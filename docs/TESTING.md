# Testing Policy

How this project validates changes. The goal is fast, repeatable
verification: a build step's validation should take minutes, not most of an
hour. [GOALS.md](GOALS.md) defines what must stay true;
[ROADMAP.md](ROADMAP.md)'s "Conformances to protect" lists the invariants —
this document defines how we check them.

## The layers

1. **Unit suites** (`npm run test:unit`, <1 s) — pure-module tests for
   notation, rollspec, and the URL codec. Plain Node scripts under `tests/`,
   no framework.
2. **Fuzz** (`npm run test:fuzz`, ~1 s) — property-based notation fuzzing.
3. **Scripted e2e** (`npm run test:e2e`, seconds) — headless Chrome driven
   over raw CDP by the zero-dependency harness in `tests/e2e/` (Node ≥ 22's
   built-in WebSocket; no puppeteer, no npm install). Scenarios exercise the
   real client + server across two tabs on two origins (distinct
   identities), asserting shared-truth invariants through the
   `window.__diceDebug` surface.
4. **Interactive browser checks** — a human (or agent) driving a live tab.

## The policy

**P1 — Scripted-first.** Repeated validation runs on scripts, never by
interactively driving a browser. Interactive checking is reserved for what
scripts cannot judge: the look and feel of *new* visuals, animation quality,
layout taste. Once a behavior exists, its regression check must be a script.

**P2 — Every feature ships with its scenario.** A build step is not done
until `tests/e2e/scenarios.mjs` covers its core behavior, tagged with the
step's area. The scenario library is how the next step's validation stays
cheap. If a scenario needs app state a script can't reach, add a getter or
entry point to `window.__diceDebug` (the supported headless test surface) —
never scrape fragile DOM or rely on rAF timing.

**P3 — Targeted per step, full before release.** Per build step, run:

- all unit suites + fuzz (they cost ~2 s — always),
- the e2e **smoke** set (`npm run test:e2e`), and
- targeted tags matching what the step touched
  (`node tests/e2e/run.mjs --only <tag>,<tag>`),
- one interactive pass over the step's *new* UX only.

The **full sweep** — `npm run test:e2e:full` plus an interactive pass over
established UX — runs before a release/milestone, not per step.

**P4 — Fresh rooms, ephemeral ports.** Every scenario runs in its own room
(rooms are independent in-memory worlds; that is the isolation boundary).
The harness picks free ports. **Port 8123 is the live preview table — no
test may ever touch it**, scripted or interactive.

## Running

```bash
npm test                              # unit + fuzz + e2e smoke — the per-step gate
node tests/e2e/run.mjs --only shelf   # targeted by tag
npm run test:e2e:full                 # everything — the pre-release gate
node tests/e2e/run.mjs --list         # scenarios and their tags
```

`CHROME_BIN` overrides Chrome discovery. A scenario fails on assertion
errors *and* on any uncaught page exception; `console.error` output is
reported but not fatal.

## Tags → areas

| Tag        | Covers                                          |
| ---------- | ----------------------------------------------- |
| `smoke`    | Cross-cutting core: shared truth, clear, shelf basics, settings sync, resync |
| `roll`     | Rolling, playback, post-roll controls           |
| `shelf`    | Collect shelf: auto-collect, cap/eviction, compaction, peek |
| `settings` | Room settings sync (felt, system)               |
| `notation` | Browser-side notation wiring (grammar itself is unit-tested) |
| `resync`   | Late-join / reload reconstruction               |

New areas add a tag here and scenarios in `scenarios.mjs` (step 4 adds
`visibility`; step 5 adds `capture`; …).

## Scenario backlog

Not yet scripted (need `__diceDebug` hooks first — add them with the
feature work per P2):

- **Offers**: offer → claim → roll attribution (hook: offer/claim entry
  points). Step 4 must add these alongside visibility scenarios.
- **Reveal**: face-down (`held`) roll → reveal → chips appear everywhere.
- **Solo/static fallback**: full client behavior with no server.
- **Ceremony phases**: declare/tumble/settle/verdict transitions via
  `ceremonyState` (partially observable today).
