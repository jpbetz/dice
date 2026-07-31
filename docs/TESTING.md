# Testing Policy

How this project validates changes. The goal is fast, repeatable
verification: a build step's validation should take minutes, not most of an
hour. [GOALS.md](GOALS.md) defines what must stay true;
[ROADMAP.md](ROADMAP.md)'s "Conformances to protect" lists the invariants —
this document defines how we check them.

## The layers

1. **Unit suites** (`npm run test:unit`, ~1 s) — pure-module tests for
   notation, rollspec, the URL codec, and the visibility projection
   (`redaction.test.mjs`: the `projectEntryFor` matrix in-process, plus an
   endpoint layer that spawns `server.js` on an ephemeral port and asserts on
   raw SSE bytes). Plain Node scripts under `tests/`, no framework.
2. **Fuzz** (`npm run test:fuzz`, ~1 s) — property-based notation fuzzing.
3. **Scripted e2e** (`npm run test:e2e`, seconds) — headless Chrome driven
   over raw CDP by the zero-dependency harness in `tests/e2e/` (Node ≥ 22's
   built-in WebSocket; no puppeteer, no npm install). Scenarios exercise the
   real client + server across tabs on distinct loopback origins (`localhost`,
   `127.0.0.1`, `127.0.0.2`, … are separate localStorage identities, which is
   how a scenario seats three or four players), asserting shared-truth
   invariants through the `window.__diceDebug` surface. A scenario may also
   step outside the browser: `apiPost` speaks to the API as a bare client
   (status + error code), and `RawPlayer` joins and holds an SSE stream open,
   keeping every byte the server sent — that is how a redaction claim is
   proved on the wire instead of on what a client chose to render.
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
| `visibility` | The ladder (goal 11): held · secret · whisper, reveal authority, offers/dice tower, redaction on the raw wire |
| `chrome`   | The persistent rail, the four collapsible panels (`dice.panels.v1`, emergent compact view), the identity chip (rename / leave & switch), and the *pool / saved pool* vocabulary (`terminology` scans every readable label, tooltip and placeholder) |
| `groups`   | Saved pools: inline row editor and popover update write back by id, save-as-variant stays additive (the tag keeps the `groups` spelling, like the code) |

New areas add a tag here and scenarios in `scenarios.mjs` (step 5 adds
`capture`; …).

### What `visibility` covers

`held-roll` (face down for everyone, the roller included → reveal → identical
full entries, chips `?` → real face) · `secret-roll` (no event, no log line,
no dice for anyone else; a later open roll proves the stream was live) ·
`whisper-roll` (three seats: the audience reads it, the chooser reads their
own, a bystander gets a shrouded roll they know happened) ·
`whisper-unknown-audience` (an unmatched name refuses the whole action, the
refusal is surfaced, nothing rolls) · `gm-screen-offer` (offer → claim → the
claimer rolls blind, the offerer reads it and holds the reveal) ·
`reveal-authority` (403 for anyone else, and asking anyway changes nothing) ·
`reveal-mid-playback` (a reveal landing while the shrouded roll is still
tumbling parks in `pendingReveals` and runs at settle — the 7f9cdf5 race, made
deterministic by `__diceDebug.holdClock(true)`, which freezes a tab's rAF
clock so only `sim()` moves it) ·
`raw-sse-leak` (a bytes-only player's stream and join snapshot carry no
values/total/perDie/modifier/parts/spec for a hidden roll, and never the
secret roll's id at all — with an open roll as the positive control) ·
`resync-shrouded` (a late joiner rebuilds a shrouded table; one arriving after
the reveal rebuilds a full one) ·
`alias-bindings` (the terminology amendment end to end: `/gmroll` rolls
secret — the roller reads it, the table learns nothing; `/sr` refuses with
the teaching error; `blind` is refused on a self-roll by client and server
alike and posts a dice-tower offer whose card carries mode `secret`).

The `#`-in-a-name whisper-misdirection ban is pinned in the redaction suite
(unit `cleanName` case + an endpoint case: join/rename strip `#`, `w:a#b`
fails closed as `unknown_audience`, the sanitized name addresses exactly its
player), which runs in `test:unit`.

## Scenario backlog

Not yet scripted (need `__diceDebug` hooks first — add them with the
feature work per P2):

- **Solo/static fallback**: full client behavior with no server (held stays a
  local face-down flow, `secret`/`w:` parse but act open, the picker disables
  them). Needs a static-hosting mode in the harness — every scenario today
  boots against the room server.
- **Ceremony phases**: declare/tumble/settle/verdict transitions via
  `ceremonyState` (partially observable today).

Scripted since (were on this list): **Offers** — offer → claim → attribution
to the claimer, in `gm-screen-offer`; **Reveal** — face down → reveal → chips
appear everywhere, in `held-roll` and `resync-shrouded`.
