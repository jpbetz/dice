# Shipped

Historical detail for work that's landed. Split from
[ROADMAP.md](ROADMAP.md) so the roadmap reads as open work only; nothing
here is a to-do. Cross-referenced from UX.md; commits cited inline.
Section numbers preserved from the pre-cleanup roadmap so incoming links
still resolve.

Ordering is by tier (matches GOALS.md's priority ladder: core mechanics →
organization → secrecy → systems literacy → effects → customization).

---

## TOWER_CORE v2 — the portal contract, the GLB tower path, and the rebuilt Hollow Bole (2026-08-13)

The redesign the W3 handoff promised as its item 7, delivered end to end.
A tower model now DECLARES its two portals — the dice-in mouth and the
dice-out doorway — and the engine derives everything else from them
(volumes, film, colliders, camera, audit thresholds, occlusion grids)
through one pure function, `towerVolumes(spec)`. The classic numbers
became `DEFAULT_PORTALS`, and classic byte-identity is STRUCTURAL: every
derivation is anchor ⊕ delta with deltas exactly +0.0 for classic rows,
frozen by an exact-string golden (`tower-contract-freeze`) captured from
the pre-v2 code — the whole shipped suite passed with zero scenario edits
(commits `011a906..fae3d22`). Along the way the seam closed a real
determinism hole (the lab's lipTilt dial fed a shipped collider films are
baked against; now a frozen constant, with a red-check proving the old
leak) and pinned the film's baking tower into `towerFilmInfo().filmTower`.

The GLB path is the app's first: GLTFLoader vendored, `js/towerglb.js`
(fetch/cache/validate/house-rules; LOADING IS NOT SOCKETING — the
roll-boundary gate `towerModelReady`, and a late-joiner's replay is HELD
until the model arrives, socket-first replay-second), portals riding as
glTF nodes authored by `forge.tower_portals()` and gated at bake time by
`check.py --tower` (limits, throat raycasts, and — after the first
shipped bake exceeded the socket unseen — a tilt-aware envelope gate).
The stress fixture (`tests/e2e/fixtures/tower_fixture.glb`, all portals
off-classic) exercises the contract's ranges in e2e; its envelope slim
demonstrated a composite truth now in its header: at max bore the
envelope PINS in.z to the classic value by arithmetic.

The dogfood is the rebuilt **Hollow Bole** — Joe's call on the W3
handoff: the stump re-authored "mostly from scratch" through the forge.
Four review-gated bake rounds (`tools/forge/recipes/hollowbole.py`):
form; roots/lower-mass/interior-darkness (where the pale cavity turned
out to be the SPECULAR FLOOR, not paint — F0 0.04 glows under any key
regardless of albedo, named by the hue of the residual, fixed via
KHR_materials_specular and now a kit parameter + trap); envelope fit +
the cowl CURTAIN (the liner's upper band carries the occlusion the
splintered crown cannot); tongue albedo. Two palette variants from one
deterministic run with a SHARED geometry digest. The W3 dressing
survived the shell swap through a raycast-synthesized surface descriptor
(`js/towerglbshell.js`), and its θ-convention debt died in the process.
Battery: fit CLEAN, occlusion 99/99 shaft+cowl at all six eyes, probe
matrix 6/6, pour 29/29, suite 48/48, tower tag 8/8 (including the new
held-replay scenario, which caught a real release-ordering bug on its
first run). The never-verified W3 items got their frames: pour
mid-flight through the mouth, both palettes, in venue.

Process notes that outlive the arc: `/new-tower` is rewritten around this
path (portal planning → forge bake gates → registry row → in-app proofs →
LOOK), docs/TOWER.md carries the v2 contract with the superseded-decision
note ("skins never change the film" narrows to towers sharing a spec),
and the forge digest is schema v2 (materials hash into `order` — a
specular change once moved the render while both digests held still).

## Forge — the mesh-bake pipeline and its bake-off (2026-08-12)

Tooling, not a player-facing feature; recorded here because it settles a
standing question ("how do complex 3D models get built?") with evidence.
Six scriptable mesh tools implemented an identical 7-model battery under an
honest-metrics contract; all 42 GLBs were gated mechanically and judged
visually in the vendored three r160. **Blender headless won 87/100** — the
only entry delivering every capability AND a defect-free GLB pipeline —
and `tools/forge/` now ships its proven kit (deterministic bakes via
canonicalize, inside-out/watertight/COLOR_0/NORMAL refusal gates, preview
harness, the battery as living worked examples), with `/forge-model` as
the procedure. Dogfooded same-day: `fae_arch` (49-shell ruined archway,
5,272 tris, byte-reproducible), whose first bake found a real kit bug
(canonicalize dropped color attributes) and whose review look found what
the builder's Cycles self-check could not (joint gaps glowing in-engine
against the dark table — fixed with tower-style mortar cores). Decision
record, per-tool evidence, research annexes and the re-open protocol:
[FORGE-BAKEOFF.md](FORGE-BAKEOFF.md). Commits `c6c8f14`, `3300495`,
`cd27f4d`. The app still loads no GLBs — that integration is deliberately
its own future feature (README's integration note); ROADMAP W3 records the
first likely customer.

---

## C25 Stage 1 — the shelf comes off the felt (2026-08-09)

Design authority: [UX.md](UX.md) §7.27 (and the amendments at §7.7 / §7.7.1).
The measurement and the decision are [ROADMAP.md](ROADMAP.md) C25.

*Joe: "dig into C25 hard. Either find space or drop the feature entirely."*

**There was no space, and the reason was worse than "cramped."** `SHELF_PITCH`
derived from `TABLE_W` while `SHELF_SLOT_W` stayed at the 5.4 it was given for
a 30-unit mat, so three zoom tightenings on 2026-08-09 left a pitch of 0.80
against a 3d6 cluster 3.26 wide. **The second collected roll already fused
with the first** — overlap 2.46 units, three quarters of a cluster's own
width — and five at `close` rendered as one slab of interpenetrating dice with
z-fighting. Nine `shelf`-tagged scenarios asserted length, sequence order and
slot compaction, and not one asserted that two clusters do not occupy the same
space. It broke at `fe24840`, the first tightening.

**The camera was the wrong suspect,** and the probe that proved it is kept:
removing the shelf from `framingPoints` bought 1.08–1.18× die size on desktop,
laptop and iPad, and **1.00× on a phone** — nothing on the device Joe named.
The shelf was removed for the space it took on the MAT, not in the view.

**Joe's two calls:** the felt keeps **nothing** (not even the mantel of one the
measurement said would fit), and Stage 1 lands on the existing roll log before
the bottom strip is designed.

**What shipped.** Collecting a roll takes its dice off the felt with the same
departure a clear plays (§7.26's lift) — collect and clear are one motion now
and differ only in bookkeeping. The record is the roll log, which was always
the backing store: `renderPeek` has always rebuilt its whole card from
`log.find(...)`, and the server's `collected` is a sequence on a log entry,
never a position. **Zero wire change.** A collected roll's ROW is the door to
that card — `role=button`, a tab stop, an `aria-label`, hover to open, click to
toggle, right-click and long-press to the tweak popover, all delegated on the
list for the same reason ⟳ is. The card stands beside its row, never over it.

**Deleted:** `canonicalDiePose`, `clusterPoses`, `spawnShelvedDie`,
`placeCluster`, `reflowShelf`, the collect whisk, the marker pills, the
under-glow rings, `#shelf-layer`, six of eight `framingPoints`, and
`revealShelvedRoll` — a collected roll has no dice left to turn over, so
revealing it is purely a surface act. Also gone: the invariant that no shelved
die may stand on the active felt, which is the whole reason `clusterPoses`
existed, and the rest-cadence and bloom "shelf gates" that existed to stop the
archive breathing.

**A caution for whoever reads this next.** Restoring the debug surface after
the deletion needed a diff of `__diceDebug`'s own key list against the parent
commit: an index-based cut swallowed fourteen unrelated hooks (`entryState`,
`chipsVisible`, `restInfo`, the offer entry points…) and four scenarios failed
with `is not a function` rather than with anything about shelves. Deleting a
region of a 15k-line object literal is not a text operation.

**Stage 2 is open** and is the creative half — the bottom strip, the log that
shows itself and collapses. Stage 1 deliberately left one thing worse: with
the log closed, a collected roll has no ambient presence at all.

---

## Joe's cleanup notes — the key, the fold, the withheld verb, the departure (2026-08-09)

Design authority: [UX.md](UX.md) §7.11b (amended) and §7.26. Four small
items from one message; the two that were design rather than cleanup went to
[ROADMAP.md](ROADMAP.md) as **C25** (the collection phase's space cost) and
**C26** (what `Change seat…` owes before it comes back).

### The hover key — SHIPPED 2026-08-09

*"The reveal window highlights dice on hover, which is awesome, but it
doesn't have any UX that maps the outline highlight color of the dice with
the pools the color relates to."* Each pool label on the result card now
leads with its own hue as a filled dot. The hue assignment moved into one
function (`sourceColorMap`, keyed by source name, walked in die order) that
both the felt shells and the card read — they used to compute nothing in
common, which is the whole reason the highlight could teach grouping and
never attribution. A key, not a recolor: the label keeps `--muted` small-caps
so tier colors keep their monopoly on meaning-bearing color. The loose group
gets its ivory dot too, and takes a label cell of its own in the ledger.
Banner only — the peek and verdict card do not hover-outline anything, and a
key to a highlight that never paints is decoration.

`__diceDebug.cardKey` reads the painted DOM; `folded-card` and `source-read`
pair it against `outlineState` off the shell materials, so the pin is
cross-surface rather than one function checked against itself.

### d20 pairing folds under Your Soul Deal — SHIPPED 2026-08-09

*"D20 pairing is not useful for 'Your Soul Deal', remove from modification
options."* U17 had brought it back on the reasoning that advantage decides
WHICH DIE COUNTS and so is a fact under every system — true of the notation,
and not a tool this chart wants. `.sec-pair` joins `.sec-sum` in the
`pop-perdie` fold; its own class because the reason is the chart and not the
arithmetic, and the two must be able to move apart again. It round-trips
invisibly the way Target once did, which is the accepted cost of everything
in that fold (notation totality is app-wide).

### `Change seat…` withheld — SHIPPED 2026-08-09

*"Maybe not fully thought through. Strongly consider hiding it for now."*
`openIdentityMenu` hides it unconditionally now (it was already hidden in the
lobby). The verb reads as "sit somewhere else at this table" and actually
drops the seat, **deletes `LS_NAME`**, and re-enters `initNet()` — §3b/L3
split it out of `Leave & switch seat` so that the name would travel with the
player, then left the name-wiping verb wearing the seat-shaped label. Safe to
withhold because C10 shipped: the door offers a returning player their
prepared seat, so `Leave table` → the door is the same journey without the
name loss. The button, its handler and `leaveTable()` stay — still the only
scripted door to a `netOnline === false` state. ROADMAP C26 holds the
redesign. `touch-doors` pins the hide at a table, `identity-lobby` in it.

### How a die leaves — SHIPPED 2026-08-09

*"The way dice disappear is not my favorite… the speed is good but the effect
is not."* Speed untouched (0.3 s); the motion inside it replaced. `sink` (drop
2.4 units, shrink to 0.65, leave by passing through the felt) gave way to
`lift` (rise 1.15 on an ease-out, shrink to zero) — the collect whisk's carry
arc, pointed at a second destination. Full reasoning and the alternatives
table in [UX.md](UX.md) §7.26. `fold` and `sink` stay switchable via
`__diceDebug.setClearStyle` so the taste call can be re-made side by side,
and `dice-depart` uses `sink` as the proof that its `dy >= 0` assertion can
fail — a green check that would have passed against the thing Joe asked us to
replace is the failure mode this repo keeps hitting.

---

## Joe's UI notes — the named verb and the pool rail (2026-08-07)

Design authority: [UX.md](UX.md) §7.21 and §7.22. Both came out of a
multi-agent design pass (two surfaces × three stances, judged, then
adversarially verified against the tree); the verify pass is what caught
the `[hidden]` bug below and the same-type glue trap in §7.22's compose.

### The `hidden` that never hid — SHIPPED 2026-08-07 (`631a562`)

`el.hidden = true` sets a property; the paint is a separate question. The
UA sheet's `[hidden] { display: none }` is user-agent origin, so any
author-origin `display` beats it regardless of specificity — and
`.banner-foot` (css:3018) and `.pool-roll` (css:797) both declare
`display: flex`. Since the Tier 0 §0e/L8 mount-once rewrite, which
replaced *build the verb when it applies* with *mount both and toggle
`.hidden`*, every face-up result card shipped a live **Reveal** the server
answers with 403, and every held card a **REROLL** of a spec nobody at the
table can read. The suite stayed green for one reason: it asserted the
PROPERTY (`revealHidden === true` — always true, always beside the point).
Fixed with a global `[hidden] { display: none !important }`, verified safe
by grepping every attribute write in `js/` (exactly the four card-actions
sites) — the `.idm-item` trap uses inline `style.display`, not the
attribute. Pinned by `fold-visibility`, which fails on the old CSS.

### The named verb — SHIPPED 2026-08-07 (`8a28827`)

Joe: *"the 'x' on the main body is probably too non-intuitive. I think we
need that to remain the main action but find a better UX."* Both halves
honoured: clearing stays the main act and gains a name. Every result
surface's fold now LEADS with a standing worded primary — `✕ Clear`,
`✕ Dismiss`, or `❯❯ Skip` while a ceremony beat still plays — at `flex: 1`
and full opacity, first in the tab order. **Hierarchy is area, not
volume** (2i-C's fourth law): the primary never wins by being redder.
The body stays a clear target but loses `role`/`tabindex`/`title` and its
keydown twin; hovering it lights the named bar (*the linked press*)
instead of painting a 72px ✕ watermark that only a cursor could find.
Retired: the watermarks and body washes on all three surfaces, the
`.card-actions-empty` gate, the verdict card's blanket rest-dim and the
un-stack rule it forced, dead `.banner-row` and `.clear-x`. One
`runCardClear` now owns every clear, so the re-entrancy guard rides the
button's `disabled` (visible) instead of two silent closure booleans; and
the touch mirror of hover-holds-the-clock landed, so a thumb on the banner
holds the tidy-away that used to collect the roll mid-read. Six scenarios,
including this suite's first assertions on computed display.

### The collapsed pool rail — SHIPPED 2026-08-07 (`fd9d9b0`)

Joe listed five defects and offered to drop the surface entirely. Every
defect was downstream of one number — 56px — so the rail is **112px** and
they go together: shelf heads spelled, names horizontal and ellipsized,
44px rows, and a tap that SELECTS (steel — gold belongs to the one bar
that rolls) so the common *Your Soul Deal* roll of an attribute, a skill
and a motivation is three taps and a bar. **2i-G: a selection is not a
draft** — rack-ordered, never persisted, spent by its roll, dropped on
expand — which is how "clear it after each roll" coexists with 2i-E's
surviving draft. A single pick launches its pool verbatim; a multi-pick
composes dice, per-die sources and labelled flat modifiers, and says out
loud what it set aside. Glue mods are stripped **unconditionally**: a
same-type sum like `4d6dl1 + 2d6` parses happily as `6d6dl1`, so a
try-and-catch design would have silently changed the distribution. Mixed
visibility fails closed to `secret`. The set-aside note lives in the rail,
because `showSettingsNote` falls through to a status pill the collapsed
rail folds to a 10px colorless dot. Two fixes the interactive pass caught
that no assertion would have: the ✓ gutter stands empty rather than
appearing on selection (a name that fit would truncate the moment you
picked it), and the rail repaints above `renderGroups`' foreign-rack
return, so a teammate's rack no longer leaves it stale.

---

## §3b — The lobby and the table flow (2026-08-07)

Design authority: [ROADMAP.md](ROADMAP.md) §3b (CUJs and rulings) and
[UX.md](UX.md) §7.20 (surfaces). Rooms had worked since the beginning;
nothing in the UI ever let a player *reach* a second one. L0/L1/L3
shipped together because a lobby you cannot leave is not a lobby.

### The lobby exists — SHIPPED 2026-08-07 (`94f3069`)

`?room=` absent no longer falls back to the key `table`. `ROOM` is
nullable, `IN_LOBBY` is the question every room-assuming site now asks,
and `initNet()` exits before `promptName()` — so a first-time visitor
meets dice instead of a modal titled *Take a seat* about a table they
never asked for (CUJ1), and the bare deployed URL stops seating every
stranger on one shared felt. Nothing about it is a fallback: the lobby
does not call `connect()`, so there is no failed join to report, and it
does not call `peekTable()` either.

**`solo` deleted as the lobby's indicator, kept where it was always
true.** The four-count argument is UX §7.20; the load-bearing one is that
`#status-pill` is a shared TRANSIENT channel — `showSettingsNote`
borrows it on a 3 s timer under an explicit *"a status change may have
taken the pill"* guard — so a permanent state parked there is destroyed
by the first note and never restored. It survives only for "you asked
for a table (`?room=` is set) and there is no server": a state with no
next action, which is when a readout is the right object, and where no
settings event can steal the slot because there is no server to send one.

**The suppression pass, by one rule** — a surface that speaks about YOU
keeps working; a surface that speaks about THE TABLE is absent, never
disabled and never silently downgraded to local. `inviteUrl()` returns
null instead of fabricating a working link to the room named `table`;
the *Everyone at the table* heading and the Table name row do not render;
`Apply to table` goes (its only roomless outcome was a refusal); the felt
and system tooltips stop claiming an audience; the offer refusal names
the exit instead of diagnosing you. The **phantom name** is gone —
`tableName` no longer survives `LS_ROOMSETTINGS` into the nameplate, the
tab title, or the download slug.

### The presence row, three states — SHIPPED 2026-08-07 (`94f3069`, `765b7da`)

`renderPlayers()` is now their renderer and runs in **both** branches.
The row already asked "who is here", so when the answer is "nobody yet"
it carries the fix, in the slot where the people will appear — an
**affordance, not prose**, which is the only way past the actively
enforced *empty renders nothing* law (`.tray-invite` was killed the day
it shipped; `#groups-empty` went the same way). A dashed ghost pill in a
solid roster pill's geometry reads as a chair nobody is sitting in.

- **Lobby:** `+ New table`, and `Tables ▾` only once a table has been
  visited.
- **Unprepared table, nobody else here:** the `Invite` chair. It stands
  only while you are alone — an unprepared table has nothing to
  enumerate, and a permanent Invite pill would be the standing chrome
  §7.9 kills; the link keeps its home in the identity menu.
- **Prepared table:** one chair per UNCLAIMED seat, wearing that seat's
  name and copying that seat's `&as=` link. `roomSetup.profiles` minus
  the live roster, client-side: no endpoint, no wire key, no new state.
  These stand **for as long as the seats are empty, not only while you
  are alone** — the first arrival must not take the other five chairs
  off the wall. They retire per seat, at the grain of a seat rather than
  the row. *(Corrected the same day: the first gate was `!others.length`,
  which made the documented "the outlines fill in one by one"
  impossible. Caught by driving a three-seat prepared table in a
  browser — seated as Bo, the row must read Ada and Kit.)*
- **Table with people, no free seats:** unchanged, and no new chrome.

The label lives in its own `.rg-label` span (`765b7da`): the copy
feedback swaps it to `Copied!`, and a `btn.textContent =` would take the
whole subtree with it, deleting a seat chair's dot permanently on first
use.

### New table, recents, and leaving — SHIPPED 2026-08-07 (`f1575ac`, `b4f5a6f`, `94f3069`)

`js/tables.js` is the store: `recentTables` / `rememberTable` /
`forgetTable` / `mintRoomKey`, never-throws, capped at 8, with its own
unit suite. **The key is minted, never the name** — this app has no
access control by design (goal 10), so the key IS the door and
`?room=soulseal` would be one anyone can guess; a readable slug carries
~83 bits of `crypto.getRandomValues` behind it, verified byte-identical
through the server's own `cleanString`/`MAX_ROOM` gate.

**`Leave table` is its own verb and deliberately does not reuse
`leaveTable()`**, which drops the seat *and* deletes `LS_NAME` and then
re-enters `initNet()` — wiring it up would have silently wiped the
player's display name and, in a lobby, looped back into *Take a seat*
with nowhere to go. The seat belongs to the table; the name comes with
you. `Leave & switch seat` became `Change seat…`, which is what it
always did.

**The name survives the round trip.** An unprepared room is deleted when
its last player leaves (only a room holding a setup lingers — §G6), so
leaving and returning landed in a new room with the name gone while your
own Tables list still showed it. The join now restores a remembered name
to a room that has none — the same trade `maybeRepushTable()` already
makes for setups, with the same accepted cost (it can bring back a name
somebody deliberately cleared).

### Two traps worth keeping

**Module-evaluation TDZ.** `ROOM`/`IN_LOBBY` are declared at the TOP of
main.js, beside `ZOOM_LEVELS` and for the identical reason: `setSound()`
→ `syncSettingsUI()` builds the felt and system pickers *during module
evaluation*, and those tooltips now read `IN_LOBBY`. Declared beside the
other net constants, it killed the whole module in TDZ — the page still
rendered from static markup, which is what made it briefly look like a
render bug rather than a dead module.

**No global `.hidden`.** Menu items hide by inline `display` because
`.idm-item`'s own `display: block` outranks the `[hidden]` attribute and
this codebase has no global `.hidden` utility (every hideable element
carries its own rule).

---

## Tier G — Game night: the prepared table (2026-08-06)

Design authority: [PROFILES.md](PROFILES.md). Built in one pass against a
fixed date — Joe's *Your Soul Deal* game on 2026-08-13 — so the sequence
was chosen for "playable if we stop here" rather than for tidiness. The
shape the whole tier rests on: **the file is the truth, the room is a
convenience, the link is an address**, which is what let it land without
amending goal 7.

### G0. Pre-flight — SHIPPED 2026-08-06 (`6c7ca9f`)

The two ROADMAP §0i/§0j patches that only cost anything if they are
missing on game day. `package.json` engines went from `>=18` to
`>=22 <25`: the old range let the Cloud Run buildpack pick a new major
silently, *on the deploy itself*. A bare `24.x` was rejected as the fix —
it converts a missing runtime on the buildpack into a deploy-day failure,
whereas the range blocks the silent jump while still landing on 24 (what
the tree is actually tested against) or falling back to 22. Node >=22 was
already a hard floor: the e2e harness drives CDP over Node's built-in
WebSocket.

`uncaughtException` now logs the stack and exits 1 instead of limping on
with half-torn-down streams. Armed under `IS_MAIN` only — the redaction
suite imports server.js in-process and its own failures must not become a
process exit.

### G1. The file door — SHIPPED 2026-08-06 (`e2a3b9d`)

Settings → *Your data* can finally put the rack on disk and take it back:
`#portable-download` (Blob + `a[download]`, reserializing a fresh
snapshot rather than the textarea's scratch text) and `#portable-openfile`
→ hidden `#portable-file`, read with `File.text()`. **Open only fills the
textarea and calls the existing `portablePreview()`** — there is
deliberately no second import path, because preview-then-apply is the
whole safety contract (GOALS §7's `#g=` post-mortem).

Filename is `<slug>-YYYY-MM-DD.dice.yaml`, slug from the table name, else
the `?room=` key, else `dice-table`. Oversize (>512 KB) refuses by name
and size and **disarms Apply**, so a refusal can never leave a stale plan
armed. `__diceDebug.portable = {snapshot, filename, loadText, acceptFile,
maxBytes}`; e2e `file-door` (`bbd69ce`) drives the real picked-file path
through `DataTransfer` because Chrome forbids assigning `input.files`.

### G2. The table file — SHIPPED 2026-08-06 (`b6a0828`)

`js/portable.js` grew `table:` and `players:`, both present-or-absent so
every file that parsed before still parses byte-identically. A player
block **nests `pools:`** rather than putting shelves at the name's depth:
shelf labels are user-authored, so a shelf named `set` or `pools` is
legal, and nesting puts the reserved keys where a shelf can never appear.
The inner block is the same grammar as the top-level one — one shelf/pool
parser, called at two base indents.

Caps: `MAX_POOLS_PER_PLAYER = 40` (top level *and* per profile),
`MAX_POOLS_PER_FILE = 300`, `MAX_PROFILES = 12`. The document cap could
not be both derived and reachable — 12×40+40 = 520, so anything ≥520 is
dead code — so 300 was chosen as a genuine second constraint that names
itself in its error.

**Unknown top-level sections now skip and warn** instead of aborting the
document, closing the forward-compatibility question POOL-ANALYSIS §9 left
open; a top-level line that is not *section-shaped* still refuses, and a
known section's contents stay strict. An unknown section's body is not
examined at all, so a future section written with tabs cannot break the
document the skip exists to save. `#` in a profile name is a line-numbered
refusal (a profile name becomes a display name, and display names are
whisper addresses) while `#` in `tableName` stays legal — the asymmetry
the server already had, now matched rather than quietly diverged from.
Tests 25 → 57.

### G3. Profile authoring — the rack swap — SHIPPED 2026-08-06 (`6adf2d4`)

**The MVP.** An organizer builds someone else's character by loading it
into their OWN rack, so the editor, the ± popover, the spectrum bars and
the §2l dice-value ledger read it **unmodified** — closing the gap
POOL-ANALYSIS §11 named (manage mode forces `poolsOwner = null`, so the
budget read was your-own-rack-only and could not price Alice). Verified
interactively: with Alice's profile loaded, the Attributes head reads
**34** (3d6 + 2d8) and the region figure agrees. *Rejected:*
parameterizing every management surface off `poolsOwner` — wide blast
radius to save one click.

`#portable-profiles` lists the file's `players:` with **Edit** and **Save
to** per row, plus *Save as new profile*. `#profile-banner` is sticky
above the pools head for exactly as long as a swap is live, and the
category heads yield their sticky pin to it (`#groups-list.profile-editing`
makes the same call `#pools-head.foreign` already makes).

The guardrails are the feature:

- the operator's rack goes to `dice.groups.mine.v1` and **the write is
  read back and verified before `groups` moves** — unverifiable storage
  refuses the swap rather than proceeding;
- `publishPools()` no-ops while a profile is loaded (one egress, so it
  covers the debounce, hello-join, silent-rejoin and debug paths) —
  otherwise every teammate's owner switcher would show Rill's pools under
  Alice's name;
- a **reload restores the operator's own rack** and drops the editing
  state. Deliberate, of the two the design allowed: the banner and the
  file text do not survive a reload, so booting with a profile still in
  `dice.groups.v1` would be someone else's rack under your name with
  nothing on screen saying so — the `#g=` codec's exact failure;
- `Save to` rewrites the **text**, never the disk, and files carrying
  skip-and-warn'd unknown sections are read-only to both verbs, because a
  rewrite would drop what the parser deliberately did not read.

e2e `profile-swap` + `profile-swap-reload` (`76c5e55`). A second tab
booting mid-edit consumes the localStorage stash, which is safe:
`portableDoneEditing` prefers the in-memory copy.

### G4. The room setup key — SHIPPED 2026-08-06 (`326f1cd`)

`POST /api/table` → `room.setup = {rev, table, profiles, at}`, echoed
present-or-absent in `/api/join` and `hello` (so unprepared rooms stay
byte-identical on the wire) and broadcast as `table-setup`. Settings ride
the **existing** validator and echo — `validateSettingsPatch` +
`commitSettings` were factored out of `/api/settings` and shared, so a
setup push fires the same `settings-changed` every other settings write
fires. Profiles go through the existing `sanitizePools` and `cleanName`.

**Anyone may push it** (goal 10); last write wins, guarded by a monotonic
`rev`. A stale push is a *silent no-op returning the winning rev*, not a
409 — `net.js` turns every non-404 into a player-visible toast, and the
loser of a two-tab race (or of §G6's re-push-on-hello, which races by
design) did nothing wrong. Caps refuse (`bad_profiles`, `bad_pools`);
unusable records drop (empty `cleanName`, duplicate names, unparseable
notation). e2e `table-setup-wire` (`f0ba179`) drives it over raw HTTP+SSE
with no client in the path and checks the setup **bytes** for `values` /
`rollId` / `total` / `visibility`, because `projectEntryFor` must remain
the only egress a roll entry ever takes.

### G5. The seat picker — SHIPPED 2026-08-06 (`8f89fd4`, `71b5d53`)

CUJ2: one link, six people, each at the right table under their own name
with their own pools.

**The ordering problem, and §2k closed as a side effect.** `initNet()`
awaits `promptName()` *before* `connect()`, so when the modal is on
screen the client has not joined and cannot know the room's setup. Solved
with **`GET /api/table?room=`** — public, read-only, no `playerId`,
returning `{name?, seats?:[{name, pools}]}` and `200 {}` for an unknown or
unprepared room. Projected field by field: no roster, log, offers,
notations, `rev`, or settings beyond the table name; uses `rooms.get`, so
a peek never creates a room and never disturbs a linger TTL. That is
exactly the pre-join peek ROADMAP §2k wanted for showing a table's name.

Prepared seats render in `#seat-list` above *Someone else…*, which keeps
today's free-text path verbatim. Choosing one takes the name and joins,
then shows the **existing** preview (`✓ 1 new · 2 updates — Apply takes
them`, the shared verdict grammar) with `#seat-apply` / `#seat-skip` — and
**applies nothing until that click**, which is the assertion the whole
design turns on. `&as=Name` pre-selects case-insensitively and does
nothing else; an `as=` naming no profile is ignored silently, so a stale
link cannot break a join. `inviteUrl()` is unchanged: one link for
everyone stays the primary form.

**Fixed in the interactive pass (`71b5d53`):** both phase panes rendered
at once. This stylesheet has no global `.hidden` utility — every element
carries its own `#id.hidden` rule — so the markup's bare `class="hidden"`
styled nothing, and Apply/Not now sat under the seat list while you were
still choosing. The logic was correct throughout, which is why the e2e
missed it; `prepared-seat` now asserts computed display in both phases.

### G6 (server half). The room TTL — SHIPPED 2026-08-06 (`2802197`)

`dropRoomIfEmpty` deleted a room the instant its last player left — so an
organizer who set the felt, named the table and built six seats lost all
of it by **walking away**, no restart required. That was the most
surprising gap in the audit and the one this tier most exists to close.

A room holding a `setup` now lingers: `log`, `offers`, `collectSeq` and
`colorCursor` clear (per-session), `setup` and `settings` survive
(per-preparation — the organizer chose that felt deliberately), and an
`unref()`'d timer deletes it for real at `SETUP_TTL_MS` (12 h, overridable
by `DICE_SETUP_TTL_MS` at boot, which is how the e2e tests it in seconds).
A join cancels the timer through `getRoom`.

**At `MAX_ROOMS` a new room evicts the oldest linger** — a
prepared-but-empty room must never be why a group can't sit down, and
without it a join-push-leave loop over 500 names could squat every slot
for 12 hours. e2e `room-linger` (`8d5a001`) polls the server's own log,
since a room lingering has no wire surface by definition.

### G6 (client half). Re-push on hello — SHIPPED 2026-08-06 (`0de9873`)

The organizer's browser is the durable copy, so a room that has lost its
setup heals as soon as an authoring tab reconnects. `dice.table.v1:<room>`
is written in exactly **one** place — a push the server *applied* — and
re-pushed on every hello (plus once post-join) when the room's `rev` is
absent or lower. G4's silent-no-op-on-stale rule is what makes this safe
to fire unconditionally.

The counterpart is what keeps it honest: **a player who merely joined
holds no authorship record** (`stored: 0`) and can never re-push a setup
they did not author. G4 landed no client push origin, so this slice also
added `#portable-push` ("Apply to table") as the one place a setup is
pushed from.

e2e `setup-repush` (`77c20a0`) tests the real path rather than a
synthetic one: everyone leaves, the room lingers, the TTL expires it, and
the organizer's tab reopens on the same origin — which is what a server
restart looks like from the client's side. It pins that the heal restores
the felt as well as the seats.

---

## Presence: departure is said out loud (2026-08-06)

**Shipped (`5888a87`).** Reported from the live table: "when players leave
their names are staying around forever." They were — but only in
production, which is why nothing caught it. Locally a closed tab reaps in
5 s and the e2e suite proves it. Behind Cloud Run's front end the
container never sees the close, its writes keep succeeding into the proxy,
and `clients.size` never reaches 0 — so no grace was ever armed and the
seat sat there until the platform force-closed the request an hour later.
The deployed logs said it plainly: `players=4` with one real window open,
no `left` lines since instance start, and `/api/events` latencies of
exactly 3601 s. [DEPLOY.md](DEPLOY.md#the-front-end-hides-departures-2026-08-06)
carries the operator's version.

The defect underneath was a design one, not a Cloud Run one: **presence
was inferred from a socket**, and every socket signal we had describes our
connection to a proxy, not the player's to us. Two layers replace it:

- **`POST /api/leave`** — a `pagehide` beacon, so the common case costs
  seconds instead of an hour. It names the stream it is leaving, which is
  the whole reason a reload survives it: a refresh fires the *identical*
  event, and only the id distinguishes the beacon of a dying page from the
  stream its successor already opened. `seat-resume` (no `player-left`
  churn across a refresh) is the standing guard on that. 'Leave & switch
  seat' passes `immediate: true` and gives the seat up at once.
- **`POST /api/pong`** — the heartbeat became a *question*. `': ping'` was
  an SSE comment no client could ever see, let alone answer; it is now an
  event the client answers, and a stream that stops answering is dropped
  regardless of what the socket claims. A pong for a stream the server no
  longer holds answers `unknown_stream` — the one way a deaf client
  (swept, evicted, or restored from bfcache holding a connection the proxy
  kept warm) is ever told to reopen.

Best-effort and backstop, deliberately layered: a beacon cannot be
awaited, confirmed, or relied on (crashes, killed tabs, dead networks skip
it), so the sweep is what actually closes the hole. Streams that carry no
`streamId` are exempt from staleness — a client cached from before this
cannot pong, and reaping it would loop it through a new seat and colour
every liveness window; it keeps today's behavior and heals on its next
reload.

Covered by `tests/presence.test.mjs` (11 protocol cases, clocks shrunk via
`DICE_HEARTBEAT_MS` / `DICE_LIVENESS_TIMEOUT_MS`) and the
`seat-closed-tab` e2e (a real tab closes, a real roster empties, and the
log still carries the departed player's roll — history is not presence).

## Tier 0 — Performance & foundation (2026-08-04 audit)

Bench + review pass 2026-08-04 (perf-audit workflow, 4 empirical benches
under `tools/drive.mjs` × 4 hot-path code reviews × adversarial
verification; the measured baseline is pinned in
`.claude/…/memory/perf-baseline.md`, so future changes have a
before/after). Findings sequenced by **impact** — player-felt magnitude ×
frequency.

### 0a. The roll-arrival pass A+B — SHIPPED 2026-08-04

**Shipped (2036b9b, 3ed606d):** Per-die settle + SAP broadphase. A landed
die now freezes to STATIC mid-sim without waiting for the group's slowest
sibling — kills the group-clock reset that made one twitching die drive
the whole roll to the 9 s cap. SAP broadphase retires the O(N²) shelf tax
(`js/main.js:446`); verified against a new `perf-determinism` cross-client
keyframe-hash e2e (1d20, 8d6, 20d6 — bit-identical across clients under
seeded throws). Bench after A+B: `8d6-loaded` collapses from ~139–349 ms
baseline to ~117 ms max longtask (under the 150 ms budget); large mixed-
die rolls (10d20 + 10d12 + 10d10 + 10d8) still hit the SETTLE_CAP at 540
frames — Commit C (§0a in ROADMAP.md) is still needed to close the
invariant for that class.

### 0b. Boot & bandwidth — bulk SHIPPED 2026-08-05

Three wins landed in the Tier 0 big pass (workflow `wf_707277c0-0ee`):

- **LOG_CAP=100 (`747acf5`).** `server.js` LOG_CAP halved from 200 to
  match the client's `MAX_LOG_ENTRIES=100` ceiling (js/main.js:44).
  Every hello had been shipping ~50% dead weight the client discarded
  on arrival — zero protocol change, immediate ~50% payload cut on
  reconnects.
- **304 revalidation for statics + immutable /vendor/ (`6ebd3e0`).**
  `streamFile` now compares `if-modified-since` to `stat.mtime` and
  answers 304 when unchanged. `/vendor/` files (three.js, cannon-es —
  never edited by rule) additionally ship
  `Cache-Control: public, max-age=31536000, immutable`. Browser
  reload pre-fix: 1,619,828 bytes re-transferred every load; now
  those turn into 304s.
- **Drop per-viewer dice-array clone in projectEntryFor (`b526572`).**
  Shrouded projection cloned the whole dice array per viewer even
  when the shroud logic left the array untouched. Aliased when the
  projection is byte-equal, only clones when actually diverging.
  Small serialization win amplifies at 40-player caps.

**Deferred/killed** (see ROADMAP §0b): delta hello over Last-Event-ID
(F3, 2 blockers — secret rollId leak in `retained`, executeRoll
never stamps roll birth with seq) and memoize projections + JSON
payloads per broadcast (F4, Map-identity precondition unmet).

### 0c. GPU idle discipline — SHIPPED 2026-08-04 (`84c1074`)

**S3, closed.** The gate now mirrors `collectShimmerSources` and excludes
shelved bloom dice from the wake predicate; `PostStack.render` brackets
`renderer.shadowMap.autoUpdate = false` between the base and glow renders
(one shadow-map pass saved per stack frame). Bench after fix (same
headless reproducer as the audit): 4 bloom dice shelved on an empty felt
drops from ~905 µs/frame to ~538 µs/frame — ~370 µs saved per frame,
`postInfo.active` observable flips false. Level 5 bypass equivalence held
(empty table renders the released direct path before roll AND after
clear). New `postInfo().bloomDiceLive` (felt-only) drives the gate;
`bloomDice` (felt+shelf) kept for pin compat. Extended `themed-post` e2e
pins the observable. Verified adversarially — reveal, whisk, hello-resync
and shelved-die reveal-in-place all funnel through `shelveRoll`, and the
gate exemption keys on `shelfClusters.has(d.rollId)` (race-free —
`shelveRoll` sets the cluster before any tick could read the state).

The findings, for the record: after collect the table's resting state has
40+ dice sitting on the shelf. `js/main.js:3671` gated the post pipeline
on `tableDice.some((d) => d.mesh.userData.bloom)` — and `tableDice`
includes shelved dice (compare `js/main.js:3687` where shimmer explicitly
excludes the shelf). Any of the six glowing sets (tidewrack, stormcall,
rimehold, emberforge, arcanum, umbra) kept the full bloom stack — mask
render + threshold + 4 blur passes + composite, plus a second full 2048²
PCFSoft shadow-map render — running every frame the archive was on
screen. Headless: 1658 µs/frame with 4 bloom dice on the felt vs 1104 µs
stripped (+50%); 1199 µs with all four shelved. Felt as fan noise /
battery drain on laptops, dropped frames on integrated GPUs — never a
hitch, hid forever.

### 0d. Server hygiene — bulk SHIPPED 2026-08-05

Six landed in the Tier 0 big pass:

- **endStream forces socket teardown (`052c92b`).** Eviction/dead
  paths now `res.destroy()` (not `res.end()`) so buffered data frees
  immediately and the socket-close event fires deterministically to
  trigger the reap path.
- **Centralize non-onClose stream drops through `dropStream()`
  (`d8ca535`).** Four places previously dropped a stream from
  `player.clients` without going through onClose, so the reap
  scheduler never fired. `dropStream(res, player)` is the single
  point that removes AND schedules reap.
- **30s TCP keepalive `initialDelay` (`96f7714`).** SSE sockets get
  `setKeepAlive(true, 30_000)` so a dead TCP peer is noticed in ~30s
  (default is 2h). Combines with the heartbeat + backpressure work.
- **MAX_PHYSICAL_DICE=40 citation (`d14697c`).** No-op audit trail
  above LOG_CAP capturing why bounds are what they are (physical
  constraint: 40 dice per player).
- **Gate high-volume server logs behind `DICE_LOG_LEVEL` (`759c31e`).**
  Chatty request/broadcast log lines now gated behind
  `DICE_LOG_LEVEL=debug`. Default `info` is quiet enough for Cloud
  Run logs to stay readable at low room counts.
- **Quote user-derived values in setting log lines (`2570088`).**
  User-supplied strings (tableName, playerName, notation) now
  JSON.stringify-wrapped in log lines, closing a log-injection hole
  where a name containing `\n[worker] ` could forge log rows.

**Deferred/killed** (see ROADMAP §0d): SSE stream eviction on write
buffer (128 KB threshold below realistic hello worst case), HttpOnly
cookie for playerId (multi-tab identity swap; TLS-behind-proxy
detection inverted), in-process token-bucket rate limits
(clientIp collapses under Cloud Run proxy; 429 on /api/events
triggers stream storm), strict security headers (blocks the
importmap and lab.html inline modules), SSE stream cap per IP
(counter leak with existing early-delete), global player cap
(undefined `totalStreams`), coalesce settings broadcasts (throttle-
vs-debounce prose mismatch), /api/pools rate limit (undefined `i`
in patchSketch).

### 0e. Endurance leak — bulk SHIPPED 2026-08-05

Eight targeted fixes landed in the Tier 0 big pass:

- **Delegate log ⟳ + append-plus-prune #log-list (`7083467`).**
  `renderLog()` had rebuilt the whole flyout on every roll arrival
  and rebound one click closure per row. Now uses one delegated
  listener on `#log-list` keyed by `row.dataset.rollId`; new rows
  prepend and old rows prune from the tail. Behavior change:
  incremental append preserves scrollTop so a user reading history
  isn't jerked to the top by every arrival.
- **Clear roll-dice outline whenever banner hides (`4f75851`).**
  The card-hover outline anchored on banner mouseenter/mouseleave,
  but sites that hid the banner without a mouseleave (new roll
  spawning, auto-collect, clearRoll, resetTableSurface, banner-main
  click) stranded per-die MeshBasicMaterial + scene-graph children
  forever. Route every hide through `hideBanner()`. New
  `endurance-outline` scenario asserts `outlinedCount === 0` after
  60 rolls.
- **Cluster marker as sinking record (`b2bbdbe`).** Sink cleanup
  relied on a die's chip ref to find its marker; when the marker
  belonged to a whole cluster (not any single die), the ref was
  lost. Now each cluster marker sinks as its own record.
- **Lazy DecalField atlas + mesh construction (`856794f`).** The
  decal atlas + mesh warmed at boot even though
  `DECALS_DEFAULT_ENABLED = false` (Joe kept the kill switch on).
  Now warms only on first `decalsEnable(true)` call. Zero cost while
  the switch stays dark.
- **Persistent Reveal/Reroll banner buttons (`538c471`).** Action
  buttons on banner + verdict fold rebuilt per render; now mount
  once and toggle visibility. Kills per-render listener churn.
- **Reuse one persistent felt CanvasTexture (`b752395`).** The
  felt-mat canvas + CanvasTexture were being allocated on every
  shelf repaint; three.js `Texture.dispose()` never called, so
  GPU-side texture handles accumulated. Now one persistent
  CanvasTexture, redrawn in place.
- **Pool shimmer sources + reuse PostStack V2 scratches (`21e3b10`).**
  Every frame allocated a fresh array of shimmer source records and
  a fresh Vector2 scratch for PostStack.setShimmer. Now pooled at
  module scope.
- **Hoist positionChips/positionShelfMarkers scratch V3s (`130e813`).**
  Vector3 scratches allocated inside per-frame loops. Moved to
  module scope.

**Deferred/killed** (see ROADMAP §0e): bound rollStates by deleting
cleared entries (breaks Enter/Esc on cleared rolls via
`lastRollActionable`), drop stagedVerdict on new roll (redundant with
`dismissCeremonyUI` + kills refreshRevealSurfaces repaint), skip
world.addBody for shelved dice (crashes resetTableSurface's
unguarded `removeBody`, violates physics-truth invariant at
:1071-1075), dedupe renderPeek (snap misses entry.dc, entry.dice,
entry.playerName), gate __diceDebug on __diceTestMode (mechanism
claim false — ES module module-scope state pinned by module
registry, not by __diceDebug getters; removes decalsEnable(true)
diagnostic surface Joe uses).

### 0f. The seat survives a refresh — SHIPPED 2026-08-04

**Closed.** "When I refresh my browser, the player pills show two players
with my name briefly… my color changes on the reload instead of being
preserved." One cause, both symptoms: `/api/join` minted a new
`crypto.randomUUID()` seat on **every** page load and took the next
`colorCursor` hue, while the abandoned seat lived on until its stream
close reaped it `DISCONNECT_GRACE_MS` (5s) later. Every refresh was a
*stranger joining* as far as the room was concerned.

- **The tab remembers its seat** (`js/net.js`,
  `sessionStorage['dice.seat.v1:<room>'] = {id, color}`) and offers it
  back on join. `sessionStorage`, not `localStorage`, is the whole
  design: it is scoped to the browsing context, so a reload resumes
  while a SECOND TAB is genuinely a second player — which is what a
  shared screen expects, and what the e2e harness relies on when it
  seats several tables against one origin.
- **`/api/join` RESUME** (`server.js handleJoin`): a known seat id in a
  live room sits back down — same `playerId`, same color, same snapshot,
  and **no `player-joined` broadcast**, so no other screen blinks. The
  id IS the credential (every mutating POST already carries it alone),
  so holding it is authority enough; an id the server has no record of
  is never adopted, it falls through to a fresh seat. Resume runs AHEAD
  of the entity caps: it adds no player, so a FULL room must still let
  its own players reload.
- **`scheduleReap` never shortens a pending grace.** A refresh races two
  timers — the dying tab's stream close (5s) can land after the new
  tab's join has asked for the full `JOIN_GRACE_MS` (60s), and the
  shorter one would reap a seat that is mid-resume.
- **Color is a preference, not a claim.** A seat that lapsed entirely
  (grace expired, server restarted, room recycled) asks for the hue it
  wore; `keepColor` honors it when it is a real palette entry and
  nobody in the room is wearing it, otherwise the round-robin cursor
  answers — and the cursor only advances when it is the one that
  answered, so an honored request never burns a hue. The silent
  re-join path carries the preference too, which is what keeps a
  color across a server restart.
- **`forgetSeat`** is the difference between LEAVING and reloading:
  'Leave & switch seat' drops the remembered seat (by room name, so it
  also clears one left by a solo boot) or the fresh join would resume
  the player who just left.

Covered by `seat-resume` (tag `seat`): same id + color across a real
`Page.navigate` reload, a watcher's raw SSE stream seeing **zero**
join/leave/rename events across it, exactly one Alice on every roster,
the resumed seat still rolling under its own name, a second same-origin
tab still a separate player, leave clearing the seat, and the color
preference honored when free / refused when worn.

---

### 0g. Hot-path polish — SHIPPED 2026-08-05 (new)

Three of the per-frame allocations + O(N²) loops that the fresh hot-
path scan surfaced (the other three landed under §0e since they were
allocation-leak fixes as much as hot-path fixes):

- **byId map in renderLog (`5c9cc8f`).** `renderLog()` was doing
  O(N²) reverse-copy + N linear lookups per arrival. Build the byId
  map once, drop the reverse copy.
- **stepPlayback per-frame forEach → index loop (`7ccfe81`).** Saves
  one closure allocation per frame per die under playback.
- **Hoist banner-cell DOM lookups to module scope (`75051d4`).**
  `document.getElementById()` on hot banner-update paths hoisted to
  module init.

Companions under §0e (same cross-cutting concern, listed there):
`130e813` (positionChips/shelfMarkers scratch V3s), `21e3b10`
(shimmer sources + PostStack V2 scratches), `b752395` (persistent
felt CanvasTexture).

**Deferred/killed** (see ROADMAP §0g): replace bloom-live scan with
felt-bloom counter (missing seams in resetTableSurface/shelveRoll
branches), track live range in Particle/DecalField
(BufferAttribute.updateRange deprecated in vendored three.js r160;
replacement addUpdateRange allocates {start,count} per call and
breaks the allocation-free claim).

---

## Tier 1 — Core mechanics landings

### 2. Interpretation system profiles v2 — SHIPPED (through 2b–2i)

`meanings.js:94-108` declares the v2 profile interface (`aggregate:
'per-die' | 'sum'`, `usesTotal`, `usesMods`, `outcomesFor`, `meaningFor`,
crit predicate). Soul Deal reads per-die against the chart's rank
columns; dnd/none keep their sum/total behavior. Result surfaces (banner,
verdict, peek, log rows) all read through the profile via §2i A's
`renderOutcomeRows`. Success counting is a straight per-die profile away
when a table needs it. The 2026-07-31 pre-revision natural-crit gate and
its unit tests were superseded and replaced.

### 2b. Multi-pool rolls & pool groups (goal 6 + goal 5)

Soul Deal play composes a roll from SEVERAL pools (attribute + skill +
motivation); Joe wanted this semi-generic — useful under every system.

Build order shipped 2026-07-31 (`7740f30`, `d092e84`, `4d1b67a` + the
source-read commit):

- **Dice-term attribution in notation** (foundation; preserves notation
  totality): `3d6[Strength]+2d8[Swords]` — attributed DICE terms,
  mirroring the existing `+2[Proficiency]` modifier grammar. Parser,
  canonical form, rollspec perDie `source` label, server re-parse,
  codec.
- **Pool categories**: saved pools gain an optional group ('Attributes',
  'Skills', 'Motivations'); the Pools panel renders category sections;
  manage mode edits the category; every carrier takes it present-or-
  absent.
- **The Pools Rack** (agreed with Joe 2026-08-01): sources add, the pool
  rolls. Pools render as TILES in category-section grids; tapping a
  tile STAGES its dice into the sticky draft cluster (source chips, one
  ✕ each; loose palette dice keep per-type ✕); ONLY the draft wears
  gold/the ROLL cue. Digits stage by rendered order; Enter rolls the
  draft when one exists (else keeps the last roll); Esc clears it (else
  sweeps). Sticky section headers, fixed trio order
  (Attributes/Skills/Motivations, others, uncategorized). Owner
  switcher: players' pools publish to the room
  (name+notation+category; localStorage stays owner truth); foreign
  lists show a standing 'BOB'S POOLS · read-only' banner-chip (also the
  way back), stage-only (no ±/manage), drafts persist across switches,
  chips snapshot notation at stage time, digits always act on YOUR
  pools. Staging a modded pool sets +N/dc aside with a one-line whisper
  on its chip. First stage from the hover flyout promotes it to the
  pinned panel.

Racks publish via `/api/pools` ('pools-changed', display copy —
localStorage stays owner truth), and attribution rides `spec.sources` on
the wire (present-or-absent; redaction drops spec wholesale, so hidden
rolls stay hidden). Breakdown, tally and log group per pool; rerolls
keep their labels (sources join the canonical and ride the notation
shape — the same single-carrier rule as visibility).

### 2c. The Sheet Pass — SHIPPED 2026-08-01

Editing un-bolted (designed by a 4-design judge panel; UX.md §7.9
records the full contract): the pool popover grows an identity strip
(rename in place, shelf chips, die-rank ladder fail-closed to NdX);
ghost '+' tiles end every shelf (creation card, newborn contract, the
shelf IS the category); the save morph gains shelf chips; manage mode
slims to the destructive gate (standing bar + grown ✕, per-tile ✎
retired); the notation card slims to the complex-pool escape hatch.

### 2d. The Trigger Pass — one way to roll — SHIPPED 2026-08-03

From Joe's 2026-08-03 play notes; refined the 2b/2c surfaces while they
were fresh, and settled where offers live *before* targeted offers (4b)
built on that surface. UX.md §7.10 records the contract: popover = pure
editor (tray live-syncs into the box canonical; group commits with ONE
Save by id + Duplicate…; shelf goes Open in draft); Offer lives on the
draft row, hidden solo; the identity strip composes counts like the
creation card (pure-dice pools, last-die guarded, 40-cap); per-die
tables fold the sum-world sections behind 'Show anyway'; the result
banner and offer cards hold fixed geometry. The original brief:

- **One roll trigger.** The ± popover loses `Roll` and `Offer to table`;
  every roll and offer fires from the draft's ROLL ❯❯❯ strip. The
  popover becomes a pure editor — tweaks land in the draft (or write to
  the saved pool), never roll directly. Extends the staging inversion
  to its last holdout.
- **One commit verb.** Editing a pool shows both 'Update this pool' and
  the save morph side by side — confusing. One primary Save that writes
  by id; additive twin demotes to explicit 'Duplicate…' or leaves the
  edit flow.
- **Count editing composes.** Identity strip's die-rank ladder swapped
  rank only; Joe expected the creation card's idiom (tap palette dice
  to add, tap preview units to remove). Same composer for pool editing
  everywhere.
- **Hide non-applying mechanics.** Under a per-die system (Soul Deal)
  the ± popover still rendered sum-world controls (keep/drop, DC, mods)
  with a note; hide them behind a small disclosure so they stay
  reachable.
- **Layout stability.** Tiles change height with long names, ROLL ❯❯❯
  strip resized when a ×2 chip appeared. Fixed tile geometry (clamped
  two-line names), reserved multiplier space, constant-width action
  strips — ambient chrome never jumps under state changes.

### 2e. Result-card IA under per-die systems — SHIPPED 2026-08-03

The reveal/result surface accumulated per-die outcome chips, the tally,
the hero word, and the action strip — nearly all of it *needed* under
Soul Deal, but muddled as a layout (Joe, 2026-08-03). UX.md §7.12: the
diagnosis was DUPLICATION at equal weight — the tally line and the
breakdown line repeated the same source labels, and reading which die
said what meant cross-referencing the two. The fix is ONE structure:
each pool is a ROW — label leading, then one chip per die [dX face →
tier-colored outcome word]. The word answers, the face is evidence
beside it; the separate breakdown line folds wherever rows stand
(banner, verdict card, peek — log keeps its compact line). The verdict
ring stops showing the dice-count-as-total (the exact confusion); under
per-die its center is empty and the rows are the verdict. The text
layer keeps the whole story row by row for copy/paste and screen
readers.

### 2f. The Workbench + reroll clarity — SHIPPED 2026-08-03

Ultracode draft-zone pass (judged 3-way design panel): the draft became
a WELL over a RAIL — the well wears the same recessed dress as the
notation box (one draft, two editors, both finally looking like
editors) and holds the ± inside it; the rail's verbs (Save · Offer ·
✕ Clear) STAND while a draft exists instead of hiding behind hover
(UX.md §7.14). Reroll clarity rode the same pass: exactly ONE clear
affordance per collected roll chosen by the opening gesture (§7.15),
every replay trigger says REROLL ❯❯❯ (the draft keeps plain ROLL), and
the log carries server-substantiated reroll provenance — `rerollOfId`
gated AT BIRTH by `entryExistsForAll`, so a reroll of a secret roll is
recorded as a plain roll and no existence oracle forms; the newest row
wears a quiet 'reroll' chip, the superseded row 'rerolled'. Verified
same day: the two-lens fleet (suite runner 47/47 ×3 + adversarial, 3
confirmed findings fixed) and the pre-release sweeps after (49/49).

### 2g. The beacon pass — the draft well goes further — SHIPPED 2026-08-03

Same day as Joe's cleanup batch (UX.md §7.11b): the FEED (two
converging gold funnels, shapes not words, framing the workbench so the
palette above and pools below visibly pour into the well), stepped heat
(the funnels brighten, the well gains its gold under-glow, the standing
ROLL whisper gathers toward 0.55 as dice land — light and depth, never
size), the FOLDED CARD (banner's body is the one big removal target
with a red ✕-watermark dress — slate for a spectator's dismiss — and
the fold below holds REROLL/Reveal untinted), and the HOVER READ
(inverted-hull WebGL outlines on the roll's dice, one color per source
pool).

### 2h. THE SIDE PANEL — the felt owns zero standing chrome — SHIPPED 2026-08-04

Joe's call, iterated live: Pools panel is a dedicated layout COLUMN,
not an overlay — one vertical divider (also the collapse control), the
canvas sized beside it (refitView / `--table-left`; every projection
went felt-rect-relative and felt-anchored overlays re-center over the
felt), no "Pools" title. The rail split into the panel: presence on top
(status · roster · you), utility verbs at the foot (❯ ≣ ⚙ + contextual
✕ Clear table, which left the felt corner); their menus still drop as
overlays. Collapsed = a slim icon rail with a SUPER-MINIMAL quick list
(named pools as vertical names alone, unnamed as die chips alone, tap =
roll directly, zero edit chrome); the hover flyout retired. NEUTRAL
graphite dress — the dice themes carry the color, gold survives only on
roll verbs, and the draft well wears the one warm bronze surface with a
larger balanced ❯❯❯ ROLL ❯❯❯ cue (Joe: the outer brown looked like a
dirt hole; brown/gold lives inside the tray only). The rack's owner row
gained air so 'You' reads as the rack's header. e2e: side-panel (tags
`smoke`,`chrome`,`groups`) replaces pool-flyout; control-rail asserts
the split; stills in tools/out/side-panel/.

### 2i. THE SOUL DEAL AUDIT — reveal read, chrome consistency, material, labs — SHIPPED 2026-08-04

All six families shipped same day (UX.md §7.16 records the as-built
laws; only E's `no-newcomer-path` stands open, by design — Joe owns the
orientation direction).

Joe asked for a UI audit of the left panel, the reveal panel, the
collect peek, and the check/cinematic screens under Your Soul Deal,
with multi-pool flow ("I find some of the presentation difficult to
parse… consider a table?"). 21 stills + a 5-lens adversarially-verified
review (33 findings survived, 2 refuted). Stills + the ledger prototype
pairs in `tools/out/souldeal-audit/` (scripts committed 943a949:
`souldeal-audit-shots.mjs`, `souldeal-ledger-proto.mjs`; full findings
JSON sits beside the stills). Severity S1–S5; each finding kept its
audit id.

**A · The reveal read (banner · peek · verdict share renderOutcomeRows) — the LEDGER family. `2631702`**:
the grid ledger (oc-ledger label spine, per-pool .oc-cell hanging
indent), layout-owned chip gap with the copyable space kept, the
exactly-once silence rule (in-chip dash beside worded dice, one
restyled 'quiet' for an all-quiet pool), header demoted to a wrapping
identity caption, oc-solo hero scale for one-die rolls, reduced-
strength tier borders, and B's ring fold rode along (a hidden roll
keeps the ring as its face-down stage). Pinned by the `ledger-read`
e2e. The findings as audited:

- S5 `chip-fusion` — `.oc-chip` is inline-flex, so the whitespace box
  between die evidence and word collapses ("d6 1Fail"). The pixels lie
  while copy/paste stays correct.
- S4 `rows-center-independently-no-shared-column` — every outcome row
  centers itself; the label column exists in intent, not geometry.
- S4 `row-wrap-orphans-worded-chip` — a wrapped chip carries no label
  and no hanging indent; the orphan can be the pool's ONLY worded die.
- S4 `quiet-grammar-three-ways` — silence rendered three ways.
  ADJUSTED by doctrine verifier: in-chip mark mandated by text-layer
  rule; "quiet" STAYS in the answer slot (§7.9), fix its weight only.
- S3 `notation-header-duplicates-rows` — the loudest line repeated
  what the rows said, wrapped inside `[PEER RESPECT]`, ellipsized on
  the peek. Demoted to a quiet identity caption; rows are the data.
- S3 `one-die-answer-not-hero-scale` — a one-die Soul Deal roll (the
  common case) rendered its whole verdict as one 15px word where dnd
  showed a 52px gold total.
- S2 `card-chips-ignore-tier-border-felt-teaches` — felt's value chips
  tier-color their borders; the card chips directly above didn't.
  ADJUSTED: apply at reduced strength.

**B · The ceremony cards. `0ef95d5`; ring fold in `2631702`**: intent
card speaks its pools (spec.sources through canonicalNotation), the
verdict action row joins the rest-dim grammar (the last invisible→
visible holdout), chips keep lowercase mono under the hero dress, and
the hero's flanking hairlines fold under rows (as generated content
they'd have joined the ledger grid as stray items and sheared the
label column).

- S4 `empty-verdict-ring` — under Soul Deal the verdict ring was a
  giant empty gold circle: main.js ~L3397 set the center to `''` while
  its own comment promised "the outcome count… so the ring stays a
  stage, not a lie". A16 still shows the card with ring folded and
  ledger as its center.
- S4 `intent-card-drops-pool-names` — renderIntentCard (~L3317)
  omitted `spec.sources` from canonicalNotation, so the declaration
  read "2d8+1d10" where "Wisdom + Sword" was the stake.
- S3 `verdict-actions-invisible-at-rest` — verdict card used the
  invisible→visible grammar the folded card retired; banner/peek rest-
  dimmed instead.
- S2 `verdict-uppercases-shared-chips` — inherited text-transform made
  shared chips shout ("D8 5 PARTIAL SUCCESS").

**C · Action grammar & control consistency. `d8673b1`**: verdict fold
builds through appendCardActions (one codepath; strip rerolls THIS
card's entry), one confirm-weight Reveal dress sized by surface, three
visibility CODES (disabled = grayscale drain; rest stays 0.45; absent =
explicit display:none), destruction hovers RED everywhere (✕ Clear
table's gold hover gone), the steel-hover law unscoped app-wide with
the log ⟳'s gold written down as the density exemption, and the draft
✕ anchored inside its chip.

- S4 `three-button-families-two-codepaths` — verdict card's icon row
  (static markup in index.html) vs banner/peek's body-click-to-clear +
  REROLL strip (built by appendCardActions): a design split that was
  also a code split.
- S4 `reveal-verb-three-dresses` — Reveal wore gold primary on banner,
  10px chip on peek, plain ghost on verdict card.
- S4 `rest-dim-reads-as-disabled` — resting reveal-tier opacity was
  numerically the disabled dress. ADJUSTED: three states three codes.
- S3 `clear-family-five-dresses-gold-hover` — clear/destroy wore five
  dresses, and ✕ Clear table (most destructive) invited with GOLD
  hover.
- S2 `done-word-three-meanings` — Done was three controls in three
  dresses. ADJUSTED: unify dress and hover; role-split semantics stay.
- S2 `steel-hover-law-stops-at-panel-edge` — neutralization was scoped
  to #left-panel; verdict Done/⟳, banner Reveal-ghost, log Clear and
  corner pill hovered gold. Unscoped; log per-row ⟳ written down as
  density exemption.
- S1 `tray-x-floats-between-chips` — proximity ✕ rendered in gutter
  between adjacent pool chips.

Proposed rule set: ONE DRESS PER VERB sized by surface · THREE
VISIBILITY STATES, never invisible-interactive · HUE = ACT globally
(gold rolls, red destroys, steel tools).

**D · Panel material — stone/bronze vs steel/silver answer. `531360d`**:
Scheme C — steel got its body (gradient + bevel + seat shadow on
palette tiles, pool tiles, the rim), column's muted tier re-tokened
cool (#99a1a9, tray re-warms its own token on purpose), bronze-bleed
balance swept with C's hover-law pass (confirm borders ivory, pool-
name hover ivory; the ± editor-open rings stay bronze — the ± belongs
to the roll world, §7.14.1).

- S3 `material-scheme-recommendation` — neither temperature swap:
  stone/bronze narrowed tray-vs-column contrast 2h just built; steel/
  silver split the app into two temperature worlds and fought ivory
  type. Scheme C wins: keep graphite/bronze, make the steel REAL.
- S3 `steel-has-no-body` — outside the tray, "steel" was flat
  translucent white over graphite: no gradient body, no bevel, no
  seat shadow.
- S2 `temperature-schism-khaki-on-graphite` — neutral re-dress was
  half-done: cool graphite panel tokens under warm khaki section
  heads.
- S1 `bronze-bleed-ambient-chrome` — bronze leaked onto non-roll
  chrome inside the neutral column through unscoped globals.

**E · Multi-pool flow. `70bc4d8`** (where it was ours to ship): spent
draft (survives its roll, cools until the next edit — `spent-draft`
e2e), and A's peek-identity wrap serves the shelf-anonymity finding
within the quiet-chrome contract until §6b's seated-shelf decision
reopens it. `no-newcomer-path` stands — Joe's. The chain rack → tray →
reveal rows keeps staged order faithfully.

- S3 `rolled-draft-accretes-on-restage` — draft survived its roll with
  no spent state: tapping pools for the NEXT roll silently doubled a
  pool. ADJUSTED: spent/refresh cue, not auto-clear.
- S3 `shelf-clusters-anonymous-at-rest` — collected rolls rested as
  unlabeled dice piles. ADJUSTED: standing mark must respect quiet-
  chrome shelf contract; §6b seated-shelf idea would answer wholesale.
- S2 `no-newcomer-path-to-first-stage` — nothing taught "tap a pool,
  then ROLL"; cut ghost text left the compose loop undiscoverable.
  Joe owns replacement direction; standing, not new.

**F · Labs — chrome-lab.html, contact-sheet index, rotted-mockups
banner. `ccbca1f`**: chrome-lab.html (pose-driver shape exactly — real
app in an iframe, posed through __diceDebug), tools/contact-sheet.mjs
(per-directory captioned grids + top index), docs/mockups marked
ROTTED (README + per-file banners).

- S4 `no-chrome-lab` — lab.html covered 3D die materials; nothing
  showed the 2D chrome side by side. Pose-driver upgrades directly on
  the card builders extract.
- S3 `mockups-rotted` — docs/mockups/*.html drifted (<1 week);
  disqualifies static-mockup shape.
- S2 `contact-sheets-have-no-index` — each drive suite dropped 20+
  loose PNGs; stitched index page per run.

**Refuted:** a worded "Collect" on the banner/peek fold (re-litigates
§7.9's retired Done); unifying the card strips' chevrons with the
tray's engraved lozenge (re-litigates §7.14.1's same-day boundary).

### 2j. The flow to collected + the one-way rim — SHIPPED 2026-08-04

Two directives landing on the audit pass's fresh surfaces (`30289fd`,
`d2c7b30`; UX.md §7.16):

- **"Cinematics have too many stages."** The ceremony's handoff into
  the standing banner is GONE: the verdict card is a folded card —
  body = the role-split clear target wearing the banner's removal
  grammar (click mid-moment SKIPS first; always interruptible), fold =
  the built REROLL/Reveal, no ✕, no Done — and its clock (hover holds
  it) flows the roll STRAIGHT to the shelf. A hidden card stands until
  its reveal re-arms the clock. Check and cinematic alike: one card
  family. e2e: `ceremony-retire` rewritten.
- **"One way to do most things."** The rim's Save and its whole
  inline morph retired — keeping a draft is pool editing's job (✎
  ghost tiles mint with shelf-at-birth, the popover's Duplicate…
  copies, the peek's Save-as-pool keeps a rolled result; writes stay
  by-id only) — and the freed room lets the modifier tool wear its
  word: **± Modify** (Joe's pick list was Modify/Customize, never
  "Tweak"). The tray popover's standing title says *Draft* now.

### 2k. The panel anatomy pass — the quiet nameplate + the region head — SHIPPED 2026-08-04

Joe asked for the panel's four regions (table & users · dice · roll
tray · pools) to read explicitly, unobtrusively, text allowed, "best UX
should win." Run as a four-entrant judged design panel (typographic ·
structural · identity-first · minimal, three adversarial lenses each +
completeness critic); UX.md §7.17 records the shipped synthesis: the
table is NAMEABLE (room-wide `tableName` on the settings channel,
renamed from Settings → Everyone at the table), the rail wears the
name at its right edge (name → chosen ?room= key → NOTHING — never a
placeholder) and document.title carries it; `SAVED POOLS` heads the
rack with a rule-to-edge rank mark, yielding to the owner banner on
foreign racks; the dice and tray regions get deliberate NOTHING
(pressed Dice segment and the bronze well already speak). e2e:
`panel-anatomy` (chrome, settings); stills in tools/out/anatomy/.

Follow-ups from the critic that shipped same day:
- roster-pill ↔ owner-chip duplication — rail pill is the browse verb,
  `buildPoolsSwitcher` retired, aria-pressed steel dress, press-again-
  to-close, disabled in manage mode, `ROSTER_MAX` 4→6.
- ownership legibility mid-scroll on foreign racks — `#pools-head.
  foreign` joins the sticky stack; category heads yield sticky in
  foreign state.

### 2l partial — slices ①–④: honesty, seam, ledger, spectrum — SHIPPED 2026-08-06

The math floor under pool analysis (`b91a32b`, `4c92ae6`); slices ⑤–⑦
remain open in ROADMAP §2l. `js/odds.js` `previewOf(dice, mods)` →
`{min, avg, max, exact}`: each capped mechanic is classified per spec —
VOID (the 40-die cap zeroes it: `40d20!`, `40d6 ro<=3` — exact with the
mechanic ignored), FREE (the cap can never bind — exact via per-die
pmfs, a tie-proof top-k threshold identity that handles mixed-type
keep/drop, and closed-form explosion chains), BINDING (truncation
depends on rolled values, which breaks per-die independence — seeded
4,000-roll sampling, and the preview line SAYS so: `· sampled — 4,000
rolls`, never a bare ≈). min is the provable floor in every tier.
`budgetOf` (dice value, POOL-ANALYSIS §4) landed beside `DIE_MAX` in
rollspec.js with the caps exported; both adv spellings of 2d20-keep-1
read 40. `fmtPreview` re-pointed in all rendered surfaces (command box +
quick palette via `renderCmdState`, ± popover echo) — the old
`previewSpec(…, 800)` Monte-Carlo line was wrong at both ends for any
pool past 3d6 (9d6: never right) and jittered per repaint. Verification:
`tests/odds.test.mjs` (53 tests) cross-checks the exact tier against
exhaustive enumeration of composeRoll's own rng-draw tree — caps, ties
and sort stability captured mechanically; e2e `preview-honest`
(`notation`, `smoke`) pins the literal preview text, an assertion that
was impossible under Monte Carlo.

Slices ②–④ followed the same day (profile seam `755808f` · dice-value
ledger `25012c6` · spectrum bars `711771e`), then a ten-commit polish
wave (`c7b90fc`…`fea43e6`) driven by Joe's screenshots. The forecast
lives in the ± popover under a labeled **Pool stats** head: per-die
spectrum bars in chart row order, identical (source, rank, transform)
dice deduplicated into one counted bar, keep/drop and binding-reroll
specs refused in plain words rather than shown wrong. Display amendment
(POOL-ANALYSIS §8): a multi-bar pool opens as ONE count-weighted mixture
line — `P(O) = (n₁·p₁(O) + n₂·p₂(O) + …) ÷ N`, exact, laid out in
`OUTCOME_LADDER` order — with a `per die` toggle; results still never
fold. Sliver honesty (Joe: a 3% Blemish vanished and its neighbor color
swallowed it): 1px mosaic rules between segments, 2px minimum segment
width, a sequential within-tier lightness palette, and a fixed readout
strip below the bar — caret at the hovered segment's midpoint, `Blemish
· 3%` — which replaced both the in-segment letters and the tick-lane
callouts (kept "for print" in POOL-ANALYSIS). Around it the popover
reorganized: Set and Saved-pool sections, Visibility above Moment,
comment folded into Moment and gated to check/cinematic, one title at
the top (the head is the rename affordance), and Soul Deal folds
sum-only mechanics plus the sysnote outright. Help arrived
concept-first (Joe: durable concepts over UI choreography): a rail `?`
door and a Pool-stats `(?)` bubble open one sectioned dialog — seven
topics (fair rolls & the pose seed, systems-as-lens, notation,
visibility, the mixture math, pools, your data) with in-dialog anchors
because the URL carries nothing. "Rack" left the UI vocabulary for
"pools" (US slang collision, Joe); `racks?` joined the terminology
sweep's banned regex and `#help-overlay` its swept roots, so the ruling
is test-enforced. Verified: `pool-forecast` + `rack-dice-value` e2e,
meanings unit vectors incl. collapsed-mixture exactness, and a clean
33-scenario gate at `fea43e6` (sole failure the known-environmental
`seat-resume`, proven pre-existing at baseline `4d7161a`).

---

## Tier 3 — Secrecy landings

### 4b partial — Targeted offers — SHIPPED 2026-08-03

The first multi-player CUJ, landing right on the Trigger Pass's single
offer surface; UX.md §7.11. Offer a roll claimable only by a named
player ("Bo, roll this save"). Name resolves against the roster at
offer creation exactly like a whisper audience (case-insensitive,
duplicates all join, 400 `unknown_target` fail-closed); pinned
`playerId`s ARE the claim gate — server-enforced (403
`not_offer_target`), never just which client drew the button. Card
shows everyone the stakes including who it's for; only the target
wears the claim strip (bystanders read 'waiting on Bo'). UI: a ▾ split
button beside the draft row's *Offer to table* (plain click keeps
one-click table-wide muscle memory; the ▾ waits for a teammate).

### 4b partial — Whisper-offer auto-targeting — SHIPPED 2026-08-03

Joe: "a whisper roll is already assigned to someone, so the offer
should always be to that person". An offered `whisper` roll derives
its claim gate FROM its audience, server-side in `handleOffer` — `w:Bo`
offered is claimable by Bo, full stop; table-wide whisper offers cease
to exist by construction (Joe: weird, arguably not useful). Multi-name
whispers are claimable by any audience member; the ▾ may still NARROW
to one of them; a target outside the audience refuses (400
`target_not_in_audience`). A whisper whose only audience is the offerer
has nobody to offer to: refused at offer time. `secret` (dice tower —
open claiming is the point) and `held` offers untouched. UI: ▾ picker
hides while draft carries whisper visibility (target already decided);
card reads 'for Bo' through existing `to` machinery. Ships with
`whisper-offer` e2e; the superseded bystander-can-claim-blind contract
left `tests/redaction.test.mjs` with a supersession note; rewritten
redaction test pins the new one.

---

## Tier 4 — State capture landings

### 5 partial — Pools & settings export/import (portable YAML) — SHIPPED 2026-08-03

Joe: human-editable YAML view of the rack (shelves; pools as name +
canonical notation) plus the just-you settings (sound, numbers), in
Settings → *Your data* — ONE textarea, two directions: Export fills
it, pasting/editing re-parses live into a preview line (`✓ 1 new · 1
update · 2 unchanged — Apply takes them`), and Apply merges by name
through the by-id writer, deleting nothing. `js/portable.js` is the
zero-dep emitter + strict YAML-subset parser (fails closed with a line
number, like the codec); every scalar is single-quoted on export because
notation carries `#` (YAML's comment) and names may carry `: `. 20 unit
tests + the `portable` e2e scenario. UX.md §7.13.

---

## Tier 6 — Customization & delight landings

### 9. Dice sets, colors & THEMES

**EXPERIMENT PHASE SHIPPED 2026-08-03**: docs/THEMES.md holds the
taxonomy — nine houses (Tidewrack · Wildwood · Stormcall · Rimehold ·
Emberforge · Arcanum · Umbra · Reliquary · Gildhall), each with
palette, material feel, and REASONED signature effects. js/themes.js
carries the material recipes; dice.js's (type,variant) seam accepts a
theme id (colors re-baked, finish + internal glow applied — geometry/
physics untouched). lab.html is the review rig (grid of every theme ×
die, effect prototype buttons, env cycle for glow judging, PNG
capture); tools/lab-shots.mjs drives it headless for review stills.

**LADDER Levels 1–3.5** shipped: texture-space maps, shader injection,
impact-keyed particles (js/particles.js + the lab's cannon-es drop
rig), geometry identity (per-set bevel/profile/wear/nicks/pillow on
the render mesh only, physics hull canonical; see THEMES.md).

**PICKER + WIRE SHIPPED 2026-08-03**: "Dice set" in settings ("Just
you" — grouped by house, felt-swatch language, localStorage); `set`
rides every roll AND claim request (present-or-absent like exp;
server validates against SET_IDS, 400 unknown_set; the CLAIMER's set
— whoever throws wears their own dice), survives redaction (cosmetic
identity like name/color), lands for everyone, and the shelf, reveal
flips (geometry + materials restore the set, shroud outranks
identity) and reload replay all keep the skin. Main table gained the
lab's PMREM reflection environment (std/shroud pinned to
envMapIntensity 0.35 — the released look holds), the SHADER_TIME
clock, and the particle field fed by fast-forward's recorded contacts
({time, strength, at} — the roll.sounds seam, realized). e2e:
themed-dice (tag `themes`).

**LADDER L4 SHIPPED 2026-08-03**: felt decals (js/decals.js — frost
crackle, drying rings, scorch with cooling ember rim, dust smudge;
instanced quads over a two-tone procedural atlas, stamped from same
recorded impacts, transient by contract) and die-parented lights
(js/dielights.js — fixed pool of 4, wave/breathe/flicker/steady modes,
Umbra pools shadow with NEGATIVE intensity; felt-only — collect
extinguishes, reveal ignites, shroud smothers). Restraint recipes:
six sets mark, five glow, four leave the table untouched on purpose.
The lab drop rig gained the coupon/rails/linger/dropView furniture
to review it at table pitch. e2e: themed-fx (tag `themes`). Marks
half retired same evening to a kill switch (Joe kept the whole ladder
except the felt residue): `DECALS_DEFAULT_ENABLED = false` gates
stamping everywhere.

**LADDER L5 SHIPPED 2026-08-03 — THE EFFECTS LADDER IS COMPLETE**:
hand-rolled postprocessing (js/post.js, core three only): selective
bloom via a blacked-out mask render (a std/shrouded die cannot bloom
by construction; no strength knob — whatever L1-2 made bright is
what burns), impact-keyed shock rings off the roll's hardest landing
(negative amp = Umbra implodes), heat shimmer above settled iron, and
a strict bypass: a std table renders the released direct path,
proven equivalent at 61.8 dB PSNR. e2e: themed-post (tag `themes`).

**CHROME WEARS THE SET (2026-08-03)**: the diceart.js bakery — baking
std chips from the real meshes since P1 — went (type, variant): one
lazy warm per set (all seven types, GL context released after),
unknown ids normalize to std, failed slots fall back to std art.
Palette tiles and tray/pool/offer strips wear MY set and re-dress in
place on a set change (refreshDieArt walks data-art-type imgs); log
chips wear each ROLL's set on every screen, and hidden entries wear
obsidian (shroud > set > std, same as the felt). e2e: themed-chrome
(tag `themes`).

**SAVED-POOL SET OVERRIDE SHIPPED (2026-08-03) — §9's engineering
seams are all closed**: a pool can pin the set its rolls wear (absent
/ 'std'-pinned / house set), chosen through one compact select shared
by the settings row and the popover identity strip ('Your set'
default). Same evening, PER-DIE (Joe: a mixed draft collapsing to one
set read as broken, and a teammate's rack wore the VIEWER's skin —
information loss at the whitelists): every die wears its own pool's
set — wire `sets` aligned to the base dice (server-validated,
redaction-preserved), provenance-chasing rollDieSet/entryDieSet for
explosion/adv/reroll extras, per-die impact effects off sounds[].di
(each recorded contact knows its die), per-die lights / bloom /
reveals / shelf / log chips, and the pools broadcast carries pool
sets so foreign racks show the OWNER's skins and staging them carries
pool identity. A YAML @-suffix carries the override through export/
import, failing closed on unknown ids. Save/variant flows inherit;
rerolls keep per-die sets; claims keep shipped semantics.
e2e: pool-set-override (tags `themes`, `groups`); units in the
portable tests.

Next morning (Joe 2026-08-04): the OWNER'S DEFAULT set rides the
pools publish too (top-level present-or-absent `set` on /api/pools,
roster + pools-changed relay, republish on every set switch), so a
foreign rack resolves explicit pool set → owner default → classics
with every strip pinned — "if you look at another player's pools,
they look identical to what that player sees." And staging a foreign
pool snapshots that resolved skin as a pin (Joe's same-day correction
— the tray had switched staged foreign pools to the borrower's
default; 'std' worlds pin std): what you saw is what you stage. Your
own rack still stages unpinned, following you.

**SLICE 0+1+2 SHIPPED (2026-08-04)** — deep aesthetic pass, judged
workflow: turn-downs across nine themes (stormcall flicker light out,
blackanvil neon digits halved, seaglass flashlight removed, umbra
violet halo halved, arcanum breathing pulse cut, plus six more),
retired eight cheap effects the critics named (heartwood firefly
motes, seaglass Mario bubbles, scrimshaw dust puff, four
proposed-but-unshipped screamers), retired two derivative sub-sets
(`rimehold.firstfrost`, `wildwood.mosstone`), added THE CLASSICS
house (8 unadorned matte variants incl. Vegas-pipped Ivory — the
honest option every RPG dice bag has), added the `glyph` field (pips
are the first family; roman + runes queue behind a glyph library),
the `sound` field with 5-body impact voice replacing the single
hard-coded click, and the `rate` field for per-set playback retiming
(vine catch · glacial arrest · ceremonial hover). Full contract in
docs/THEMES.md §0.

**SLICE 3 (rest cadence) SHIPPED (2026-08-04)** (`fc9d38d`): settled
dice breathe per set (seaglass swells sub-mm, heartwood creaks 0.4°,
scrimshaw ticks once and stays still, sapamber declares stillness);
alloc-free stepResting reads d.finalPos/d.finalQuat live so reveal
becomes the new cadence baseline for free; shipped after §0c's
shelf-bloom fix opened the perf headroom. e2e: rest-cadence.

**Configurable edge tint (`geo.tint`, 2026-08-04)** (`cac1fa2`): the
darker-color edge tint became a recipe field (0–1 range widened from
0–0.25, color parameter added — was hard-coded black lerp); applied
to onyx (`#e8e2d2` @ 0.14), brass (`#3a2708` @ 0.55), heartwood
(`#1a0a05` @ 0.35), scrimshaw (`#4a3520` @ 0.5). Lab exposes both
knobs in the builder.

### 9c. THE SOFTER EDGE — Tiers 0–2

**Tier 0 — data only. SHIPPED 2026-08-04** (`f220ef1` + seams
`64941de`): THE GEO BENCH in the lab — eight `geo` recipes swept over
otherwise-standard dice (sets may now omit body/text to inherit std
per-type colors; house-less sets read std finish) — plus THE SET
BUILDER (every recipe knob live, themes.js-shaped copy-out) and hero
die framing (canvas click, ↑/↓ same-die-across-sets surfing). e2e:
lab-geo-bench (tag `lab`); stills: tools/geo-bench-shots.mjs.

Bench verdict, post-hole-fix: the first verdict — "even round .130
reads as dark grooves" — was measuring THE HOLE (Joe found: order-
blind stitcher paired each edge's two inset segments, but consistently
wound faces traverse a shared edge in OPPOSITE orders — every band
quad was a bowtie: one triangle doubled, the other half a triangular
hole showing scene background as a pure-black wedge). Fixed by
endpoint-aligned pairing; e2e scenario now asserts every render mesh
is watertight — including through the builder's wear/nicks
displacement. With whole bands, cut recipes read as clean machined
chamfers and `round .090` reads GENUINELY soft at hero distance — the
fillet shading rolls a smooth highlight along the edge.

**Tiers 1+2 — true fillets. SHIPPED 2026-08-04** (with the `ink`
knob, Joe's ask: "turn down the darker color on the beveled edges").
Every `round` edge is now `segments` (default 3) quadratic-Bézier arc
strips, control point = the ORIGINAL sharp edge — tangent to both
faces by construction (q→ctrl lies in q's plane), never outside the
base solid, never below the resting plane (bottom edge's ctrl lies IN
bottom plane, so canonicalDiePose holds). Corners are domes fanned
over shared arc instances (watertight with no angular sort —
consecutive arcs share ring endpoints); normals are ANALYTIC:
face-exact at rims (zero crease), blended across the arc, corner-ray
at apexes. Worn sets keep the 0.65 sphere-blend after displacement.
`geo.ink` (0..1) dials the painted face outline + band material
together (they are one visual system); bench row `lab.selfink` shows
.04. House round sets upgraded free.

Deliberately NOT done: metric-radius insets (`r / tan(dihedral/2)`
per edge — the d10's kites carry two dihedrals, so fillet widths are
slightly uneven there; share-based insets keep today's proportions).
Pick that up only if the d10/d10x reads unevenly on the bench.

**Fillet review outcomes (2026-08-04, 7 confirmed):** fixed — pillow
re-opened the zero-crease guarantee at band rims on pristine round
sets (~14° step ringing every face on heartwood/sapamber/scrimshaw;
the pillow pass now tilts rim vertices identically), builderSet
bypassed the profile-flip ink snap (recipes fossilized the old
default), the e2e "inside the sharp corner" bound was looser than
the corner itself (now bounded by the base solid's actual radius),
and ink/tint/segments had zero positive coverage (now asserted off
the live band material + vertex counts). ACCEPTED, not fixed: the
builder's ink slider pops the face outline one step off the round
default — inherent to the coupled ink semantics; a split knob would
betray the one-visual-system rule.

---

## Later landings (terse index)

- **Mat zoom (2026-08-04)** (`642b71b` + `dec573c`) — three-level
  room-wide setting (wide 30×17 default · medium 24×14 · close 18×11);
  walls repositioned in place, shelf pitch derives from TABLE_W, shadow
  frustum tracks, camera eye preset shrinks with mat. Deferred
  interaction rule: mid-roll zoom queues to next roll boundary to keep
  keyframes bit-identical across clients. e2e: `zoom-syncs`.

---

## Baseline shipped (older, one-line summary)

Multiplayer core (SSE rooms, server-authoritative values, simulate-ahead
replay with face correction, solo fallback) · Soul Deal meanings · saved
pools (localStorage; the `#g=` URL codec that once carried them shipped
2026-07 and was dropped 2026-08-04 — GOALS §7) · player rename · roll
mechanics engine (shared rollspec: modifier/adv/keep/reroll/explode,
attributed parts, per-die metadata) · offers (offer/claim/withdraw) ·
face-down + reveal (UI-level; real redaction is step 4) · reroll-last ·
notation layer (Roll20 dialect, 561 tests + fuzz, command box, ± popover)
· room settings channel + felt themes + settings modal · roll ceremonies
(intent card, mat-text felt decal, staged verdict, cinematic slow-mo,
skip) · quick-roll palette + keyboard shortcuts · capability matrix
across all roll surfaces · per-roll Done-clears · **visibility core
(step 4, goal 11)**: the role-free ladder open · held · secret · whisper
riding notation (`held`/`secret`/`w:Name` + the offer-only `blind`
alias), server-side per-recipient projection on every egress, server-
enforced reveal authority, offer visibility incl. the dice-tower roll,
shrouded obsidian playback with deferred mid-playback reveals, solo
degradation, the cross-tool terminology pass (`/gmroll` family →
`secret`, `/sr` refused as ambiguous, labels *Only me* · *Whisper to…*
· *Dice tower*), and the `#`-in-player-names ban that keeps whisper
addressing total · **quiet chrome (UX.md §7.9)**: the documented z ladder
with ceremony above table labels, value chips off by default, dot-only
shelf markers with the peek doing the talking, one clear-this-roll
gesture everywhere, a persistent rail that no view can strand,
independently collapsible panels with compact view as their emergent
state (the Players panel later retired into rail roster pills, and the
remaining panels merged into the ONE Pools panel — 2026-07 cleanup),
the identity chip (rename · leave & switch · invite link) solo and
online, by-id saved-pool editing, and the *pool / saved pool* naming.

---

## Tier U — the converged UX (2026-08-08)

**2026-08-08 — a week of convergence, audited.** Joe: *"It's taken a week,
but we're finally starting to converge on a UX that is simpler and more
consistent. I'd like you to do a full analysis of it and catalog its
strengths and weaknesses."* Five stances (newcomer, GM/table, accessibility,
doctrine, consistency) read the shipped experience at
`1b7a8f2` against the source and sixteen captured frames; every finding was
adversarially verified and only survivors are recorded here. (Five stances
ran in the main pass — newcomer, GM/table, accessibility, doctrine,
consistency; touch/tablet errored and was re-run separately, see
[UX-AUDIT.md](UX-AUDIT.md) §H.) **This is a
design audit, not a bug hunt** — but two of its findings are defects, and
one is a shipped CUJ that stopped working for returning players.

**What landed.** The hard part converged: the primary verb is one
constructed object in both views, geometry no longer moves, sections
migrate losslessly, and privacy is architectural rather than cosmetic. The
week did not finish the seams — the draft silently drops the intent the
notation exists to carry, the default system (*Your Soul Deal*) keeps
falling through render gates written for sum systems, and UX.md is stale on
the newest surface it describes.

**Where this sits.** **U1–U3 are defects and outrank the rest of the
ladder** — U1 and U2 break goal 11 and §7.8's notation-totality invariant
in the *fail-open* direction, and U3 breaks the CUJ2 claim G5 shipped
against, with game night on 2026-08-13. **U4–U15 are cheap and clearly
right** and can ship in any order behind them. **U16–U26 are marked DESIGN
FIRST or carry a batch** and sequence normally, behind Tier 1. Sizes are in
the headings. Per [TESTING.md](TESTING.md) each rung ships with its e2e
scenario; where the audit found the suite *blind*, the scenario fix is named
in the entry rather than left to the step.

*Moved here from ROADMAP 2026-08-08, per this file's own opening rule — the
roadmap reads as open work only. Twenty-five entries; the seven still open
(U16, U20, U21, U23, U25, U26, U28b) stayed behind. Entry numbers preserved
so incoming links resolve.*

### U1. The draft drops its intent — `stageGroup` carries only dice — DEFECT, small  
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit A1 (major). The sharpest finding in the audit.* The same pool sends
two different rolls depending on whether the panel is open. `rollRailPool`
(main.js:7547) round-trips the pool through the grammar and fires with
everything — dc, moment, visibility, keep/drop, reroll, explode, set.
`stageGroup` (main.js:6503) — the expanded rack's tap, the digit keys, **the
primary path** — pushes only dice, source label and set; its `dropped` note
is built from `mods` and `dc` alone, and **`res.exp` (moment + subtitle),
`res.comment` and the parsed visibility are never read**. So
`Sneak Attack = 3d6+2 dc12 cinematic held` fires face-down and cinematic
from the 112px rail and lands as a bare open `3d6` in the workbench — the
exact failure §7.8 names as a GOALS-level violation (*"a pool meant to be
secret rolls in the open on the next machine that opens it"*, UX.md:1262),
failing **open** on a goal-11 surface, while `rollRailSelection` fails
*closed* to `secret` on the same data a few dozen lines away.

**Change:** write `res.exp`, `res.comment` and `visOfParse(res)` into
`boxExtras` — the fields exist and `syncBoxFromTray` already preserves them.
Anything that genuinely cannot ride must join `dropped`. Also silent and in
scope: the partial stage at the 40-die cap (a chip labelled "Strength"
holding half of Strength). Closes the expanded/collapsed behavioural fork in
the same change.

### U2. An invalid box plus staged dice rolls the tray, open — DEFECT, small  
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit A2 (major).* `usable = cmdResult.ok || tray.length > 0`
(main.js:5504) arms the plate on staged dice alone; `paintCmd` only syncs
when `res.ok`; `rollDraft` falls through to
`requestRoll([...tray], formula(tray))` (5563) carrying **no visibility, no
dc, no exp, no mods**. Type `2d8 secret`, break it with one character, press
the plate: it rolls `2d8` in the open. `offerDraft` has the identical
fallthrough (5602). The box's own Enter is correctly gated (6049) — the
hazard is the plate click and the global Enter. §1.3's "one spec object, two
projections" has no answer for the moment the projections disagree; the safe
answer is to do nothing, loudly.

**Change:** when the box is non-empty and the parse fails, disable the plate
or route the press to the existing `cmd-shake` + `#cmd-slot` error path.
Stop silently substituting the stale tray.

### U3. The prepared seat never reaches a returning player (CUJ7) — DEFECT, medium  
**SHIPPED 2026-08-08 (`5a0b45b`).**

*Audit E1 (major).* `initNet` prompts for a seat only when `dice.name.v1` is
empty, and that key is **origin-global**. A returning player opening an
`&as=Bo` invite never sees the seat picker, never gets Bo's pools; the
parameter does nothing. §7.19's *"one link in Discord, six people, each
landing at the right seat"* — and PROFILES.md's G5 row, *"CUJ2 end to end.
One link, six players, right pools"* — hold only for six people who have
**never opened the app**. The only recovery is `Change seat…`, which says
nothing about prepared seats.

**Suite is blind:** the `prepared-seat` scenario passes because the harness
seeds no name. Fix the fixture in the same step — a returning-player variant
with `dice.name.v1` pre-seeded — or this reopens silently.

**Design call inside it:** how origin-global identity and per-table seats
interact. Minimum: an `&as=` link reaches the picker despite a stored name,
pre-selecting the named seat. **Game night is 2026-08-13** — this is the
one audit finding with a date on it.

### U4. The record: a WHAT IS TRUE TODAY table, four amendments, one GOALS sentence — small-medium  
**SHIPPED 2026-08-08 (`e76b723`).**

*Audit G1, G2, G3 (major/moderate). Cuts off the defect class that has now
bitten six times* — twice as shipped-on-superseded-doctrine incidents UX.md
already post-mortems, four more found by this audit.

- **§7.23 describes a section bar that does not exist, in the commit that
  shipped it.** The doc, both index.html comments and a second CSS comment
  all say "no track, no lit cell, weight alone, 0.72/0.45"; the shipped CSS
  has a track, a lit recess, and 0.42/0.78, with the third iteration
  recorded *only* at css:405 ("THE INK MARKS THE CONTROL, THE WEIGHT MARKS
  THE STATE"). Rewrite the paragraph from that comment. Also dead: the
  `rail-seg` selector (matches nothing), "104px" at css:1780.
- **A ~30-line "WHAT IS TRUE TODAY" table at the head of §7**, one row per
  surface naming the one authoritative section. Answering *"what is true
  about the rack today"* currently means reconciling §7.9, §7.10, §7.16,
  §7.17, §7.18, §7.22 and §7.23 by hand — demonstrably how four stale-
  doctrine findings survived.
- **Banner or move §1–§6**, verified dead letter with no markers: §1.3's
  notation-box placement, §1.4's click-to-copy formula (no JS producer),
  §2.1/§2.3's experience records (the server refuses the key), §2.4's
  user-held dwell and Roll button (shipped: a 1.35 s timer, no button),
  §2.5's meaning hero (unreachable — see U17).
- **Amend §7.15** (the one-✕ machinery is fully retired in code and still
  cited as live doctrine from two places in §7.9), **§7.17** (`SAVED POOLS`
  no longer stands over the rack), and the **shelf-marker dot** §7.7/§7.9
  still spec, which ships invisible (see U20).
- **Add the launcher carve-out sentence to GOALS.** GOALS' Uniform-roll-
  surfaces invariant has no carve-out while GOALS is the document that wins
  ties, so the shipped rail is formally out of compliance with the file every
  agent reads first. The carve-out is right (§7.4); the omission is the bug.

**Suite is blind, and it is the same lesson inverted:** §7.17's deletion took
the dice-value ledger's caption with it — the whole-rack `.ph-fig` never
renders (`#pools-head:not(.foreign){display:none}`), the shelf figures are
four bare integers with no unit, **and the `rack-dice-value` scenario still
passes because `textContent` of a `display:none` node reads fine.** That is
the exact inverse of the build-not-hide lesson §2l recorded. Fix the
assertion with the doc.

### U5. Live-region triage — the ceremony and both notice channels are silent — small  
**SHIPPED 2026-08-08 (`e76b723`).**

*Audit D1, D2 (major), plus B3's wrong word.* The largest verified a11y gap,
and three fixes share one shape.

- **Ceremony rolls are completely silent to a screen reader.**
  `#banner-live` is the app's only working live region and it lives inside
  `#result-banner`, which a ceremony never paints — `stepPlayback` returns
  into `ceremonyEnterSettle` before `showResults` (main.js:2216-2222), and
  the sole write to the region is on the banner path. Every Check and every
  Cinematic — the rolls carrying a DC, a moment and a subtitle — lands
  unannounced. **Change:** a permanently-mounted body-level `sr-live` node,
  written from the settle stage as well as from `renderRollResults`.
- **Both notice channels are silent by construction.** `railNote()` sets
  `textContent` and clears `hidden` in the same task, so the region is out
  of the a11y tree at mutation time and the 40-die cap refusal — which
  exists *because* the collapsed pill is invisible — never announces.
  `#status-pill` has no `aria-live`/`role="status"` at all; collapsed it is
  a colourless 10 px dot (`color:transparent`), and `showSettingsNote`
  passes no class so it is graphite-on-graphite. index.html:105 documents
  the irony exactly: `#rail-note` was built because "a note sent there would
  be invisible in exactly the state that sends it" — and the table's notices
  were never routed to it. **Change:** one `notify(msg, {scope})` that picks
  the visible channel from panel state; live regions mounted-and-empty,
  never `hidden`; `role="status"` on the pill.
- **`renderRollResults` says `'held'` for a *whisper*** (main.js:2941) — the
  one channel a blind player has, using the wrong rung's word. One line.

### U6. Hue-law and legibility one-liners — small  
**SHIPPED 2026-08-08 (`6285473`).**

*Audit C1, C2, C3, C4 (major/moderate).* Four measured breaks, four small
changes, no new machinery.

- **The primary verb is least legible on the surface that owns it.** The
  well's ROLL cue measures **1.42:1** empty and **~1.9-2.0:1 armed with a
  draft staged**; the rail plate — same builder, same word — is **6.2:1
  armed** and **2.33:1 disabled**. The workbench's live, armed primary act
  is dimmer than the launcher's dead one, because the heat ladder caps cue
  opacity at 0.65 over an already-dim base while the rail ships
  `rgba(255,215,102,.62)` at opacity 1. §7.21's amendment says "the primary
  act stands at full opacity"; four CSS lines say otherwise. **Floor the
  well cue at the rail's value and let heat ride the pocket bloom alone**
  (heat was specified as light-only anyway).
- **Live and disabled controls tie at ~2.2:1.** Unpressed section-bar cells
  measure **2.23:1** (opacity 0.42, undershooting 2i-C's own documented
  0.45); disabled rim tools measure **2.27:1**. Three visibility codes
  collapse to one percept, and at 11.5-12 px the live cells are a flat WCAG
  1.4.3 failure — in the all-off floor state (`panel-all-off.png`) the only
  route back to the sections is three ghosts at 2.23:1. **Raise unpressed
  cells to ≥4.5:1 (~0.72 on `--muted`), push disabled to grayscale(1)/~0.30,
  and reconcile 0.42 vs 0.45 in whichever direction is intended.**
- **HUE = ACT breaks three ways in one popover.** `#pop-save` is the app's
  only `.btn.primary` — the gold roll gradient on a pure save, violating the
  comment four lines above the rule it breaks (css:289) while the correct
  `.btn.confirm` dress ships on the adjacent button. Every `.seg` inside
  `#mods-popover` lights **gold** because the ivory override is scoped
  `#left-panel .seg` and the popover is body-level, so "Face down",
  "Cinematic" and "kh" wear the roll hue three inches from a panel where the
  identical control wears ivory precisely so it would not
  (`audit-popover.png` shows three pressed dresses in one 300 px card).
  **`#pop-save` → `btn confirm` (one attribute); invert the seg default to
  ivory with an explicit gold opt-in.**
- **Name `#rail-roll`'s bronze in 2i-C.** Disabled has thirteen recipes, six
  without grayscale; the rail plate's bespoke bronze is a fourth visibility
  code that *works well* and exists only as an unwritten exception. Write it
  down here; the base-rule-plus-named-exceptions collapse is U23.

### U7. Gate the box preview on `forecastFor` — small  
**SHIPPED 2026-08-08 (`485616d`).**

*Audit A4 (major).* `renderCmdState` calls `fmtPreview` with no system gate
(main.js:5883), so the notation box forecasts a **sum total** under
soul-deal, where no total ever lands anywhere — while the app's own Help
(index.html:504-523) states the per-die rule the box contradicts on the same
screen. The correct branch already exists: the popover's preview at 8446
calls `activeSystem().forecastFor` with a comment claiming coverage of
"every ± door alike". **Wire the popover's branch into `renderCmdState`;
fixes the quick palette too.** §2l's two standing warnings govern the
rewrite: the preview *is* the validator in a fixed-height slot (replace,
never blank), and the success branch ends in `visSuffix` (a naive rewrite
drops the visibility echo).

### U8. Reduced-motion the crit — small  
**SHIPPED 2026-08-08 (`485616d`).**

*Audit B2 (major), first half.* UX.md:962 explicitly orders "always drop
shake/flash/sweep" under `prefers-reduced-motion`; the shipped block scopes
to `#ceremony-layer *` and misses both the full-viewport radial wash and
`container.classList.add('shake')` on `#scene-container` for 1700 ms
(main.js:3452 — an element outside the layer). `matchMedia` appears **once**
in all of js/, for `navigator.share`. **Add `.shake`/`#crit-text`/
`#crit-overlay` to the block *and* gate the class in `playCritEffect` on
`matchMedia`.** The frequency half is U18.

### U9. Rail dice rows — the cascade tie and the floating ✕ — small  
**SHIPPED 2026-08-08 (`6285473`).**

*Audit C6 (moderate).* `.rd-item { flex:1 }` (css:1829) loses to
`.rp-item { flex:none }` (css:1896) — equal specificity, later wins — so the
selection box shrink-wraps to the label and breaks the "same 86 px box"
promise: measured **74.0 / 51.7 / 72.7** CSS px across the frames, the box
growing under your finger with every digit. The `.rd-x` remover is anchored
to the full-width cell, not the shrunk button, so it floats ~19 px right of
the row at `3d6` and lands on the label at `10d10x`. **This is the third
`.rp-*`/`.seg` tie in three commits to silently win against the rail block;
the pattern is the finding** (the durable half is U23).

**Change:** `.rd-cell .rp-item { flex:1 }`, anchor the ✕ to the button, drop
its `tabIndex=-1` (see U22), and add a hover frame to `rail-look.mjs` —
`.rd-x` currently appears in **zero** captured frames.

### U10. The mode switch stops destroying the dice pick — small-medium  
**SHIPPED 2026-08-08 (`485616d`).**

*Audit C5 (moderate).* `#section-bar` (checkbox, 0-3 lit) and `#rail-mode`
(radio, exactly one lit) are styled by the same selector and are
indistinguishable — one dress, two grammars. Compounding it:
`setRailMode('pools')` executes `railDice = []` (main.js:7196, immediately
after a comment reading "BOTH PICKS SURVIVE… except this one") and the digit
path repeats the wipe (10954) — three counted taps gone, no undo, from a
control that *looks* like the harmless bar upstairs. §7.23 states "Nothing is
ever destroyed by navigation" as law; the code destroys twice.

**Change:** reorder the mode resolution so an explicit choice outranks a live
dice pick, then drop both wipes; give the exclusive bar a visibly different
affordance (thumb or underline). **Recorded so it is not re-attempted:** the
previously proposed fix — setting `railModeVisit` instead of clearing — does
**not** work; `railMode()`'s resolution order is the mechanism.

### U11. `± Modify` cannot modify anything in the shipped default system — small  
**SHIPPED 2026-08-08 (`0f34acc`).**

*Audit A3 (major).* `soul-deal` has `usesMods:false`, and `pop-perdie` folds
Modifier, d20 pairing, Target, keep/drop and reroll/explode (main.js:7896);
`audit-popover.png` shows what is left — Visibility, Moment, Pool stats. The
rim's loudest tool says "Modify" with `title="Modifiers, target, moment"`,
two of which are absent by default. It also invalidates the remedy U1's
`dropped` note points at ("re-add via ±" is impossible for `dc`).

**Change:** derive the rim button's word and title from `activeSystem()`.
**And amend the contract:** js/meanings.js:152-154 still documents
`usesMods:false` as "the popover NOTES that modifiers do not change
outcomes", while index.html:678 records Joe's superseding ruling
("entirely — no note").

### U12. Long-press on `.shelf-marker` and `#peek-card` — small  
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit D5 (moderate, touch).* Both have `contextmenu` only, and iOS Safari
never fires it on long-press — so a shelved roll's **±**, "Open in draft" and
"Save as pool…" are unreachable on an iPhone. The long-press helper already
exists ~5,700 lines up, on pool tiles. Closes the iOS hole and the GOALS
uniformity gap in one wiring change.

### U13. `Save as pool…` in the banner fold, `Edit notation…` on the pure branch — small  
**SHIPPED 2026-08-08 (`6285473`).**

*Audit A6 (moderate).* A draft is buildable, editable, spendable, repeatable
— and **keepable only by spending**. §7.16 retired the rim's Save on the
grounds that the peek's "Save as pool…" covers it; verified coverage is: wait
out the 3 s auto-collect → find an invisible 150-200 px circle → right-click
(no long-press, see U12) → find a button in the popover — additionally gated
on `canReroll` (main.js:1313, 1611). Meanwhile the creation card accepts only
a name and a d4-d20 multiset, and a pure pool's popover early-returns
*before* `Edit notation…` (main.js:8178 — the ghost verb exists in the
unreachable branch; `beginEditGroup` has exactly one call site, inside it).

**Change:** add `Save as pool…` to the banner's existing `appendCardActions`
fold, and keep `Edit notation…` standing on the pure branch (one
`appendChild`). Both are wiring into existing builders — no new surface.

### U14. Guard scope, one label, one discarded count — small  
**SHIPPED 2026-08-08 (`44b71a4`).**

*Audit E5 (moderate), F3.* Three unrelated one-liners that all cost a real
table something.

- **`c` sweeps the felt for everyone and stays live under two menus.** The
  `modalOpen` guard's own comment names the hazard and covers one of three;
  `isIdentityMenuOpen()` and `isOfferMenuOpen()` already exist and are absent
  from it. Add them. *(Do NOT add a confirmation — see the refuted list.)*
- **Rename the log flyout's header `Clear` to `Clear history`.** The flyout
  is deliberately un-modal (correct for `r`), so `c` pressed while looking at
  a button that says Clear sweeps the felt instead of the history — and the
  same word means local-and-recoverable online but permanent solo.
- **Surface the `dropped` count the log already computes** and discards
  (main.js:9082); `LOG_CAP` drops history silently today.

### U15. Re-fixture the look tools with the dealt rack — small  
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit G5 (minor), and §7.22's own closing rule: "Run it, and look, before
calling a visual change done."* Both look tools fixture a hand-authored
12-pool sheet the app never deals — the real rack is 18 pools and scrolls
below ~975 px with `scrollbar-width:none`. **No frame shows** a populated
roster, a live `#rail-note`, a hovered `.rd-x`, a spent draft, or an invalid
box; the presence row is the one geometry that *moves* (wraps at 3-4
players) and no capture shows it. Re-fixture with `dealStartingRack`'s
output and add the missing frames, including a short collapsed viewport.

### U17. What a per-die system's Check shows — **STEPS 1–4 SHIPPED 2026-08-08; 5–6 OPEN**

**Steps 1–4 shipped** `fe9acbd` (the stake renders; only its adjudication is
gated) · `ba03e88` (the mute gold `?` leaves the total slot) · `f5359d8`
(steps 3 & 4 — arithmetic and selection split; the `meaningFor` channel
deleted). **Step 5 (docs) is this pass. Step 6 (the look) is open**, and per
the repo's standing rule U17 is not "done" before it: the verdict card's stake
line rhythm and the peek's `.pk-held` word have not been seen rendered.

**THE LIVE RULE NOW LIVES IN [UX.md §7.24](UX.md).** Everything below this
block is the **build spec and the record of the defect** — the surface-by-
surface renders, the gate table, every disagreement ruled, the strongest
objection and its answer. It is kept because it is what was decided and why,
and it is written in the present tense of 2026-08-08 *before* the build. Read
§7.24 for what a surface shows today; read this for why.

**Two sites still disagree with the rule, verified against source 2026-08-08**
— one a gate the spec listed and the build missed, one a site the spec never
listed. Both are recorded in §7.24's *Not closed*, and both are small:

- **#26 — `modsSummary`'s `values` option.** Never added; `renderOffers` still
  calls `modsSummary(o.mods)` with no options, so **an offer card still prints
  the flat `+5`** under a per-die lens while the intent card it becomes drops
  it. The last declaration surface on the wrong side of the split.
- **The log's total column still answers `?`** for a held roll under a per-die
  lens — the same mute gold glyph step 2 removed from the banner and the peek,
  making the same claim of a withheld sum that will never exist. The spec
  never listed this site (it enumerated `#result-total` and `.pk-total` only);
  by the spec's own reasoning it is the same defect.

**One claim in the spec below overstates what shipped.** Step 3 says
`4d6dl1`'s dropped die "returns to the verdict card, banner and peek." It
returned to the **verdict card** only, as a `DL1 dropped` attribution card.
`renderOutcomeRows` prints only the dice `outcomesFor` returns
(`p.counts && !p.child`) and the breakdown line folds wherever those rows
render, so the banner and the peek still show no struck die under a per-die
lens. That is a live half of GOALS' *Attributed math* and it is a **rows**
question, not a stake question — it belongs to whoever next touches
`renderOutcomeRows`, not to a gate.

**The new scenario landed under an existing name.** The spec's `stake-read`
was folded into **`per-die-read`** (smoke) rather than added beside it, which
is why `grep stake-read` finds nothing; the assertions are there. Its old
pin — "no DC verdict under per-die" — was pinning the defect and is re-pointed
to the contract.

---

*Audit B1 (major), B3, B4.* `1d20+5 check dc15 # The Duel` renders on the
verdict card as one chip and a word — no DC, no `+5`, no subtitle — because
`hasDc` is gated on `usesTotal` and mod cards on `usesMods`. **Four surfaces
render four different subsets of the same stake:** the intent card shows the
subtitle but buries the dc in 9 px mono; the dock strip (cinematic only)
shows the dc because `renderDockStrip` has *no* gate; the verdict card shows
none of it; the log shows `+5` but not the dc. The player typed a target and
a bonus, the app rolled with both, and showed neither at the moment of the
verdict. **The gates conflate "this system sums" with "this system has
stakes" — different facts.** Decide once (is a dc a stake even without a
summed verdict?), then apply to all four surfaces together.

**THE DESIGN IS SETTLED — this entry is now a build spec, not a question.**
Five agents: one mapping every gate site in source, three stances (a target is
a stake / invert the profile interface / render less, not more), one decider.
The full record is in the workflow journal; the decision follows verbatim.

*One correction the pass made to the audit itself:* the audit said FOUR
surfaces disagree. It is **eight**, rendering **six** different subsets — the
offer card and the ceremony's screen-reader announce were never gated at all,
so an offered Check declares both stakes under soul-deal and rolling it shows
neither, and a blind player hears `target 15` while the sighted player's card
says `d20 8 quiet`. The 2026-07-31 gate sweep touched five sites and missed
three; that is the whole shape of the bug.

---

**Stance A leads.** Its rule is right and its gate table is the one that survives contact with the source. I graft three things onto it:

- **From C — the flat modifier.** A and B both keep `+5` alive under a per-die lens (A as a "receipt" in the log, B by restoring the mod-card outright). C is right and they are wrong. `.log-mod` is `var(--gold-bright)` at weight 700 (`css/style.css:3572`) — louder than the die it sits beside — feeding a total column the lens has emptied. A dangling `+5` is the one surface that actually *implies* the sum. It goes. C's "quote register" also wins on the intent card's notation line: it stays whole, `dc15` included (A's proposal to truncate it is rejected — a canonical echo that silently drops a token is worse than a duplicate, and `ledger-read` already pins that line as a verbatim declaration of pools).
- **From B — the interface gets smaller, not larger.** B's diagnosis is correct (`usesMods` does two unrelated jobs) and its cure is too big for 2026-08-13. I take the subtraction without the rewrite: **`usesMods` is deleted outright**, `meaningFor` with it, and nothing replaces them. Three members out, one tiny one in. B's `readFor` is refused — see *Deferred, and what it costs*.
- **Against all three — the naming.** If the gold target ring returns to the declaration under Joe's own game, it currently reads **`DIFFICULTY CLASS`**. That is a D&D mechanic's name printed in 9.5px gold caps on a Soul Deal table at the app's most deliberate beat. Nobody caught it. One new profile string fixes it, and it is the correct shape for the whole decision: *the stake renders under every system; the profile names it.*

Also ruled: **§2.5 is struck to a pointer and the live rule goes into a new §7.24 with WHAT IS TRUE TODAY rows.** A rewrites §2.5 in place — that puts binding spec back inside the §1–§6 block the document's own banner declares to be history, which is the exact failure mode §7's table exists to prevent (it has already shipped two wrong builds).

And **the verdict card's subtitle is deferred** — against A and B. It is a missing *element*, uniform across all three systems, not a gate; it is not part of the conflation, and it costs new markup at the one beat where hierarchy is most fragile.

---

## The rule

> **A stake renders on every surface under every system. Its adjudication — the comparison of a result against it — renders only where the system produces a single number to compare (`usesTotal`). The two never share a slot.**
>
> A **stake** is a condition of the moment the player declared: the target, the title, the subtitle, and the mechanics that decide *which dice land and which count*. A stake is a fact about the roll and does not ask the app to compute anything.
>
> **Arithmetic** is a term in a sum: the flat modifier, named bonus parts, the total, the margin, the ring's ratio, `Success`/`Failure`, `✓`/`✗`. Arithmetic renders where its sum renders, and nowhere else.
>
> The dividing question at every site is **"did the player type this, or did we compute it?"** — with one refinement: a typed value that has no meaning except as an operand of an absent operation is arithmetic, not a stake. A target stands on its own (*we are throwing at 15*). A `+5` does not.

Three consequences, stated so a future reader does not re-derive them:

1. **`usesTotal` narrows to one sentence** and that sentence goes into `js/meanings.js`'s contract prose: *gates the SUM and everything derived from it — the big number, the margin delta, the ring's ratio, and the Success/Failure adjudication of a target. **It does not gate the target.***
2. **`usesMods` is deleted.** It never distinguished anything (all three profiles set it equal to `usesTotal`) and it conflated arithmetic with selection. After the split, arithmetic keys off `usesTotal` and selection mods are universal — so the interface loses a member and the conflation this audit found becomes unspellable.
3. **No per-die comparator is built, now or in this change.** `grep -rn "cmp\b" --include=*.js` → zero hits; `js/odds.js` has no threshold concept; `docs/UX.md:346` reserves `scope:'each'` for roadmap §8 success counting under a *different* notation (`cs>=N`) and a different verdict rendering (success pips, not a ring). U17 says so in one line so the next reader does not re-litigate it.

### Why the app's own record already says a target is a stake

Not argued from taste — three places in this repo already decided it:

- `index.html:758` — *"The improviser's hot pair rides near the top (CUJ2): **a target and a moment are the stakes**."* The markup calls it a stake.
- `docs/UX.md:348` — *"There is **no `target.hidden`**: stakes are public on every visibility rung (§3.0), so the target number and its odds line render the same for everybody — the drama comes from the held *result*, not a secret number."*
- `docs/GOALS.md` superseded decisions — the DM seat's fourth power, *hidden Targets*, **was rejected outright, "because stakes are public on every visibility rung."**

The held branch at `js/main.js:4052-4059` already ships the exact shape C calls incoherent: `vs DC 15` over `Face down`, commented *"Public stakes, hidden result."* Nobody has ever filed that as a bug. A per-die read is the same case — *unavailable because this system does not judge* instead of *unavailable because not yet*. The code already knew how to render a stake without a verdict; it never noticed it had a second reason to.

**And the decisive one for the default table:** under UX.md §2.3, `dc15` *with no experience implies a Check* — "a target with no staging would be mute." Under C, `2d6 dc15` on a Soul Deal table stages a full Ordeal ceremony — card, title, dwell, dock, verdict — whose sole trigger is a number the app then refuses to name on any surface. Staging a ceremony because of a fact and then suppressing the fact is worse than either extreme. C's "dormant notation" analogy (chart words under `dnd`) fails on exactly this point: a chart word is *the app's reading*, which a lens legitimately governs. A target is *the player's sentence*, which no lens authored and no lens may retract.

---

## What each surface shows, exactly

Fixture `1d20+5 check dc15 # The Duel`, system `soul-deal`, the d20 lands **8** (the d20's null band is faces 4–9, `js/meanings.js:46`; the chart reads the **raw** face — the `+5` never touches it). Node-confirmed: `# The Duel` is the **comment**, not the subtitle; `exp = {kind:'check'}`. Where a subtitle exists (`… # The Duel | Charisma`) it is shown in parentheses.

### 1 · Intent card — `renderIntentCard` (declare)

```
                ( J )
             O R D E A L
              The Duel
           (C H A R I S M A)
              ╭────────╮
              │   15   │        gold ornament, IVORY numeral, ~96px
              ╰────────╯
              T A R G E T       9.5px/0.24em gold caps  ← was DIFFICULTY CLASS
                                #intent-mods empty (:empty shrinks the gap)
             1d20+5 dc15        10px mono, muted — unchanged, whole
```

The badge returns under every system. The `+5` chip does **not** — it is arithmetic. `2d6 adv dc15` *would* show an `ADV Advantage` chip, because advantage decides which face the chart reads.

The label becomes profile-supplied (`targetWord`, below). The notation line is untouched: it is the app **quoting the player**, in the evidence register, and a quote that drops a token is a lie. The dnd double-print (badge + `dc15` in mono) already ships and stays.

Look at `tools/out/lifecycle/07-check-declare.png`: today there is a conspicuous dead band between `CHARISMA` and the mono line, where the badge was suppressed. The card reads as though something failed to load. The badge fills the hole it was designed to fill.

### 2 · Dock strip — `renderDockStrip` — **no change**

`js/main.js:3921` (`const hasDc = Number.isInteger(roll.dc);`) is already the rule. `git blame` shows the gate sweep `c39df53` rewrote exactly two `hasDc` declarations and never visited this function — it was an omission, and the omission happened to be correct. Its correctness is now derived rather than accidental. The cinematic-only *paint* stays: A is right that `css/style.css:4374-4376` carries that decision in prose (*"The docked strip is CINEMATIC furniture only"*) — a presence decision about a bar riding the top of the screen, not a content decision about stakes.

### 3 · Verdict card — `renderVerdictCard` — the card that showed nothing

```
      J O E   ·   T H E   D U E L        11px muted tracked caps
                                          ← ring folded (usesTotal), the gap it leaves
              v s   D C   1 5             10px/0.2em muted caps, numeral IVORY
          ╭──────────╮
          │  d20 8   │   quiet            .oc-solo hero scale, 19px
          ╰──────────╯
      ───────────────────────────
      [    ✕  Clear    ]   REROLL ❯❯❯
```

Text layer: **`JOE · THE DUEL vs DC 15 d20 8 quiet ✕ Clear REROLL ❯ ❯ ❯`**
Captured today (`tools/out/lifecycle/facts.json`): `JOE · THE DUEL d20 8 quiet ✕ Clear REROLL ❯ ❯ ❯`.

**The branch-order trap dissolves rather than being patched.** `renderOutcomeRows` runs first at 4061, so `else if (hasDc)` at 4065 is unreachable under soul-deal *regardless of what `hasDc` evaluates to* — which is why flipping only `&& sysTotals` at 4039 changes nothing visible. The fix is not a gate flip: **the stake is written into `#verdict-margin` unconditionally, above and outside the entire hero chain.** Stake and reading are different slots; the rows owning the hero can no longer suppress the stake.

`#verdict-margin` is the correct home and needs no new element: the ring is a **ratio** (`total/dc`) and `.vtotal` is the **result** slot — putting `15` there is the "dice-count read as a total" confusion 2i-B killed. The slot already proves it works; `js/main.js:4055` writes a bare `vs DC 15` into it on the held branch today.

Held, per-die (`… dc15 held`): `vs DC 15` / *Face down* — identical text, now reached under every system.

**dnd, same fixture, unchanged:** eyebrow / ring at `13/15 = .867` with `.fail` / **13** at clamp(36px,8.6vmin,62px) / `vs DC 15 · margin −2` / **FAILURE** in red / a `+5 Modifier` card flying up.

### 4 · Roll log — `buildLogEntryEl`

```
Joe · The Duel                    ⟳                        (total column empty)
[d20 art]  d20 8  ·  vs 15  ·  a quiet roll                        09:28
```

`vs 15` renders, **without `✓`/`✗` and without `.ok`/`.bad`** — that is the comparator, and it does not exist. **The `+5` is gone.** `.log-mod` exists to decompose `.log-total`; it gates with the column it feeds. This is the audit's own named inversion (the log shows `+5` and not `15`) closed in both directions at once.

**dnd unchanged:** `d20 8 +5 · vs 15 ✗`, total **13** gold.

### 5 · Result banner — `renderRollResults`

A ceremony never paints it (`ceremonyEnterSettle` returns before `showResults`); this is the reloaded / revealed / plain path.

```
Joe · The Duel
                                  #result-total — display:none, and EMPTY in the DOM
V S   D C   1 5                   15px display caps, no hue class, numeral ivory
d20 8   quiet                     #result-meaning.result-outcomes
                                  #result-breakdown folded (the rows carry it)
```

Held whisper, per-die: `Joe · A word in your ear` / `VS DC 14` / ***Whispered*** in the held dress. Today (`facts.json.whisperBystander`): a mute 52px gold `?` and a `✕ Dismiss`.

Free correctness win: `js/main.js:2987` routes the SR sentence through `resultVerdictEl.textContent`, so the banner now says `vs DC 15` and **finally agrees with `ceremonyEnterSettle:3677`'s ungated `target 15`**. The two announce sites stop contradicting each other and their own cards.

### 6 · Peek — `renderPeek`

```
Joe · The Duel
d20 8  quiet
vs DC 15
✕ Clear    REROLL ❯❯❯
```

Hidden, per-die: ***Face down*** / ***Whispered*** in the held dress replaces the 30px gold `?`. The `?` for `!entry` (a collected roll carrying no data) **is preserved** — C caught this; there the `?` is not a lens question.

### 7 · SR announce, offer card

`ceremonyEnterSettle:3677` (`target 15`) stays ungated — correct by rule, now for a reason. `renderOffers:11888` (`vs 15`) stays ungated. `modsSummary` gains a `values` option so an offer's arithmetic follows the same law as everything else: **`d20 · advantage · vs 15 · Check — Charisma`** under soul-deal, `+5` restored under dnd. The `9176` call site (the ± variant row — a quote surface) passes nothing and is unchanged.

### The eight-surface table, after

| surface | title | subtitle | dc | flat +5 | selection mods | Success/Fail |
|---|---|---|---|---|---|---|
| offer card | ✅ | ✅ | ✅ `vs 15` | ❌ | ✅ | — |
| intent card | ✅ | ✅ | ✅ **gold ring, ivory 15** | ❌ | ✅ chips | — |
| dock strip | ✅ | ✅ | ✅ pill *(cinematic paint)* | ❌ | — | — |
| SR announce | ✅ | — | ✅ `target 15` | ❌ | — | ❌ |
| verdict card | ✅ | ⚠️ *no element — deferred* | ✅ `vs DC 15` | ❌ | ✅ mod-cards | ❌ |
| result banner | ✅ | — | ✅ `VS DC 15` | ❌ | — | ❌ |
| roll log | ✅ | — | ✅ `vs 15` | ❌ | ✅ struck/✴ | ❌ |
| peek | ✅ | — | ✅ `vs DC 15` | ❌ | ✅ (breakdown) | ❌ |

Six subsets → **one**, with one honest, uniform, system-independent gap (the verdict card's subtitle) held open in the roadmap.

---

## What `#result-total` does under a per-die system

**Nothing. It never paints — and it never holds a number.**

`#result-total` is `css/style.css:2738-2745`: `var(--font-display)` **52px/700**, `color: var(--gold-bright)` = `#ffd766` (css:22). `.roll-cue` is `rgba(255,215,102,0.34)` (css:1070-1082) — `rgb(255,215,102)` **is** `#ffd766`. The 52px number is literally the roll verb's hue at full alpha, and under soul-deal it is `display:none` for every open roll and springs to life only to announce an absence.

```js
// js/main.js:2937-2938
resultTotalEl.style.display = sysTotals ? '' : 'none';                    // drop `|| hidden`
resultTotalEl.textContent   = sysTotals ? (hidden ? '?' : String(entry.total)) : '';
```

Two things happen there and both matter. The display gate loses `|| hidden`; and **the textContent write moves inside the gate.** Today line 2938 writes `entry.total` into the node on *every paint under every system* and only CSS withholds it — the sum is in the DOM at all times, one devtools inspection or one CSS regression from leaking. That closes.

The `?` leaving is a **correctness** fix, not taste. Under dnd a `?` is right: a number exists and is being withheld. Under soul-deal **no number is being withheld** — *words* are. A `?` in the total slot claims a hidden sum that will never exist. The state is a fact of the roll (goal 11), so it is spoken in words in the slot that already holds words — exactly what the verdict card (`.verdict-hero.held`) and the log (`.log-hidden`) already do. Three surfaces converge on one vocabulary, factored into `heldWord(entry)`.

This resolves the 2i-C hue collision by **deletion, not re-hueing** — no new colour decision — and §7.21's *hierarchy is AREA, not volume* is satisfied because the outcome rows already own the hero area.

Same edit at `js/main.js:1566` for `.pk-total`, with a `.pk-held` dress.

**Explicitly out of scope, and named:** `#dock-strip .strip-dc` (gold-bright) and `.offer-vs` (`--gold`) are gold numerals on *pre-roll declaration* surfaces. They ship that way, nobody has complained, and retinting them is a §7.9 / 2i-C hue pass I cannot judge without looking. U17 governs the **post-roll** register only: on a result surface, gold and red mean *adjudicated*. An unadjudicated stake takes the muted register with an ivory numeral.

---

## What happens to the dead `meaningFor` surface

**Delete the channel — producer, all consumers, its CSS, and its spec section.** All three profiles declare `meaningFor: () => null` (`js/meanings.js:177, 239, 258`), so `entryMeaning` returns `null` on every path. Unreachable, untested render code with live CSS is debt wearing a socket's costume.

| site | disposition |
|---|---|
| `js/meanings.js:177, 239, 258` + contract prose at 161 | `meaningFor` removed from all three profiles and from the interface |
| `js/main.js:2470-2477` `entryMeaning` | deleted (behaviour-neutral: it returned null on every path) |
| `js/main.js:2474` the dc short-circuit | deleted **with the doctrine restated, not lost** — see below |
| `js/main.js:2544-2545` `critWord`'s `if (meaning)` | deleted; signature becomes `critWord(crit, entry)`; both call sites (2994, 2997) updated. It always fell through already |
| `js/main.js:2944, 2951-2953` banner else-branch | replaced by `hidden ? heldWord(entry) : ''` |
| `js/main.js:1588-1596` `.pk-meaning` element | deleted, markup and producer |
| `js/main.js:4048, 4076-4078` verdict `else if (meaning)` | deleted; the chain becomes rows → adjudication → `''` |
| `js/main.js:9319-9323, 9335` log `meaningHtml` | keys off `outcomes` alone; the `else slot.textContent = meaning.word` goes |
| `css/style.css:3521-3522` `.pk-meaning` | deleted (live CSS with no producer) |
| `css/style.css:4507-4508` `.verdict-hero.tier-crit-success/-crit-fail` | deleted — reachable *only* through the deleted branch (`renderOutcomeRows` puts tier classes on child `.oc-word` spans, never on `heroEl`) |

**The one thing that must not die with it.** `entryMeaning:2474` (`if (Number.isInteger(entry.dc)) return null;`) encodes real doctrine — *a roll with a target is a Check and the verdict is its entire read*, the gate that killed "Failure beside a chart Success." That is precisely the conflation U17 names: "a dc is present" wired as "the sum verdict owns the hero." **This rule supersedes it and states it better:** the hero holds the READING, `#verdict-margin` holds the STAKE, and they never contend for one slot — so a target no longer needs to suppress anything.

**Doc placement (my ruling, against all three).** §2.5's ruling is retired. It does **not** get rewritten in place: §1–§6 are declared history by the document's own banner, and the §7 table exists because two agents already shipped wrong builds by reading a section that *described* a surface instead of the one that *changed* it. So:

- **`docs/UX.md` §2.5** is struck to a two-line pointer: *"Retired by §7.24. The one-hero-slot conflict it arbitrates cannot arise — `meaningFor` is gone — and the conflict it feared is resolved by moving the target out of the hero, not by silencing the chart."*
- **New `docs/UX.md` §7.24 — THE STAKE AND THE READ**: the rule at the head of this document, the stake/arithmetic/selection taxonomy, the eight-surface table, the note that no per-die comparator exists and `cs>=N` is roadmap §8's.
- **WHAT IS TRUE TODAY gains/updates rows** in the same commit for **Verdict card**, **Result banner**, **Peek**, **Roll log** and **± popover** — each pointing at §7.24 for stakes and naming §2.5 under *Do not build from*. The table's own rule is "update the row in the same commit that changes the surface"; U17 changes five surfaces. This is the item ROADMAP U4 already lists.
- **`js/meanings.js`'s interface prose** (lines 138–169) is rewritten to interface **v3**: `usesTotal` narrowed to the one sentence above, `usesMods` and `meaningFor` gone, `targetWord` added, and one line recording that selection mods are universal because `outcomesFor` filters on `p.counts && !p.child`.

---

## Which existing gates change, and to what

### The profile interface (`js/meanings.js`)

**Removed:** `usesMods` (176/238/257), `meaningFor` (177/239/258).
**Kept, narrowed in prose:** `usesTotal` (175/237/256).
**Added — one string:**

```js
targetWord: 'Target'            // soul-deal, none
targetWord: 'Difficulty Class'  // dnd
```

Used by exactly one site: `#intent-target-label`. The profile owns the *name* of the stake; nothing about whether it renders. `aggregate` stays as-is (still consulted by nothing but comments — not U17's problem).

**Why this field exists.** With the badge ungated, a Soul Deal declaration would print `DIFFICULTY CLASS` in gold caps under a 96px ring — a D&D mechanic's proper noun on Joe's own game, at the beat GOALS goal 3 calls the app's most deliberate. `Target` is the word the ± popover (`Target (DC)`), the SR announce (`target 15`) and UX §2.1's own record field already use. Cost: nothing — dnd keeps its flavour, and the terse post-roll strings (`vs DC 15`, `vs 15`) are unchanged because they are readbacks of the `dc` token itself, not names of a concept.

### `js/main.js` — new helpers (next to `entryOutcomes`, ~2480)

```js
const heldWord = (entry) => (entry.visMode === 'whisper' ? 'Whispered' : 'Face down');

// The stake, one string, no system in it — deliberately.
function stakeInto(el, entry, adjudicated) {
  el.append('vs DC ');
  if (adjudicated) { el.append(String(entry.dc)); return; }
  const n = document.createElement('span');
  n.className = 'stake-num';       // unadjudicated register: muted label, ivory numeral
  n.textContent = String(entry.dc);
  el.appendChild(n);
}
```

### The render sites

| # | site | from | to |
|---|---|---|---|
| 1 | `renderIntentCard`:3890 | `Number.isInteger(roll.dc) && activeSystem().usesTotal` | `Number.isInteger(roll.dc)` — the cleanest case in the file: this runs at *declare*, with no `entry`, no `total`, no comparison. It was withholding a literal the player typed on the grounds of an arithmetic that had not happened and would not be shown either way |
| 2 | `renderIntentCard`, target label | static `Difficulty Class` in `index.html:616` | `= activeSystem().targetWord` |
| 3 | `renderIntentCard`:3897 | `activeSystem().usesMods ? preModChips(m) : []` | `preModChips(m, { arithmetic: activeSystem().usesTotal })` |
| 4 | `preModChips`:3849-3854 | unconditional | the flat/named block runs only `if (opts.arithmetic)`; 3855-3859 (ADV/DIS, keep, `RO≤`, `!`) **always** emit |
| 5 | `renderIntentCard`:3906-3912 | — | **unchanged.** The notation line stays whole, `dc15` included |
| 6 | `renderDockStrip`:3921 | — | **unchanged** |
| 7 | `renderVerdictCard`:4038-4039 | `sysTotals`; `hasDc = …&& sysTotals` | `const hasDc = Number.isInteger(entry.dc);`<br>`const adjudicable = hasDc && sysTotals && !hidden;` |
| 8 | `renderVerdictCard`:4042, 4044 | `hasDc && !hidden` | `adjudicable` |
| 9 | **new, immediately after `marginEl.textContent = ''`** | — | `if (hasDc) stakeInto(marginEl, entry, adjudicable);` — **written once, above and outside every branch, including the hidden early-return** |
| 10 | `renderVerdictCard`:4055 | `if (hasDc) marginEl.append(…)` | deleted (line 9 covers it); hero ← `heldWord(entry)` |
| 11 | `renderVerdictCard`:4065-4075 | `else if (hasDc)` + `marginEl.append('vs DC N · margin ')` | `else if (adjudicable)` + `marginEl.append(' · margin ')` — the prefix is already on screen. Byte-identical dnd output |
| 12 | `renderVerdictCard`:4087 | `activeSystem().usesMods ? attributionCards(…) : []` | `attributionCards(roll, entry, { arithmetic: activeSystem().usesTotal })` |
| 13 | `attributionCards`:3932-3937 | unconditional | the flat/named block runs only `if (opts.arithmetic)`; adv (3938-49), reroll (3950-61), keep (3962-70), explode (3971-74) **always** emit |
| 14 | `renderRollResults`:2937-2938 | see above | display gate loses `\|\| hidden`; textContent write moves **inside** the gate |
| 15 | `renderRollResults`:2951-2953 | `meaning ? meaning.word : ''` | `hidden ? heldWord(entry) : ''`, `className = hidden ? 'held' : ''` |
| 16 | `renderRollResults`:2961 | `if (Number.isInteger(entry.dc) && sysTotals)` | `if (Number.isInteger(entry.dc))` → `stakeInto(el, entry, adjudicated)`, then the `— Success/Failure` tail + hue class only when `adjudicated` |
| 17 | `renderRollResults`:2986 | — | unchanged (already `usesTotal`-gated) |
| 18 | `ceremonyEnterSettle`:3676-3677 | — | **unchanged.** Correct by rule; and #16 makes the banner's twin agree with it |
| 19 | `renderPeek`:1566 | `if (hidden \|\| !entry) total.textContent = '?'` | `!entry` keeps `'?'`; `hidden` → `heldWord(entry)` + `.pk-held` under a per-die lens, `'?'` under a totals lens |
| 20 | `renderPeek`:1571 | `total.textContent = String(entry.total)` | `activeSystem().usesTotal ? String(entry.total) : ''` — closes the ungated sum fallback (unreachable today only by accident) |
| 21 | `renderPeek`:1575-1585 | `… && activeSystem().usesTotal` | same nested shape as #16 |
| 22 | `buildLogEntryEl`:9281-9290 | ungated `modPartsOf` / `entry.modifier` | wrap the whole chain in `activeSystem().usesTotal` |
| 23 | `buildLogEntryEl`:9314-9318 | `!Number.isInteger(dc) \|\| !usesTotal ? '' : …` | `!Number.isInteger(dc) ? '' : (hidden \|\| !usesTotal) ? \`<span class="log-verdict">vs <span class="stake-num">${dc}</span></span>\` : \`<span class="log-verdict ${ok}">vs ${dc} ✓/✗</span>\` ` |
| 24 | `buildLogEntryEl`:9328, 9361 | — | unchanged (Bucket A) |
| 25 | `renderBreakdown`:2752 | `if (!mods.length) return;` then `= ${entry.sum}` + tail | `if (!mods.length \|\| !activeSystem().usesTotal) return;` — **missed by A and B.** Reachable under per-die when `outcomesFor` returns null on a visible roll (all-child / all-discarded pools) |
| 26 | `modsSummary`:11810 | `modsSummary(mods)` | `modsSummary(mods, { values })`; value clauses skipped when `values` is false, shape clauses always. `renderOffers`:11880 passes `{ values: activeSystem().usesTotal }`; `9176` passes nothing |
| 27 | `renderOffers`:11888 | — | **unchanged** |
| 28 | `openPopover`:8246 | `toggle('pop-perdie', !activeSystem().usesMods)` | `toggle('pop-perdie', !activeSystem().usesTotal)` |
| 29 | `index.html`:761-762 | `class="sec tight sec-sum"` / `prow prow-sum` on **Target (DC)** | both dropped — a target is a stake and must be **authorable** under every system |
| 30 | `index.html`:748, 802, 819 | `sec-sum` on d20 pairing / Keep-drop / Reroll-Exploding | dropped — these decide *which dice count*, which `outcomesFor` reads (`p.counts && !p.child`) and `forecastFor` refuses to pre-read **because** of it |
| 31 | `index.html`:735 | `sec sec-sum` on **Modifier** | **kept** — the one genuinely sum-world section. Joe's 2026-08-06 fold ruling ("entirely — no note") stands exactly over it |
| 32 | `updateTrayModsWord`:5945 | `const full = activeSystem().usesMods` → `± Modify` / `± Moment` | `± Modify` unconditionally; the per-die title drops "Modifiers" and gains a tail |

**#29 is not optional.** With the dc on five more surfaces, a target that round-trips invisibly — `popStateFromParse`:8168 loads it, `popCanonical`:8626 emits it, `#pop-echo`:8798 prints it, and the editor shows no row — becomes a worse split than the one U17 is closing. It is U11's own named remaining hole ("re-add via ± is impossible for `dc`").

**#32 applies U11's rule, it does not overturn it.** `± Moment` was correct when the popover held two of seven sections; after #29-#31 it holds **six of seven**, and naming one of six is the same defect U11 fixed.

### CSS — four rules, two deletions

```css
/* the unadjudicated stake: muted label, ivory numeral. One register,
   four surfaces (verdict margin, banner verdict, peek verdict, log). */
.stake-num { color: var(--ivory); font-variant-numeric: tabular-nums lining-nums; }

/* with the ring folded the stake must caption the ROWS, not echo the
   eyebrow: 6px under an 11px caps line reads as a second eyebrow. */
#verdict-card .ring-wrap.hidden + .margin-line { margin-top: clamp(10px, 2vmin, 18px); }

/* the held word takes the slot the `?` vacated, in the dress the verdict
   card already owns (.verdict-hero.held, css:4506). */
#result-meaning.held { color: var(--muted); font-style: italic; letter-spacing: 0.06em; }
.pk-total.pk-held  { color: var(--muted); font-style: italic; letter-spacing: 0.06em;
                     font-size: 15px; text-shadow: none; }
```

Deleted: `.pk-meaning` (3521-3522), `.verdict-hero.tier-crit-success/-crit-fail` (4507-4508).

**Not renamed:** `.margin-line` / `#verdict-margin` keep their names (against A's #20). A rename buys a nicer word and risks a stale selector in `tools/steps/*`, the look tools and the suite. The section that explains the slot is §7.24; that is where the name lives.

---

## Does it look right?

**The verdict card, soul-deal, after — described as a reader meets it.**

A translucent gold-cornered card sits at the top anchor, 300–430px wide, and it now runs **head, caption, answer, exits** — four bands, top to bottom, with real air between them.

The head is unchanged: `JOE · THE DUEL` in 11px muted tracked caps, the roller's name in their colour.

Then a gap — and this gap is the one thing that had to be got right. The ring is folded, so the stake line would otherwise land 6px under the eyebrow, and two small tracked-caps lines stacked 6px apart read as *one doubled eyebrow*, not as a head and a caption. That is exactly the "measured clean, looked bad" failure this repo keeps post-morteming, and none of the three stances saw it. So `#verdict-card .ring-wrap.hidden + .margin-line` opens the gap to clamp(10px, 2vmin, 18px), and the stake line falls into the seat the ring vacated — closer to the answer than to the head, which is what it is: a caption over the reading.

The caption reads **`v s   D C   1 5`** — 10px, 0.2em tracking, uppercase, `--muted`, with the numeral in `--ivory`. That ivory numeral is doing real work. It gives the line a focal point without hue, so the eye lands on *15* rather than sliding past a grey ribbon; and it is not an invention — the intent card's `.tnum` is already `--ivory` inside a gold ornament, so the card that declared the stake and the card that answers it now spell the number the same colour. Gold on a result surface would say *how it went*, and nothing has gone.

Then the answer, and it is unmistakably the largest thing on the card: one pill reading `d20 8` in mono, and beside it *quiet* in italic grey, at `.oc-solo` hero scale — 19px, roughly double the caption. §7.21's law holds without argument: the reading wins the **area**, the stake is the small line above it. The hero's gold flanking bars stay suppressed by `verdict-outcomes` (`content: none`), so the row reads as evidence, not as a proclamation.

Hairline, then the fold: `✕ Clear` in red at `flex:1`, `REROLL ❯❯❯` resting at 0.45. Unchanged.

What the card no longer does is the thing the audit caught it doing: stand at the moment of the verdict with a name and a die and nothing about the moment that was declared. And what it still refuses to do is conclude. There is no ring, no empty gold circle implying a missing number, no `?`, no `Success`, no `13`. The absence of the ring is what keeps `vs DC 15` reading as a **caption** rather than a **gap** — there is no vacant socket beside it announcing that something failed to arrive.

Compare `tools/out/lifecycle/09-check-verdict.png`: today the card is head, chip, rule, buttons — three bands with a large unexplained void between the head and the chip. The stake line fills that void with the one fact the player is holding in their head.

**One line I will not certify from source.** The intent card's badge under soul-deal I can predict confidently (it is dnd's shipped render with one word changed and `tools/out/lifecycle/07-check-declare.png` shows the hole it fills), but per this repo's own standing rule — *look before "done"* — the stake line's vertical rhythm on the verdict card, and the `.pk-held` word replacing a 30px gold numeral on the peek, get an interactive look before U17 is called shipped. That look is one pass over the existing `tools/steps/lifecycle-*` fixtures, not a validation sweep.

---

## Every disagreement, ruled

| # | question | ruling | who wins |
|---|---|---|---|
| 1 | Is a dc a stake without a summed verdict? | **Yes.** It is the player's sentence, not the app's reading; three places in the repo already say so; and `dc` alone stages the ceremony that then hides it | A, B |
| 2 | Gate the dock strip? | **No.** Ungated `hasDc` is the model. CSS cinematic-only paint stays — `css:4374-4376` states that decision in prose | A, B |
| 3 | Gate the offer card's `vs 15`? | **No** | A, B |
| 4 | Gate the SR announce's `target 15`? | **No** — and #16 makes the banner's twin agree with it for free | A, B |
| 5 | The flat / named modifier under a per-die lens? | **Renders nowhere in the app's voice — intent chip, mod-card, log, offer summary, breakdown tail all gate on `usesTotal`.** `.log-mod` is gold-bright/700 feeding an empty column; it is the surface that most implies the sum | **C** |
| 6 | Selection mods (adv, keep/drop, reroll, explode)? | **Universal.** `outcomesFor` filters on `p.counts && !p.child` and `forecastFor` refuses keep/drop *because* they matter. Today a `4d6dl1` under soul-deal shows no dropped die on the verdict card, banner or peek — a live break of GOALS' *Attributed math* on the default system | A, B |
| 7 | Rewrite the interface as `readFor(entry)`? | **No.** See the deferral below | A over B |
| 8 | Keep `usesMods`? | **No — delete it.** It never distinguished anything | A, B |
| 9 | Strip `dc` from the intent notation line? | **No.** It is a verbatim quote; a canonical echo that drops a token is a lie, and `ledger-read` pins that line as a declaration of pools | **C** over A |
| 10 | Rename `.margin-line` → `.stake-line`? | **No.** Churn with selector risk across tools, look tools and suite | against A |
| 11 | Add `#verdict-subtitle`? | **Deferred** — see below | against A, B |
| 12 | `#result-total`'s `?` under per-die? | **Gone, and the textContent write moves inside the gate.** State goes to words via `heldWord` | unanimous |
| 13 | `meaningFor`? | **Deleted**, producer + 5 consumers + 2 CSS rules, with its dc-doctrine restated by the new rule | unanimous |
| 14 | Where does the live ruling live? | **New §7.24 + WHAT IS TRUE TODAY rows.** §2.5 struck to a pointer | **mine** — A rewrites a dead section |
| 15 | `± Moment` → `± Modify`? | **Yes, unconditionally.** Six of seven sections now stand under a per-die lens | A |
| 16 | Popover `Target (DC)` folded? | **Unfolded.** Also pairing, keep/drop, reroll/explode. Modifier stays folded | A, refined |
| 17 | The badge's label under soul-deal? | **`targetWord`, profile-supplied.** `Target` / `Difficulty Class` | **mine** — all three missed it |
| 18 | Hue for the unadjudicated stake? | **`.stake-num` — muted label, ivory numeral, one register on four surfaces.** Pre-roll gold (dock pill, offer `vs`) explicitly out of scope | **mine** |
| 19 | Build a per-die comparator? | **No.** `cs>=N` / `target.cmp` / `scope:'each'` stay roadmap §8, and U17 says so in one line | unanimous |

---

## Deferred, and what the deferral costs

*(Both are now recorded in **UX.md §7.24, "Deferred, with the cost named"** —
the section a reader reaches from the WHAT IS TRUE TODAY table. This is the
reasoning; that is the durable notice.)*

**1. B's `readFor(entry)` interface.** Refused for 2026-08-13. It changes nothing the player sees versus this spec; it is ~70 lines across the file's most-repainted functions five days before a play date; and its own shape (`{headline, verdict, ring}`) presumes the sum world's furniture, so the first genuinely different profile would force a redesign anyway. **Cost of deferring:** hero arbitration stays in `js/main.js` rather than in the profile, so the day a hybrid system (chart words *and* totals) ships, whoever builds it re-opens the one-hero-slot question §2.5 was invented for. §7.24 records that explicitly, so it is a known door and not a rediscovery. B's real content — a smaller interface, the stake and the read in separate slots — ships here by subtraction.

**2. `#verdict-subtitle`.** The verdict card has no subtitle element (`index.html:647-664`), under any system, for any notation. That is a **missing element**, uniform across all three profiles — not a gate, not part of the conflation, and not something a lens can be blamed for. Adding it means new markup, new CSS, and a third small line between the eyebrow and the answer on a card whose whole virtue is *the name, the answer, the exits* — a hierarchy call I decline to make from source. **Cost:** the eight-surface table keeps one residual asymmetry (row 5, subtitle). Named in §7.24, and filed as a ROADMAP rider under U16 (which owns the draft's intent read) rather than left to be re-audited.

**3. Pre-roll gold numerals** (`.strip-dc`, `.offer-vs`). Named above; a §7.9 hue pass, not U17's.

---

## The strongest objection, and the answer

> **`vs DC 15` beside `d20 8 quiet` is a promise the app cannot keep.** You replaced a silent card with one that raises a question and refuses to answer it. The player has a target on screen and no arithmetic anywhere, so they will do it in their head — and `entry.total` is sitting at **13** (`entryFromRoll`:2595 computes `sum + modifier` unconditionally, every system, forever), while the chart beside it read the raw **8**. Two numbers, one die, one card. And at N > 1 it is worse: `3d10 dc15` prints three independent chart words above a target that can only be met by *adding them* — the one act Joe's law forbids in ten words. Silence was safer.

Four answers.

**1. Removing the `+5` removes the arithmetic, and that is why C had to be grafted in.** This is where A and B were genuinely vulnerable and this spec is not. Under A's version the card shows `vs DC 15`, a `+5 Modifier` flying up, and a raw `8` — every operand of the phantom sum, laid out, minus the operation. Here the card shows `vs DC 15` and `d20 8 quiet`, and **13 appears on no surface under this lens** — not the banner, not the peek, not the ring, not the log's total column, not the log's detail, not the breakdown tail (#25), not the offer card. The mental arithmetic the objection fears now requires the player to supply an operand the app never showed them. Today's build is the one that lays the trap: `d20 8 +5 · a quiet roll`, a bonus added to a number that is nowhere on screen.

**2. The invitation exists whether we print it or not.** The player typed `dc15`. It is on the offer card, in the dock pill, in `popCanonical`, in `#pop-echo`, in the saved-pool record, in the YAML export, and — in a build four days old — **spoken aloud** to a blind player as `target 15` at `ceremonyEnterSettle:3677`. Withholding it from four surfaces does not un-declare it; it guarantees that the one place a player looks at the decisive moment is the one place it is missing. The audit's sentence is exact.

**3. Declining to conclude is obedience, not evasion.** GOALS goal 6 draws the line: *"Dice, not game rules. How rolls fit into an RPG's mechanics is the players' business."* `total >= dc` is not a fact about dice — it is a house rule, true under D&D-style play and undefined under Soul Deal. `usesTotal:false` is a profile saying *I do not define that comparison*. Silence on the **verdict** is obedience; silence on the **stake** is amnesia. Printing `Success` would invent a rule; printing `vs DC 15` repeats what the table said before it rolled.

**4. On N > 1: this rule is what *prevents* the sum, and the current build is what implies it.** `13` lives only in `entry.total`, and every render of it stays behind `usesTotal`. Under soul-deal `3d10 dc15` shows three chart words and `vs DC 15`; it never shows 22, never draws a ring at 22/15, never says cleared, and after #22 never prints a bonus to be added to anything. And the card already ships this exact shape without complaint: **`vs DC 15` over `Face down`**, `js/main.js:4052-4059`, commented *"Public stakes, hidden result."* The code knew how to hold a stake without a verdict. It never noticed a per-die system is the same case.

**The residual cost, stated plainly.** A Soul Deal player who wants a target *judged* still cannot have one, and now sees it rendered without a judgement — which makes the absence more visible than it was. That is the correct trade. The absence is real, inventing a per-die comparator to paper over it would be the app deciding how a target works in someone else's game, and roadmap §8 owns that decision. Making the gap visible is how it gets designed rather than forgotten.

---

## Build order — smallest independently-committable steps

Each step leaves the app coherent and shippable on its own. Total: ~90 lines touched in `js/main.js`, about a third of them deletions; −3/+1 members in `js/meanings.js`; 5 lines of `index.html`; +4/−4 CSS rules.

**Step 1 — The stake renders.** *(the audit's core; ships alone)* — **SHIPPED `fe9acbd`.**
`heldWord` + `stakeInto` helpers · gates #1, #7, #8, #9, #10, #11, #16, #19(dc half), #21, #23 · `targetWord` in all three profiles + gate #2 · the `.stake-num` and `.ring-wrap.hidden + .margin-line` CSS rules.
After this commit: the dc renders on all eight surfaces, no surface prints an unearned `✓`/`✗`/`Success`, and the verdict card's branch-order trap is gone. `+5` is still inconsistent — that is step 3.
*As shipped:* all of it, plus one defect only LOOKING caught — U13's "Save as pool…" was deriving its class by string-stripping `revealClass` and shipped with **no dress**, a browser-default white button between a red Clear and a gold REROLL, every assertion green. Fixed in the same commit.

**Step 2 — The `?` leaves the total slot.** — **SHIPPED `ba03e88`.**
Gates #14, #15, #19(held half), #20 · `#result-meaning.held` and `.pk-held` CSS.
Independently valuable: the app's headline privacy feature stops answering with a mute 52px gold glyph, and the sum leaves the DOM under a lens that refuses it.
*As shipped:* banner and peek only. **The log's total column still answers `?`** — a site the gate table never listed (see the status block).

**Step 3 — Arithmetic and selection split.** — **SHIPPED `f5359d8`** *(with #26 missed)*.
Gates #3, #4, #12, #13, #22, #25, #28, #32 · `index.html` #29, #30 (#31 untouched) · delete `usesMods` from all three profiles.
Independently valuable even without steps 1–2: it closes the *Attributed math* invariant break on the default system and makes the dc authorable in the ± popover.
*As shipped:* **#26 did not land** — `modsSummary` has no `values` option and `renderOffers` passes none, so the offer card still prints the flat `+5`. And the dropped-die claim was narrower than written: it returned to the **verdict card** only (see the status block).

**Step 4 — Delete the `meaningFor` channel.** — **SHIPPED `f5359d8`** (same commit as step 3). JS + CSS per the table above; `critWord` signature and both call sites. Pure subtraction, behaviour-neutral.

**Step 5 — Docs, one commit.** *(this pass)* `js/meanings.js` interface prose · UX.md §2.5 → struck to a pointer · new §7.24 · WHAT IS TRUE TODAY rows · GOALS' *Attributed math* gains the clause that it governs math which happens · ROADMAP U17 marked step by step, with the two deferrals (`readFor`, `#verdict-subtitle`) recorded where the next reader will find them — §7.24's *Deferred* and, for the subtitle, a rider under U16.
*Note:* the interface prose in `js/meanings.js` was rewritten during steps 1 and 3, so step 5 inherits it. Its heading still reads **"Profile interface v2"** over a v3 member list — a one-word correction for whoever is next in that file.

**Step 6 — Look. — OPEN.** One interactive pass over the existing lifecycle fixtures: check-declare (badge + `TARGET`), check-verdict (stake line rhythm), peek held, whisper banner. Per the repo's standing rule, U17 is not "done" before this.

---

## Test plan — scenarios by tag, `__diceDebug` hooks needed, existing pins to re-point

**No new `__diceDebug` hooks are required.** Everything the new assertions need already exists and is exercised by `ledger-read`: `commandRoll`, `sim`, `skipCeremony`, `ceremonyState`, `retireCeremony`, `setSystem`, `openPopoverFor`, `closePopover`, `cardActs`, `logTop`. Per §7.21's lesson, **every visibility assertion reads computed `display`/`offsetParent`, never a class.**

### Existing pins to re-point

| file:line | today | becomes | step |
|---|---|---|---|
| `tests/e2e/scenarios.mjs:811` (`per-die-read`, **smoke**) | `assert.ok(!logTop().includes('vs 15'))` | `assert.ok(logTop().includes('vs 15') && !/[✓✗]/.test(logTop()), 'the stake shows; the verdict does not')` | 1 |
| `scenarios.mjs:817` (same) | `assert.ok(logTop().includes('vs 15'))` under dnd | **must tighten** to `/vs 15 [✓✗]/` — it stops discriminating otherwise | 1 |
| `scenarios.mjs:801-803` `#result-total` computed `display === 'none'` | — | **survives, becomes more true** (no `?` flicker on the hidden path) | — |
| `scenarios.mjs:806-807` `.log-total` textContent `''` | — | **survives** | — |
| `scenarios.mjs:~830` `secVisible` over `.sec-sum, .prow-sum` | asserts all fold under per-die | re-scope to the **Modifier** section only; add positive computed-visibility assertions that `#pop-dc`, `#pop-seg-adv`, `#pop-seg-keep`, `#pop-sw-reroll`, `#pop-sw-explode` are **visible** under soul-deal (four of these currently assert the opposite) | 3 |
| `scenarios.mjs:838` `#pop-sysnote === null` | — | **survives** — no note returns, per Joe's 2026-08-06 ruling | — |
| `scenarios.mjs:3597, 3610` (`rim-word`, **smoke**) | `'± Moment'` under soul-deal | `'± Modify'` under both; assert the *title tail* differs instead of the word, and keep the `!/tweak/i` ban | 3 |
| `scenarios.mjs:996-999` (`ledger-read`) ring folds | — | **survives** — the ring folds on `usesTotal` (4004), untouched | — |
| `scenarios.mjs:~991` `#intent-notation` includes `[Wisdom]` | — | **survives** — the notation line stays whole | — |
| `tests/meanings.test.mjs:81` `sd.usesMods === false` | — | **deleted** (field is gone) | 3 |
| `tests/meanings.test.mjs:82` `sd.meaningFor() === null` | — | **deleted**; replace with `assert.equal(sd.targetWord, 'Target')` and `assert.equal(SYSTEMS.dnd.targetWord, 'Difficulty Class')` | 4/1 |

### New scenario — `stake-read`, tags `['smoke','meanings']`

One pass, one fixture (`1d20+5 check dc15 # The Duel | Charisma`) under soul-deal, then the same log re-read under dnd:

1. **Declare:** `#intent-target` computed-visible; `#intent-target-label` textContent `Target`; `#intent-notation` still contains `dc15`; `#intent-mods` has **no** `+5` chip.
2. **Verdict:** `#verdict-margin` textContent is exactly `vs DC 15`; `#verdict-hero` contains none of `Success`, `Failure`, `13`; `#verdict-hero` carries `verdict-outcomes`; `#verdict-modcards` is empty; `#verdict-margin .stake-num` exists.
3. **Selection mods return** *(step 3's real payload)*: `4d6dl1 check` under soul-deal → `#verdict-modcards` contains a `DL1 dropped …` card, and the dropped die's label appears inside an `<s>`. This is the GOALS *Attributed math* pin.
4. **Log:** `.log-verdict` reads `vs 15` with no `ok`/`bad` class; the line contains **no** `+5`; `.log-total` is `''`.
5. **Banner / peek:** `#result-verdict` has neither `verdict-success` nor `verdict-fail`; `#result-total` computed `display === 'none'` **and** `textContent === ''`.
6. **Hidden:** a whispered roll's banner → `#result-meaning` reads `Whispered`, carries `held`, and `#result-total` is both `display:none` and empty. Peek → `Face down` with `.pk-held`.
7. **SR agreement:** after a ceremony settle `#sr-live` contains `target 15`; after a banner paint the announce contains `vs DC 15`. *(The one assertion that pins the two announce sites to each other.)*
8. **The relit re-read:** `setSystem('dnd')` on the standing card → `#verdict-margin` becomes `vs DC 15 · margin −2`, `#verdict-hero` reads `Failure`, the ring unfolds, a `+5 Modifier` mod-card appears. `setSystem('soul-deal')` → all of it withdraws and `vs DC 15` remains. This is the lens contract, pinned in one place.

### Run path

`npm test` (unit + fuzz + e2e smoke) after every step — `per-die-read`, `ledger-read`, `rim-word` and `stake-read` are all smoke-tagged, so the whole U17 surface is covered by the seconds-long script. `node tests/e2e/run.mjs --only meanings` for the targeted loop. Full sweep is a pre-release gate, not a per-step cost.

---

## What NOT to do

- **Do not build a per-die comparator.** No `target.cmp`, no `scope:'each'`, no `cs>=N`, nothing in `outcomesFor` that consults `entry.dc`. It would burn a field UX.md §2.1 explicitly reserves for roadmap §8 (which already rules that case needs a *different verdict rendering* — success pips, not a ring) and it would have the app decide how a target works in someone else's system. §7.24 says this in one line so it is not re-derived.
- **Do not flip `renderVerdictCard`'s `hasDc` gate alone and call U17 done.** It changes exactly three things: `strokeDashoffset` and `.fail` computed on an element `css:4460` has set to `display:none`, and the held-branch line at 4055. The verdict card — the surface the audit is *about* — shows nothing new, because `renderOutcomeRows` at 4061 blocks the `else if` at 4065. The stake must be written **outside** the chain.
- **Do not flip the log's gate at 9314 alone.** It prints `vs 15 ✗` off a phantom **13** while the chart beside it reads the raw **8**. Worse than doing nothing.
- **Do not un-gate `#result-total` in CSS.** Line 2938 writes `entry.total` into the node on every paint under every system; only `display:none` withholds it. The textContent write must move inside the gate.
- **Do not restore the flat `+5` anywhere** — not as an intent chip, not as a mod-card, not in the log detail, not in the breakdown tail, not in the offer summary. It is the operand of an operation this lens does not perform.
- **Do not strip `dc15` from `#intent-notation`.** It is a verbatim canonical echo. The dnd double-print is intentional and already ships.
- **Do not gate the dock strip, the offer card's `vs`, or `ceremonyEnterSettle`'s `target N`.** They are correct; they were only accidentally correct before.
- **Do not restore `#pop-sysnote` or add any "the dc does nothing here" note.** Joe deleted that species of note on 2026-08-06 ("entirely — no note"), it would fire per keystroke, and it would be false: `dc15` under soul-deal stages the Check (`notationIntent`) and arms the dnd re-read.
- **Do not un-fold the popover's Modifier section.** #31 stays `sec-sum`. It is the one genuinely sum-world section and Joe's ruling sits exactly over it.
- **Do not rename `.margin-line` / `#verdict-margin`,** and do not add `#verdict-subtitle` in this pass.
- **Do not touch U18.** `soul-deal.critFor` fires on any crit chart cell — a `3d10` pool crits 48.8% of the time. It is inside the same file and outside this decision.
- **Do not re-tint `.strip-dc` or `.offer-vs`.** Pre-roll declaration hue is a §7.9 pass.
- **Do not restructure the profile interface** (`readFor`) before 2026-08-13. Take the subtraction, leave the rewrite.
- **Do not add a `declaresStakes` profile bit.** It would equal `usesTotal` for every shipped profile, and the one future system that legitimately reads per-die targets needs real design, not a boolean.
- **Do not touch port 8123.**

---

**Rode with it — both CLOSED** *(B3 in `ba03e88`, B4 in `f5359d8`)*, kept as
the statement of what was wrong. ~~the only 52 px gold number a Soul Deal
table sees is `?` — `#result-total` is dead for every open roll and springs to
life, in the roll verb's own hue, only to announce an absence, with the banner
never saying *why* (the verdict card and log both name the state; the banner
is mute). And the meanings migration left dead surface: all three profiles
define `meaningFor: () => null`, so the non-ledger `#result-meaning` branch,
`.pk-meaning`, the verdict's `else if (meaning)` and §2.5's entire hero-slot
ruling are unreachable while §2.5 is still written as live spec (retire it
with U4's pass).~~ The banner and the peek name the rung now (`Face down` /
`Whispered`); the channel is deleted, producer and consumers and CSS; §2.5 is
struck to a pointer at UX.md §7.24. **The one residue: the log's total column
still answers `?`** for a held roll under a per-die lens.

### U18. Crit frequency under soul-deal — SHIPPED

*Audit B2 (major), second half.* `soul-deal.critFor` fires when *any* die
lands a crit cell, and those cells exist on d10/d12/d20 — so a `3d10` pool
crits on **48.8%** of rolls, each one a full-viewport wash plus a 1700 ms
shake. §2.4 budgets crit as a rare accent; on a d10-heavy Soul Deal pool it
is the **median outcome**, and "excitement outranks physicality" inverts into
noise. This is a chart/threshold question, not a rendering one: decide what
"crit" means for a multi-die per-die pool. (U8 ships the reduced-motion half
independently and first.)

**Decided 2026-08-08 — SHIPPED.** It is a *ceremony* question, and the audit's
framing above is half wrong. The chart is correct and is untouched: face 10 on
a d10 IS a Critical Success, 1 in 10, as its author wrote it. The defect is
that `critFor` is a `some()` over N independent readings — the one place the
soul-deal profile AGGREGATES, under its own no-aggregation law
(POOL-ANALYSIS §2, "every number describes exactly one die") — and it fed a
full-viewport wash that makes a claim about the ROLL, which a per-die system
has no verdict to make.

So the two questions are split. `critFor` still answers *did something crit*,
and the word always lands (U8's rule; the per-die card prints it regardless).
A new optional profile method `critCeremony(entry)` answers *does the table
stop*. Soul Deal says yes only when a **strict majority of the crit-CAPABLE
dice** agree — d4/d6/d8 have no crit cell and so are not in the denominator,
without which the canonical attribute+skill+motivation roll (one d10 among
three dice) could never clear a majority and would lose the accent entirely.
D&D states `critCeremony: () => true` explicitly: a d20 system has one
verdict, and a natural 20 under advantage is a crit *because* the other d20
disagreed.

Measured (2e6 rolls each, wash rate before → after):

| pool | before | after | |
|---|---|---|---|
| `1d10` | 20.0% | 20.0% | the author's rate, unchanged |
| `d8+d6+d10` | 20.0% | 20.0% | the canonical attribute+skill+motivation |
| `3d10` | 48.8% | 5.3% | the audit's case: median → accent |
| `d10+d12+d20` | 40.0% | 3.2% | |
| `4d20` | 34.4% | 0.1% | strict majority of four is a big ask |

The shapes Soul Deal actually plays cost nothing; only the crit-capable STACK
is rationed, which is exactly the pool that was drowning. **The threshold is
the tunable** — strict majority is a defensible default, not a law, and it is
one comparison in `soul-deal.critCeremony` for Joe to retune against play.
Pinned by unit tests (7 cases) and the `crit-budget` scenario, which was
verified to FAIL against pre-U18 behavior.

### U19. `playerId` succession for reveal and offer authority — SHIPPED

*Audit E2 (major).* Reveal authority and offer ownership are pinned to an
ephemeral `playerId` with **no fallback**. Lose your stream past the 5 s
grace, rejoin with a fresh id, and your own held rolls become unrevealable
*by anyone*, forever. An offerer who leaves strands an un-withdrawable gold
card; a claimed dice-tower offer from a departed offerer whispers to a dead
id — a roll nobody can ever see. Rolls got a universal-housekeeping escape
once collected (§7.7); offers and reveals did not, for no stated reason.
**Decided 2026-08-08 — SHIPPED.** Neither option as written. The two halves
have different stakes and got different answers:

- **Seat-name fallback: REFUSED, permanently.** `resolveVisibility`'s own
  contract is that *duplicate player names all join* (server.js:1376, :2045).
  Matching a departed authority by name would let anyone sit down under the
  roller's name and reveal their held rolls — a privacy hole traded for a
  convenience. Any real succession needs durable identity, which GOALS
  defers. This is the same bet as U3, and the answer stays "not yet".
- **Offers: §7.7 extended.** An offer whose creator has left is table
  furniture — the invitation was public and its spec was public the moment
  it was made, so withdrawing discloses nothing. Anyone may now rescind an
  orphaned offer; while the creator is present it stays theirs, unchanged.
- **Reveals: no fallback, but no longer immovable.** A held roll whose
  authority is gone stays unrevealable forever — that is the *correct*
  failure direction, and inventing a successor is the only way to get it
  wrong. What was actually broken is that it also could not be **cleared**,
  so it sat on the felt for the rest of the session. Clearing sends dice
  away and never discloses a value, so it is now universal once the roller
  is away. The values die with the seat; the felt comes back.

The client half matters as much as the server's: the banner and verdict card
paint their verb once, so a departure now repaints them (`repaintAwayVerbs`,
called from `renderPlayers`) from a local Dismiss to a real red Clear. An
empty roster reads as "we don't know yet", never "everyone left", so a
reconnect does not flicker red. Pinned by `orphan-clear`.

### U22. Modal semantics and the focus pass — SHIPPED

*Audit D3 (major), D4, D5.* Batch this; it is one sweep, not eleven fixes.

- **Six modal-ish surfaces, zero focus containment, one dishonest
  `aria-modal`.** `#help-overlay` is the app's only `role="dialog"
  aria-modal="true"` and has no trap — Tab walks into content AT has been
  told does not exist (focus real, speech silent). The other five overlays
  are anonymous `<div>`s; nothing sets `inert`; `#mods-popover` sits after
  `</aside>` in the DOM, ~26 tab stops from the button that opens it;
  `#name-modal` — the blocking front door, no cancel, no Esc rung — is the
  least accessible surface a new player meets. **Until a trap exists, *drop*
  `aria-modal` from help**: an honest un-annotated dialog beats a lying
  annotated one.
- **`.cmd-in:focus { outline:none }` with nothing put back** — the primary
  text input and the palette have no focus indicator, the cleanest 2.4.7
  failure in the app; the correct swap-for-border pattern ships three times
  in the same file. Add `aria-invalid`/`aria-describedby` for box errors.
- **Names that are not names.** Icon-only foot buttons and `.die-x` are named
  by `title`, which the accname algorithm never reaches for a button with
  glyph content — while `.rd-x` and `#edge-toggle` do it right in the same
  file. Popover segments are mutually exclusive but announce as independent
  unlabelled toggles — on Visibility, the one control whose mistake cannot be
  undone. `#zoom-picker` sets both `aria-checked` and the invalid
  `aria-pressed` on `role="radio"`.
- **Keyboard traps and dead ends.** `.rd-x` is `tabIndex=-1` beside the
  comment "a counted row you cannot decrement by touch is a trap" — the
  identical keyboard trap left standing (Esc clears the whole pick). Shelf
  markers are invisible, unlabelled, tabindex-less `<div>`s, so the table's
  history is a flat 2.1.1 failure — and once a roll is shelved the peek is the
  *only* door to Reveal.
- **Structure and focus retention.** No `<main>`, no `<h1>`, no skip link —
  the workbench announces as "complementary". Every rail re-render drops
  focus to `<body>` (picking three pools by keyboard costs three Tab-walks
  from the top) while the expanded rack, via `renderTray`, does not — twins
  behaving oppositely. Add `scroll-padding-top: calc(var(--draft-h) + 34px)`
  so Shift+Tab does not land focus rings under the 203 px sticky zone.
- **Touch floor.** The 44 px coarse floor reached only the card-action row
  (css:4415); the ± popover — reached on touch by the app's hardest gesture,
  a 500 ms hold — is built from 23 px seg cells, 23×24 steppers and 30×17
  switches, and `#offer-pick`'s ID rule beats the coarse bump, leaving ~20 px.
  *(Closed by U28 — this bullet shipped there, including the `#offer-pick`
  specificity fault it names.)*

**SHIPPED 2026-08-08.** One sweep, as the entry asked for.

- **The trap, and an honest `aria-modal`.** `openModal`/`closeModal` put every
  OTHER body child `inert` — which removes the rest of the page from the tab
  order, from hit-testing and from the accessibility tree in one property,
  rather than three hand-rolled mechanisms each getting it subtly wrong — plus
  a Tab wrap (inert bounds where focus may GO, not where it wraps) and focus
  RETURN to the opener. `role`/`aria-modal`/`aria-labelledby` are now set by
  that same function, so the annotation and the containment cannot ship apart:
  the audit's finding was a true `aria-modal` on a dialog Tab walked straight
  out of, which is a promise to AT that the rest of the page is not there.
  Applied to `#help-overlay`, `#kbd-overlay`, `#settings-modal`.
- **The focus ring.** `.cmd-in:focus { outline: none }` had nothing put back —
  the primary text input and the command palette, no indicator at all. It is a
  **box-shadow**, not the border swap the file's three other instances use,
  because `.cmd-in`'s border already carries a STATE (`.cmd.is-invalid` paints
  it red) and a focus indicator that overwrites the error is a worse trade
  than none. Two channels: border says valid/invalid, ring says focused, and
  the invalid ring is red so the two never fight. Plus `aria-invalid` and
  `aria-describedby` pointing at the slot that was already the validator's
  voice — the wire between them was simply never run.
- **Names.** `aria-label` on every glyph-only button (`⚙ ≣ ? ❯`, the corner
  clear, `.die-x`, the cheatsheet `?`): accname never reaches `title` for a
  button that HAS content, and `⚙` is content, so a title-only icon button
  announces as its glyph and nothing else. `title` stays — it is the sighted
  hover read, and both say the same thing on purpose.
- **A seg is a choice.** `segSet` — the single place all four popover segs are
  painted — now emits `radiogroup`/`radio`/`aria-checked` with a roving
  tabindex and arrow-key selection, replacing `aria-pressed` (which says "this
  button is on", invites turning several on, and says nothing about the four
  being one decision — on Visibility, the control whose mistake cannot be
  undone). `#zoom-picker` no longer sets both `aria-pressed` and
  `aria-checked` on `role="radio"`; pressed is not valid there, so one of the
  two was always wrong.
- **Reach.** `.rd-x` is tabbable — it was `tabIndex=-1` three lines under a
  comment calling the touch version of the same omission a trap, and Esc
  (which drops the whole pick) was the only other undo. Shelf markers are
  `role="button"`, `tabIndex=0`, named per-render with Enter/Space: they were
  unlabelled tabindex-less `<div>`s, so the table's history was a flat 2.1.1
  failure and a keyboard player could not reveal their own held roll at all.
- **Structure and focus retention.** An `<h1>` and a `<main>` where there were
  neither, `aria-label` on the panel so it is a named region rather than an
  anonymous "complementary", `scroll-padding-top: calc(var(--draft-h) + 34px)`
  so Shift+Tab does not park a focus ring under the sticky well, and
  `keepFocusThrough` on both rail renders — they rebuild from
  `textContent = ''`, so picking three pools by keyboard cost three full
  tab-walks from the top while the expanded twin kept focus throughout.

Pinned by `a11y-modals`, verified to FAIL when `openModal` stops setting
`inert` — i.e. it catches the exact "annotated but not contained" shape the
audit found, which an attribute-only assertion would have passed.

### U24. Ordinals versus the dealt rack — SHIPPED

*Audit G4 (moderate).* `1 2 3 Enter` — the roll the design says the surface
exists for — **cannot be typed on the rack the app deals**.
`dealStartingRack` seeds 9 attributes, then skills at ordinal 10 and
motivations at 16; ordinals render only for `ord ≤ 9`, and there is no
reorder affordance. UX.md asserts the claim in the paragraph *directly above*
the dealt-rack amendment that broke it (1536-1539 vs 1542-1563), and
main.js:10948's comment advertises a sequence that now means Strength + Wit +
Intelligence. **Either interleave ordinals across shelves or re-scope the
promise; either way fix both doc sites and the code comment.**

**Decided 2026-08-08 — SHIPPED.** Interleaved. The nine digits are dealt
ACROSS the shelves rather than down the first one: `digitPools` gives every
non-empty section at least one slot, then hands the remainder out largest-
section-first. On the rack the app actually deals (18 pools — 9 attributes,
6 skills, 3 motivations) that lands 3/3/3, so `1 4 7 Enter` is an attribute
plus a skill plus a motivation — the cross-section roll the surface exists
for, and the exact roll the old ordering made untypable. `digitOf` reads the
position back out of `renderedPools`, so the badge and the key agree by
construction rather than by a parallel count. Pinned by `digit-reach`.

### U27. The identity menu's touch path is dead code — DEFECT, small  
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit T4 (major).* `identityChip` arms a 500ms long-press that calls
`openIdentityMenu()` (js/main.js:11683-11695), and the `click` listener
four lines up (11664) closes the menu on the same release. There is no
`lpFired` suppressor, so on a tablet the menu flashes and vanishes — and
that menu is the **only** door to *Change name…*, *Change seat…* and
*Leave table*. `Copy invite link` has a second home as a `.rail-ghost`; the
other three do not, so a touch-only player cannot rename, re-seat or leave.

The fix is a copy, not a design: the pool tile at js/main.js:7053-7095 is the
correct implementation — 500ms timer, 10px `pointermove` cancel,
`pointerup`/`pointercancel` teardown, `lpFired` checked and reset at the top
of the click handler, and the Android `contextmenu` handler clearing the
timer so the door cannot double-toggle. Lift it into a shared
`attachLongPress(el, fn)` while doing this; **U12 needs the same helper** for
`.shelf-marker` and `#peek-card`, so do U27 and U12 together and write the
helper once.

**Scenario:** extend `sheet-touch` — synthesize `pointerdown`, wait 550ms,
`pointerup`, assert the menu is still open. The existing pool-tile pin is the
model; the identity chip has no touch coverage at all today, which is why a
dead path shipped.

### U28. The coarse-pointer size pass — SHIPPED

*Audit T1, T2, T3, T6, T7, T8, T9, T12.* **The structural finding, and the
reason this is one batch rather than eight entries: seven of the eight
`(pointer: coarse)` blocks in the stylesheet fix *visibility*, and exactly
one fixes *size*.** Touch was given things to see, not things it can hit.
Two of them are removers that were deliberately made to STAND on coarse
pointers by rules written to make them reachable, while staying 20px and
18px — `.die-x` (css:527) over 34px die art with no gap to its neighbour,
and `.rd-x` (css:1831) absolutely positioned **on top of the row that
increments**, holding x∈[64,82] of an 86px row, so a finger centred left of
it adds a die instead of removing one. §7.23 argued that ✕ must stand
"because a counted row you cannot decrement by touch is a trap"; it made it
visible, not tappable.

Measured, against a 9mm pad ≈ 34 CSS px:

| control | now | file |
|---|---|---|
| `#edge-toggle` — the ONLY pointer path to collapse/expand | 14px wide | css:236 |
| `.sw` switch (adv, explode, reroll, **sound**) | 30×17 | css:3843 |
| `.stepper button` (± mod, dc, keep/drop) | 23×24 | css:3839 |
| `#offer-pick` | ≈21 wide | css:891 |
| `.pop-close` | ≈17×21 | css:3748 |
| `.rd-x` | 18×18 | css:1831 |
| `.die-x` | 20×20 | css:527 |
| collapsed foot ⚙ ≣ ❯ ✕ | ≈19×27 | css:1760 |
| `#rail-mode` cells | 39×23 | css:1797 |
| `.tile-del` (destructive, no confirm) | 24×24, 6px from the next tile | css:1234 |
| `.roster-name` / `.rail-ghost` (Invite, + New table, Tables ▾) | ≈24 tall | css:2181 |
| `.rp-item` | 38 (deliberate, §7.22) | css:1898 |

Two selector faults to fix while in here, both of which explain why a bump
that exists did not land: **`#tray-mods` carries no `class="btn"`**
(index.html:196) so `.draft-actions .btn`'s coarse rule never matches it — it
reaches row height only because `align-items: stretch` drags it there — and
**`#offer-pick`'s id rule (1,0,0) out-specifies the coarse rule (0,2,0)**;
media queries add no specificity, so the id wins regardless of source order.
That is the one place in the stylesheet where an id beats a coarse bump, and
it is worth a comment when fixed.

Budgets are known, so this is arithmetic rather than design: the collapsed
foot has 6px of slack (80 of 86) — `padding: 10px 2px` gets four glyphs to
~35px inside it; `#rail-mode` has vertical room for `padding: 11px 2px`
(39×35); the ± popover is 312px wide with `overflow-y: auto` and can afford
the height. `#rail` is `flex-wrap: wrap`, so growing the roster pills wraps
the row instead of overflowing it. `#edge-toggle` should keep its 14px *ink*
and widen only its *target* (`::before` into the felt side, which has no
competing handler).

One addition that teaches rather than enlarges, and is the cheapest item
here: `.tile-add` (css:1224) — the `+` whisper that is the only thing saying
a rack tile *stages into the well* rather than rolling — is `opacity: 0`,
hover-only, with no coarse branch. On touch nothing distinguishes a rack tile
from a `.pool-roll` strip that fires immediately.

**Do this behind U23's token layer if U23 lands first** — a `--tap-min`
token is exactly the kind of thing that keeps this fixed. **Scenario:** a
`touch-targets` scenario that walks a list of selectors under
`emulateCoarsePointer` and asserts `getBoundingClientRect()` ≥ the floor;
`named-verb-touch` is the model, and a list-driven pin is what stops the next
control from shipping at 23px.

### U29. iOS text-input zoom and the keyboard-occluded foot — SHIPPED

*Audit T11 (moderate).* Every text input in the app is under 16px —
`.cmd-in` 12.5 (css:3499), `.tin` 12, `.pid-name-input` 13,
`.new-shelf-input` 12, `.portable-text` 11, `.btn-row input` 13 — and iOS
Safari auto-zooms the whole layout on focus below that threshold. So tapping
the notation box, renaming a pool or naming a shelf jolts the table. Raise
them to 16px under `(pointer: coarse)` only; the mono face keeps the visual
register at that size.

Separately, `#left-panel { position: fixed; top: 0; bottom: 0 }`
(css:150-153) uses no `dvh` unit, and the viewport meta (index.html:20) has
no `interactive-widget=resizes-content` — so `#rail-foot` (⚙ ≣ ? ❯ and
✕ Clear table) sits *under* the software keyboard whenever any input is
focused. One meta attribute plus a `dvh` fallback.

Note index.html:20 is otherwise correct and should be left alone:
`initial-scale=1` with no `user-scalable=no` and no `maximum-scale` is what
keeps pinch-zoom alive, and pinch-zoom is what makes every undersized target
in U28 *recoverable* rather than impossible.

### U30. A short-viewport branch that trims the well, not the rack — SHIPPED

*Audit T10 (moderate).* `.draft-zone` measures **203px** (167 with the rim
hidden) and it is sticky, so it is subtracted from every scroll. On a
**1024×768 landscape tablet** the panel body is 654px; minus the sticky zone
leaves 451px, and the section bar (46) + palette (152) + `#cmd` (~50) take
248 of it — **≈203px for the rack**, about two tile rows. The device with the
most screen puts the whole rack behind a scroll. Portrait (768×1024) is
comfortable at 707px.

**Nothing in the stylesheet keys off height.** The `@media (max-width: 640px)`
branch is a single rule that computes to no change at 640px and only bites
below 372px wide, so neither tablet orientation ever enters it.

Add a `max-height` branch that shrinks the *well* (`.tray-cluster` /
`.tray-roll` to ~84px, `.draft-zone` padding to 10px) rather than the rack —
`--draft-h` is recomputed from `offsetHeight` (js/main.js:5501), so the
sticky shelf-head offset follows automatically with no second edit. This
composes with the empty-draft shrink already argued for in **What NOT To Do**
(do not make the section bar sticky; let the well collapse toward the rim
when there is nothing staged).

**SHIPPED 2026-08-08 (U28, U29, U30 together).** Every rule is in `css/style.css`
plus one line of `index.html` (the viewport meta gains
`interactive-widget=resizes-content` and NOTHING else — `initial-scale=1` with
no `user-scalable=no` and no `maximum-scale` is what keeps pinch-zoom alive,
and pinch-zoom is what makes an undersized target recoverable rather than
impossible). Pinned by `touch-targets`, which walks a LIST rather than
asserting one control — the audit's finding was that seven of the eight
`(pointer: coarse)` blocks fixed *visibility* and exactly one fixed *size*,
and nothing caught it because every touch assertion pointed at the same
button. U30's branch gates at **max-height: 780px**, deliberately a height
question and not a touch one (a 1366×768 laptop has the identical problem),
and deliberately below 800 so the 1440×900 class — where the rack already
gets ~349px and there is nothing to buy — stays out of it.

**Two cascade faults, both worth keeping on the record.** `#tray-mods` carries
no `class="btn"`, so `.draft-actions .btn`'s coarse rule never matched it; it
reached row height only because `align-items: stretch` dragged it there. And
`#offer-pick { padding: 4px 6px }` is (1,0,0) against the coarse rule's
(0,2,0) — **media queries add no specificity**, so the id won regardless of
source order. Both are answered at id weight. The markup fix for `#tray-mods`
is deliberately NOT taken: it has a full dress of its own at `#tray-mods`, and
adding `.btn` would layer a second one under it for no behavioural gain.

### U28a. The rack's delete ✕ needs a layout change before it needs a bigger target — SHIPPED

**Found by LOOKING, after U28 shipped and was partly reverted the same day**
(`tools/steps/touch-look.mjs`, `touch-manage.png`). `.tile-del` went 24 → 36
with the rest of the batch. It measured correctly and every assertion passed.
It was also visibly broken: a pool with a count wears its `×2` badge
immediately left of the ✕, and at the shipped 24px the badge's right edge
*already* overlapped the button's left edge by 2px — a designed near-touch
with no free space beside it. At 36 that overlap is **14px**, so the button's
box lands on top of the "2" on every counted pool (5 of 18 on the dealt rack).

Ink/target separation — how `#edge-toggle`, `.die-x` and `.sw` all reach 34+
in this same batch — does not rescue it: the halo would still swallow the
badge, and this is the rack's one destructive control with **no confirm and no
undo** (js/main.js filters and saves on the first tap). A hit area that
quietly extends over a neighbouring label is exactly how the wrong pool gets
deleted; a bigger target is worth less than the accident it invites.

**SHIPPED 2026-08-08, both halves.** The ✕ came off the corner and became a
**rail**: in manage mode the tile is `[content | 34px rail]`, `.tile-stage`
gives up the width and the ✕ takes the full height of what it gave up. The
badge and the button no longer share an axis at all, so there is nothing left
to collide. Flush to the right edge is safe here in a way a flush corner was
not — a miss to the right crosses the 6px grid gap into the NEXT tile's left
side, which is its stage/edit door, so the worst miss is a wrong-tile *edit*,
never a wrong-tile *delete*.

And the **undo is a tombstone in the slot**: the deleted pool leaves a
ghost-footprint cell reading `↩ Undo` exactly where it stood, which is where
your eye and finger already are. No toast, no timer racing the read, no
z-index, nothing to find. It restores at the REMEMBERED INDEX (clamped) —
a pool that reappears somewhere else has not been restored, and on a rack
with digit shortcuts it would silently move under the keys. One slot, not a
stack, and it closes when manage mode does: an undo that outlives its gate is
a stale door. Pinned by `pool-undo` (including the delete-from-the-middle and
last-on-shelf cases) and by `touch-targets`, whose delete assertion is now a
NO-OVERLAP check rather than a size — a size assertion alone is exactly what
passed while the shipped control was visibly broken.

**And it happened again, in the same commit.** The tombstone's gold dress sat
150 lines above `.ghost-add .ghost-plus` at the identical (0,2,0), so
ivory-at-0.4 won on source order and the rescue rendered as grey furniture —
indistinguishable from the `+` ghost beside it. Caught by looking; every
assertion was green. That is three equal-specificity source-order losses in
this file in as many weeks, which is the argument for U23's token layer.

**The tooling lesson generalises.** `rail-look` and `panel-look` both frame a
FINE pointer at a tall desktop viewport — the one configuration U28/U29/U30 do
not change — so they were structurally incapable of showing this batch at all.
`touch-look.mjs` is the third look tool: coarse pointer, tablet portrait, plus
a short-laptop frame for U30's height branch. A coarse-only rule is invisible
to a tool that never emulates touch, which is the same blindness the audit
found in the suite itself.

### U28b. The expanded rail foot — SHIPPED 2026-08-17

One of U28b's four refused size families, taken alone and with its price. The
rule is four lines in `css/style.css` under the collapsed foot's coarse block,
where the two halves of the same story now sit together:

```css
@media (pointer: coarse) {
  #rail-foot .btn.ghost,
  #rail-foot .corner-btn { min-height: 34px; min-width: 34px; }
}
```

**Two families, one row, one change.** ⚙ ≣ ? ❯ (`.btn.ghost`, 31px) and
✕ Clear mine (`.corner-btn`, 28px) are siblings in `#rail-foot`, so the row's
height is its tallest child and both reach the floor together — pricing them
separately would have priced the same 3px twice. Before
(`38×31, 37×31, 33×31, 37×31` and `101×28`) and after (`38×34, 37×34, 34×34,
37×34` and `101×34`).

**Every number in this entry is printed by `node tools/steps/touch-price.mjs`**,
which shipped with it. It reads offsetWidth/offsetHeight under an emulated
coarse pointer at U30's worst frame — deliberately the same reader
`touch-targets` uses, so a figure here and an assertion there cannot disagree —
and it prices each candidate as a **delta inside one run** rather than two
numbers from two runs.

**What U28 actually did, and why this was left.** The 2026-08-08 pass fixed the
**collapsed** foot (`padding: 11px 3px`, css/style.css:2467) and stopped there,
so the same five controls stayed at 31/28 in the state most people use. The
comment above that block is a width argument end to end — it never asks what
the expanded row costs, because in the expanded column width is free.

**THE FLOOR IS 34 AND THAT IS THE ARGUMENT, not a shortfall.** `?` is 33px
wide, and four 44px glyphs plus a 101px labelled ✕ cannot fit a 260px column —
so a rule buying 44 of height while width stayed 37 would have spent rack for a
target that still failed 44×44. 34 is reachable on **both** axes here, which is
the whole of why it is the number (U28's own conversion: 34 is a 9 mm finger
pad and this file's floor; 44 is the platform guideline and is taken where the
budget affords it).

**It costs the rack 3px, and the tool prices it by REVERTING it.** `#rail-foot`
is `flex: none` in the column, so its height comes off the scrolling body: put
the row back to 31/28 and `#builder-panel > .panel-body` goes **660 → 663**.
The two refused families are priced in the same run — see ROADMAP U28b.

**The first write-up of this said 4px, and that is worth more than the fix.**
The 4 was measured on a *padding-based candidate* (`padding-block: 9px`) which
landed the ghosts at 35px; the rule that shipped uses `min-height` and lands
them at exactly 34, so the row grows 31→34 and the bill is 3. **A number
measured on the prototype and written up as the shipped fact** is this repo's
commonest doc defect, and it slipped past two doc passes here — it was caught
only when the throwaway probe was rewritten as a committed tool step and run
against the shipped tree. That is the argument for the tool step over a
scratchpad path in a comment: a command nobody can run is a date with extra
characters.

**The collapsed rail is untouched, by specificity rather than by hope.** The
collapsed block is `#left-panel.collapsed #rail-foot .btn.ghost` at (2,3,0)
against the new rule's (1,2,0), so both `padding` and `min-width` lose there and
the icon rail keeps the width budget it was measured to. Verified after the
change: the collapsed foot still uses **81px of its 86px content box**, and its
controls still read 19×39 / 18×39 / 18×39 / 18×37 — which is also how the new
near-miss in ROADMAP U28b was found (18–19px **wide** is under the floor, and
no rule can fix it in an 86px box).

---

# Moved out of ROADMAP.md (2026-08-14 cleanup)

ROADMAP.md had grown to 3,723 lines, of which most was shipped narrative,
killed designs and verified-pattern records — i.e. everything its own header
says lives here instead. Moved verbatim; section numbers preserved so
incoming links still resolve. Nothing below is a to-do.

## Tier 0 — the designs that were KILLED (2026-08-05 pass)

Recorded so a future pass does not re-attempt them naively. Each names the
specific defect that killed it. Moved out of ROADMAP 2026-08-14.

### 0b. Boot & bandwidth — 3 shipped, delta hello killed

Three shipped 2026-08-05 (SHIPPED.md §0b): LOG_CAP=100,
`if-modified-since` + immutable `/vendor/`, drop per-viewer
dice-array clone.

**Killed:**

- **Delta hello over Last-Event-ID (F3)** — 2 blockers, needs
  redesign. (i) `retained: room.log.map(r => r.rollId)` unfiltered
  leaks secret rollIds to non-rollers, breaking visibility invariant
  (GOALS.md goal 11); must filter by `entryExistsFor(r, viewerId)`.
  (ii) `executeRoll` (server.js:1235) — the primary broadcast — was
  not enumerated in the seq-stamping list, so fresh rolls silently
  drop from the delta (exact failure mode the design claimed to fix).
  A working redesign must stamp roll birth AND every mutation path
  (revealed/cleared/whisper flips) AND filter the retained rollId
  list per viewer.
- **Memoize projections + JSON per broadcast (F4)** — the Map-identity
  precondition it depends on isn't met by current `projectEntryFor`
  (redacted branch allocates fresh `{}` per viewer). The design's fix
  is dismissed as "future pass" — bundle the projectEntryFor stability
  work with F4 next time, don't ship F4 solo.

### 0d. Server hygiene — 6 shipped, 8 killed

Six shipped 2026-08-05 (SHIPPED.md §0d): endStream socket teardown,
centralize `dropStream()`, 30s TCP keepalive, MAX_PHYSICAL_DICE cite,
`DICE_LOG_LEVEL` gate, quote user-derived log values.

**Killed:**

- **Evict SSE streams with growing write buffer** — 128 KB threshold
  below realistic hello worst case (LOG_CAP=200 × 1-2 KB pre-fix);
  can evict fresh healthy WAN joiners before kernel drainage. Needs
  instrumentation on real slow-client join before a threshold gets
  picked, plus coupling to sendEvent's try/catch not to lose it.
- **HttpOnly cookie for playerId (F9)** — multi-tab identity swap
  (cookies per-origin, sessionStorage per-tab, first tab's SSE
  reconnect authenticates as whichever seat wrote last);
  `req.socket.encrypted` is FALSE behind a TLS terminator, so the
  design's Secure-flag detection is inverted; no reduction in URL
  log surface because client still puts playerId in SSE URL.
- **In-process token-bucket rate limits per playerId + IP (F1)** —
  `clientIp = req.socket.remoteAddress` collapses to global under
  Cloud Run's proxy; 429 on `/api/events` trips a self-inflicted
  stream storm (EventSource → CLOSED → reopen → rejoin). Cloud Armor
  rate rule is the correct place, not in-server buckets.
- **Strict security headers (F2)** — `script-src 'self'` blocks
  `index.html`'s `<script type="importmap">` and `lab.html`/
  `chrome-lab.html` inline modules; app fails to boot. Redesign
  needs hash allowlist per inline script or extract-and-serve.
- **Cap concurrent SSE streams per IP + globally (F3)** — counter
  leak: server.js already deletes from `player.clients` OUTSIDE
  onClose in four places before triggering the close event, so
  counter decrement races the eviction. Missing `sendRateLimit`
  helper the sketch calls.
- **Rate-limit /api/pools + cache canonical (F4)** — patchSketch
  internally inconsistent about where the cache lives (`p.__raw`
  vs `player.__poolsRawCache`); final line has undefined `i` and
  index-alignment bug in the map.
- **Global player cap + capacity heartbeat (F6)** — undefined
  `totalStreams` var in log line; MAX_PLAYERS_TOTAL=2000 is a 10×
  cut from currently-legal headroom (MAX_ROOMS × MAX_PLAYERS_PER_ROOM
  = 20 000) and wasn't called out as semantic change; `server_full`
  error code collides with existing MAX_ROOMS cap.
- **Coalesce settings-changed broadcasts (F7)** — fixShape says
  debounce, patchSketch implements leading-edge throttle;
  scenario asserts wrong event type (server.js:668 sends `hello` not
  `settings-changed`).

### 0e. Endurance leak — 8 shipped, 5 killed

Eight shipped 2026-08-05 (SHIPPED.md §0e): log ⟳ delegation + append-
plus-prune, outline clear on banner hide, cluster marker as sinking
record, lazy DecalField, persistent Reveal/Reroll banner buttons,
felt CanvasTexture reuse, shimmer source pool + PostStack scratches,
hoist positionChips scratch V3s.

**Killed:**

- **Bound rollStates by deleting cleared entries (L2)** —
  `applyClearRoll` never nulls `lastEntry`; deleting the rollStates
  row makes `lastRollActionable` (:8869) return `lastEntry` for a
  cleared roll, so Enter/Esc calls `requestCollectRoll` on it.
  Mouseleave re-arm (:2229) and `retireCeremonyFlow` (:3408) hit the
  same shape. Needs `applyClearRoll` to null `lastEntry` first, or
  a different tombstone scheme.
- **Drop stagedVerdict when new roll takes stage (L4)** — redundant
  with `dismissCeremonyUI` (:1765) which already nulls stagedVerdict
  unconditionally at every non-queued playRoll; self-admitted
  regression to `refreshRevealSurfaces` (:3012) which repaints on
  hidden-roll reveal.
- **Skip world.addBody for shelved dice (L7)** — `resetTableSurface`
  (:799, reached from clearTable:1725, 9594, 9705) calls
  `world.removeBody(d.body)` unguarded; would crash post-shelve.
  Also violates physics-truth invariant documented at :1071-1075
  (STATIC bodies parked in world so fast-forward collides with the
  shelf as it is).
- **Dedupe renderPeek and reuse .pk-main (L9)** — snap misses
  `entry.dc` (mods flip Success↔Failure with same total, guard skips
  repaint), `entry.dice/parts` (tweak preserves total, stale per-die
  rows), `entry.playerName/color/label` (header identity can change
  without touching guarded keys).
- **Gate __diceDebug installation on __diceTestMode (L10)** —
  mechanism claim false: main.js is an ES module, so removing
  `window.__diceDebug` frees no module-scope state (bindings pinned
  by module registry, not by __diceDebug getters). Also removes
  live-tab diagnostic surface (`decalsEnable(true)`) Joe uses in
  production.

### 0g. Hot-path polish — 3 shipped, 2 killed

Three shipped 2026-08-05 (SHIPPED.md §0g): byId map in renderLog
(O(N²)→O(N)), stepPlayback per-frame forEach → index loop, hoist
banner-cell DOM lookups. Three companion allocation fixes shipped
under §0e (positionChips scratch V3s, shimmer pool, felt canvas
reuse — cross-cutting concern).

**Killed:**

- **Replace bloom-live scan with felt-bloom counter (T0-NEW-6)** —
  missing seams: `resetTableSurface` (:796-816) wipes tableDice
  directly without going through `removeRollDice`; `shelveRoll` has
  a hello-reconstruction branch (:1181) that calls
  `spawnShelvedDie` for dice that never lived on the felt;
  `applyReveal` has two callees (beginRevealFlip felt vs
  revealShelvedRoll shelf) the design's increment doesn't
  distinguish. Fixable, but the design as-is would leave the
  counter drifting.
- **Track live range in Particle/DecalField (T0-NEW-3)** — uses
  `BufferAttribute.updateRange`, deprecated in three.js r160 (the
  vendored version) — 8-14 console.warn/frame per pool. Replacement
  `addUpdateRange()` allocates `{start,count}` per call, breaks the
  design's allocation-free claim.

### 0h. Build-time vs runtime — ALL 7 KILLED, needs fresh discovery

Seven build-time deferral designs proposed (idle-warm shader programs,
lazy PostStack RT alloc, defer PMREM env, precompute std
shelfPoseCache, dispose PostStack RTs, freeze SETS/SET_IDS registries,
idle-warm bakery, fan out picker warms); all killed. The common
failure mode: designs referenced symbols not in current source
(`warmPrograms`, `warmVariantAsync`), seams that reveal/URL-groups
paths bypass (`getDie` at :3045/:3093 skips the `createDieMesh`
seam), `!window.__lab` gate misfires under ES module hoisting on the
lab page, or `__diceDebug` hooks not yet added. The *concept* is
sound (defer PMREM, cache face topology, precompute shelf poses) —
each design cascaded on a specific missing seam that a fresh
discovery pass would surface.

**Standing sign-off (medium risk):** Cache face topology per die type
— one of the 2 items that survived verify. Ships as a small
follow-up when someone re-audits with the missing seams accounted
for.


## Healthy patterns to protect (Tier 0 passes)

### Healthy patterns to protect (verified by the same passes)

- Level 5 post bypass **is** bypassing when idle (empty table renders
  the released direct path, proven at 61.8 dB PSNR — the audit
  reconfirmed it).
- The `(type, set)` material cache is doing its job — no per-roll
  material rebuild.
- `measurePeek`/`positionPeek`'s write-only rAF discipline holds
  (no forced reflow per animation frame).
- The `--draft-h` ResizeObserver keeps the shelf-head pin fresh
  under every non-`renderTray` height change.
- Server projection is honest: every egress path runs
  `projectEntryFor`, and the pass found no leak of hidden values.

---

## 9d. The dice tower — the full build record

### 9d. The dice tower — **SHIPPED 2026-08-12**; three models by 2026-08-14; dressed 2026-08-11; one follow-up left

The lab became the product. `tower` is a room setting whose value is a
tower id — `none` (default), `heartwood`, `bastion` and `blackanvil` — and a tower roll is baked
as a POUR: scripted entry, hidden transit behind the skin, exit through
the doorway, then the ordinary settle. The contract, the socket, the bake,
the amended camera ruling and the measurements are
[TOWER.md](TOWER.md)'s STATUS section; the player-facing spec is
[UX.md §7.31](UX.md#731-the-tower-and-what-a-poured-roll-looks-like-2026-08-12).
Scenario `tower-roll` (tag `tower`), and the whole pre-existing suite
passes **unchanged**, which is what THE FIRST LAW ("don't change anything
about how the system works without a tower") means in practice.

**DONE 2026-08-13 — a second tower, and the sound palette it forced.**
`bastion` (js/towerbastion.js) is a stone turret, and it cost what the
registry promised: a skin file, a row in TOWERS, one id in the server's
validate list. The shared techniques moved behind `export` in
js/towerskin.js with Heartwood's output byte-for-byte unchanged. The
replay-safety claim is now measured rather than argued: 8 dice, seed 42,
through heartwood and through bastion, every resting position identical
to the last digit — which is only true because a skin adds zero colliders
and the film never reads it. And `clunkVoice` is live: a baffle knock is
voiced by the socketed tower (wood clacks, stone thuds), resolved at
render time, so the bake, the film timings and the replay hashes never
learn which model is standing. Proofs and the three findings the build
turned up are in [TOWER.md](TOWER.md)'s STATUS.

**DONE 2026-08-14 — a third tower, and the registry stopped being a claim.**
`blackanvil` (js/toweranvil.js) is the Emberforge family's forge: a
soot-blackened anvil block with a barred furnace grate glowing over the
casting channel, a fire-brick stack strapped in oxidised bronze with one
ember vent, and a flared crucible lip. Same price as the second — a skin
file, a row, one server id — plus `bakeStone` moving into the shared kit,
witnessed pixel-for-pixel against the pre-move source rather than asserted.
It establishes the house's ONE legal glow: an emissive map baked from the
same seeded canvas pass, dim, inside a recess, no light and no bloom.

What the third model changed about the tooling, which is the part that
compounds: `tower-roll`'s swap / socket / voice / pour block is now a LOOP
over the registry's skinned models instead of a block naming one tower, so
a fourth row is covered the day it is registered; `tower-resting-eye.mjs`
takes a tower id like the other proofs (it hard-coded heartwood);
`tower-family-shots.mjs` takes a LIST of siblings so the lineup is the whole
family. And two claims are pinned that only a third model could motivate —
every skinned row carries a `clunkVoice` and no two are the same, and the
picker's row still LAYS OUT at four chips (the paint assertions would have
stayed green with the chips overflowing).

Recorded, not fixed *(and then fixed — see the dressing pass below)*:
**Bastion's arrow loop does not show its dark slot** — the `shadowStone` sits
0.012 behind a granite facade panel spanning the same x/y, so the granite is
in front and the loop reads as a surround with plain wall inside it. Cosmetic
and pre-existing; Black Anvil cuts its facade into panels around the grate
and the vent to avoid the same shape of mistake.

**DONE 2026-08-11 — the dressing pass, and a fourth discipline.** Joe: "I
like the general shape. The exterior could maybe benefit from more detail…
2–5 cosmetics per tower." The three models were architecture and read as
architecture: nothing on any of them had been put there by a person. Each
now carries two to five props — one bold, the rest quiet — out of a new
shared prop kit, `js/towerdress.js`: cloth with a real fold field, heraldry
under the rule of tincture, heater shields, cressets and sconces, ivy as a
guided walk, moss as a pixel pass, rope, chain, a horseshoe, and six quads of
smoke that are not a particle system. Manifests, budgets and the traps are in
[TOWER.md](TOWER.md) under DRESSING; the player-facing story is
[UX.md §7.31](UX.md#731-the-tower-and-what-a-poured-roll-looks-like-2026-08-12).

Three things it established that outlive it:

- **A warm focal light is the FAMILY TRAIT.** Every skinned row now carries
  `ember`, and `tower-roll` fails a row without one. Black Anvil's grate
  stopped being one tower's feature and became the house's.
- **Weathering belongs in the vertex colours.** Every wall texture here tiles
  at WORLD scale, so a gravity stain painted into a tile repeats wherever the
  tile does and cannot know where the bands are. `gravityStain` runs in world
  space after the AO bake: zero triangles, zero textures, zero draw calls.
- **tower-fit NAMES every overrun or goes red.** Six legal classes against the
  engine volumes that grant them; UNCLASSIFIED fails. It caught a real gap in
  its own taxonomy on the way in, which is the useful kind of red check.

And Bastion's arrow loop is a recess again.

What is left:

- **`tower` in the portable YAML.** `table:` carries name/felt/system/zoom
  (js/portable.js `TABLE_KEYS`), so a prepared table cannot yet arrive
  with its tower already up — the one place the setting is not treated
  like its neighbours.
- ~~**The exit portal's minimum height is too generous**~~ — **RESOLVED
  2026-08-13, same day.** The portal-floors campaign
  (tools/steps/portal-probe.mjs; ~420 pours over film-scan envelopes,
  below-floor candidate specs via `towerProbePortals`, retry knees off
  the exit guarantee) measured the true floors and re-derived
  `TOWER_PORTAL_LIMITS` in all three mirrored places + the skill:
  `clearH 3.6·S→2.7·S` (the old door carried ~58% more height than any
  die used; the binding case is CONGESTION at the doorway, not the lone
  d20 — solo need is 2.85, retries turn up at 3.0), `w 4.0·S→3.2·S`
  (jambs channel, they don't jam), `clearR 1.7·S→1.6·S` (entry is
  scripted; envelope exactly 1.816). Full derivation in docs/TOWER.md
  "THE MINIMUMS". Floors only moved down — classic stays legal, the
  freeze golden untouched. The Hollow Bole re-bake to wear the floor is
  the arc's last step.

Known cost, recorded rather than hidden: a 40-die pour is ~25 s of film
and up to five bake attempts (~3 s synchronous). Forty dice through one
chute is forty staggered entries, forty transits and forty exits that may
not overlap, so the length is honest; the bake cost is the exit
guarantee's price and only the largest pool pays it.


## Conformances to protect (from the 2026-08-08 audit)

## Conformances to protect (from the audit)

How these are checked is governed by [TESTING.md](TESTING.md):
scripted-first (unit + fuzz + tagged e2e per step; full sweep pre-
release), and every build step ships with its e2e scenario.

Server is the sole value authority (client-sent values ignored) ·
notation re-parsed server-side, never trusted from the client ·
canonical form is a tested byte-stable fixed point · every rack
transport fails closed on hostile input (the YAML parser names the
line; migrateGroup drops what it cannot read, never the pool) ·
static-hosting solo works completely · the capability matrix is one
shared code path, not parallel implementations · settings echo-
apply with no optimistic divergence · `cleared`/`exp` flags are
present-or-absent so plain payloads stay byte-identical · control/
bidi stripping is mirrored across all four layers with surrogate-
safe truncation (and `#` is banned from player names at every entry
point — whisper addressing must stay total) · `playerGone()`
rejoins only on unknown_player/room (never mints identities on
expected 404s) · broadcast already loops per-player (step 4's
redaction hook) · server-side per-recipient projection
(`projectEntryFor`) is the ONLY path a roll entry ever leaves the
server — every egress (roll broadcast, POST responses, reveal,
hello, `/api/join`, shelf/log resync) goes through it · redaction
is **absent data, never hidden data**: a redacted or omitted
projection carries no values for a client to decline to render ·
whisper audiences pin `playerId`s at roll/offer creation (a rename
never changes who may read a roll; unknown names fail closed as
`unknown_audience`) · reveal is authority-checked server-side
(`revealAuthority`, 403 `not_reveal_authority`), never gated by
which client drew the button.

---

## Tier C — the landings (C6–C9)

### C6. `Clear history` orphans the shelf — SHIPPED

*CUJ9.* `clear-log` is `log = []; renderLog()` (js/main.js:10341-10345) and
nothing else — but `log` is the **backing store for every shelf read**:
`renderShelfMarkers`, `glowTint`, `renderPeek`, the tweak popover. With
`entry === null` a shelved roll's peek reports it as *hidden* when it is
merely unlogged, its header degrades to "collected roll", its total to `?`,
**and the entire fold — the named `✕ Clear` primary and Reveal — is never
built**, leaving only the undocumented body-click. Every marker title
collapses to "Collected roll" and every glow falls back to one gold, so
colour attribution goes uniform. One click makes five shelved rolls
anonymous, unreadable, unrerollable and strips their advertised control.

The same handler skips `updateLogDroppedNote()`, so the flyout shows "No
rolls yet." and "37 earlier rolls rolled off the end" simultaneously.

**SHIPPED 2026-08-08.** The shelf goes with it. Clearing history is
housekeeping on the table's *record*, and the markers are that record's dice
— leaving them behind is not "keeping" them, it is keeping five discs nobody
can read. `logDroppedTotal` resets with the thing it counted, the peek closes,
and the sweep is announced. Pinned by `clear-consequences`, verified to fail
without the fix.

### C7. `Clear table` wipes five people's evening — SHIPPED

*CUJ9.* `handleClear` (server.js:2301-2319) has **no authority check** and
sets `cleared` on every uncleared roll in `room.log` — the felt *plus every
shelved roll from every player*. It broadcasts `{playerId, playerName}` and
the client throws both away (`case 'clear': clearTable(); break;`). It is
bound to an unmodified `c`. There is no `confirm()` anywhere in main.js.

The asymmetry names itself: **deleting one pool from your own rack has an
undo tombstone (U28a); wiping five players' shelves has nothing** — not a
confirmation, not attribution, not a way back.

**① SHIPPED 2026-08-08.** The broadcast always carried `{playerId,
playerName}`; the client now reads it. A neighbour's sweep says who, on the
pill and to a screen reader — and is deliberately *not* narrated back at the
person who pressed it. New `#status-pill.notice` dress: `.refused`'s shape
(a sentence, not a shout) without the lie in the class name.
**② SHIPPED 2026-08-08** (Joe's call: scope split, arm the wide one). One
press clears **yours** — instant, and what almost every press means. When
other people's rolls remain it **arms in place** for the wider sweep, same
two-tap grammar as the rack's delete, disarming after 4 s; skipped entirely
when your rolls were all the rolls, because pressing twice to clear a table
you are alone at is a toll rather than a safeguard. `c` routes through the
button, so the key and the control are one path and the arm is not
mouse-only.

The server takes a `scope` and **gates nothing** — goal 10 means there is no
permission to check, so the arming is a courtesy to the presser, not an
access control. The broadcast now names the cleared rollIds, because a scoped
sweep cannot be re-derived from `clearTable()` — that call removes
everything, which is right for `table` and wrong for `mine`.

Still open, and small: **no "clear the shelf, keep the felt"**. Nobody has
asked for it; noting it so the absence stays deliberate.

### C8. The creation budget exists in code and never reaches a screen — SHIPPED

*CUJ6, the journey's stated done-when.* Shelves print a bare integer
(`shelfDiceValue`) with **no target, no over/under, no colour**. The prices
the journey is measured against — Attributes 9 pools/100 points, Skills
6/100, Motivations 3/30 — are in `js/seed.js` (`SEED_SHELVES`) and are
imported **only by tests**; main.js imports just the dealers. So "priced
against the system's creation budget" is currently served by the player
remembering 100 from a design document.

Partly tracked already as §2l ⑤ (the ledger sheet, "session-only target")
and ruled in POOL-ANALYSIS §9 ("the number `100` appears nowhere in code").
**The ruling and the journey are in tension** and that is the thing to
decide: a budget that cannot be shown cannot be spent deliberately.

**SHIPPED 2026-08-08 (Joe's call: the system profile names its budget).**
`SYSTEMS['soul-deal'].budget` sits beside the chart — the same place every
other fact of that rulebook lives, which is what makes it pluggable rather
than hardcoded (goal 6). Shelf heads read it through one accessor and print
`100/100`; a system naming no budget prints a bare total, which is what D&D
does. §9's ruling is **amended, not overturned**, in POOL-ANALYSIS itself:
what it protected — no Soul Deal rule scattered across render sites — is
intact, and the session-only half (no storage, no wire key, no portable
field) is untouched. Over-budget is the only state with a hue: being part-way
through building a character is not an error, and colouring it would nag at
every step of the thing the figure exists to help.

The budget follows the **profile's** system, like the trio shelves — a
character is priced by the rulebook it was built for, not by whichever table
it is briefly sitting at. §2l ⑤'s *typed* session target is still unbuilt and
is still the right home for "I am building to 80 tonight". Pinned by
`creation-budget`.

### C9. Four small preparation defects — SHIPPED

- **The `dice value` caption never renders while you build your first
  character.** The rack figure builds only under `!foreign && poolsEdit`, and
  the head is hidden unless `.foreign` or `.profiled` — and `.profiled`
  needs *more than one* profile. A player with one profile gets unlabelled
  integers on shelf heads. `rack-dice-value` passes anyway because it reads
  `textContent` through `display:none`. **UX.md and the stylesheet both still
  assert the figure "never reaches a screen"; since `.profiled` landed that
  is only true at a library of one, so two comments are wrong today.**
- **`Apply to table` hands out a stale snapshot.** It reads the textarea,
  which refills only on first open of the pane, on *Fill with my data*, or on
  *Open file*. Edit a character after opening the pane and the room silently
  gets the pre-edit set. `Download`, in the same row, calls `portableSnapshot()`
  live — so two buttons an inch apart disagree about what your data is.
- **`⚄ Random` ignores the name you just typed**, while `＋ New` (which reads
  it) makes an *empty* profile. So the realistic six-character path is Random
  → rename, every time. Related: the picker's `＋ New profile…` creates
  nothing — it opens Settings and force-expands the unrelated YAML pane.
- **`ensureTrio` was promised system-aware and is not.** It forces
  attributes/skills/motivations into every rack in manage mode whatever the
  profile's system — PROFILES §11.6 names exactly this: *"a D&D rack in manage
  mode would stand three empty Soul Deal shelves. It becomes system-aware."*

**SHIPPED 2026-08-08.** All four. Notes worth keeping:

- The head gained a **fourth** reason to stand (`.ledgered`) rather than a
  looser gate. §11's `.profiled` had already narrowed this bug without fixing
  it, leaving it aimed at the player holding one profile — i.e. exactly the
  person building their first character. `rack-dice-value` is re-pointed at
  **computed display**: it passed for weeks reading `textContent` straight
  through `display:none`, which is the failure §7.21 already named.
- The head now hides its region NAME when it stands only for the ledger.
  Otherwise manage mode printed "SAVED POOLS" one line under the section
  bar's "Pools" — §7.23's own rule, broken by the fix for something else.
- `Apply to table` re-snapshots **only when the box still holds exactly what
  we put there**. Always re-snapshotting would silently discard an opened
  file, which is the worse failure by a distance; a hand-edited box goes as
  it reads.
- The trio follows the **profile's** system, not the table's — a D&D profile
  briefly sitting at a Soul Deal table is what the mismatch banner is for, and
  it must not also grow three shelves its own system never had.
- Pinned by `prep-affordances`, verified to fail without the fixes. It also
  surfaced a latent fragility: `panel-anatomy` asserted the head is absent
  while *inheriting* a library from whatever ran before it on that origin.
  Both scenarios now establish their own state.


## Tier C — the landings (C17, C21, C23)

### C17. The table offers what the players hold — no push — SHIPPED

*CUJ6/CUJ7, Joe 2026-08-09: "I was imagining a simpler approach where all
profiles are available for use when joining a table… all profiles available
for now, we can refine visibility later."*

The organizer's headline act — **hand these characters out** — was five
gestures behind a YAML textarea: Settings → Your data → `Export / import…` →
`Fill with my data` → `Apply to table`. A developer-shaped door on the most
important verb in the preparation journey.

**SHIPPED 2026-08-09.** A player's whole **library** now rides the publish
their active rack already rode, and a table offers what the people at it are
holding. The organizer builds six characters and sits down; the table offers
six. Nothing is pushed and Settings is never opened.

**Per-player, not folded into `room.setup`.** Setup carries a rev and a
conflict rule because it is ONE shared object — six players publishing into it
would take turns replacing each other's characters. This rides `handlePools`'
shape instead: a field on the player, broadcast when it changes, with the
existing no-op guard extended to cover it. That shape already scales to forty
streams.

**Two sources, one list**, and they do different jobs: `room.setup` is what a
FILE prepared the table with and survives everyone leaving (SETUP_TTL_MS);
live libraries are zero-effort and leave when their owner does. Setup wins a
name collision — it was chosen deliberately for this table, a live library is
whatever somebody happens to be carrying. `tableOffers()` is the one merge,
used by the seat door and the in-room list alike, so a seat the picker offers
is always a seat the door can open.

The ACTIVE profile publishes from `groups` (the live rack) rather than its
stored copy: an edit in progress has not been written back, and offering
yesterday's version of the character you are visibly editing is worse than
offering none.

**Visibility is deliberately wide** — every profile, to anyone with the link.
Joe's call, explicitly for now. The narrowing belongs in one place when it
comes: the `sanitizeProfiles(body.value.library)` call in `handlePools`.

The YAML path is untouched and still does table settings + seats, because a
file is the only thing that crosses a browser or outlives a room. What changed
is that it is no longer the ONLY door.

Pinned by `library-is-the-seats`, verified to fail when the server stops
merging live libraries. `setup-repush` re-pointed from `deepEqual` to
`includes`: asserting the exact seat list there would now be asserting that
nobody is sitting at the table.

### C21. The dice are too small, especially on a phone — SHIPPED

*Joe 2026-08-09: "I want to see the dice more closely, particularly on
mobile… maybe make what is currently the closest setting the widest setting
and make the medium and close setting even closer."*

**SHIPPED — the whole ladder moved one step in.** `wide` is byte-for-byte the
old `close` (18×11) and the two below continue the ladder's own ×0.78 pitch:
`medium` 14×8.6, `close` 11×6.7. **`medium` is the new default**, because
leaving it at `wide` would ship the view a player previously had to go and
choose.

**Why the mat and not the camera.** The mat is the PHYSICS WALLS and must be
identical on every client — a seeded roll replayed against different walls
lands differently — so it cannot vary by device. And `applyCameraFraming`
only ever pulls the camera BACK from the preset until the mat fits, never
closer. A smaller mat is therefore the one lever that makes dice bigger, and
it shrinks the shelf with it (slot pitch derives from `TABLE_W`), which is
what forces the retreat on a narrow screen in the first place.

**Measured** (`__diceDebug.zoomProbe()` — a unit-radius span at the mat's
centre through the live camera, so it accounts for preset, viewport and
framing retreat at once), in CSS px per die:

| | wide | medium | close |
|---|---|---|---|
| desktop 1440, rail | 124 | **160** | 203 |
| desktop 1440, panel open | 107 | **138** | 175 |
| phone 390, rail | 38 | **49** | 62 |

**The mobile gap that remains is structural, and worth naming.** A phone is
portrait (≈278×844 of canvas beside the rail) and the mat is landscape, so
WIDTH binds and the camera retreats hard — `camY` 40 on a phone against 12.9
on a desktop at the same preset. Closing that would mean either a
portrait-shaped mat (a room-wide setting every client shares, so a mixed
phone/desktop table would have to agree) or framing less than the whole mat
(dice can land at any wall, so cropping loses them). Both are real options
and neither is free; not taken here.

One thing the measuring turned up: with the panel OPEN a 390px phone leaves a
**74px** canvas, and the camera retreats to `camY 62`. The boot rule already
collapses the panel under 640px, so a real phone gets the rail — but any
future affordance that opens a region on a phone should know it costs four
fifths of the felt.

`zoom-syncs` re-pointed to read `ZOOM_PRESETS` through a debug accessor
instead of carrying its own copy of the numbers: a scenario that hard-codes
the ladder asserts a decision rather than a behaviour, and fails on a retune
that is working exactly as intended. What it is for — every client agrees,
the walls and shelf pitch follow the setting — is what it checks now.

### C23. Three things a phone showed — SHIPPED

*Joe 2026-08-09, with a screenshot, once mobile was working again.*

- **The dice were still too small.** The whole ladder moved in one more step:
  each level became the next one down (`wide` and `medium` are the previous
  `medium` and `close`, values already looked at) and a genuinely closer
  `close` was added below. Default stays `medium`. Measured die span on a
  phone with the rail: **40 → 49 px**.
- **The result panel ran off the right edge**, with its outcome words cut in
  half. Two separate causes, both about measuring the wrong thing: the card
  was bounded by `100vw` while being centered on the **felt**, which beside
  the panel is ~278px on a phone — so a 320px floor produced a card wider
  than the surface it sits on. And inside it, the ledger's label spine is an
  `auto` column that takes ~90px for a word like STRENGTH, leaving too little
  for `d8 7 Success & Bonus`. Below 560px the spine now stacks above its row,
  and the longest reading wraps rather than truncating — a chip is `nowrap`
  because a split phrase reads worse than a narrow one, but that only holds
  while the alternative is SHORTER, not CUT.
- **The felt's standing vignette is gone.** `radial-gradient(ellipse …)` sizes
  to its box, so the same declaration was a soft corner-darkening on a wide
  desktop felt and a visible oval with an edge on a tall narrow one — two
  pictures, one of them designed. The ceremony's own vignette stays: a
  transient beat with a reason to be seen, not standing furniture.


## The settle/physics campaign — C30, C31, C32, C33

### C30. The wiggle was a predicate — **SHIPPED 2026-08-10**; two threads left

*Joe 2026-08-10: "there is a very slow, very shaky process by which the dice
then slide and wiggle-move until they are stable. It can take quite some time
and it's super awkward to watch."* He asked whether to change the collider
shapes and said that, forced to choose, he would accept dice repelled by
boxes slightly larger than themselves.

**No shape change was needed or possible in that direction.** The colliders
are exact convex hulls off each die's render mesh. The tail was mostly a
still table: a die judged cocked was refused a freeze and sat motionless to
`SETTLE_CAP` = 9 s. 15 of the 17 dice that reached the cap across 36 throws
were not moving. Shipped: `cockedDot` 0.82 → 0.6 and a tail cut that
credits a timed-out die with its last moving frame. Soul Deal −12%, 20d6
−14%, caps 13/16 → 4/16. The felt contact numbers were measured, win far
bigger, and are held back — see C30c. Full account in UX §7.29; pinned by
`settle-tail`; priced by `tools/steps/settle-paired.mjs`.

**What shipped does NOT fix: the shakiness itself.** Joe's word was "shaky",
and the reversing is caused by the absent damping — the shipped subset moves
`shake` by 0% to −4%. The worst throws got much shorter; the dithering is
untouched. That is C30c.

**C30c — the felt tuning is measured, wins big, and is blocked on the spawn.**
Grip 0.6 / bounce 0.15 / damping 0.1/0.14 buys Soul Deal −43%, 20d6 −1.63s,
**and 20–38% less shake — the only thing that touches the dithering at all.**
It is not shipped because it PILES: on this mat sliding apart is how dice
separate, `spawnDie` spreads a throw by `min(TABLE_W - 4.4, count × 2.6)`, and
at `medium` that clamp bites hard (TABLE_W 8.6 → six dice start 0.84 apart
when the spacing wants 2.6). Stop the skid and they stop on each other: at
`close`, 6d6 went 17% → 33% of dice piled, 3 clean throws in 10 → 1.
`dice-land-flat` caught it (3 failures in 13 runs vs 0 in 8 on the parent) —
the C24 floor working. Halving the damping did not halve the piling, so this
is not a knob-tweak. Priced by `tools/steps/pile.mjs` and `settle-paired.mjs`.

**C30c, pass three (2026-08-10) — still not shipped, and the story has
changed.** `tools/steps/settle-matrix.mjs` now judges shake, duration, caps,
piling, creep and the clock together on 16 paired seeds behind a canary that
refuses the run if the rig cannot reproduce a known answer. Four things it
established, none of which were the "wider spawn" the paragraph above
predicted:

- **The shake win is restitution, not damping.** Deadening alone is −23% to
  −37% shake on every multi-die pool; speed-gated damping alone is worth
  ZERO. What the gate buys is the slow half (20d6 −22%, caps 7→2).
- **Deadening's duration cost is glide.** 8d6 on one 10-seed family: shipped
  2.13 s, deaden+gate4 3.71 s, deaden+**grip**+gate4 2.60 s. Grip recovers
  70% of it — restitution was where a die's vertical energy went, and
  removing it leaves the skid on a floor of friction 0.25. **This closes
  C30a**, which had guessed damping.
- **Deadening does not replay.** Throw a seed family, run 700 unrelated
  throws, throw it again: one seed in sixteen becomes a materially different
  throw (2.267 s → 2.600 s, 137 → 157 frames). That is the same disease that
  took the sleep raise off the table, it is independent of the pile work, and
  it disqualifies deaden on its own. `tools/steps/replay-drift.mjs`, with
  `sleepier` kept as the control that must fail. Nothing here is byte-
  identical across a tab's lifetime — even shipped moves rest positions by
  ~5e-6 — so the bar that means anything is whether duration or frame count
  moved.
- **The pile cannot be nudged away.** `NUDGE.pileScale` (shipped inert)
  refuses a freeze to a die resting above its hull's circumradius — the
  highest a convex die touching the felt can hold its centre, so the bar is a
  theorem rather than a fit — and hands it to the existing nudge. It recovers
  part of the medium regression (6d6 flat throws 17/40 → 22/40 against
  shipped's 33/40) and no more: at `close`, across 24 seeds, it takes a die
  off the pile ONCE, at 4.60 s → 8.73 s. On a crowded mat a hurled die comes
  down on another die. Pinned by `pile-refusal`; calibrated by
  `tools/steps/pile-bar.mjs`.

The candidate deaden+gate4+pile-nudge failed 4 of 7 gates (duration +67% on
8d6, piling +5pp at medium/6d6, wall clock 1.68×, creep +45%). **The open
rungs are grip and the throw target, not the settle predicate.**

**A bar worth reusing, and a caution.** `dice-land-flat`'s `y > 1.2` is the
d6 circumradius (1.169) and change — sound for the pools that scenario rolls,
a coincidence for anything else. A solo d20 was measured resting legitimately
at **1.190**. Any future check that calls a die piled by height should use
`restCeiling(type)`, not 1.2.

**C30d — the sim is in slow motion, the drift was cannon's sleep, and the
missing restitution threshold is not the fix (2026-08-10, pass four).**

*Joe: dice must "really magnetize themselves to the surface once they're
landed, no more bounding like they're on the moon."* Pass four took that
literally and measured two mechanisms. One is a theorem and works; one is an
emulation of a real engine feature and fails. The by-product is the answer to
why deaden could never ship.

**The moon is arithmetic.** `GRAVITY` is −110 in a world where a d6 is 1.35
units. A d6 is ~16 mm, so a unit is ~11.9 mm and 9.81 m/s² is ~826 units/s²
here. The world runs at 110 — **7.5× too weak** — and a trajectory's
timescale goes as 1/√g, so everything on this table falls, bounces and
settles **2.7× too slowly**. Joe's word is a correct reading of the number,
not a matter of taste. Corroborated: `NUDGE.lift` 7 buys 2·7/110 = 0.13 s of
hang time, which is a hop and reads as a float.

**And the minimal correct fix is not a physics change.** Newton is invariant
under t → t/k when g → k²g and v → k·v — identical curve, identical rest
pose, k× sooner. `playRoll` already bakes the whole throw into keyframes
before frame one, so the fix is a **projector speed on `stepPlayback`**: same
film, faster. No re-bake, no determinism risk, no pile risk. Shipped inert as
`TEMPO.k` (1 = byte-identical), applied only on a real-time frame — `tick()`
takes a `realtime` flag, `animate()` is its one caller, so `sim(n)` and every
e2e scenario keep stepping the film one baked frame at a time. Three theorem
checks (`tools/steps/tempo-check.mjs`):

- the **bake is untouched** at k=2 — tails (duration, frames, nudges, landing
  frames, sound count) identical 6/6, largest pose delta 5.25e-6 against
  1.10e-5 for a paired k=1 control, i.e. *less* than the tab moves it alone;
- **playback tracks duration/k** — worst deviation 2.0%, mean speedup 1.980×
  (measured in frames of real time under `holdClock`; this tab fires rAF at
  ~50 fps and without the hold every drain read 2–10% short);
- **`npm test` 48/48 with the default left at k=2**, then returned to 1.

The click gate rides the projector too: `max(12, 35/k)` ms, so at k=1 it is
exactly the 35 ms that shipped and at any k the *same set* of impacts
survives — no landing thump can be dropped by construction. Past k = 35/12 ≈
2.9 the 12 ms hard floor bites first, which is above the 2.7 the arithmetic
asks for. **Ceremony beats are not dice**: the declare hold, the settle
phase, reveal flips, the sink, rest cadence, camera easing and FX lifetimes
all stay unscaled.

**The floor magnet fails, and on its own axis.** cannon-es has no restitution
threshold — Bullet and PhysX both zero restitution below an impact speed,
because a slowly-landing die sticks rather than bounces. `MAGNET.vy` is that
missing threshold (a die in floor contact rising slower than `vy` has vy
zeroed), shipped inert. At vy 1/2/4 over 16 paired seeds:

| | vy1 | vy2 | vy4 |
|---|---|---|---|
| shake, soul (16 seeds) | **+38%** | +29% | +27% |
| hops, soul (16 seeds) | **+13%** | +5% | +13% |
| dur, 8d6 (16 seeds) | +13% | **+47%** | +15% |
| creep, 1d20 (16 seeds) | +9% | +46% | +28% |
| pile, close/6d6 (**10 seeds**) | +0pp | +5pp | +5pp |
| replay, soul (16 seeds) | 15/16, **tail moved** | 15/16, **tail moved** | — |

*The pile row is a TEN-seed measurement and the rest are sixteen; the table
printed them side by side unlabelled, which reads as one run and is not.
`settle-matrix.mjs` takes the two counts as separate arguments, so any row
quoted from it has to carry the one it was measured at. At 40 seeds a ±2pp
pile difference is 5 dice out of 240; at 10 it is 1 or 2, which is noise.*

Every gate fails except the clock. The reason is that **zeroing vy does not
glue a die down**: the contact solver re-supplies the push on the very next
step, so the clamp trades one smooth ballistic arc for per-step chatter. In
this solver what the eye reads at rest is *contact chatter, not bounce*. It
also **adds** replay drift (seed 32676 comes back a 435-frame throw instead
of 450) where shipped's movers are pose-only at 5e-6 — the prediction that
quantising to zero would absorb float divergence is falsified. And
`settle-tail` names the damage in one line: *"2 dice stopped and were refused
a freeze"* — the clamp pins a cocked die before it can rock flat, recreating
the exact bug C30 shipped a fix for. `dice-land-flat` is 10/10 with it armed,
so the C24 floor survives; nothing else does.

**A new instrument: `hops`.** The count of separate times a die goes back UP
in its last 0.6 s, read off the baked keyframes in `restMotion` — the
complaint stated literally, where `shake` cannot tell a hop from a horizontal
jitter. Validated with a positive control: deaden moves it −17% to −38%, in
step with its shake win. So the magnet's flat reading is the mechanism
failing, not the meter.

**THE DRIFT IS CANNON'S SLEEP.** The pass-four result that matters. Deaden's
disqualification was that it does not replay. `tools/steps/replay-drift.mjs`,
16 seeds, 700 throws of churn:

| variant | replays | note |
|---|---|---|
| shipped | 14/16 | movers pose-only, 5.10e-6 / 5.25e-6 |
| deaden | 15/16 | mover 2.267 s/137 fr → 2.600 s/157 fr |
| **sleepoff** | **16/16** | byte-identical — *better than shipped* |
| **deaden+sleepoff** | **16/16** | byte-identical |
| deaden+sleepoff+gate4 | 16/16 | |
| sleepoff+gate4 | 16/16 | |

`sleepoff` beating shipped **overturns a documented belief**: the ~5e-6 pose
noise was blamed on the SAP broadphase's axis list having seen a different
history (`pile-refusal`'s comment says exactly that). It is the sleep
decision. The app already has its own retirement predicate — `stillTime >=
SETTLE_STILL`, then `freezeInPlace` — and cannon's sleep is a *second*,
independent one running underneath it, the one that cannot be reproduced from
a seed.

**Which reopens deaden.** What sleep-off costs is the slow half (soul +31%,
caps 7→11), and that is exactly what the damping gate was measured to buy
back. `deaden+sleepoff+gate4`: **shake −21% to −34%, hops −19% to −40%** (the
best numbers measured anywhere on this table), **replay 16/16**. It still
fails on duration (8d6 +57%) and piling (medium/6d6 +8pp, flat throws 16/40
against shipped's 33/40), plus clock 1.64× and creep +45%. **Deaden's three
objections became four gates failing, not two.** This paragraph originally
said "down to two — glide and pile", counting only the two it had a story
for, in the same breath as naming the clock and the creep. Four of six gates
fail; glide and pile are the two nobody has an answer to, which is a
different sentence and the one that was meant.
`sleepoff+gate4` on its own is nearly free (dur −1%, caps 5/7, clock 1.01×,
pile +1pp) and replays 16/16, which makes it a *determinism* candidate with
no shake claim attached.

**Open rungs, in order.** (1) The tempo, which is done and waiting on an eye.
(2) `sleepoff+gate4` as a determinism fix on its own merits. (3) Deaden's
glide — grip was measured to recover 70% of it (C30c) and has never been run
with sleep off. (4) Deaden's pile, still unsolved; the nudge is the wrong
instrument (C30c) and the spawn geometry is the untried one.

**C30e — the terminator was the bug, and sleepoff's price was the terminator
leaning on the thing it removed (2026-08-10, pass five).**

The freeze predicate is `velocity² < 0.05` held for 0.45 s — speed under
0.224 units/s, roughly **nine times stricter than any shipping engine's rest
test**, and structurally the wrong shape. An oscillation has velocity at every
instant however small the excursion, so a dithering die cannot pass a velocity
bar however long it waits. What actually retires one today is **cannon's own
sleep**, which hard-zeroes both velocities underneath us — and cannon's sleep
flaps (a body re-enters AWAKE the instant combined speed crosses
`sleepSpeedLimit` once inside `sleepTimeLimit`, resetting its own timer). So
the app's retirement predicate has been leaning on the one mechanism that
cannot be reproduced from a seed.

`SETTLEGATE.mode = 'displacement'` is the standard answer — Eric Lengyel's
jitter-tolerant sleep condition (*Game Engine Gems 2* ch. 23), as shipped in
Jolt and in Rapier 0.35. Three points per die (centre of mass plus probes on
the local +X and +Y at the half-width, because **one point cannot see
rotation**), each growing an AABB; any box reaching `eps` restarts all three
and restarts the clock; all three inside `eps` for `SETTLE_STILL` means at
rest. `eps` is a fraction of the die's WIDTH, so a d4 and a d20 are judged by
the same visual bar. Shipped inert (`velocity` = byte-identical).

**The eps sweep**, 16 paired seeds behind a passing canary:

| | soul dur | 8d6 dur | 20d6 dur | caps (of 80) |
|---|---|---|---|---|
| shipped | 2.26 | 2.42 | 6.58 | 7, of which 6 on 20d6 |
| eps 0.01 | −23% | −15% | +2% | **5**, of which 5 on 20d6 |
| **eps 0.02** | **−37%** | **−23%** | **−47%** | **0** |
| eps 0.05 | −45% | −38% | −71% | 0, but pile +3pp |

0.01 of a die-width is *under this solver's own contact chatter*, so the box
never holds and the cap fires anyway. 0.05 wins biggest and starts piling.
**0.02 is the pick.**

**And the headline.** `sleepoff` alone reproduces its known price exactly —
soul +31%, caps 7 → 11 — and pairing it with the box test **inverts** that:
soul −35%, 8d6 −28%, 20d6 −43%, caps 0. The +31% was never sleep-off's cost.
It was the freeze gate's dependence on the sleep it was removing, which is
what pass five was written to test. `gate4` on top is **not** wanted: it
pushes close/6d6 to +5pp with the flat count 3/10 → 2/10.

**What it costs, honestly.** Two gates do not pass and neither is dismissible
by assertion:

- **Creep +114% on 20d6** — and the meter's anchor moved. `creep` reads the
  0.6 s BEFORE each die's settle frame, so retiring a die sooner drags the
  window back into the tumble. Asked *forward* instead of backward, the same
  throws move their worst die **0.0200 of a die-width** over the window that
  earned its freeze, with **zero** clean freezes over the bar; shipped's worst
  is 0.0279 with three, and `sleepoff`'s 0.0319 with four. The end-of-film
  discontinuity gets **smaller**. `endDisp` is not a self-report: `settleProbe`
  re-derives it from the baked keyframes and the two agree to 6.6e-16.
- **Pile +2.5pp at close/6d6 over 40 seeds** — 55 dice of 240 against
  shipped's 49, with the flat-throw count level at 6/40; and medium/6d6 8 →
  13 of 240 with flat 33/40 → 28/40. Real, and about a third of deaden's
  (+8pp, flat 33/40 → 16/40). The mechanism is plausible: a die that freezes
  earlier turns STATIC earlier, so a neighbour landing on it can no longer
  shove it aside. `NUDGE.pileScale` exists for exactly this and has never been
  run against a terminator this cheap.

**A one-frame bug found on the way.** `SETTLE_STILL` is 0.45 s and every
comment in `js/main.js` called that "exactly 27 frames". Twenty-seven
additions of 1/60 sum to 0.44999999999999996, which is under the bar — the
window is **28 frames**. Harmless to the sim (the loop is self-consistent) and
not harmless to anything re-deriving it: `settleProbe` disagreed with the
mechanism by 11% of `eps` until it was fixed.

### C31. The same values, a different film — master does not replay 20d6

**A live production bug, measured 2026-08-10.** Every client fast-forwards a
roll from its seed and must agree; `perf-determinism` compares two FRESHLY
LOADED tabs, so it cannot see a divergence that only appears once a tab has
been open a while. `tools/steps/replay-drift.mjs` can: throw a seed family,
churn 900 unrelated throws, throw it again.

On **shipped master**, 20d6, 8 seeds, **4 of 8 come back a materially
different throw**:

| seed | before | after |
|---|---|---|
| 1000 | 4.683 s / 282 fr | 5.333 s / 321 fr |
| 8919 | 5.5 s / 331 fr | **8.55 s / 514 fr** |
| 16838 | 3.217 s / 194 fr | 3.0 s / 181 fr |
| 24757 | 9.0 s / 541 fr | 7.067 s / 425 fr |

Two players an hour apart see the same declared values over a visibly
different throw — one of them watching three extra seconds of it. The cause is
cannon's sleep (C30d), and the cure is `allowSleep = false`, which needs a
terminator that does not depend on sleep to be affordable — C30e. With
`dispgate + sleepoff` the same families replay byte-for-byte.

**RESOLVED — SHIPPED 2026-08-11.** `SETTLEGATE 'displacement'` +
`BODYFLAGS.allowSleep false` are the defaults (with the tempo curve and
`NUDGE.pileScale 1.05`, Joe's A/B picks). Cleared by an adversarial pre-flip
audit that re-ran every pivotal number; the audit's three conditions (scenario
pins re-anchored to the shipped defaults, the matrix's creep gate replaced
with a forward bound on terminator rows, and the C33 ledger entry below) ship
in the flip commit.

**AND THE INSTRUMENT CAN REPORT A FALSE NEGATIVE, which is the part to
remember.** The pool-generalized runner throws soul, then 20d6, then 8d6, then
churns, then repeats — and in that shape shipped's 20d6 came back **8/8
identical**. Run 20d6 on its own and it is 4/8. The drift is a knife edge, and
how much unrelated history precedes a family decides which side it lands on.
**A passing drift run is weak evidence; a failing one is strong.** Judge a
candidate one pool per invocation.

### C32. If we ever replace cannon-es — the reserve position

**Not a plan, a bookmark.** Recorded 2026-08-10 so the next person who hits
cannon-es's limits does not re-do the survey. Two of this pass's dead ends —
the missing restitution threshold (C30d) and a sleep decision that cannot be
reproduced from a seed (C30e/C31) — are *engine* limitations, not tuning
problems, and both are solved upstream elsewhere.

**Sourced from a research sweep, NOT verified in this repo.** Nothing below
was built, benchmarked or vendored here. Treat every claim as needing
confirmation before a line of code moves.

- **Jolt** is the only candidate that is single-file vendorable, ships a
  tunable restitution velocity threshold (`mMinVelocityForRestitution` — the
  exact mechanism `MAGNET.vy` was emulating by hand and failing at), and has
  CI-verified cross-platform WASM determinism. Two blockers: the published npm
  package is **not** built with the determinism flag, so we would have to
  vendor our own emscripten build; and **JoltPhysics#2092**, a NaN-at-sleep
  bug, should close first. Wait for it.
- **Rapier** is rejected. Per-pair contact materials and per-body sleep
  thresholds are absent from the JS bindings — both are things this table
  tunes today (`cmFloor`/`cmDice`/`cmWall`, `SLEEP`) — and issue **#797**, a
  `setRotation` determinism problem, is open.

The zero-dependency rule (no npm installs, no build step) is what makes "a
single file we can vendor" a hard requirement rather than a preference, and it
is also why an emscripten build of our own is a real cost and not a footnote.

### C33. 20d6 at `medium` piles slightly more under the flip — the ledger entry

**Measured by the pre-flip audit, 2026-08-11, and shipped with eyes open.**
Paired 8 seeds, 20d6 at `medium` (8.6 × 5.2), dice above `restCeiling`:
shipped **80/160** → flip set **86–87/160** (+6, 4 of 8 seeds worse by one or
two dice; `pileScale` does NOT buy this pool back the way it buys 6d6 —
nudged dice land back on a mat that is already past capacity). The
counterweight on the same seeds: shipped ran **26 dice across 5/8 seeds to
the 9 s cap** (mean throw 8.37 s, ceremony beats declined on every capped
roll) versus the flip's **0 caps, mean 4.14 s**. Twenty dice on this mat is
past its flat capacity in BOTH worlds — the old build just spent nine seconds
grinding before freezing the same tower. The honest statement is "+6 piled
dice in 160, minus 26 cap-outs and 4 s of dead time"; the earlier claim
"candidate ≤ shipped everywhere probed" was false and is corrected here. If
20d6-at-medium flatness ever matters, the lever is spawn/landing geometry
(aimed slots, C30c's spread notes) — not the terminator, and not more nudge
budget (raising it to 8 changes nothing; there is nowhere flat to send them).

**C30b — 20d6 can still reach the cap with dice genuinely tumbling** (3 of 16
seeds). That is real motion, so shortening `SETTLE_CAP` would truncate it and
show dice snapping. Left alone deliberately. If big pools matter later, the
fix is a gentler nudge or a smaller spawn spread, not a smaller cap.

**What this cost to find, and the reusable part.** The first sweep was
unpaired and concluded the materials barely mattered — variance, on the
largest single win. `__diceDebug.throwSeeded(types, seed)` replays a fixed
tumble, so any future physics claim can be paired; do not price one without
it. Same rule as C25's: `settleProfile()` also reports what the *old* rule
would have played, so before/after comes off one simulation.


## Tier C — the landings (C18, C19, C20, C16, C10)

### C18. The result panel is too busy — SHIPPED

*Joe 2026-08-09.* Two cuts, both subtractive:

- **Drop `Save as pool…` from the result panel.** It was added in U13 to give
  "save what I just rolled" a door that was not an invisible 150px disc behind
  a right-click. That reasoning still holds for the *peek*, but on the result
  panel it is a third verb competing with the roll's own reading.
- **Stop printing the roll's text form in the panel's title.** Show **who
  rolled** and nothing else. The notation is already on the card body, in the
  log, and on the felt as dice; the title repeating it is what tipped the
  surface from "a result" into a list of facts about a result.

### C19. Buttons should not ask questions — SHIPPED

*Joe 2026-08-09, on C7's armed clear:* the double-press is right, the wording
is not. `Clear 1 more?` puts a question in a control. **Buttons guide, they do
not interrogate** — a question belongs in a modal, and this is deliberately
not one.

**SHIPPED 2026-08-09.** `Clear mine` → press → `Clear all`. Same two-tap,
same red escalation dress, no question mark. The COUNT moved to the title and
the announcement, where a number informs rather than interrogates — and the
title is where it has to live anyway, because the collapsed rail hides
`.cb-label` and the hover read is the only channel left there. Swept the rest
of the app's controls: this was the only one that asked.

### C20. `.hidden` is a class this stylesheet does not define — SHIPPED

*Found 2026-08-09 while rebuilding the join door.* `css/style.css` has a
global rule for the `[hidden]` **attribute** and **no generic `.hidden`
class** — every one is scoped to its element (`#settings-modal.hidden`,
`.popover.hidden`, …). So `classList.add('hidden')` on any element without its
own rule **is a no-op that reads exactly like a fix**.

Three were found in the seat modal alone: `#seat-someone` ("Someone else…")
had been visible every time the code asked it not to be, plus `#seat-list` and
`#seat-table-name`. Those three are now named individually.

**SHIPPED 2026-08-09.** 48 elements are toggled by class; **four had no rule**
— `#seat-someone`, `#seat-list`, `#seat-table-name` (named the day before) and
`#seat-preview-btns`, found by this audit. The last went unnoticed because its
PARENT `#seat-preview` has a rule and hides the whole block during the pick,
so the only visible symptom was the Apply/Not now row lingering after a seat
had already been applied.

The blanket `.hidden` stays refused, and `hidden-means-hidden` is what makes
that safe: it walks 35 elements the code actually toggles and proves each one
OBEYS — a rule-by-rule sheet stays honest by being checked, not by being
replaced. Two candidates the grep raised were false positives (`#draft-actions`
and `#strip-dc` hide via class-scoped rules; `#name-input` was a same-named
variable in another scope), which is the argument for testing computed display
rather than reading selectors.

### C16. Authoring a character crossed the Settings modal — SHIPPED

*CUJ6, raised by Joe 2026-08-09: "I'm not convinced a player preparing a game
for a group has a sufficiently easy process."* Counted honestly, preparing six
characters cost about thirty gestures **and six modal round trips**, because
the two halves of one job sat on opposite sides of one: Settings is
`position: fixed; inset: 0` with a blur — it **covers the rack** — so
"make a profile" and "build its pools" could never be seen together.

The picker's `＋ New profile…` was the sharpest instance: the one row that
promises a new character called `openSettingsAtLibrary()`, which opened the
modal **and force-expanded the YAML box**. It delivered a text editor.

**SHIPPED 2026-08-09.** `＋ New profile…` mints an empty profile under a dealt
name and takes it in hand, like `⚄ Random…` beside it already did. Renaming
moved to the rack: a `✎` beside the name on the region head opens an input
**in place** — Enter commits, Esc abandons. This does not fight PROFILES
§11.5 ③, which refused a rename field inside the *picker menu* because a menu
closes on focus-out; the head is standing furniture and does not close.

Two follow-on corrections, both found by looking:

- The `✎` first rendered as a **floating pencil with no name beside it**,
  because §11.5 ② hides the picker at a library of one. At rest that is still
  right — no new chrome for a player who never makes a second profile — but in
  manage mode it is wrong twice: the head is already standing for its ledger
  (C8), and the menu is the one place a *second* character gets made. So while
  you are deliberately editing a character, the head names it.
- That turned `.profiled` on and brought back **"SAVED…"**, truncated, one
  line under the section bar's "Pools". C9's rule had been aimed at the
  symptom (`:not(.profiled)`); the honest rule is that **your own rack never
  carries a region name at all** — only a foreign rack's head names anything,
  because the section bar names the region (§7.23).

Pinned by `author-in-place`.

### C10. The generic invite link never offers a prepared seat to a returning player — SHIPPED

*CUJ7, steps 2 and 7.* The picker is gated on `name && AS_PARAM`. With a
stored `dice.name.v1` and **no `&as=`**, `initNet` skips both `peekTable` and
`promptName` and joins straight through — no modal, no seats, no offer. The
player lands under their old name holding their old rack. Worse:
`unclaimedSeats()` matches seats against roster names, so if their stored
name happens to equal a prepared seat, **that chair vanishes from everyone's
rail** and the organizer reads it as claimed by someone holding none of its
pools.

U3 fixed exactly this bug class for `&as=` links and stopped there, while
UX §7.19 still says *"one link for everyone stays the primary form"* — which
is the link this breaks. ROADMAP L2 raises the question ("what arrival looks
like for a visitor with a stored name versus one without") and does not
answer it.

**Decided 2026-08-08 (Joe):** offer the picker when the table has **unclaimed
prepared seats** and you have not already settled a seat at this room — so an
ordinary re-open of a plain table still joins straight through, and a reload
after choosing or declining does not re-ask.

**FIRST ATTEMPT REVERTED THE SAME DAY, and the reason is the design.** The
gate was written against the pre-join peek's `seats` list, which made it fire
for *anyone* arriving at a prepared table — including **the organizer at the
table they just prepared**, and three scenarios hung waiting for a join that
never came. The word doing the work in Joe's ruling is **unclaimed**, and the
peek cannot know it: `handleTableInfo` deliberately omits the roster
(server.js:2540 — *"No players, no roster, no log, no offers"*), which is a
privacy decision, not an oversight. `unclaimedSeats()` can only run in-room,
after the join the gate is deciding whether to make.

**So the open question is where "unclaimed" comes from**, and there are three
answers, none free:
1. **Put a count on the peek** — `seatsOpen: n`, a bare integer, no names. The
   cheapest, and it discloses strictly less than the seat names the peek
   already carries.
2. **Offer on name-match instead of on vacancy** — if your stored name equals
   a prepared seat, that seat is *yours*; take it rather than shadow it. This
   also fixes the second half of the defect (a stored name silently claiming a
   chair on everyone's rail) and needs nothing new on the wire.
3. **Offer after joining**, as a dismissible in-room invitation rather than a
   modal at the door — no peek change at all, and it cannot hang a join.

(2) and (3) compose and are probably the answer together; (1) is the one that
touches the privacy surface. **Decide before rebuilding.**

**SHIPPED 2026-08-09 — option (3), with (2) folded in.** A standing,
dismissible **offer banner** in the panel, not a modal at the door. It cannot
block a join at all, which is the property the first attempt lacked, and it
serves every arrival rather than only the ones whose name happens to match.

The join stays exactly as it was: a stored name with no `&as=` still joins
straight through, and the pin asserts that no modal was added. What changed is
that the table now *says* it is holding characters — the switcher over the
rack has listed them since C17, and this points at it. Two exits: `Choose…`
opens that switcher, `Not now` is remembered **per room** so it does not nag
all evening.

**(2) is the banner's lead line.** `unclaimedSeats` matches prepared seats
against roster NAMES, so a player whose stored name equals a character
silently claims that chair on everyone's rail while holding none of its pools
— C10's second half. When the offer includes a character with your name, the
banner leads with it: *"**Bo** was prepared for you by Walter."* The collision
becomes the invitation.

(1) — a `seatsOpen` count on the peek — stays unbuilt and unneeded: nothing
here reads the peek, so the roster-privacy boundary is untouched.

Pinned by `table-offers-you`, which asserts the straight-through join, the
banner, the per-room dismissal, and the name-collision lead.


## Tier V — the landings (V1 audio, V2 motes)

### V1. Audio phase one — the pillar-sized gap, medium-large — SHIPPED 2026-08-12
The one BASELINE-tier hole in the audit (§5): mono today, no rolling
contact, no room tone, no space. Shipped: equal-power stereo panning by die
position · a rolling-contact loop (gain from load, rate from film-derived
speed — dice must sound like they tumble, not just land) · settling taps ·
a faint synthesized room tone · a delay-line "shaft" color on tower clunks.
All synthesized, zero-dep, film-deterministic; no convolution, no samples.

Design authority is now [AUDIO.md](AUDIO.md); the player-facing surface is
UX §7.32; the proofs carry tag `audio`. Eight increments, one commit each,
each with a red check recorded in its commit message.

**Three things the build found that the design had wrong**, kept here
because they are facts about this codebase rather than about audio:

- **`landings[].frame` is not when a die stops moving.** It is the
  *recovered* stop instant — the bake rewinds it by SETTLE_STILL from the
  freeze it earned — so ~27 frames of real sub-millimetre motion follow it,
  and on a 4d6 one die is still over the rolling EXIT bar afterwards. The
  phase machine's absorbing settle is therefore load-bearing, not tidiness.
- **The frozen tail is not in the film.** `frozenPose` is pushed by
  reference after a freeze, but the tail cut truncates the reel at the last
  landing, so the byte-identical frames a check might want to exercise are
  exactly the ones that were deleted.
- **A rolling voice's leak is only visible mid-roll.** The end of the film
  silences the pool on its own, so `settle() → clearTable()` is green with
  the teardown removed. The claim has to be made with dice still turning.

**Still open (phase two, none of it blocking):** hidden-transit rolling
voices (the shaft is silent apart from clunks); the rough/surface track
feeding wall-vs-felt *timbre* rather than only level; a stone-chamber tail
if the dry table ever asks for one (a shared send with `g ≤ 0.90`, never a
ConvolverNode). And the bed does not ship on by default until Joe has
listened to it for an hour straight.

### V2. Dust motes in the lamplight — small — SHIPPED 2026-08-15
The canon's highest-ratio atmosphere cue (audit §3). Shipped as
[js/motes.js](../js/motes.js): one THREE.Points draw call of ~130 additive
glints falling slowly through the mood lamp's cone, brightness-enveloped so
no mote ever pops, riding the accumulated-dt clock (holdClock freezes the
air). The impact-keyed particle contract stayed intact by staying out of
it; the smoke's never-additive rule does not apply because a mote is
visible *only* as scattered lamplight. Field is a pure function of a fixed
seed and the mood dials — every client breathes identical air, and lamp
dials move the cone and its dust together. Proof: `mood-motes` (tag `fx`),
sabotage-checked; dials live at `__diceDebug.motesTune/motesInfo`. The
band deliberately stops at y=10: motes higher up paint the black backdrop
and read as a night sky, not dust (A/B in the commit). Same-day owner
pass: Joe re-dialed the field room-wide and much fainter (peak 0.07,
rMax 12, count 200) and scoped it to HEARTWOOD ONLY — a registry family
trait (`TOWERS[id].motes`) set through towerSocket, so the dust rises and
settles with its tower and every other body of air stays clean.

### V4 (instrument). The frame's draw budget is now a number — SHIPPED 2026-08-17

Audit §10's first gap, and the reason it was not the one-liner it looks like:
**the obvious read of `renderer.info.render.calls` lies, and it lies in the
flattering direction.** three.js resets that counter *inside* every
`renderer.render()` (`if (this.info.autoReset === true) this.info.reset()`),
and js/post.js issues up to **eight** renders per frame — base, glow,
threshold, four blurs, composite. So a scenario reading it after a bloom frame
gets the **1 draw call** of the closing fullscreen quad and passes any budget
anybody could write. A green check masking a broken thing, pre-installed.

Three small hunks in `js/main.js` take the reset over:

- `renderer.info.autoReset = false` beside the renderer (js/main.js:655);
- `renderer.info.reset()` once per frame, inside tick()'s `if (render)` gate
  (js/main.js:8657), so the counters **accumulate across every pass** — and the
  2048² PCFSoft **shadow map is now in the total**, which the engine's own reset
  point deliberately skips (it resets *after* `shadowMap.render`);
- `__diceDebug.renderAudit()` (js/main.js:12512) — `calls`, `triangles`,
  `lines`, `points`, `passes`, `post`, `pixelRatio`, `programs`, `geometries`,
  `textures`.

**`passes` is there so the number can be disbelieved**, and the sabotage check
proved it is needed *and* corrected the contract that was written first. Flip
`autoReset` back to `true` and:

| frame | as shipped | sabotaged |
| --- | --- | --- |
| blackanvil + 4d6, plain | 186 calls, 1 pass | **81** calls, 1 pass |
| blackanvil + 4d6, post forced | 246 calls, 8 passes | **1** call, 8 passes |
| blackanvil idle, no dice, plain | 170 calls | **93** calls |

So **the anti-collapse floor belongs on a POST frame and nowhere else.** On a
plain frame the sabotage only hides the shadow pass — 81 is still far above any
sane floor, and a plain-frame floor would have been theatre. A ceiling-only
budget passes the sabotage on every row. The first draft of this contract put
the floor on a plain settled frame; it would have shipped green.

The same table measures something the default counter can never show: the 2048²
shadow pass is **77 of blackanvil's 170** idle draw calls, **45% of the frame**.
`pixelRatio` rides along for the same disbelief reason (see the wrong-claims
table: the clamp the audit called missing was never missing).

**The scene-wide sibling of `towerDressAudit()`, not a replacement.** That one
WALKS the graph and counts meshes — the dressing's static price, budgeted at
≤4k tris / ≤8 draws by `tower-dress-budget`. This one reports what three.js
actually *issued* for one frame.

**Measured 2026-08-17 by `node tools/steps/draw-price.mjs`**, which shipped with
the instrument and is the command behind every draw figure in this entry and in
ROADMAP V4 — after settle, headless, dpr 1 (draw calls do not depend on
resolution, so the figures port): empty felt **2**, a settled `4d6` on bare felt
**58**, `heartwood` **133**, `bastion` **141**, `blackanvil` **186**,
`nullstone` **68**, `hollowbole` **79**, and `blackanvil` with the post stack
forced **246 in 8 passes**. The step finds the worst tower itself rather than
trusting the list, then evaluates the proposed assertion and prints PASS/FAIL
per line, so the scenario can be written from a run instead of from a paragraph.

Two of those numbers are load-bearing elsewhere: 186-every-frame-forever is what
makes V4's idle throttle worth keeping, and 2-on-an-empty-table is what makes it
a LOOK question rather than a win.

*Note for whoever writes the assertion:* `sim()` ticks with `render=false`, so
the audit always reports the last **real** rAF frame — wait for a fresh frame
(`waitFor` on the audit itself) after changing scene state, and read after a
settle, since mid-playback frames legitimately draw more.


## Tier W — the landings (W0, W1, W3)

### W0. Research + concept — DONE 2026-08-15, JOE-APPROVED
Two dossiers (scratchpad/fae-research/ — grammar.md's sixteen rules and
four Vegas gates; techniques.md's fog/glow kit with two traps found in
post.js before they shipped), the venue spec draft
([FAE-VENUE-SPEC-DRAFT.md](FAE-VENUE-SPEC-DRAFT.md)), and four concept
plates from the gated lab (js/fae-lab.js, four rounds of iteration).
Joe: "That's awesome. I love them both" — BOTH palettes ship, as two
venues over one build. Tower direction: the rotted hollow trunk (a
natural shaft; foxfire is literally the glow of decaying wood; the moot
stages on it), with a mirror pool as glade dressing.

### W1. The venue mechanism + the set toggle — SHIPPED 2026-08-15
`VENUES` registry (table / moonrise / foxfire), `venue` as a room
setting (server SETTING_SPECS, the tower's unknown-id rule client-side),
a Venue picker in settings, and goal 13 enforced: while a fantasy venue
is active the felt/tower/dice-set pickers leave the panel, and selecting
a fantasy venue sends {venue, tower:'none'} as ONE patch so no client
ever pours through a tower another client does not draw. The W0 lab rig
is the interim stage — W2 upgrades fidelity in place. Proof: `venue-set`
(settings/fx/tower), sabotage-checked on the staged-means-in-the-scene
claim.

### W3. The fae tower — RESOLVED 2026-08-13: the shell is the first forge-baked GLB tower

**The route-1 ending.** The radius-field JS shell (route 2) landed on
2026-08-12 and its proofs went green, but Joe's verdict on the LOOK was
still open at the handoff (docs/handoff/2026-08-12-w3-hollowbole.md), and
his call came back: re-author through the forge, "mostly from scratch, an
organic looking model of the stump, turned into a dice tower in a clean
way". The clean way became a whole arc — **the TOWER_CORE v2 PORTAL
CONTRACT** (the handoff's own item 7, promised and now delivered; see
docs/TOWER.md "THE PORTAL CONTRACT" and docs/SHIPPED.md): a tower model
declares its dice-in/dice-out portals and the engine derives volumes,
film, colliders, camera and proofs from them, with the classic numbers as
the byte-frozen default spec.

The shell shipped after four review-gated bake rounds (form → roots/mass/
interior darkness → envelope fit + the cowl curtain → tongue value): two
palette variants from one deterministic recipe (`tools/forge/recipes/
hollowbole.py`, shared geometry digest, palette as bake input), 7.8k tris,
served from models/towers/ through js/towerglb.js, seated by the loader,
dressed through a raycast-synthesized surface descriptor so the
Joe-approved moot/attendants/door survived the shell swap (and the
θ-convention debt died with it — the moot gap finally faces front-left).
Battery: fit CLEAN (shell VENUE GROUNDS, tongue LIP CLADDING), occlusion
99/99 shaft+cowl at all six eyes (carried by the interior liner, seen
through the crown notches — see round 8 below for where the liner's top
ended up), probe matrix 6/6, pour 29/29, suite 48/48, tower tag 8/8 with
the new held-replay scenario. The original W3 text below stands as history.

**ROUND 8 (2026-08-14) — two objects deleted, and both were the proof's
fault rather than the model's.** Joe, at the round-7 frame: *"I don't
think we need the black cylinder visibly sticking out the top of the
stump."* It was the liner's cowl curtain, and it was carrying rays the
occlusion band fired at points ABOVE the declared rim — open sky over a
broken crown, where a die is still visibly falling in and is meant to be
seen. The band was mis-derived: it rode 1.6·S over the MOUTH, which is
inside the building for a hooded architectural tower and is weather for a
stump. `v.cowlY` caps it at a despawning die's top (`despawnY + 1.25`),
which lands 0.5 under the rim for every spec at the shipped S; classic top
sample 10.60 → 8.10, Hollow Bole 11.25 → 8.75; all four towers still
99/99 on both bands at all six eyes, and muting a shell still takes it
red. Then Joe, at the next frame I sent him without opening it: *"WTF?"* —
the black mass was mostly not the curtain at all but the code-side
`towerSkinLining`, standing in front of the baked trunk in both palettes,
on two numbers that were fine for a code shell and stale for a bake
(`yRing` 11.4 flat → follows `v.rimY`; the lining TUBE declined outright
by a baked shell, `SURF.liningTube === false`, because on the bake that
radius IS the outer wall). Found by hiding, not by reasoning —
`towerHideNamed()` is that idiom as a hook now. And the earth berm went
with them: it was doing four jobs (visible floor, dice ceiling, LID over
the hole beneath the ramp, bank of earth), the shelf Joe saw was job two
surfacing, and what actually held it there was the hole — which the wood
now closes itself with a 0.04-wide window, clamped between the ramp crest
1.046 and the throat floor 1.0875. Docs and the e2e claim closed
2026-08-14: `tower-roll` brackets `cowlY` against `despawnY + flight.r`
and the declared rim for every registered row (red-checked at 10.6 vs
8.25), and `tower-hollowbole` finally asserts the shipped venue tower's
own occlusion — 99/99 on both hard bands at all six eyes, red-checked at
53/99 — which until now only a test FIXTURE carried.

*(original entry, for the record:)* REGISTERED 2026-08-12, SHELL OUTSTANDING
`hollowbole` (`js/towerhollow.js`), the first `venueOnly` tower: no chip,
chosen by choosing the venue. Everything that is not the shell is done and
proven — the registry row and its hollow-log clunk voice, the lit door and
its ember light, `motes: false`, the server allowlist, the picker skip, the
crown moot and shelf fungus authored to the bloom threshold under BOTH fae
palettes, the scenario `tower-hollowbole` (tags tower/fx) with its red
checks, and the four contract proofs green.

**What is left is the SILHOUETTE, and it needs a technique this repo does
not have yet.** The owner's reference is a broken stump — stocky, a torn
frontal wound opening into black, splinter spires, heavy buttress roots,
pale barkless fibre — and `js/towerskin.js`'s vocabulary is boxes and
extrusions, which reads as a rectangular tower wearing bark. The shell is
isolated behind one function and one `(θ, y)` surface descriptor
(`buildLobedShell` → `buildHollowBoleSkin(v, { shell })`), named
`towerSkinBolePlaceholder`, so the parametric displaced shell drops in
without touching the moot, the door, the palette work or the proofs.
The general finding for docs/TOWER.md: the surface kit is ARCHITECTURE,
and organic forms want a radius field, not a box stack.

*(2026-08-12, recorded for whoever owns the shell: the missing technique
now exists in-repo. The forge pipeline —
[FORGE-BAKEOFF.md](FORGE-BAKEOFF.md), tools/forge/, the `/forge-model`
skill — was built exactly for organic-beyond-boxes, and its battery
includes a gnarled root-flared stump (tools/forge/recipes/B4_gnarl.py)
that is most of this brief. Two routes, owner's choice: bake the shell to
GLB (needs the app's first GLTFLoader vendoring — deliberately not done
yet, see tools/forge/README.md integration note), or use forge/Blender as
the ITERATION rig and port the converged radius/displacement field back
into the existing `(θ, y)` descriptor seam — zero new runtime deps, and
the field math is the same either way.)*


## Tier W — the landings (W2, W2b, W2c, W4)

### W2. The glade room — DONE 2026-08-13
The interim W0 rig upgraded in place at the resting eye (the frame a
player lives in), all four named dimensions: **horizon** — a wrap-safe
pale MIST BAND inside the treeline, whose void-coloured canopy against a
void sky over void-tinted fog had never read at any eye (the silhouette
finally has something to stand against, and so does the tower's dark
trunk); **atmosphere** — fog retreat to the spec's own numbers (22/60)
and real billow structure in the sheets (three octaves of wrapped blobs
over a continuous bed); **lighting** — the moonbeam narrowed from
frame-wide haze into a column that LANDS on the resolve area (grammar
12; a beam is visible where it ISN'T — probed by hide-one-at-a-time
before tuning); **surface** — two-scale moss and a clearing-detail
layer where grammar 14 puts the one place of detail. The moot re-staged
out from under the W3 tower (the W0 ellipse stood "where a tower will
stand", and then one did) onto the left flank, ring rotated so the gap
and the fallen cap face the clearing; and the MIRROR POOL — Joe's
approved W0 dressing, finally built — holds the right: night water a
step PALER than its banks (it mirrors the sky), the moon's glint a
broken column of wavelet dashes, unlit by design (a mirror's light is
its bake). Placement law ships as `venue-set` assertions off
`venueInfo().stage` — flank props dice-unreachable at their NEAREST
point beyond the widest back wall and clear of the tower envelope, beam
on the clearing, three dense sheets below every die top — red-checked
on the beam's old wrong position. `tools/steps/glade-look.mjs` is the
fast look loop with element forensics. Both palettes LOOK-gated at the
resting eye and in the spread; suite 48/48, tower+fx 15/15 with the
contract freeze untouched.

### W2b. Scene integration and the venue skill — TRACKED 2026-08-13 (Joe)

Joe's verdict on the W2 room, verbatim: *"The scene is arranged as three
set pieces… The tower, the mushroom ring, and the pool. They are good
set pieces overall, but the scene lacks integration. And setting them
next to each other in this way is simplistic. Please consider the visual
flow of the scene as a whole. You might need to research design a bit
for this and start to build out a venue skill that defines how to reason
about layout, flow… you did great on a theme and a color palette."*

So: theme ✓, palette ✓, **composition is the open craft.** The shape of
the work, in order:

1. **Research the discipline** — scene composition and visual flow for
   staged environments (leading lines, depth layering and overlap,
   grouping/rhythm vs. the three-islands failure, negative space, how
   ground cover and light carry the eye between features). Distill to a
   dossier the way fae-research/grammar.md distilled palette law.
2. **A venue skill** (`/new-venue` or similar) that encodes HOW TO
   REASON about layout and flow — the composition counterpart to
   `/new-tower`'s portal arithmetic: what gets placed where and why,
   what connects features (paths, spill, roots, mist gradients,
   shared edges), what the eye should do from the resting eye, and the
   gates that check it (occlusion/overlap between features, sightline
   probes, the placement law W2 shipped).
3. **Apply it to the glade** — integrate tower, moot and pool into ONE
   scene (candidates to evaluate under the researched doctrine, not
   commitments: moss/ground-cover gradients that flow between features,
   the moot's spill trailing toward the tower's roots, the pool catching
   the tower's silhouette, mist density carrying the eye, overlap
   instead of adjacency).

Sequenced AFTER W4 per Joe ("track these issues for later; go ahead with
the dice").

**DONE 2026-08-13 — all three steps.** (1) The doctrine is
[VENUE-COMPOSITION.md](VENUE-COMPOSITION.md): ten rules with CHECKs,
grounded in the one fact that makes them mechanical — a venue is a
DIORAMA, watched from one composed eye. (2) The skill is `/new-venue`
(eyes before opinions, diagnose by CHECK, triangle inside the placement
law, tissue in the stage's own idioms, both-palette LOOK, the trap
list). (3) The glade integrated per its own diagnosis: pool moved back
and out (7.2, −7.4 — bookend depth broken, background layer gains a
tenant), its glint re-aimed at the tower's foot (the one dissenting
arrow), a five-cap SPILL walking from the moot toward the root flare,
two connective moss lobes baked into the ground (socket→moot,
socket→pool), base transitions (damp pool margin, trampled court), and
the mist band's bites azimuth-weighted (thin at the circuit's release,
dense behind the pool). Placement-law claims held as inequalities off
venueInfo().stage — no scenario edit needed for the move, which is what
reading the contract instead of constants buys. Suite 48/48;
fx+settings 21/21; LOOK both palettes.

### W2c. Grown, not placed — the aesthetic goals (2026-08-13, Joe)

Joe's verdict on the integrated W2b room, verbatim: *"When I look at the
scene, I see three set pieces, the mushroom ring, the stump tower, and
the pond. They are placed next to each other in a line in the most basic
way. There is no aesthetic to it, there is no visual continuity
transforming them from set pieces into a unified scene with a flow. Part
of the problem is the seams around the stump. It's not part of its
environment. It lacks a convincing connection to the ground. It looks
like an item set on a table, not a stump that grew out of the ground. It
needs to either blend into the fog fully, or the ground needs to be
visible and it needs to better integrate with it via roots or something.
The other part of the problem is that the ramp out of the stump is not
part of the immersion and instead plays against it. Making it look like
part of the ground (dirt, maybe moss, maybe roots) that happens to be
placed in the right location, would work far better. It's also weird
that the exit hole extends below the ramp's highest point…"* And the
directive: *"use this information to build out the design aesthetic
goals for all venues so we track this for future builds."*

**The post-mortem W2b owes, recorded so the doctrine can absorb it:**
W2b moved features in PLAN, and the resting eye compresses the placement
law's back band (features live behind z −4.3 in a strip a few units
deep) into one horizontal screen band — so plan-depth moves cannot break
a line-reading. Rule 6's check was run in the wrong space. The levers
that exist at the eye are angular-size contrast, silhouette overlap,
terrain, and the untouched FOREGROUND band (in front of the front wall,
dice-free by construction). Fresh frames confirm the rest: the stump's
base meets the moss in a clean seam (the W2b lobes are too soft to read
at exposure); the baked wooden tongue reads as a gangplank propped
against a prop — round 4 already tried paint (make_tongue_paint, a 0.39
value drop) and a tinted prop is still a prop; the wound's ragged
threshold (0.90, teeth lower) shows below the ramp crest (sill 1.00);
and the pool is half-cropped out of the resting frame and near-invisible
in foxfire.

The work, in order:
1. **Doctrine** — VENUE-COMPOSITION.md gains rules 11–13 (grown-not-
   placed; engine furniture wears the world; the scenery tier) and rule
   6's check moves to SCREEN space; `/new-venue` absorbs them; GOALS
   goal 14 points at the dossier as the venue-scene law. Chosen fork of
   Joe's either/or on the stump: GROUND-INTEGRATION, not fog-blend —
   the tower is the hero (rule 1) and a hero dissolved into fog forfeits
   the frame. **DONE (1939666).**
2. **The stump grows its ground (hollowbole round 6)** — the model owns
   its transition: the wooden tongue re-authored as an EARTHEN BERM
   (crest exactly on the ramp collider plane inside the dice lane;
   lumpy wings outside it, pressed flush into the wound base so the
   below-sill rag is buried, not squared); root-flare fingers diving
   into the soil; moss-creep vertex color low on the trunk blending
   toward each palette's ground. Venue side: the contact ring retuned
   tight and dark, a disturbed-soil ring. **DONE (d088bf9 + promotion).**
   A first candidate re-built the RAMP with parapets and was rejected at
   review (Joe caught it live); the accepted mound is a heightfield with
   the lane carved through it — the trap and construction are recorded
   in the recipe header and the skill.
3. **Re-flow at the eye + the scenery tier** — the pool into frame and
   up a value step; angular-size and overlap contrast between the
   three; foreground-band scenery (dark tufts, a stone, framing the
   bottom corners) and mid-ground connective bits (a fallen mossy
   branch, bank stones) — value-quiet, zero new sources; every moved
   placement lands as a documented new claim in `venue-set`.
   **DONE (c4c2f17)** — with a probe-driven correction: `worldToScreen`
   showed the resting eye crops nearly the whole front band, so the
   fore tier is ONE bottom-left corner wing (near-corner legality =
   outside the dice BOX, past the front wall OR the x wall).

**Two bugs the round surfaced, both fixed with red-checked claims:**
- **The palette flip that never re-dressed.** The two fae venues share
  tower id `hollowbole`, so a palette change queued no socket and the
  moonrise model stood in the foxfire world — invisible for two rounds
  of pale wood, loud the moment the berm carried baked soil. Fix:
  `towerReskin()` — visual-only in-place skin swap on venue change
  (variants share portals + geometry digest, so bodies and the film
  never move), guarded by a portal-match refusal. `venue-set` asserts
  the berm's baked vertex-color means DIFFER across the flip (identical
  means was the smoking gun) and that no body moved.
- **The grounded env on venue towers.** scene.environment stays the
  grounded room's env in every register, and a dark surface is mostly
  reflection — the berm (albedo ~0.025) took a visible foreign blue
  cast at the C5 house-rule 0.45. Fix: `towerEnvPolicy()` — 0.45
  grounded, 0.08 fantasy, applied at socket + reskin, asserted by the
  audit's offPolicy check from the same function.

**Ledger — next tower round (not W2c):** the pale MACHINED FACE at the
shell's x-clamp plane (x 3.13, y 0.70–0.85, z 0..−0.4) reads as a sawn
plank in side views; pre-existing (round 5 renders it identically,
A/B'd), and more visible now that everything around it is organic.

### W4. The dice set — DONE 2026-08-13 (pending Joe's LOOK verdict)
Moonmoot Witchlight (THEMES.md §10; js/themes.js): tumbled labradorite,
all the light in the deep-carved numerals — "rune glow" delivered as
carving + witchlight rather than a runic alphabet (a recorded refusal:
the legibility invariant outranks the brief's word, and the glyph
library stays the later slice themes.js already names). One set serves
both skies (its digit color sits between the two palettes' rims). The
venue STAGES it at roll creation — venueDiceSet through wireSet/
rollSetOf/draftDieSets, the GOALS 13 punt delivered — so the roll
RECORD carries the set: replay, late joiners and every client agree off
the record, dice on the felt keep the skin they landed with, and your
own choice resumes with the room. `venueOnly` (no chip anywhere) and
`fog` (per-set venue fog breath) joined the recipe language. Voice: a
long cold chime, reasoned and NEVER LISTENED TO (Joe's dial, same
ledger as every tower clunk). Die lights deliberately absent: the venue
lights its dice (followers, halos, fog) and a set light would
double-glow — restraint recorded in the recipe. Proof: `venue-dice`
(record-level, both tabs, release-on-exit, picker refusal),
red-checked; suite 48/48; fx+settings+tower 23/23. throwSeeded now
records the set a real roll would (absent for std — every existing
record byte-identical), so look-drivers photograph the product's dice.


## Tier W — the landings (W5, the living layer)

### W5. The living layer — BUILT 2026-08-13; its own LOOK read still open (see W7)

The glade is inhabited, and it minds the table. [js/faelife.js](../js/faelife.js)
is venue-generic — a FIELD of fireflies that says the place is alive and
a WISP PROCESSION that says somebody lives here — and the glade supplies
only composition data: four zones where life is legal, and a ten-waypoint
route that rides the eye's own circuit (rule 7). The vacated moot stays
vacated and gains VISITORS: a pulse travels cap to cap, the fallen one
answers out of turn, and the ring lifts when the procession is standing
in it. Doctrine is [VENUE-COMPOSITION.md](VENUE-COMPOSITION.md) rule 14.

**THE ONE LAW: nothing alive ever crosses the dice box** — held by
construction, not by good waypoints. Members are seated outside the
widest mat's walls with their own wander included, a runtime clamp
backstops the seat, and both counters must read zero. Rule 1, goal 15 and
the placement law collapse into that one sentence.

**The budget shaped it more than taste did.** A census counts NINE
countable sources against a ceiling of nine, and two glow hues plus one
warm accent against a limit of exactly that — so the field is tertiary
and grayscale-per-point (the hue lives in one material, which is what
keeps a field exempt from the count), and the wisps are a procession
rather than a swarm: one bright lead, which REPLACES the lead the stage
has carried since W0, plus three followers at the field's ceiling. Net
new countable sources: zero.

**The governor** is what makes it serve the roll instead of decorating
it: the glade withdraws while the film runs (fast — startled is quick)
and leans back in once dice are readable (slow, cautious), where the lean
is dwell and value on the route's near arc and never a step toward the
table. One crit beat, keyed to `entryCritCeremony` and never `entryCrit`
— U18's lesson is that a per-die system calls about half of all pools a
crit.

**Two findings worth more than the feature.** (1) A TIER IS A LUMINANCE
and an authored scalar is not one: the field was written at 0.22 "against
a ceiling of 0.25" and rendered at 0.09, because the palette's teal
carries a luma of 0.416 — two thirds of the budget unspent, and the gate
would have passed it (rule 8 as amended; the probe now reports the
product). (2) A `THREE.Points` size is world units scaled by
halfHeight/depth, so 0.20 at ~17 units is about two device pixels: the
census said fifty-one lit fireflies were in frame while the frame showed
two, and no brightness change was ever going to fix it. A size ladder at
0.2/0.5/0.9 picked 0.5 — 0.9 makes blobs that contest the moot's caps.

**Three bugs it surfaced, none of them W5's:** the stage clock never
reset across a restage (so a client that had toggled venues breathed
differently from one that had not, and no screenshot after a toggle
reproduced); a POURED die parked inside the tower was lighting a fog
pocket from inside the trunk; and the sixth halo slot had been built and
never written to on every fae frame since W0.

Proof: `venue-life` (tags fx, settings) — the law over every member at
six points around the route, the tiers as RENDERED, the sim-clock freeze,
a re-staged glade breathing identically, the governor under a seeded
throw, the ring waking and quieting across a lap under the bloom
threshold, and the two skies dressing the life differently (the P9
content check — every other number the hook reports is
palette-independent by construction). Six red checks recorded in the
commits. `tools/steps/life-look.mjs` is the look loop: a static room is
fair to photograph once, a moving one is not.


## Tier T — the landings (T1, T2, T3, T4, T14)

### T1. `TABLE_D` drifts a float on every tower swap — FIXED 2026-08-13
Found by the occlusion probe, not by a failing test. `towerDeepenMat(+4.5)`
followed by `(−4.5)` did not return: at 'medium' the mat came back
6.699999999999999, one ulp low, once per unsocket. z0 is −TABLE_D/2 and z0 is
the anchor every volume, collider and keyframe hangs off, so two clients with
different socket histories could bake one seed against interiors differing in
the last bit — goal 15's exact failure, hidden because `applyZoom` re-assigns
`TABLE_D` from the preset and every ONLINE client takes a zoom at hello.

Fixed as designed: depth is a SUM of named layers (`MAT_DEPTH` = base + socket
+ lab), re-derived by `towerMatDepth(layer, extra)`, which takes what a layer
IS rather than how much to add. Putting a layer away restores the base
exactly, and the sum's fixed order means a room reached by different routes is
the same double either way. It also closed a second hole for free: the LAB
used to undeepen by whatever its dial said later, so moving the dial
mid-session left the mat permanently off by the difference.

Two witnesses, both pre-existing and both moved from documenting the bug to
refusing it: `tower-glb-loader`'s restoration assertion was literally
`assert.equal(downExtents.d, 6.7 + 4.5 - 4.5)` — the hardest tab in the suite
(four towers, two tower→tower swaps, a lab cycle nested inside a socketed
tower) — and is now `deepEqual` against the preset; and
`tower-contract-freeze` went RED on `medium.none` and `close.none`. That
re-capture is the deliberate kind: 13 fields moved, every one of them by
exactly one ulp (max 8.9e-16), no field added or dropped, and every new value
is the exact preset-derived number.

### T2. The doorway ignores the portal it belongs to — DECIDED + FIXED 2026-08-13
**The decision: keep the knob and make it coherent.** Deleting `out.x` the way
`out.z` was deleted was the other honest end, and it lost: the freedom is
already 80% built — apron, lip, hood, exit spawn and the flight envelope all
follow `out.x` — so the bug was never the knob, it was three bodies that had
not been told. And it was not hypothetical: BOTH committed test fixtures
declare an off-centre exit (the portal-stress fixture −0.15, the min-tower
fixture +0.25), so each had a jamb standing 0.15–0.25 inside its own modelled
opening, where a die grazing the edge meets an invisible wall.

`doorL`/`doorR`/`lintel` now derive from `v.door.x`, written `anchor ⊕ delta`
like the rest of `towerVolumes` (`+ ox / 2` is `+ 0 / 2` at the classic spec,
and `x + 0.0` is `x`), so no classic body moved and the freeze needed only an
additive `door.x` re-capture — no value moved, proved by a key-by-key walk.
`tower-occlusion`'s doorway classifier follows the same centreline; its old
NOTE apologised for the mismatch and is now a statement of where the aperture
is. Red-checked by forcing `ox` back to 0: RED on the lintel and both jamb
edges.

**What this does NOT buy:** shipping a tower with an off-centre exit still
owes the probe matrix, exactly as an off-classic sill does. What is proven
today is that the door is coherent and that a 3d6 pour delivers through
`out.x` 0.25 (`tower-glb-loader`); a real off-centre product tower wants
`portal-probe` across seeds and pool sizes before the sill is called final.

### T2 (original entry, kept for the reasoning) — small, DECIDE FIRST
`doorL`/`doorR`/`lintel` are built centred at x=0 while the apron, lip and
exit spawn all follow `portals.out.x` (legal range ±0.75). The first tower
to use that freedom gets a doorway that does not line up with its own exit
lane. No shipped tower exercises it; `tower-occlusion` prints a NOTE when
`out.x ≠ 0`. Two honest ends, both cheap: derive the three bodies from
`out.x`, or delete the knob the way `out.z` was deleted on Joe's ruling.
Deciding is the item — keeping it means engine work *plus* a probe campaign
for off-centre exits, which is the cost the ±0.75 range was meant to buy.

### T3. Re-pin the two fixtures — and decide what the spec digest is FOR — SHIPPED 2026-08-13
Both proof fixtures were red, for the same benign reason: each was captured
in a worktree before the merge added fields. Re-pinned with a mechanically
reviewed diff — `git diff --stat` on the contract golden reads *0 deletions*,
and a walk over the old fixture confirmed **no value moved**, only fields
appeared. Three things came out of it that were not just a re-pin:

- **The freeze now runs on two axes.** Z0: three presets × {unsocketed,
  heartwood}, as before. SPEC: every OTHER registered tower at one preset,
  which freezes the portal spec each one asks for and the core derived from
  it. Hollow Bole was frozen nowhere at all until this; a baked row whose
  portals silently failed to load and fell back to the classic core is a
  different bug wearing identical volumes, and `source` (`model` vs
  `default`) is now frozen next to the numbers that tell them apart.
- **A new tower must be frozen too.** The registry is read live and every id
  must have a row, so registering a tower without capturing its contract is
  RED — with the message saying that this re-capture is the legitimate,
  purely-additive kind. Red-checked by deleting `wide.hollowbole`.
- **The spec digest stopped pinning DERIVED fields.** It covers the declared
  spec + source + limits only. An engine-constant change used to move every
  row at once on work that renegotiated no portal, and churn is how a gate
  gets re-pinned without being read. Derivation drift has two better owners,
  both byte-level: the freeze above (whole derived core, every tower) and
  `towerFilmDigest` (spec + volumes + POUR + the plan pourPlan draws).
  Red-checked: a declared `out.w` edit still reports `portals.out.w: 4.6 → 4.2`.

### T4. Split the cosmetic lane in the e2e suite — SHIPPED 2026-08-14
All four wants, and the fourth found something.

- **The `look` tag is enforced, not documented.** `runScenarios` reads
  `__diceDebug.diceEverMade()` from every tab after a `look` scenario and
  fails on any non-zero count — or on a counter it cannot READ, because a
  guard that passes when its instrument is missing is this project's
  dominant failure mode. `DICE_MADE` counts die BODIES at the three places
  one comes into existence (throw, pour, lab drop), which fails closed: a
  body built and never stepped still means dice were in play.
- **`tower-dressing`** (tags `tower`, `look`) holds the claims that moved out
  of `tower-roll`: 13s against 38s, and it covers every skinned row instead
  of every row-but-the-first.
- **The budget is an assertion**, and it was a wish: the day it ran,
  heartwood measured 11 dressing draw calls and bastion 9 against a written
  rule of 8. Triangles are fine everywhere (worst: hollowbole 2644 of 4000).
  See T14 — the two are waived by name AND by value rather than by raising
  the budget to fit them, and the waiver is self-cleaning (a listed row that
  comes back inside the budget FAILS, so a fix forces its line to be deleted).
- **Claims are aggregates** over the `towerSkin*` subtree, not named meshes.

Red checks, all three seen: a `look` scenario that rolls → RED; with the
scenario's own assertion removed, the RUNNER catches it → RED with the same
count; with the debug hook renamed away, the guard refuses to pass → RED.

### T14. RESOLVED 2026-08-14 — by moving the budget, not by merging the kits
The entry below is kept as written because its diagnosis was right and its
PRESCRIPTION was wrong, which is the more useful half.

Two things were found when the fix was attempted. **The plan rested on a
premise that is false:** "the kit already knows how to bake a shared canvas"
— it does not. `bakeWood`/`bakeStone`/`bakeEmber` each bake ONE canvas for one
purpose and there is no atlas anywhere; heartwood's props carry five distinct
materials and only `hang`+`coil` share one, so the whole available
same-material merge saves ONE of the three draws needed. **And the budget was
on the wrong noun:**

| tower | total draws | skin | dress |
|---|---|---|---|
| nullstone | 5 | 5 | 0 |
| hollowbole | 16 | 4 | 7 |
| heartwood | 49 | 30 | 11 |
| bastion | 61 | 46 | 9 |
| **blackanvil** | **88** | **75** | **5** |

A rule refusing heartwood's 11 dress draws while saying nothing about the 30
beside them was arguing about 22% of the cost — and it **passed blackanvil**,
the most expensive tower in the app, because its dressing is 5. Merging the
kits would have bought 3 draws out of 49, for an atlas pipeline that would
have to be written first, on two towers `/new-tower` calls "maintained, not
imitated".

So `tower-dressing` now gates TOTAL draws per socketed tower at **20** (set
from evidence: the most expensive honest tower is hollowbole at 16). The
dressing TRIANGLE budget stays where it was — that one is about art restraint,
not frame cost, and every tower has always met it. The three classics keep the
waiver discipline on the new noun: named, valued, may not grow, self-cleaning
(both directions red-checked). Their line now shows the real number, so nobody
reads "11" and thinks heartwood costs eleven draws. **Their fix is not a prop
merge; it is T15.**

### T14 (original entry, kept for the diagnosis it got right) — small
Found the moment T4 turned "≤ 4k triangles and ≤ 8 draw calls of dressing"
from a printed number into an assertion: heartwood's dressing is **11** draw
calls (9 in `towerSkinDress`, 2 in `towerDressFx`) and bastion's is **9**.
Both are inside the triangle half by a wide margin, and every newer tower is
inside both. Nothing is visibly wrong — this is frame cost on a scene that
already spends 49–88 draws — but the rule has been decorative since the
dressing pass, which is exactly the thing T4 existed to stop.
Fix shape: a merge pass on the two classic prop kits (they are 9 and 8
separate meshes; the kit already knows how to bake a shared canvas, so this is
geometry merging rather than art). Until then `DRESS_DRAW_WAIVER` in
`tower-dressing` names them with their measured counts, so neither can grow
and fixing one deletes its line.


## Tier T — the landings (T4 original, T10 the look loop)

### T4 (original entry, kept for the shape it asked for) — small-medium
The policy exists in the tools (`gate:cosmetic`) but not yet in
`scenarios.mjs`, so a pure mesh change still drags a 38s physics scenario.
Wants: a `look` tag with a fail-closed no-roll guard in `run.mjs` (a
cosmetic scenario that simulates a die should FAIL, not pass quietly);
`tower-roll`'s dressing block split out; the dressing budget (≤4k tris,
≤8 draws) turned from a printed number into an assertion; and every
cosmetic claim anchored to an aggregate over the `towerSkin*` subtree
rather than one deletable mesh name — `venue-set` breaking on a deleted
berm is the precedent that named the rule.

### T10. The look loop — SHIPPED 2026-08-13 (nullstone's postmortem, made mechanical)
Building Nullstone measured where a tower's time actually goes: the gates
cost four minutes of machine time across seven bakes and caught five real
defects, and **the look loop cost more than everything else in the job put
together.** Two causes, both now fixed rather than noted:

- **`tools/steps/tower-try.mjs`** + `__diceDebug.lookSheet()` — six views of a
  bake, rendered through the SHIPPED path (same tick, post stack, lights and
  tone map a player gets), composited into ONE labelled sheet, with the fit
  and occlusion verdicts printed above it. It sockets a raw
  `tools/forge/out/*.glb` through `towerRegisterGlb`, so nothing is promoted
  or committed to be judged and a rejected round leaves no trace. Judging in
  the FORGE PREVIEW — whose rig is not the room's — cost four rounds of value
  decisions that were all retaken the moment an app frame existed.
- **`tools/forge/towerplan.py`** — what a portal spec leaves you room to
  BUILD, before you model: per-heading reach with the wall floor under it and
  the inset budget between them, the doorway's jambs and probe box, the
  lane's two collider planes, and how tall the front must be for the
  occlusion proof to pass (9.568 for the classic-family rim — the number that
  is otherwise invisible until a browser finds it). Four of nullstone's five
  gate failures were answerable from that table.
- **`tools/forge/towerkit.py`** — `tri_array`, the ray caster and the seven
  gates every recipe was copying, wrapped around `towergates`.
  `run_battery()` returns the gates it ran, so "every gate ran" is a
  comparison rather than a hand-kept manifest. Proven a pure lift: nullstone
  re-baked on it to a byte-identical digest.

**The finding worth keeping**, recorded in `/new-tower` §1.9: nullstone round
1 passed every refusal in the contract — occlusion 99/99 at six eyes, lane
clad 243/243, throats clear — and rendered as a picket fence around a bucket.
The contract proves a tower is LEGAL; only a frame says it is a tower. Still
open from the same pass: `hollowbole.py` has not been moved onto the kit (it
carries its own copy of both helpers), and nothing yet renders CANDIDATE
massings side by side, which is T11.


## Tier T — the landings (T7 promotion, T8a the front-height gate)

### T7. Promotion is manual and main-session-only — small, and it has already bitten
**2026-08-13, found by accident:** the shipped `hollowbole_*.glb` had been two
commits behind their recipe since that morning — round 1's forge work added a
`doorPad` marker, re-baked, and correctly did not promote (models/towers/ was
outside its cluster), and nothing then noticed. The digest baseline could not:
`set` is over GEOMETRY, and the geometry never moved. **A digest proves a model
did not change; it says nothing about whether the file anybody serves is the
file the recipe writes.** Promoted and proven the same day, but the gap is the
item.


An agent can bake a GLB and prove it, but cannot ship it: copying into
`models/towers/`, adding the static-cache manifest entry and re-pinning the
digest are main-session acts. The gate is deliberate — the frozen-mtime
production bug lives in exactly this class — but it is the one seam where
an otherwise autonomous tower build stops dead. Refinement: a `promote`
step that performs all three edits as one reviewed diff, so the human act
is approving a diff rather than remembering three files.

**SHIPPED 2026-08-14, and with the part the entry did not ask for.**
`tools/forge/promote.mjs <slug…>` does the three edits and prints them; the
human act is reading a diff. But a promote step you FORGET to run is the same
bug it was written to prevent, so the drift is now caught at both ends:
`forge.export_glb` stamps a `sha` of the whole written file into the digest
record, `digestdiff` compares it (a move in `sha` ALONE means shipping data
outside the mesh changed — precisely the `doorPad` marker that started this),
and `static-cache` asserts every SHIPPED model against that baseline. A
re-bake nobody promoted now fails the suite with the command that fixes it in
the message. `promote.mjs --check` is the same claim on demand. Red-checked by
serving one tower's bytes under another's name. All four shipped models were
verified current on the day (nothing had drifted since the August 13 catch).

### T8. Two gates that cannot be armed yet — (a) ARMED 2026-08-13, (b) designed
- **`tower_fixture.py` was RED on the bake-side occlusion gate** (cowl 11/99
  at `wide.full`) — REBUILT, not waived. The cause was one line and it
  generalises: `HEIGHT = PORTAL_IN["rimY"]`, "the rim IS the top edge, so they
  are one number". THE RIM IS NOT A HEIGHT CAP. The cowl band's top is
  despawnY + a die's radius, and a high eye's ray to it crosses the model's
  front plane ABOVE the rim, so a model as tall as its own mouth cannot hide
  the vanish — by construction, however closed the rest of the shell is. The
  fixture now builds its front to `front_height_needed() + 0.15`. Building to
  that number the first time still left 1/99, which was the second finding:
  both hand-written copies of that arithmetic measured the sample on the BORE
  AXIS, while the binding one is the deepest point of the widest disc (9.854
  vs 10.120 here) — a planning number a compliant model fails is worse than
  none, so it moved into `towergates.front_height_rows` and both callers ask
  it. The in-app half is a VERDICT now too: `tower-glb-loader` asserts shaft
  and cowl fully blocked at all six eyes, red-checked against the old bytes
  (87/99 at wide.full). It could not have carried that assertion before — a
  leaking asset cannot police the leak.
  **And a THIRD time, 2026-08-14** — same shape, one layer deeper, found by
  the Nullstone divergence agent that tried to open a hole in the front and
  was refused by a number it could not look up. `front_height_needed` was the
  OCCLUSION floor alone, while `gate_front_carries_the_dark` also required a
  die to VANISH at or below the mouth: a second, independent floor that no
  tool computed and towerplan never printed. On nullstone it binds higher at
  **every** eye — 9.992 against the published 9.864 — so the occlusion column
  was never the binding one, and **a model built exactly to the published
  number was refused by the bake** (proved: a front at 9.864 loses a die at
  y 9.249 against a mouth of 9.4). The number that is documented being the
  number that fails is the worst arrangement available. Both floors are now
  columns in towerplan §7, `need` is their max, the gate derives its own
  inequality from the same function, and **the plan checks its answer against
  that inequality before printing it** — a floor is only worth publishing if a
  model built to it passes. Cost: the stress fixture's crown 10.27 → 10.43,
  re-baked and re-pinned; nullstone re-bakes byte-identical (its front stands
  at 11.14) and every shipped tower was always above the true floor.
  **The fix immediately found its own next instance:** hollowbole had NEVER
  RUN this gate. It wanted a scalar `front_top`, which a slab tower can answer
  honestly and a torn stump cannot, so the recipe quietly never called it —
  the strongest claim about a shipped tower going unmade for weeks while
  fourteen other gates were green, an unarmed gate reading exactly like a
  passing one for the fourth time in this file. `front_top` is optional now
  and the die-vanish claim is MEASURED off the built triangles when it is
  absent, which is better evidence than the proxy ever was (it is the ray the
  player's eye casts). Measured before arming: hollowbole's worst eye loses a
  die at y 9.92 against a mouth of 9.40, so arming cost ZERO model change —
  both variants re-bake with digests matching the baseline. Red-checked by
  handing the gate the mushroom shelves instead of the shell.

## Tier B — the closed beta, as shipped

## Tier B — The closed beta (2026-08-14)

Joe: *"I consider the dice towers and the stages to be in closed Beta. I don't
know how to properly hide this from others. Maybe we just require
`?stability=beta` in the URL? I'm okay with something simple."*

**Shipped** (UX §7.38, `js/stability.js`, e2e `stability-gate`): two channels,
redeemed by `?stability=beta` and revoked by `?stability=stable`, persisted
per browser and stripped from the address bar. The gate takes the venue and
tower rows off the Staging destination and drops those two keys from your own
solo settings on restore. **It gates the OFFER and never the CAPABILITY** —
goal 15 forbids anything else, since a client that refused the room's tower
would bake a different film and put different dice on screen from the seat
beside it.


## Tier N — the Nullstone divergences, judged (2026-08-14)

## Tier N — the Nullstone divergences, judged (2026-08-14)

Four agents each took a moderately risky swing at the round-5 nullstone
("structurally right, not yet handsome… but it's quiet"). Judged on one sheet
by the main session; Joe's verdict on the winner: *"the best tower you've
built so far."*

- **② Interior light — LANDED** (83b9e3c). Fissure slots with violet
  filaments, witchlight veins up the doorway pocket's back wall, ember moved
  into the pocket. Measured at the gate rather than argued: die 0.4712,
  doorway vein 0.2058, fissure 0.0887, lit ramp 0.0360, felt 0.0065 — dice
  brightest by 2.3× over a clean ladder. `tower-contract-freeze` byte-
  identical, so 590 recipe lines and a re-baked model cost zero dice sims.
- **③ Carved spill — IDEA CONFIRMED, BAKE REFUSED.** Re-shot under the
  corrected lamp and under the lamps it was authored against. **The base is a
  clear win**: the foot flares into an unmirrored skirt of broken stone and
  the delivery slab stops being a tray parked in front of a building, which
  paint had already failed to fix twice (hollowbole's tongue took a 0.39 value
  drop and still shipped a gangplank). But it is not landable as it stands:
  its body carries the OLD doorway — the flat rectangle ② exists to have
  fixed — and its **cost is wrong by ratio**. The base is ~10570 tris against
  a whole tower of 4304, so ported onto master it lands near 14874/15000
  (estimate: the two touch different geometry), ~0.8% headroom, freezing
  nullstone against any later change. 71% of the model for the bottom fifth of
  the frame, seen mostly at grazing angles. **NEXT ROUND, NOT A MERGE:** re-
  derive the heightfield at a coarser density and keep the silhouette law
  (no straight outline run over ~0.8 u, crest broken by asymmetric shoulders).
- **① Attached structure — DECLINED.** The pier, cantilevered slab and
  switchback stair do break the single outline, cheaply (2552 tris), but the
  tower reads architecture-first: a ruined keep with a rock in it, when the
  monolith IS the identity. **Its finding outlives it and belongs to every
  tower:** the room lights from ABOVE, so detail cut INTO a player-facing
  vertical face never appears in a frame — an arch was carried three rounds
  and was invisible in every one.
- **④ Floating mass — DECLINED IN FORM, KEPT IN FINDING.** The strong form is
  impossible and the agent proved why: a gap in the front below the height
  floor is a leak, not a gap, so the float gets 2.12 of 12.30 at the prow, and
  see-through buys nothing in a dark room (the background is as dark as the
  stone). It found the front-height under-report (bf96213), which is the most
  valuable single thing the four produced.

Both of the findings that outlived their swings were about TOOLS lying, and
both are fixed on master: the `tower-try` lamp (11346ed) and the front-height
floor (bf96213).


## Patterns to protect (verified by all six audit stances)

### Patterns to protect (verified by all six stances)

- `projectEntryFor` (server.js:1440) on all six egress paths, redacted branch
  as a **whitelist construction** — a future field is private by default;
  `secret` returns `null`, not a blanked record. `entryExistsFor`/
  `entryExistsForAll` gate housekeeping; `400 unknown_audience` refuses the
  whole roll rather than narrowing the audience; shrouded dice carry an
  identity face-correction, so dice nobody can read have nothing written on
  them; the dice tower works with **no roles** because `revealAuthority` is
  separated from `playerId`.
- The three choke points: `entryHidden()` (three lines, 18 call sites),
  `editPoolById` (the sole by-id mutator), `CARD_VERBS` + `appendCardActions`
  (five viewer/mode combinations, one table).
- `buildRollCue()` — seven call sites — is why the two views cannot drift;
  the rail plate's gradients are byte-copied with the lesson at the site
  (css:2017).
- "Flush" and "one click target" are true by CSS *structure*
  (`#tray-actions::after`, `padding:0`, `pointer-events:none`, the
  `:has(.die-x:hover)` honesty override), pinned by `elementFromPoint` at
  four positions (scenarios.mjs:3251).
- Failure directions chosen by state shape: `sec-off-*` classes degrade to a
  visible panel; `sectionsStored`/`sectionsTransient` make laundering
  unrepresentable; `applyImportPlan` has no delete path; `rollRailSelection`
  fails closed to `secret` and strips glue mods unconditionally.
- Geometry observed, never asserted (`--draft-h` ResizeObserver); real
  `disabled` so keyboards skip dead stops; `[hidden]{display:none!important}`
  and its generalized suite rule, "pin computed display, never class names"
  (UX.md:2746).
- Server owns the shared state machine: ordered `collectEntries`, shelf slots
  as ranks off a monotonic `collectSeq`, a losing `/api/table` rev as a
  silent `200 {applied:false}`, presence *asserted* via `pagehide` beacon +
  application-layer heartbeat.
- "The count is the label" (`d6 → 1d6 → 3d6`) — counter, notation and wire
  payload in one token, leading `1` deliberately kept.
- Input-model care: `e.repeat` rejected at the top of the global handler;
  `isComposing` in both notation editors; the Esc chain as one ordered ladder
  mirroring `--z-*` backwards; accessible names computed from the parse
  ("Roll 3 pools: Wisdom, Swordplay, Zeal"); both real menus complete down to
  focus restoration on close.


---

# The 2026-08-15 batch — sixteen roadmap items, worked in ORDER

*Fifteen of THE ORDER's sixteen entries, worked in parallel and merged one at a
time. What each shipped is below; **what each proved WRONG about this file's
own claims is the more valuable half**, and is collected at the end.*

## What shipped

- **C15 — restore a library from its file** (ORDER #1). `Replace my library…`
  in `#import-profiles`, the app's existing two-step in-place arm, naming what
  it destroys and offering `Download` inline first. `rebuildStore` builds from
  `emptyStore()` + `addProfile()` with **no `uniqueName`**, compares each
  landed name to the file's rather than assuming, persists and **checks the
  return** before swapping the live pointer, then adopts the profile the file's
  `profile:` key names. Plus the four defects in the same journey:
  `parsePortable`'s warnings now reach the status line as `⚠` with a `.caution`
  class (never `.warn` — `ok` reads `.warn`, and a skipped section is not a
  failed load), an empty file refuses at the file door, boot normalization
  reports what it dropped **and withholds the first write while it holds
  anything**, and `LS_GROUPS`'s comment stopped calling a fossil a recovery
  path. `js/profiles.js` `rebuildStore`; UX §7.40; PROFILES §12.

- **§0j — `/health` + `GIT_SHA`, and a room-creation budget** (ORDER #2, #3).
  `/health` reports cardinalities only — no room key (goal 10: the key IS the
  door), no name, no log line — and **validates rather than echoes** `GIT_SHA`,
  so a secret typed into that var reports `unknown`. `make deploy` bakes the
  sha with `--update-env-vars` (not `--set`, which would wipe a
  `DICE_LOG_LEVEL` set to diagnose something mid-investigation) and appends
  `-dirty` when the uploaded working tree was not HEAD, because `--source .`
  ships the directory rather than the commit. The throttle is a **RATE, not an
  ownership cap** — if the key ever collapses to one value, a rate degrades to
  "10 new tables/min for everyone" while an ownership cap degrades to "no new
  tables at all" — guarded at half of `MAX_ROOMS` so a refusal can never happen
  while 250 slots are free, refusing with 429 `room_rate_limited` (never
  `server_full`, which would make every future capacity report ambiguous), and
  never on `/api/events` (§0d F3's stream storm).

- **C29 — the static handler serves the app, not the repo** (ORDER #10).
  `APP_DIRS` / `APP_FILES` / `isAppPath` on the resolved absolute path; 404 for
  everything else. `tests/static-cache.test.mjs` grew 22 → 51 assertions,
  naming each refused path.

- **C11 + C12 — arrival on the phone it is designed for** (ORDER #7).
  `#name-panel` scrolls instead of overflowing upward (the same fix
  `#settings-panel` carries, with the same comment); a coarse-pointer block
  puts the picker family at 44px and `#name-input` at 16px so iOS stops
  zooming; focus is conditional on `(pointer: fine)`; `#name-modal` joins the
  Esc ladder and gains a ✕, dismissing to **`null` — you are LOOKING, not
  sitting** — with `Take a seat` in the presence row as the way back. `&as=`
  became the default pick again, `Stay as ⟨name⟩` carries the pick and says so,
  and `⚄ Random`'s hook stopped minting. UX §7.39.

- **U23 — the token layer** (ORDER #11). Three degrees of not-active
  (`--dim-rest` available / `--dim-off` out of play / `--drain` + `--drain-fx`
  unavailable) and three kinds of ON, under one rule: **THE KIND OF CHOICE
  PICKS THE DRESS, DOM ANCESTRY DOES NOT.** SWITCH (a bar cell turning a region
  on — no ring, state carried by weight), PICK (choosing *is* the work — ivory
  or steel, never gold; the default when you cannot tell), DIAL (changes the
  whole table and stays changed — gold, the one family where gold is not the
  roll verb). Nine copied dresses became one expression with thirteen greppable
  one-line overrides. Proved mechanically rather than trusted: 1046 selectors,
  none changed specificity; 1041 rule instances resolve byte-identical after
  recursive `var()` substitution **including ancestor overrides** — the trap
  being that `#left-panel` re-declares `--panel`/`--hair`/`--muted`, so a
  `:root` alias of any of them would freeze the root value and silently stop
  tracking the override with no symptom at the call site. UX §7.41.

- **C25 Stage 2 + C14 — the record** (ORDER #5, #9). One object at two scales:
  open, a row of rank panels in the log's head; closed, the same panels as a
  three-pixel spine along the base of the ≣ — same order, same roller colours,
  same held dress, so the collapse reads as one thing getting smaller. Clicking
  a panel anchors its row and opens its card. C13's three facts land here:
  **rank** renders, **waiting-on-you** is a gold tick a sighted player can see
  (it was in an `aria-label` and nowhere else), and the ring that was "claimed
  as the substitute and is not" lost the comment defending it. Plus `Find a
  roll…` with the filter judging arrivals, the at-cap note for late joiners,
  `Clear history` naming its scope, and the ≣'s **accessible name** written
  every render. The felt strip Joe sketched was **refused with arithmetic** —
  five panels across a 390px phone is 78px each — and the frames to overrule
  that are `rec-phone-open.png` + `rec-five-open.png`. UX §7.42.

- **C27 + C28 — framing and the spawn line** (ORDER #8, #10). C28 ①: the spawn
  clamp asked the wrong axis, and **16 of 144 throws started a die through the
  z-wall** — the standing claim that none did had only ever checked X. Fixed by
  clamping illegal dice only, so every legal spawn stays bit-identical. C28 ②:
  the deferred room change now flushes on the predicate rather than at a call
  site, because there were **four** release paths, not the two named. C27
  shipped as an **instrument, not a default** — every gain costs cropping the
  felt where it currently fits, which is the mirror of the crop C27 already
  priced and declined. `setFraming({preferDice:true})` is inert until Joe says
  otherwise.

- **§3 resync + C22 — the version stamp** (ORDER #13, #10). Resync needed **no
  new wire field**: an entry with neither `collected` nor `cleared` is on the
  felt, at most one can qualify, and riding the log inherits `projectEntryFor`
  for free. Two real defects fell out — `replaySettledRoll` **dropped** the roll
  when a playback was live, and since `hello` is one-shot a reconnect landing
  mid-playback left the felt permanently short; and the client kept only half of
  `joinSnapshot`'s promise, rendering the log and leaving the felt bare. C22
  shipped as `js/schema.js` + one `ver: 'E.M.m'` string: an absent stamp loads
  (never purges), a newer **major** refuses out loud **and locks the key**, and
  the portable file carries `version:` as a *section* rather than a top-level
  key, because field readers refuse an unknown top-level line but skip an
  unknown section.

- **§1 + §2l ⑤ + U17 — the die a pool discarded, and the ledger sheet**
  (ORDER #12). A struck die is a **dress on `oc-chip`, not a fourth grammar** —
  one bit changed, and this app already owns that dress for that bit. It is not
  confusable with `oc-quiet` because the **answer slot** decides: quiet holds a
  dash, struck holds the mechanic's word (`dropped` / `rerolled` / `not kept`).
  Its word is **never computed** — a dropped d6 showing 5 is not a Success.
  ✴ children get no reading of their own; the child's face rides its base die's
  evidence (`d6 6 ✴3`), because a chart word for it would turn `1d6!` into a
  two-die pool and move U18's crit denominator. Two things that would have
  broken quietly, both pinned: `critCeremony`'s crit-capable denominator was
  true only by omission, and `oc-solo` counted **chips**, so `1d20 adv` would
  have silently dropped from a 26px verdict word to 15px. §2l ⑤ shipped the
  typed session target with `placeAnchored` **extracted** rather than copied.
  UX §7.43, §7.44.

- **U25 + U26 + U28b — the seams a first table night runs into** (ORDER #14).
  The log row says each pool once; the `rerolled` chip names the rerollER when
  attribution flipped; the whisper sub-line names the leak it was describing
  backwards; `Split table…`'s neighbour `Copy invite link` gained a Settings row
  and key `i`; roster pills have a 76px floor; `publishPools` is disclosed on
  both sides; the change note names the setting; an unnamed table stops wearing
  its minted key; a counted rail row drops its die art on coarse.

- **W7 ② + the frame gates** (ORDER #4). See the Tier W record below.

- **L4 / CUJ5 — sub-tables** (ORDER #16). `POST /api/split`, a parent pointer
  and a scoped in-memory directory, `↩ Main table` and `Breakouts ▾` in the
  presence row, `Split table…` behind the chip. The child inherits
  `felt·system·zoom·tower·venue` **as a copy, never a link** — the system
  decides what a roll MEANS, so a breakout on the default reads a d20 under a
  different rulebook; and a live link would make the child a satellite, which is
  a role wearing a settings patch. It refuses the parent's *name* and the §G4
  setup. A split **mints no room** — the child is created by the splitter's
  ordinary `/api/join` under the same budget — so no new accounting; a
  split-specific allowance would be strictly weaker, since joining is never
  throttled and an attacker would mint a seat and spend the trusted budget from
  inside it. UX §7.46.

- **C4 — UX.md names its own next free section number.** §7's head now carries
  a NEXT FREE line. It earned itself immediately: eight parallel passes claimed
  §7.39–§7.46, **four of them first wrote themselves as §7.39** and two more
  independently claimed §7.45. Every one of them read the line before writing —
  they were reading eight different copies of it.

- **Walking to another table never said goodbye** — found by
  `journey-split-the-party` *after* the batch, and pre-existing for every
  `gotoTable` caller. `gotoTable` is a real page load, and Chrome fires
  `pagehide` with **`persisted: true`** for it; the beacon handler returns early
  on `persisted` **by design** (a restored bfcache page must keep its seat), so
  no `/api/leave` was ever sent. The walker's pill stood on the old roster until
  the liveness sweep reaped it ~75 s later, **with no `left` line on the server
  at all** — while `renderPlayers`' own rationale claims the opposite ("when
  three of five players walk into a breakout, this row loses three pills").
  **The first fix was wrong in an instructive way:** copying `leaveToLobby`'s
  awaited `leave({immediate:true})` broke three scenarios outright, because an
  awaited POST either delays a navigation or, on rejection, replaces it. The
  page is leaving, so the transport must be the one that survives a teardown and
  cannot be awaited — `leave()`'s `sendBeacon`. It is also the right semantics:
  the soft beacon drops the stream and leaves the SEAT on the ordinary grace,
  because walking to a breakout and back is a round trip, not a resignation.

## What the roadmap and the audits got WRONG, verified against the tree

*This is the durable half. Every entry below was written from a reading that
was true when it was made and had stopped being true — which is the failure the
2026-08-14 cleanup was supposed to treat and clearly only half did.*

| Claim | What is actually true |
| --- | --- |
| **C29: "no credential or config exposure, verified path by path"** | Two errors. There is **no MIME-based refusal anywhere** — `/Makefile`, `/README.md`, `/LICENSE` and `/docs/*.md` all returned **200 with their real bytes**. And the file it names as safe, `.deploy.config`, **does not exist**; the real one is `deploy/config.mk`, which has no dot-prefixed segment, so `safeResolve` waved it through — `GET /deploy/config.mk` returned 200 **with the billing account in the body**. Production was never exposed (`.gcloudignore` drops `deploy/`), but every local `node server.js` served it. |
| **§0j / §0d F1: in-server rate limiting cannot work behind Cloud Run's proxy** | Stale. `clientAddr()` has parsed `X-Forwarded-For` leftmost for weeks and `handleClientError` already shipped a per-IP limiter keyed off it. The **real** objection, which the roadmap never stated, is that Cloud Run *appends* to client-supplied XFF, so the leftmost hop is forgeable — evadable by rotation and abusable to spend a victim's budget. That is why the in-server rule is soft and fails OPEN. |
| **C12: "`⚄ Random` mints and persists on the tap, with no undo"** | False for the control since 2026-08-09 — and **true of `__diceDebug.chooseDealtProfile()`**, the hook a scenario would reach for. A test hook was doing the thing the control had been fixed not to do, and no scenario called it, so it never lied out loud. |
| **C11: "no scenario ever clicks a real `.seat-btn`"** | False — `join-door` clicks real rows. The conclusion survives for a better reason: those are `el.click()`, which fires on a node no finger could reach, at a headless viewport where `(pointer: coarse)` does not match at all. The picker's coarse rules were never exercised and its geometry was never read. |
| **Not in the roadmap at all** | **`&as=` had silently stopped pre-selecting anything.** §G5 documents it as "a highlight and a focus, so Enter takes it"; the highlight lived in a `#seat-list` loop retired 2026-08-09. A per-seat invite link was landing on a picker that pre-selected the player's *last-used* profile. |
| **U23's evidence** | Two of three claims stale. The thirteen `:disabled` recipes are **nine**, collapsed by U6; the three `.rp-*`/`.seg` cascade ties are **zero**, closed by U9. The nine `[aria-pressed]` dresses across four families is **exactly right — but not the same nine**: U6 moved `.seg` out of gold into ivory and the count landed back on nine by coincidence. |
| **§1: `/api/join` carrying `offers`** | Closed. `joinSnapshot` returns them and the comment above it records the fix in so many words. |
| **§1: struck dice, "narrower than written"** | Narrower still: the gate is **one line in the system profile**, not the renderer — `js/meanings.js`'s `if (!p.counts \|\| p.child …) return`. `renderOutcomeRows` prints only what `outcomesFor` returns, so one line hid the struck die on the banner, the verdict hero and the peek at once. Also: `p.child` is **explosion only**, not reroll offspring. |
| **U17's three residuals** | **All three false.** `modsSummary`'s `values` option landed in `68fdc7a` — *the very commit that wrote §7.24*, whose own message lists it under "three gaps the docs pass found in the build". The log's `?` total was fixed there too and is pinned by `held-roll`. Step 6's LOOK was done there. Both the ROADMAP entry and §7.24's own *Not closed* paragraph were written from the audit and never re-read against the diff beside them. |
| **§3: "hello does not carry which logged rolls still sit on the table"** | False since `a7f1d89`. Three of §3's four bullets are **dead** post-C25: per-roll chips lifetime (`removeRollDice` takes the chips with the dice), per-roll landing zones (one roll on the felt), and ordered eviction (already server-ordered; `playRoll` carries the tombstone). |
| **U20: "in `body.mini` the banner's top edge cuts into the peek"** | Not reproducible post-C25 — the card anchors to a log row now. In its place: on `body.mini` the **flyout sits over the banner** and covers it entirely. |
| **U26's first bullet — CUJS.md's own "CUJ11's first item"** | Stale. `armAutoCollect` does not exist; §7.28 deleted the whole auto-collect clock on 2026-08-10, four days after the audit found it. **CUJ11's first item shipped by deletion before the journey was named.** |
| **U25's `drive egw19x` example** | Never a production key. `tools/stage.mjs` mints `drive-<6 base36>` for the harness; production keys carry a 16-char tail. The defect was real; the evidence cited for it was a look frame of the test tooling. |
| **U25: "`publishPools` broadcasts your entire rack"** | It broadcasts the whole profile **library** (C17). And there were **two** false sentences about pool transport, not one — the invite tooltip and Help's *Your data* said the same thing. |
| **C28 ①'s preset table, and C24's mat table** | Both one notch stale. The ladder shifted out 2026-08-12: today `wide/medium/close` = **14.1 / 11 / 8.6**. C24's row labelled `medium` (8.6×5.2) is today's **`close`**, and its `close` (6.7×4.1) does not exist. C24's measurement and its instruction still bind; its labels do not. |
| **C28 ②: "the ceremony path never flushes"** | Two paths named; there are **four** (`ceremonyFinish`, `clearTable`, `stepRevealing`'s last flip, `fastForwardPlayback`'s skip drain), three of them proven to fail with the fix backed out. |
| **C28 ①: "widening the spread should reduce the frame-zero contact count"** | Refuted. `firstFrame` is 1.5–10.2 today and all three spread formulas sit inside each other's noise; the 280 contacts in `5a5a8ce` were pre-cap. |
| **C27's residual "on a 390px phone"** | Not a phone problem: the option gains **0 px** at 390. The win is elsewhere — iPad-portrait 3d6 **119 → 242**, desktop 1600 3d6 200 → 245, and 40d6 gets **worse** (200 → 184). |
| **W7 ②: "has not started"** | It shipped 2026-08-13 (`583b569`, `c67977f`) with `venue-set` claims. What had never happened was **frame-space verification or a LOOK**. |
| **GOALS goal 14: "the thirteen rules"** | Fifteen. Rules 14 and 15 had both landed. GOALS wins ties, so a stale count there is worse than anywhere else. |
| **§3b's blocker, and four line refs** | The throttle it names as owed **landed**. `initNet`, `dice.name.v1`, `MAX_ROOMS` and `renderSeatChoices` were all cited at line numbers that had moved. |
| **POOL-ANALYSIS §6.1's two timings** | Do not reproduce, and their *ordering is impossible* — `poolBars` calls `spectrum`, yet the doc has it faster. Unwarmed-JIT noise, never measurements, in a document whose first rule is that every number is generated. |
| **IMMERSION-AUDIT §10 / ROADMAP V4: "pixel ratio not clamped (worth checking on laptops)"** | **Never true, on any day.** `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` is at js/main.js:641 and has been there since the repo's first commit: `git log -S "setPixelRatio(Math.min" --oneline -- js/main.js` returns `2036d59 init` and nothing else. Same shape as C27 — not drift, wrong on the day it was written, and it survived a re-copy into the roadmap. It is now assertable rather than re-asserted: `__diceDebug.renderAudit().pixelRatio` reports it (headless reads 1; the ceiling is the claim, so assert `<= 2`). |

## Two findings about method, worth more than any single fix

**A gate can certify the frame it was written to refuse.** Four measures that
read like the obvious composition gates — whole-frame ink balance, staging-band
balance, near-band ink share, footprint mass balance — all *pass* the W2c frame
Joe rejected, and footprint mass says it was **better**, because a wide dim pond
weighs the same as a small lit ring. A gate on any of them would have certified
the rejected picture to three decimals in the exact language of the complaint.
This is why rule 15 requires a composition gate to **fail the frame that was
rejected** before it is allowed to pass anything.

**The inversion the structural risk proposes should not be done.** `usesTotal`'s
20 live reads are not one question but four: 8 ask whether a sum exists, 3
whether an adjudication does, 6 are about arithmetic in a breakdown, and 2 run
*before any roll exists*, so there is no entry to pass. A `readFor(entry)`
supplier answers 11 and cannot touch 9 — shipping it would leave a boolean gate
alive beside a supplier, which is worse than either. And §1's actual bug was the
**inverse shape**: a supplier over-filtered and took four surfaces down in one
line, invisible to a grep of the render sites. Inversion makes single-line
multi-surface failures *more* likely and *harder* to locate. What is cheap is
the pattern the two shipped call sites already use — `modsSummary(mods,
{values})` and `attributionCards(…, {arithmetic})` take the answer from the
caller and never query the system, at one line each.

## The design-first four — one kill, three decisions (2026-08-17, THE ORDER #8/#9)

*Each of the four stuck items was re-verified against the tree before being
judged, per the standing rule that a correction must re-run the thing it
corrects. Full designs live in the four ROADMAP sections and
[docs/IDENTITY.md](IDENTITY.md); this is the record of what died and what
was decided.*

**B1's server half is KILLED.** The named defect: *it asked the server to
refuse an entitlement that does not exist, for a threat the client gate
already ends, in violation of the channel's own one law.* Enrolment is an
open keyword, so there is no unentitled class to refuse — durable identity
does not change whose claim it is; goal 10 forbids a settings write refused
by who asks; and `js/stability.js`'s "THE CHANNEL GATES THE OFFER, NEVER
THE CAPABILITY" is exactly what a server refusal would break. The
discoverability gate as shipped is the complete feature. Consequence: the
identity pass stops being scheduled against B1 — its real bill is
goal 11's, not Tier B's (a held roll's reveal authority dies with the tab
that chose it; your own secret rolls vanish from your own log on a
tab-close rejoin — both verified in the tree, both healed by
IDENTITY.md §5's `dice.who.v1` rung 1, ~25 lines, no projection changes).

**C26 decided: the label `Change seat…` never returns; the gesture does.**
The withheld verb's name deletion turned out to be *load-bearing*, not
incidental — a stored name skips the door, so amnesia was the only way the
handler could force the picker open, and the round trip also minted a new
`playerId`, orphaning reveal authority on the way. Every journey the label
suggests has a lossless verb already. What returns is `Take a prepared
seat…` — conditional on free prepared seats, rename + preview-then-apply
on the SAME seat, nothing dropped, nothing wiped. `leaveTable()` and its
hidden button stay as the scripted offline door, tests-only, permanently.

**U21 decided: the presence carve-out, mirroring §7.4's launcher
carve-out.** A launcher may drop presence chrome — people are visible
through their acts on the felt, and the panel is one keystroke away — on
the condition that presence STATE cannot outlive its signal (collapse
falls home: `poolsOwner` clears in `applyPanels`, the same P2 precedent
that already exits manage mode there) and that DOORS are not chrome
(`↩ Main table` and `Take a seat` survive collapse; roster, chairs,
Invite and nameplate do not). The teammate-pill dead tap takes the
transient section door the audit itself named.

**Two claims in the entries were false, one newly-sharp fact was missing:**
U16's "± hides the dc, per U11" — stale since U17 #28/#29; Target sits in
an always-visible section and the popover carries the Visibility seg, so ±
is a complete intent viewer (the well still shows nothing, which is the
half that survived). U21's "during a profile swap that is Alice's pools
rolling under your name" — the G3 rack swap is deleted (PROFILES §11.8);
the rail can only ever list your own active profile, and the residue is a
labelling gap, not a leak. And the audit predates L4: the collapsed column
now also hides `↩ Main table`, so a breakout player in the immersion state
has no way back on screen at all — that fact, not the roster, is what
"deletes multiplayer" means today.
