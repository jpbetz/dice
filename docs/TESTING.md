# Testing Policy

How this project validates changes. The goal is fast, repeatable
verification: a build step's validation should take minutes, not most of an
hour. [GOALS.md](GOALS.md) defines what must stay true;
[ROADMAP.md](ROADMAP.md)'s "Conformances to protect" lists the invariants —
this document defines how we check them.

## The layers

1. **Unit suites** (`npm run test:unit`, ~1 s) — pure-module tests for
   notation, rollspec, meanings, the dealt starting rack
   (`seed.test.mjs`: 4000 deals re-priced through `budgetOf`, because a
   shelf that misses its price is the one failure the seed can have),
   the portable YAML, and the visibility
   projection
   (`redaction.test.mjs`: the `projectEntryFor` matrix in-process, plus an
   endpoint layer that spawns `server.js` on an ephemeral port and asserts on
   raw SSE bytes). Plain Node scripts under `tests/`, no framework.
   `presence.test.mjs` is the other spawned-server suite: how a seat LEAVES
   (`/api/leave`, `/api/pong`, the staleness sweep), shrinking the server's
   clocks through `DICE_HEARTBEAT_MS` / `DICE_LIVENESS_TIMEOUT_MS` because a
   browser cannot wait out three 20 s heartbeats. It lives here rather than in
   e2e for that reason alone — the browser half is the `seat-closed-tab`
   scenario.
   `schema.test.mjs` is C22's versioning contract, and it is the suite whose
   failure costs a real person their data: its centre is the literal bytes a
   browser in the field is holding for `dice.profiles.v1` — **no version stamp
   at all** — and the assertion that those still LOAD. Everything else there
   guards the asymmetry (older data migrates, newer data refuses out loud),
   which is easy to write backwards and impossible to notice once shipped.
   It also pins the two deliberate copies of the version number: `js/report.js`
   hard-codes it because a crash reporter that imported the module graph would
   share the fate of the thing it reports on.
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

**P5 — A commit that edits `window.__diceDebug` diffs its key list.**
That object is ~300 keys of one literal in a 15k-line file, and deleting a
region of it by index is a text operation with no compiler behind it. C25's
shelf deletion swallowed **fourteen unrelated hooks** — `entryState`,
`chipsVisible`, `restInfo`, `tableDiceInfo`, `fxInfo`, the offer entry
points — and the symptom was four scenarios failing with `is not a function`
and nothing whatsoever about shelves. Run this before committing; it takes a
second and it names exactly what left:

```bash
git show HEAD:js/main.js > /tmp/old-main.js && python3 -c "
import re; pat = re.compile(r'^  (?:get )?([A-Za-z_\$][\w\$]*)\s*[({]', re.M)
o=set(pat.findall(open('/tmp/old-main.js').read())); n=set(pat.findall(open('js/main.js').read()))
print('LOST  :', sorted(o-n)); print('GAINED:', sorted(n-o))"
```

Anything in `LOST` that you did not mean to remove is a hook some scenario
still calls. (Confirmed useful the same night by the session working on the
contact recorder, which ran it before merging and got a clean
`LOST: none / GAINED: ['contactStats']`.)

**P7 — A key list proves a hook EXISTS; something must prove it ANSWERS.**
P5's blind spot, found the same night it was written. A rename left four
dangling references inside `matFit()`'s body — the key was still on the
object, so P5 passed, and the hook threw `ReferenceError` on every call from
the moment it landed. Three consecutive full sweeps stayed green, because its
only caller was a tool step rather than a scenario. **The stand-in we added to
stop stand-ins going stale had itself gone stale** (ROADMAP C27's rule, aimed
at a check instead of at code).

`debug-surface-answers` (tag `quality`) closes it: with dice on the felt, it
calls every ZERO-ARG `__diceDebug` hook and asserts none throws. Zero-arg on
purpose — a hook taking arguments changes state, and a smoke test has no
business guessing what to pass. It was verified the only way this kind of
check can be: by reintroducing a dangling reference, watching it fail, and
restoring it. A guard nobody has seen fail is not yet a guard.

**P6 — A scenario that samples an animation freezes the clock.**
`__diceDebug.holdClock(true)` makes the world advance exactly as far as
`sim()` says and no further. Without it, a sampling loop is racing the rAF
loop across CDP round trips: `dice-depart` sampled a 0.3 s departure over six
round trips and caught two frames instead of five, failing ~70% of the time
**in isolation** while passing inside a sweep where the timing happened to
work out. Every stepped effect (`stepSinking`, `stepRevealing`,
`particleField`, the shader clock) is dt-driven precisely so this guarantee
exists — take it. Release the hold before anything that needs a running
clock, and before the scenario ends.

**P8 — The harness's blind spots are POPULATIONS: warm profiles and state
TRANSITIONS.** Two instances in one day (2026-08-13). The GLB loader's
`force-cache` pinned re-baked models on every returning browser — invisible
to every scenario because a harness profile is born with an empty HTTP
cache, so the entire cache-policy dimension was untested by construction.
Same day: a venue palette flip never re-dressed the standing tower —
invisible because every scenario and look-driver goes COLD into one venue,
so the flip path had zero coverage until a loudly-pigmented model stood
under the wrong sky. Cold-boot coverage proves nothing about what a warm or
switching client sees. The cure is a MANUFACTURED case, not a bigger sweep:
`tower-glb-freshness` rotates bytes under one url behind a throwaway origin
speaking server.js's exact contract; `venue-set` flips venues mid-session
and asserts the re-dress. When a feature has cache behavior or follows a
mode switch, its scenario must include the warm/switched leg explicitly.

**P9 — A determinism gate proves STABILITY, never CORRECTNESS.** The round-6
double-bake reproduced both GLBs byte-for-byte while the app was showing the
wrong palette's model — the gate was green because it only ever promised
"same answer again". Pair every determinism claim with a CONTENT claim
(venue-set's berm discriminator: the two skies' baked vertex-color means
must DIFFER — identical means was the smoking gun that found the bug). The
diagnostic that settles "wrong bytes or wrong pipeline" is sampling the
BAKED attribute off the live geometry (`__diceDebug.meshColors`); no
rendered frame can answer it, because the frame is the pipeline.

**P10 — Gate the RENDERED quantity, never the authored one.** W5's firefly
field was written at 0.22 against a declared tertiary ceiling of 0.25 and
rendered at 0.09, because the scalar multiplies a teal whose own luma is
0.416 — the tier gate, had it been written against the dial, would have
passed a field nobody could see, forever, while reporting a number that
looked deliberate. A gate on an authored value only ever re-states the
author's intent back to them; the same failure shape as a bake check that
reads constants instead of built vertices (`/forge-model` §1). Ask what
UNIT the doctrine is written in — a tier is a luminance, a budget is
pixels, a size is device pixels after projection — convert, and have the
probe report the converted product. `venue-life` asserts `fliesLuma` and
`wispLuma`, never the peaks they came from.

And when the quantity is a SIZE, measure it with a ladder rather than
arithmetic: the same field was invisible at `THREE.Points` size 0.20
because a point's pixels go as size × halfHeight / depth, and the census
happily reported fifty-one lit members in frame. Three renders at
0.2/0.5/0.9 settled in one pass what two rounds of brightness reasoning
had not.

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

### How much machine a run may use

A full sweep opens ~147 tables, and every one constructs a
`THREE.WebGLRenderer` — so a run is really ~147 renderer create/teardown
cycles, back to back. Runs are **serial** by design (`run.mjs` is a plain
for-loop, one browser, one page at a time), so the suite's own peak is modest.

| env | default | what it does |
|---|---|---|
| `DICE_E2E_GPU=1` | off | render WebGL on the real GPU instead of SwiftShader |
| `DICE_E2E_CORES=8` | unset (unbounded) | pin the browser tree to N cores via `taskset` |

**The suite has never used the GPU**, and that is Chrome's choice rather than
this repo's — bare `--headless` selects SwiftShader for WebGL on its own.
Probed directly:

```
--headless                -> ANGLE (SwiftShader Device), SwiftShader
--headless --enable-gpu   -> ANGLE (NVIDIA GeForce RTX 4090), NVIDIA
```

Every scenario is green against the software path, and the die-art pass
renders fine on it (all eight palette tiles carry real art). `DICE_E2E_GPU=1`
opts into hardware — closer to what the app ships on, and the way to tell
whether a rendering bug is SwiftShader-specific.

#### A wrong diagnosis, recorded so it is not repeated

On 2026-08-08 this file briefly carried an explicit SwiftShader block. A host
had died mid-run three times with **nothing in the kernel log** — no panic, no
OOM, no MCE, no thermal trip, the journal simply stopping mid-line, which is a
power event rather than a software fault — and taking the GPU out of the loop
looked like the lever.

Wrong twice. **Wrong component:** the GPU was already capped to 300 W while
the CPU package limit was *unlimited* (`intel-rapl:0/constraint_*` at 4095 W
on a 13900K); software rasterization would have moved load off the capped part
onto the uncapped one. Capping the CPU stopped the crashes, and they stayed
stopped with the GPU unrestricted. **And a no-op:** the renderer was
SwiftShader before the block and after it, so the change never altered what it
claimed to.

Three lessons, all cheaper to read than to relearn. **Read the failure before
choosing the remedy** — the kernel log said "power event, no software fault"
from the first crash, and the component was guessed at rather than measured.
**Verify that a fix changed what you think it changed** — one probe of
`UNMASKED_RENDERER_WEBGL` would have shown the block did nothing, and it was
run only after the second wrong conclusion. And **a multi-agent pass
multiplies the peak by the number of agents**: the crashes came while a
97-scenario sweep ran alongside six agents each starting their own headless
Chrome. Serialize that work; do not overlap it.

## Tags → areas

Four kinds. **Area tags** (below) say what a scenario touches. **Journey tags**
(`cuj1`…`cuj13`, [CUJS.md](CUJS.md)) say which user journey it walks, so
`--only cuj7` runs the journey rather than a surface. **`journey`** is the
gate tag: it marks the ONE composed walk per journey (the table above), and
`--only journey` is the pre-release selector. And one **lane tag**, `look`,
which is the only tag with a RULE attached.

**The `look` lane (ROADMAP T4).** A tower model is theatre over invisible
engine colliders: physics and the pour film are a function of (portal spec,
engine constants, seed), and the mesh is not an input. So a cosmetic claim owes
measurements and LOOK sheets and owes simulation **nothing** — and the saving
is the whole point, because a pour costs tens of seconds and a geometry read
costs milliseconds. A scenario tagged `look` therefore may not simulate a
single die, and `runScenarios` **proves** it: after the scenario returns it
reads `__diceDebug.diceEverMade()` from every tab and fails on any non-zero
answer — or on a counter it cannot read at all, because a guard that passes
when its instrument is missing is the green check this project keeps catching
itself writing. `node tests/e2e/run.mjs --only look` is the lane.

Do not reach for the tag to make a slow scenario look fast: the claims have to
BE cosmetic. `tower-dressing` is the worked example — groups, geometry
aggregates, budgets and registry declarations, all readable off a socketed
model — and its sibling `tower-roll` keeps everything that needs dice.

**Why journeys get their own selector.** A journey with no end-to-end proof
can pass in every part and fail as a whole. That is measured, not argued:
`prepared-seat` was green for weeks while **CUJ7 was broken for every
returning player**, because the fixture seeded no name and so only ever
tested first-timers (UX-AUDIT E1 → ROADMAP U3). Every part was correct; the
journey was not.

**The rule, and it is a gate rather than a sentence — a rule with no selector
is a wish (ROADMAP C1 + C3's open half, 2026-08-14).** Every journey that has
code owns exactly ONE scenario tagged **`journey`**: the composed walk, the
table below. `node tests/e2e/run.mjs --only journey` is a **release gate** that
must be green before a milestone ships. And **a feature that changes a journey
updates that journey's composed scenario IN THE SAME COMMIT** — not its
part-scenarios instead of it, and not in a follow-up. This is the same rule
UX.md's WHAT IS TRUE TODAY table already applies to surfaces; the part
scenarios cannot enforce it and never could, which is the whole of what the
paragraph above measures.

A composed scenario is recognisable rather than merely tagged. It walks the
journey's own **done when** sentence from CUJS.md in order, it uses the
controls a person uses (a tap on the palette, the ± popover's fields, the
recents row) rather than the notation shortcut that makes a part-scenario
cheap, and its closing assertions are about **what somebody ends up holding** —
the pools in their hand, the three log counts at three seats, the bytes a
fourth player's stream did not carry. `journey-who-sees-this` ends on a raw SSE
stream; `journey-follow-along`'s fixture is a player who never rolls. An
assertion that a widget exists belongs in a part-scenario.

| journey | composed scenario |
| --- | --- |
| CUJ1 | `lobby-no-prompt` |
| CUJ2 | `journey-call-the-game` |
| CUJ3 | `prepared-seat` |
| CUJ4 | `journey-between-games` |
| CUJ5 | `journey-split-the-party` |
| CUJ6 | `profile-library` (its persistence half is `profile-library-reload`) |
| CUJ7 | `profile-dm-prepares` |
| CUJ8 | `journey-roll-this-thing` |
| CUJ9 | `journey-legible-evening` |
| CUJ10 | `journey-who-sees-this` |
| CUJ11 | `journey-follow-along` |
| CUJ12 | `journey-different-game` |
| CUJ13 | `profile-file` |

Scenarios with **no** `cuj` tag are deliberate: they are cross-cutting quality
gates that apply to every journey rather than walking one — `a11y-modals`,
`touch-targets`, `terminology`, `resync`, `perf-determinism`, `announced`,
`lab-geo-bench`. Tagging those with a journey would claim they prove one.

| Tag        | Covers                                          |
| ---------- | ----------------------------------------------- |
| `smoke`    | Cross-cutting core: shared truth, clear, shelf basics, settings sync, resync |
| `roll`     | Rolling, playback, post-roll controls           |
| `shelf`    | Collect shelf: auto-collect, cap/eviction, compaction, peek |
| `settings` | Room settings sync (felt, system)               |
| `notation` | Browser-side notation wiring (grammar itself is unit-tested) |
| `resync`   | Late-join / reload reconstruction               |
| `visibility` | The ladder (goal 11): held · secret · whisper, reveal authority, offers/dice tower, redaction on the raw wire |
| `chrome`   | The persistent rail, the ONE Pools panel (`dice.panels.v1`, legacy two-region state migrates; emergent compact view), the identity chip (rename / leave & switch), and the *pool / saved pool* vocabulary — `terminology` scans every readable label, tooltip and placeholder across the standing chrome AND the result surfaces (banner, ceremony layer, peek, log flyout, offers, offer menu, seat modal, status pill), for `tray`/`group`/`rack`/`compose`/`category`. **It plays the table first, and asserts every swept root CARRIED TEXT before judging a word**: four of those eight surfaces hold zero characters at rest, so sweeping a quiet table is a green check over nothing. Also the pinned log vs the result banner (`flyout-banner`), which measures OCCLUSION with `elementFromPoint` rather than trusting `--banner-lift` — and whose rotation leg **was a known RED and is now green**: `syncFlyoutLift` was driven only by a ResizeObserver on the two boxes, and a rotation can move them into one column without resizing EITHER — so the observer never fired, the lift stayed stale, and the log covered 251/900 of the read until the next roll (measured 2026-08-17, 1440x900 → 844x390; closing and re-opening the log cleared it, which is what proved the geometry right and the trigger missing). Fixed by also syncing on `resize`, the same event the felt re-fits on. The assertion was never weakened to reach green |
| `seat`    | Seat identity: rename / change seat (`identity-chip`), and the seat surviving a refresh — same playerId, same color, no roster churn, per-TAB not per-origin (`seat-resume`) |
| `identity` | `dice.who.v1` rung 1 ([IDENTITY.md](IDENTITY.md) §5, UX §7.52): a seat outliving its TAB. The browser key is per-ORIGIN localStorage and the seat is per-TAB sessionStorage, and the difference is the feature — `who-resume` asserts both storages before it asserts anything else. Three scenarios, all also tagged `seat`: the lapsed-seat resume carrying the REVEAL AUTHORITY with it (`who-resume` — before rung 1 the returning browser got a fresh uuid and its own held roll answered 403), the live-seat REFUSAL, which is one comparison and is the whole security argument (`who-never-steals` — and it was green before the feature too, so its first assertion proves the two tabs really share one key, or the rest is vacuous), and the held roll surviving a reload driven through `dropSeatMemory()` rather than through a real 5 s grace (`who-held-survives-reload`). **`who-resume` lands the pagehide beacon itself, awaited** (`POST /api/leave` with no `streamId` — the endpoint's own "drop them all" mode): `sendBeacon` cannot be awaited from anywhere, so `close()` returning says nothing about the server having noticed, and the join beat the socket close once inside a 38-scenario lane |
| `lobby`   | The lobby → table flow (§3b, UX §7.20): the bare URL prompting for nothing and issuing **zero** API calls (`lobby-no-prompt`, in smoke), the presence row's exits, the suppression pass (no phantom table name, no invite link, no room-scoped settings), minting a table, the Invite chair retiring into a real roster pill, per-seat chairs on a prepared table, leaving without losing your name, and a table name surviving the room evaporating |
| `table-file` / `prepared-seat` | The prepared table (Tier G) as amended by §11: a chosen seat now becomes a PROFILE of the player's own rather than merging into their one rack, so `prepared-seat` asserts that their own profile is left untouched |
| `groups`   | Saved pools: inline row editor and popover update write back by id, save-as-variant stays additive (the tag keeps the `groups` spelling, like the code) |
| `profiles` | The profile library (§11): the lossless switch (`profile-library`, in smoke), the store surviving a reload with the same profile in hand, the system binding and the mismatch that is labelled rather than swapped, the join-time picker filtered to the table's system with last-used pre-selected (`profile-join-pick`, in smoke), Random per system, copying a teammate's published profile, and the whole library round-tripping through the file with exactly ONE home per rack |
| `tower`    | The dice tower as a room setting ([TOWER.md](TOWER.md)): `tower-roll` sockets `heartwood`, pours four pools through it, and proves the exit guarantee, the hidden windows *on screen*, the baffle clunks, same-seed and cross-client replay, the mid-roll defer, and — THE FIRST LAW — that coming back down leaves the world byte-for-byte the towerless one. It carries a 40d6 stress pool on purpose: the pour's one measured failure never appeared below twenty dice |
| `subtables` | Breakouts (§3b L4, CUJ5, UX §7.46): the composed walk (`journey-split-the-party`, also `journey`/`cuj5`), the follower who did not split and the stranger arriving by raw URL (`split-follower`), the four populations where the authoring verb is withheld and the 403 behind it (`split-chrome-quiet`), the pointer surviving the room it names (`split-orphan`), and hello's present-or-absent rule both ways (`split-reconnect`). `--only subtables` is the set; `--only cuj5` is the walk alone. **Read the block comment above `SPLIT_GHOSTS` in `scenarios.mjs` before adding one** — walking between tables sends no leave beacon, so the old table's roster keeps the walker for ~75 s and no scenario may wait on it emptying |
| `journey`  | The GATE lane: the one composed walk per journey (table above), run as `--only journey` before a release. A journey with parts and no walk passes everywhere and fails as a whole |
| `look`     | The COSMETIC lane (rule above; no dice, enforced). `tower-dressing` walks every skinned registry row and asserts the dress groups each one DECLARES, that the skin is visible as an aggregate over the `towerSkin*` subtree, the dressing TRIANGLE budget (≤4k, art restraint) and the WHOLE TOWER's draw budget (≤20 — frame cost is total draws, not dress draws; the three code-built classics carry named, valued, self-cleaning overruns at 49/61/88, ROADMAP T14 and T15), and the family traits: an ember on the row with its lamps readable by value, zero lights in the skin |
| `audio`    | V1 sound ([AUDIO.md](AUDIO.md)): the graph built once at unlock and suspended until a real gesture (`audio-graph`), the three-phase contact machine derived off the film (`audio-phases`), the rolling voice pool and its teardown (`audio-rolling`), the settle cluster's seeded schedule and its own gate cursor (`audio-settle`), the tower shaft send and the FIRST LAW asked of `impactVoiceFor` (`audio-shaft`), the room bed's two switches (`audio-ambience`), and the venue's palette — the grounded row inert in effect, a fantasy venue's trim as an exact product, the baffle knock that keeps the neutral ground, the tail that changes level and not rhythm, and a bed that re-voices in place and is never switched ON by a venue (`audio-venue`). Every scenario also carries `fx` and `roll`. What makes it testable headless: Chrome runs `--mute-audio` WITHOUT `--autoplay-policy=no-user-gesture-required`, so the graph is fully observable while the hardware stays silent and the suspended-until-gesture state reproduces exactly |
| `stability` | The closed-beta channel (UX §7.38, `js/stability.js`): what the settings panel OFFERS a production browser, and — the leg that costs dice — that the offer is ALL it gates. `stability-gate` puts a stable client and a beta client in one room, pours, and compares both films: refusing the room's tower on the stable client passes every visibility assertion in the file and puts different dice in front of the two players. **Every harness tab is a beta tab** (towers and venues are unreleased and the suite's job includes them), so the population that matters is reached deliberately — `clean: ['dice.stability.v1']` for a browser that has never heard of the beta, `query: '&stability=stable'` for the revoke link. A default that only ever booted one channel is `prepared-seat`'s failure with a new subject |
| `lab`      | The dice lab as a raw page (not in smoke — it bakes ~2000 canvas textures): the GEO BENCH sweep's geometry claims via `geoStats`, the SET BUILDER's live rebuild via `builderSet` + `faceDump`, lab-only ids staying out of `SET_IDS` |

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

## Reading crashes from the field

Clients report uncaught exceptions, unhandled rejections and failed resource
loads to `POST /api/clienterror`, which writes one `clienterr` line to stdout
and nothing else — no store, no file, no retention decision. On Cloud Run that
means:

```bash
gcloud run services logs read dice --region us-central1 --limit 200 | grep clienterr
```

`js/report.js` is a **classic script loaded before the module graph**, because
the most valuable failure to catch is `js/main.js` failing to parse or one of
its imports 404ing — at which point nothing inside main.js runs.

**What a report carries:** message, trimmed stack, source position, user
agent, viewport, seconds-since-boot, and a per-tab random `sid` so two lines
can be told to be one session. **What it must never carry:** the room key
(the table's only access control), player names, pool names, notation, roll
values. `crash-reporting` asserts those absences, not just the presence.

Bounds, because the door is unauthenticated like every other: the client sends
one report per distinct error and at most 12 a session; the server drops past
20/minute per address and truncates every field rather than trusting it.

A scenario that throws ON PURPOSE arms `ctx.expectErrors(/…/)` with a regex
matching only its own messages — page exceptions stay fatal for every other
scenario, and for any other message in that one.

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
