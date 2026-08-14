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

Add new step files here (Apache header, like everything first-party) rather
than writing one-off inline scripts — repeatable work belongs in the repo.

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
npm run gate:cosmetic -- <tower>     # the whole measuring set + model sheets
```

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
| `tower-contract-capture.mjs` | re-captures `tests/e2e/fixtures/tower-contract.golden.json` | **measures**, and WRITES a golden | only a deliberate renegotiation of the engine contract; never to fix a red freeze |
| `engine-contract.mjs` | emits `tools/forge/engine_contract.json` — the constants the forge tools must stop re-typing | **measures**, and WRITES the file | an engine constant, volume or limit moved |
| `dress-bake-ab.mjs [--redcheck]` | byte-identity of a kit's baked canvases across a refactor | **measures** (canvas compare) | a bake function moved or was re-plumbed |

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

`/chrome-lab.html` (served by `node server.js`, any port) is the 2D
counterpart to `lab.html`: it embeds the REAL app in an iframe and poses
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
