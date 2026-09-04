# tools/ — the shared headless driver

One way to drive the app outside the e2e suite (debug sessions, repros,
screenshots), built on the same trusted machinery the tests use
(`tests/e2e/cdp.mjs` + `harness.mjs`). Always binds an **ephemeral port** —
it can never touch the live table on 8123.

```bash
node tools/drive.mjs tools/steps/<step>.mjs [args…]
node tools/drive.mjs --steps a.mjs,b.mjs,c.mjs [args…]   # one stage, many steps
```

`--steps` runs a CHAIN against a single stage: one server boot, one Chrome
launch, every step run even after one of them fails, and a non-zero exit if
any did. Each step gets its **own room** over that shared browser — tower,
zoom and felt are room settings, and a step joining the room the last one
left behind would grade whatever it was wearing.

A step file default-exports `async (stage, args) => { … }`:

- `stage.tab(origin, name)` → a harness `Table` (`eval`, `dbg`, `roll`,
  `settle`, `waitFor`, `logTop`, …). Distinct origins (`localhost`,
  `127.0.0.1`, `127.0.0.2`, …) seat distinct players in the same room.
- `stage.shot(table, 'name.png')` → PNG into `tools/out/` (gitignored).
- `stage.out('name.png')` → a PATH under `tools/out/`, for a step that writes
  its own bytes. **Not** a promise; `await`ing it yields a string either way,
  which is how it looks correct and writes to `undefined`.
- `stage.ctx` / `stage.port` / `stage.room` for anything lower-level.

Two things that cost a run each when they were undocumented (2026-08-13):

- **`t.dbg('expr')` evaluates `window.__diceDebug.expr`**, not arbitrary page
  script — `t.dbg('foo()')` calls the hook `foo`, and `t.eval('…')` is the one
  that takes a whole expression. `t.eval` awaits a returned promise
  (`awaitPromise`), so an async debug hook is fine and returns by value.
- **Read the hook's shape before printing it.** `towerModelAudit()` answers
  `{tower, meshes, lights, offPolicy, outs, fx, hull, socket}` and
  `towerOcclusionCheck()` answers per-EYE (`{eyes: [{id, shaft:{n,blocked},
  cowl, exit, hood}]}`) — a report line written against a guessed shape
  prints an empty summary and looks like a passing check.

Canned steps:

- `two-tab-roll.mjs ['<notation>']` — A rolls, both tabs settle, full state
  dump per tab (dice, log, busy, net, page errors).
- `screens.mjs [feltId] [prefix]` — the standing screenshot suite into
  `tools/out/` for visual review of new chrome.

The camera and the spawn line (ROADMAP C27/C28, 2026-08-14). All four take
paired seeds, so a before and an after are the same throw:

- `frame-residual.mjs [--seeds N] [--zoom z] [--views …] [--pools …]
  [--spawn axis] [--pile] [--verbose]` — **C27's residual, and the one to run.**
  The full matrix (6 pools × 3 widths × `preferDice` off/on) with several seeds
  a cell, reported as a median and a range. It reads off and on from ONE
  settled throw, so the delta is the camera and provably nothing else, and it
  prints the GATED answer beside the UNGATED probe — which is the distinction
  the 2026-08-15 table lost. `--spawn width` re-runs any cell on the
  pre-`b2a3326` spawn line; `--pile` re-asks C24's dice-above-1.2 table of the
  presets that actually ship.
- `frame-small.mjs [desktop] [zoom]` — die span in px per viewport × pool, the
  rung the ladder settled on, and what the two `setFraming` options would give.
  One seed a cell, which is what makes it a probe rather than a table: prefer
  `frame-residual.mjs` for any claim somebody will later quote.
- `frame-price.mjs` — the dice rung run four ways (each orientation × scan
  starting at the preset or below it). Written because `oracleProbe` fits from
  `CAM_TARGET_HOME` and therefore answers `null` on the device in question.
  **Its cells are UNGATED**: they say what rung 2 would give if nothing judged
  it, not what `preferDice` does. Three cells of this grid were read into the
  C27 table as `preferDice` numbers and two of them were from the wrong column
  (2026-08-17) — read `frame-residual.mjs` for what ships.
- `spawn-clear.mjs [seeds] [zooms] [pools] [variants]` — worst wall clearance
  on the spawn line (negative = a die born inside a wall plane), frame-zero
  contacts, pile share, and the settled cluster. Simulates: minutes.
- `defer-flush.mjs [legs]` — walks a room-wide zoom through every way a table
  goes idle (ceremony, sweep, reveal flip) and proves one seed is one film
  across two very different viewports. `[legs]` is `1,2,3,4`; run ONE leg to
  take a negative control, because with the flush backed out leg 1 leaves a
  zoom pending and wedges every later leg's setup.

A place at the table (docs/UX.md §7.63). Two gates that ran before the stamp
merged, and two look passes:

- `place-settle.mjs [seeds] [gate|ab]` — v1's PLACE_AIM ship/no-ship bars,
  kept as a RECORD since v2 (Joe: "pilling is OK"): the region throw against
  the placeless baseline on identical seeds (Δ pile, Δ median settle, worst
  cell), printed and never gated — exit 0 either way. `ab` prices the shipped
  dials against `on: 0`. Simulates: minutes.
- `place-spawn.mjs [seeds]` — the laned spawn line priced against the laneless
  one: wall clearance in every laned cell and the F1 separation delta.
- `place-look.mjs [outDir] [w] [h]` — the placard itself: one card, the full
  house at three zooms, the numbers `placard-look` gates on, and the wash
  mid-film. Looks.
- `place-card.mjs [outDir] [w] [h]` — the v2 card, measured against the two
  things Joe said were broken: a die (`spanPx` × a d6's 1.35 edge, beside every
  card's projected face box, from both chairs, at three zooms, idle and after a
  3d6) and `#result-banner` (the card's printed panels and the NAME inside them
  against the panel's live DOM rect, and against the widest that rect can grow).
  Desktop and phone. **One tab through developer mode** (`ctx.devTab`) since
  v4 — the sticky seat switcher walks both chairs on the shipped orbit path,
  where the two real tabs used to. Looks + simulates (one throw per frame size).
- `place-region.mjs [zoom] [seeds] [variants-json] [stations] [pools]` — where a
  stamped throw comes to rest (v2): per cell, the share of dice and of pool
  centroids inside the roller's region, pile and median settle against the
  placeless baseline, rim-hugging, the mean centroid. The record behind
  PLACE_AIM's dials and the tool to re-price them (pass a JSON array of
  PLACE_AIM shapes to try variants). Recorded, never gated. Simulates: minutes.
- `place-gap.mjs [zooms-csv] [seeds] [pools-csv]` — the space BETWEEN the two
  pools, with both standing (v3.1): station 0 rolls and settles, station 1
  rolls and settles beside it, then per seed the centroid-to-centroid
  separation and the clear ground between the pools (min pairwise die
  distance). The measure behind Joe's "more space between them ... by at
  least 20%". Recorded, never gated. Simulates: minutes.
- `place-two-rolls.mjs [outDir] [w] [h] [zoom]` — Joe's own two-tab frame,
  re-taken: two seated tabs, 3d6 each, both pools on the felt in their own
  regions from both chairs, desktop and phone; prints the die's px edge, every
  card's px box, each pool's centroid and region membership, and whether the
  two chairs' feltPoses are byte-equal. **Deliberately still two real tabs**
  while its siblings moved to developer mode: a stamp crossing the WIRE, and two
  clients baking one film, is what a single tab cannot say. Keep at least one
  step in this shape. Looks + simulates (two throws per frame size).
- `place-view.mjs [outDir] [w] [h] [players]` — the view from every chair, in
  **one tab through developer mode** (`ctx.devTab`, docs/DEVMODE.md): up to
  EIGHT chairs — the viewer's own and seven dealt around it — which
  three loopback origins never could reach (the harness ceiling is three tabs,
  so the six- and eight-place pictures used to exist only as borrowed eyes).
  Prints each chair's place base, the orbit the ladder rested on, the die span
  (the short-edge tax), the fog floor and the lamp's nudge; saves every chair
  idle at three zooms, one throw from station 0 mid-flight (through
  `simulatePlaceView` — a seat change rides the roll-boundary flush and will
  not move mid-tumble) and at rest from the sticky seat, and the crowd frame
  where every chair has thrown and every pool is still standing. Looks +
  simulates.

Add new step files here (Apache header, like everything first-party) rather
than writing one-off inline scripts — repeatable work belongs in the repo.

## The dice-geometry steps (ROADMAP §9c)

A `geo` recipe change is RENDER ONLY by contract, and these three are how that
sentence stops being a promise. Run all three around any edit to `STD_EDGE` or
to `buildBeveledGeometry`; the first two are the proof, the third is the look.

- `edge-film.mjs [pools]` — **the proof the film did not move.** Digests the
  CANNON hull per die type and every keyframe of 15 seeded throws at 9 dp
  (through 40d20 at the pool cap) into ONE line to compare across builds.
  Answers what `perf-determinism` cannot: not "do two tabs of this build
  agree" but "does this build agree with the last one", which is what a room
  spanning two deploys needs. **Simulates**: ~90 s.
- `edge-price.mjs [count] [type]` — **what the edge costs.** The resolved geo
  recipe and vertex count per type, the mesh-inside-the-physics-hull pass/fail,
  and draw calls / triangles / real rAF frame intervals with a settled pool.
  Draw calls are the budgeted number and a vertex count cannot move them; the
  frame medians are headless SwiftShader and read as a stress test, not as a
  player's frame. **Simulates**: ~60 s.
- `edge-look.mjs [prefix] [seed]` — **the frame in the room.** Three cells
  (close/4 mixed, medium/the Soul Deal trio, wide/40) as whole frames plus a
  4× crop on the die nearest the mat's centre. Fixed seed, so running it either
  side of a change with two prefixes gives a true A/B of one variable.
  **Simulates**: ~60 s.

## The tower steps

There are a dozen of them and until now this file indexed none, so "which
proofs does my change owe?" was answered by reading `ls`. Each row says what
the step COSTS — whether it **measures** the built world (geometry, counts,
projection: seconds, deterministic) or **simulates** dice (a pour per case:
tens of seconds, and the only reason to spend it is a change that could move
physics) — and which class of change should trigger it.

**A cosmetic change never needs a simulation.** A tower model is theatre over
invisible engine colliders and portals; physics and the pour film are a
function of (portal spec, engine constants, seed) and nothing else. So a
mesh-only edit owes the measuring steps and the LOOK sheets, and owes the
simulating ones NOTHING — `tower-spec-digest` is what turns that from a claim
into a check.

Three instruments carry that claim, and each answers a different question, so
none of them is redundant: `tower-spec-digest` pins what every tower
**declared** (the eight portal numbers, the source, the limits);
`tower-contract-freeze` (e2e) pins the whole **derived** core of every
registered tower, byte for byte; `towerFilmDigest` hashes spec + volumes +
POUR + the plan `pourPlan` actually draws at a fixed seed — the **picture**.
The digest deliberately stopped pinning derived numbers (T3, 2026-08-13): an
engine-constant change moved every row at once on work that renegotiated no
portal, and a gate that reds for reasons its readers wave through has stopped
being a gate.

```bash
npm run gate:cosmetic -- <tower>          # the whole measuring set + model sheets
node tests/e2e/run.mjs --only look        # and the e2e half of the same lane
```

The `look` tag is the suite's side of this policy, and it is ENFORCED: a
scenario carrying it may not simulate a die, and the runner proves that by
reading `__diceDebug.diceEverMade()` afterwards rather than trusting the
comment (docs/TESTING.md, ROADMAP T4).

**THE LOOP FOR A NEW TOWER, in the order that costs least** (nullstone's own
postmortem, 2026-08-13 — its look loop cost more than the rest of the job put
together, and both halves of the fix are here):

```bash
~/opt/dice-forge/venv/bin/python tools/forge/towerplan.py --recipe <recipe>.py
tools/forge/bake.sh <recipe>.py --tower --expect-colors --max-tris 15000
node tools/drive.mjs tools/steps/tower-try.mjs tools/forge/out/<slug>.glb
```

`towerplan.py` prints what the portal spec leaves you room to BUILD before you
model anything — per-heading reach, the wall floor under it, the doorway's
jambs, the lane's two collider planes, and how tall the front must be for the
occlusion proof to pass. Four of nullstone's five gate failures were
answerable from that table. `tower-try.mjs` then judges the bake in the app's
own light on ONE sheet, with no promotion and nothing committed: the forge
preview's rig is not this room's, and value decisions taken there had to be
retaken the first time an app frame existed.

| step | what it answers | COST | run it when |
| --- | --- | --- | --- |
| `tower-spec-digest.mjs [--write]` | do the eight portal numbers a tower DECLARES (plus its source and the limits it was judged against) still hash to what was committed, per tower | **measures** — no dice, no browser work beyond reading a hook | **every** tower change: it is the proof that a cosmetic change was cosmetic. `--write` re-pins and is not a way to go green |
| `tower-fit.mjs [tower…]` | does the model sit inside the socket (every overrun a named legal class), and did the skin add colliders or lights | **measures** the built mesh + the world's body list | a new or re-baked model, new dressing, a change to the audit's classes |
| `tower-occlusion.mjs [tower]` | is the shaft and the cowl band hidden at all six shipped eyes; which exit/hood sightlines the declared doorway does not explain | **measures** — raycasts against the built skin | anything that moves the silhouette: a re-bake, a lining, a curtain, a portal |
| `tower-dress.mjs [tower…]` | triangles, draw calls, sways, ember, lights per group against the dressing budget | **measures** | dressing added, merged or retired |
| `tower-try.mjs <glb\|id>` | what a bake looks like IN THE ROOM, six views on one sheet, with its fit and occlusion verdicts printed above it | **looks** — no dice; sockets the model and renders through the shipped path | **the look loop for a new tower.** Takes a raw `tools/forge/out/*.glb`, so nothing is promoted or committed to be judged |
| `tower-shots.mjs [tower] [seed]` | the model from four look-only eyes plus a lab pour, for a human | **looks** (+ a lab pour, offline) | any visual change to a skin |
| `dress-look.mjs [tower]` | does each prop earn its triangles, with the subject located and its on-screen size printed | **looks** + **measures** (projection) | dressing changes; a prop moved or retired |
| `tower-room-shots.mjs [tower]` | the same tower from the PLAYER's cameras, across the zoom ladder and a real pour | **looks** + **simulates** (three pours) | camera/framing changes, a venue change, the first review of a new model |
| `tower-family-shots.mjs [tower] [sibling…]` | does it belong to the family — the same idle frame of every model | **looks** + **simulates** (one pour) | a new model, or a family-wide material/lighting change |
| `hollow-look.mjs [tower]` / `glade-look.mjs [probe]` | the Hollow Bole and the glade under both palettes, in the venue they actually live in | **looks** + **simulates** | changes to hollowbole, the fae palettes, or the venue |
| `tower-lantern-ab.mjs [tower…]` | does the raking lantern wake the baked normals; does the ember warm the tray | **looks** | lighting, lantern or ember changes |
| `tower-resting-eye.mjs [tower]` | the camera rests on the tower on an empty felt, hands the frame back when dice land, and the towerless table is unchanged | **simulates** (one roll) | camera/framing changes; a new model inherits it free |
| `tower-probe.mjs [n] [seed] [secs] [tower]` | the lab pour, die by die: delivered, parked, hidden, rescues, every collision | **simulates** | engine/collider/pour changes. A cosmetic change must leave this IDENTICAL — that is the claim, not the gate |
| `tower-pour.mjs ["pools"] [tower]` | the SHIPPED film: exit-guarantee bakes, hidden windows, clunks, per pool | **simulates** (a pour per pool) | pour, tempo, audio-film or exit-guarantee changes |
| `portal-probe.mjs baseline\|sweep` | what dice actually use of a portal, and where the physics pushes back below the floors | **simulates**, heavily (the floors campaign) | changing `TOWER_PORTAL_LIMITS` — and nothing else |
| `forge/promote.mjs <slug…>` / `--check` | SHIPS a baked model: the bytes, the served-file list and the digest baseline as ONE reviewed diff. `--check` verifies every shipped model is still the file its recipe writes | **edits the repo** — no browser, no Blender | after a bake is accepted. Not run by `bake.sh` on purpose: promotion is a main-session act (ROADMAP T7) |
| `tower-contract-capture.mjs` | re-captures `tests/e2e/fixtures/tower-contract.golden.json` | **measures**, and WRITES a golden | only a deliberate renegotiation of the engine contract; never to fix a red freeze |
| `engine-contract.mjs` | emits `tools/forge/engine_contract.json` — the constants the forge tools must stop re-typing | **measures**, and WRITES the file | an engine constant, volume or limit moved |
| `dress-bake-ab.mjs [--redcheck]` | byte-identity of a kit's baked canvases across a refactor | **measures** (canvas compare) | a bake function moved or was re-plumbed |

## THE SITTING — every open LOOK and LISTEN on one page

```bash
node tools/drive.mjs tools/steps/verdict-shots.mjs          # crop + stump
node tools/drive.mjs --steps tools/steps/glade-look.mjs,\
  tools/steps/life-look.mjs,tools/steps/record-look.mjs      # the three existing ones
node tools/verdict-sheet.mjs                                 # → shots/verdicts.html
```

`shots/verdicts.html` is a **single self-contained file** (frames embedded as
JPEG data URIs) that opens from the filesystem with no server. It carries every
outstanding visual and audio judgement in the project, ordered by **what each
verdict frees** rather than by tier number: the question in one sentence, the
frames side by side, what happens on either answer, and — for the listening
half — `docs/AUDIO.md` §9's script transcribed in its own order, because the
order is what makes it one sitting instead of ten errands.

It exists because ROADMAP THE ORDER #1 was a queue of judgements that were
each a paragraph in a different file needing a different tool re-run to see.
The cost was never the deciding; it was the finding.

**The page is gitignored and the generator is committed, deliberately.** A
committed page with embedded frames goes stale silently the first time anybody
touches the venue, and this project's dominant failure mode is a green check
over a stale thing. Two consequences the generator enforces rather than
documents: a missing PNG renders as a **loud red cell naming the command that
would produce it** (a quietly shorter grid reads exactly like a complete one),
and an A/B whose two files are **byte-identical is labelled as such** on the
page — an unarmed comparison looks precisely like a passing one.

One frame in the sheet cannot be produced from the tree as it stands: W7 ②'s
"before" needs `js/fae-lab.js` from the commit before the staging landed.

```bash
git checkout 9f1e592 -- js/fae-lab.js
node tools/drive.mjs tools/steps/glade-look.mjs tag=before
git checkout HEAD -- js/fae-lab.js     # ALWAYS, and check `git status` after
```

`verdict-shots.mjs` also writes `shots/verdict-data.json` — the measured
numbers each frame was taken at — and the sheet captions itself from that file
rather than from figures quoted out of a doc, which is how a caption goes stale
while its picture stays true.

## Contact sheets (2i-F)

```bash
node tools/contact-sheet.mjs            # stitch tools/out/ and each subdir
node tools/contact-sheet.mjs <dir> …    # only the named dirs
```

Writes a `contact.html` captioned-thumbnail grid into every directory
that holds PNGs (plus a top-level `tools/out/index.html`), so a drive
run is reviewable at a glance and two runs are comparable. Regenerate
freely — the sheets live inside the gitignored `out/` tree.

## The chrome lab

`/chrome-lab.html` (served by `node server.js`, any port) is the last lab
standing — the 3D one, `lab.html`, retired on 2026-09-03 into the
developer-mode panel's sets section (docs/DEVMODE.md §9), taking
`tools/lab-shots.mjs` and `tools/geo-bench-shots.mjs` with it. It embeds the
REAL app in an iframe and poses
result-read states (staged draft, banners, peek, check/cinematic
verdicts, held rolls) through `__diceDebug` — real CSS, real hovers,
zero forked markup, so it cannot rot the way docs/mockups did.

## Pool-analysis data (§2l)

```bash
node tools/pool-analysis-data.mjs           # human-readable report
node tools/pool-analysis-data.mjs --json    # machine-readable
```

No browser, no server, no port — pure computation over `js/meanings.js`,
`js/notation.js` and `js/rollspec.js`. Regenerates **every number** in
[docs/POOL-ANALYSIS.md](../docs/POOL-ANALYSIS.md): the six per-die
spectra, the dice-value cases, the combination enumerations, the
(ruled-out but preserved) aggregate ladders, and the chart invariants —
exiting non-zero if `p(Success) === p(Success & Bonus)` or unit mass ever
breaks. It exists because the design pass behind §2l ran on numbers and
**two of them were fabricated** by the agents that produced them; a
figure you cannot regenerate is a figure you should not trust.

## The apply tool (developer mode)

```bash
node tools/dice-apply.mjs ~/Downloads/dice.yaml            # patch the checkout's dice.yaml
node tools/dice-apply.mjs ~/Downloads/dice.yaml --check    # report only, write nothing
node tools/dice-apply.mjs dl.yaml --root /path/to/checkout # another tree
```

The other half of the panel's **Download** ([docs/DEVMODE.md](../docs/DEVMODE.md)
§6). No browser, no server, no port. Validates the given file against the
dial tree in `js/tune.js` (exit 2, one line per problem, nothing written: an
unknown path, a wrong type, an enum value outside its options, any boolean),
finds the leaves that DIFFER from the checkout's `dice.yaml`, and patches the
checkout's **own** text one span at a time through `js/yaml.js` — so a comment
added locally after the download survives and `git diff dice.yaml` is exactly
the lines that moved. Prints `path: old → new` per change and a count; writes
atomically. `tests/dice-apply.test.mjs` runs it only ever against a scratch
copy of the tree.

The computation itself lives in `js/dice-apply-core.js`, because the panel's
**Save** runs exactly the same one (below).

## Save straight into the checkout (developer mode)

```bash
DICE_DEV_WRITE=1 node server.js       # …then press ` and click Save
```

Started that way — and only that way — the local server mounts
`GET /api/dev/status` and `POST /api/dev/write`, and the panel's primary verb
becomes **Save** instead of **Download**: it posts the changed dials and the
server patches its own `dice.yaml`, so the round trip through a Downloads
folder disappears and `git diff dice.yaml` is still the whole review
([docs/DEVMODE.md](../docs/DEVMODE.md) §6). Loopback only, same-origin only,
one allowlisted file, atomic rename, and every path validated against the dial
tree by the same core the tool above runs. `DICE_DEV_ROOT=DIR` writes into
another checkout instead (the tests point it at a scratch tree). Without the
variable the routes are not mounted at all — which is every deploy
([docs/DEPLOY.md](../docs/DEPLOY.md)).
