# TOWER_CORE — the tower geometry contract

## THE PORTAL CONTRACT — v2, 2026-08-13 (supersedes the fixed six volumes as LAW; the numbers survive as the CLASSIC SPEC)

A tower model now declares exactly two things about the engine's geometry —
its **dice-in portal** (the mouth) and its **dice-out portal** (the doorway)
— and the engine derives everything else: shaft, aim box, cowl, despawn
line, apron slope, hood, lip, exit spawn, pit walls, camera eye, audit
thresholds, occlusion sample grids. One function owns the derivation:
`towerVolumes(spec)` in js/main.js, pure in (spec, mat depth, engine
constants). This is the "TOWER_CORE v2 portals" promise recorded in
docs/handoff/2026-08-12-w3-hollowbole.md item 7, delivered.

**The spec** (world units; z relative to the back-wall anchor z0):
`in: {x, z, rimY, clearR}` — a vertical entry aperture dice fall into;
`out: {x, sillY, w, clearH}` — a front-facing exit rectangle in the wall
plane. That shape is the v1 portal model, deliberately: one vertical mouth,
one forward door. Angled throats, side mouths and multiple bores are out of
contract (the film and the occlusion sampler assume this shape).

**The classic spec.** `DEFAULT_PORTALS` = `in {x 0, z −1.6·S, rimY 7.0·S,
clearR 1.7·S}`, `out {x 0, sillY 0.8·S, w 4.0·S, clearH 3.6·S}` (S = 1.25).
Every registered tower that declares no portals resolves to it, and
`towerVolumes(DEFAULT_PORTALS)` reproduces the pre-v2 volumes and all eight
collider poses BIT-FOR-BIT — proven, not claimed, by the
`tower-contract-freeze` scenario against a golden captured from the pre-v2
code (tests/e2e/fixtures/tower-contract.golden.json). The derivations are
written anchor ⊕ delta so classic identity is structural: every delta is
`spec − default`, which is `+0.0` on the same double for a classic tower.
DO NOT algebraically rearrange an anchor expression; the comment above
towerVolumes says why.

**THE MINIMUMS — measured, 2026-08-13** (`TOWER_PORTAL_LIMITS`; the
per-model proofs remain the real gate). v2 shipped its aperture floors as
the classic spec's own values, inherited rather than derived; Joe called
the Hollow Bole's door too tall — it sat AT the floor — and asked for
first principles. The portal-floors campaign
(`tools/steps/portal-probe.mjs`: film-scan envelopes via
`towerPourEnvelope()`, candidate specs below the floor via
`towerProbePortals()`, retry/fault knees off the exit guarantee; ~420
pours across seeds × pools × candidates) measured what dice actually use:

- `in.clearR ≥ 1.6·S = 2.0` — ENTRY IS SCRIPTED, so its envelope is
  exact: ±0.4 xz aim jitter (0.566 radial) + d20 circumradius 1.25 =
  1.816 worst-case reach; measured p100 1.805. The floor keeps a 0.18
  reserve. No physics gate exists on this axis at all.
- `out.clearH ≥ 2.7·S = 3.375` — THE BINDING CASE IS CONGESTION, NOT THE
  BIG DIE. A lone d20 needs `r·(1 + 1/cos(pitch)) + 0.2` ≈ 2.85 over the
  sill (analytic = measured to ±0.03) and single-file pours cleared even
  a 2.6 door; but dice climbing dice at the doorway push higher, and the
  exit-guarantee retry rate turns up at 3.0. At 3.375 every realistic
  pool (4×d20, 8d6, mixed 8) ran 36/36 with attempts=1; 20d6 spends
  occasional extra offline bakes; 40d6 is unchanged in kind from the
  classic door, where it already exhausted the guarantee (the known-cost
  note). The old 3.6·S = 4.5 floor carried ~58% more height than any die
  ever used.
- `out.w ≥ 3.2·S = 4.0` — JAMBS CHANNEL, THEY DON'T JAM: narrowing to
  3.4 produced zero faults (wide dice deflect inboard and leave). The
  floor keeps shed room for congestion under a low lintel — the two
  axes meet at the pile-up — and preserves the delivery fan. Combined
  floor runs added nothing to the retry profile over clearH alone.

Unchanged, still position bounds rather than aperture floors: `rimY ∈
[5.8, 8.2]·S`; `in.x ∈ ±1.0·S`, `in.z ∈ [−2.6, −1.0]·S` (the bore stands
over the fixed chute, inside the pit flanks); `sillY ∈ [0.5, 1.1]·S` (the
28°-family ramp must still reach the felt inside the FIXED matExtra
spend); `out.x ∈ ±0.6·S` — and since 2026-08-13 (T2) that knob moves the
DOORWAY too. `doorL`/`doorR`/`lintel` were the last bodies built at a hard
x = 0 while the apron, the lip, the hood, the exit spawn and the flight
envelope all followed `out.x`, so a tower using the freedom got a jamb
standing inside its own modelled opening; both committed test fixtures
declare an off-centre exit and had exactly that. The opening the three
bodies cut is now `out.x ± out.w/2` on both edges. There is still no
MAXIMUM door width, and the jamb goes negative once `w + 2|out.x| >
TABLE_W` — unreachable today (that is `w > 7.1` at the narrowest preset,
against a widest shipped door of 5.0) and filed as T12 rather than
clamped. (Historical note kept from v2: the ORIGINAL
§2b text below says "width 3.0", which was doc drift even then — the
shipped classic door has been 4.0·S since the jamb-clipping fix.)
Floors only moved DOWN, so every shipped spec remains legal and the
`tower-contract-freeze` golden is untouched by construction.

**What stays engine-fixed, on purpose:** the SOCKET envelope (the room's
budget, not the model's), the pit walls, `matExtra` (every tower consumes
the same mat — the tower-roll assertion "every tower consumes the same mat"
stays true), the eight named colliders in their contract add order (spec
moves them, never adds or removes them), the apron/lip dialed furniture,
and the camera dials (render-only). The lab's `lipTilt` dial no longer
reaches the shipped socket — `TOWER_LIP_TILT` is a frozen constant and the
dial exists only behind `towerLabVolumes()` — so the "Still lab-only" claim
below is now true by construction (it was not, before v2: the dial fed a
shipped collider).

**How a model carries its portals.** A forge-baked GLB declares them as two
scene-root nodes, `portalIn`/`portalOut` — node translation = position,
node extras = scalars (tools/forge/README.md "Tower portals";
`forge.tower_portals()` authors them, `check.py --tower` gates them at bake
time with limit checks and throat raycasts). The app's loader
(js/towerglb.js) re-validates at load, applies the house rules, and freezes
the portals onto the registry row; `towerPortalsOf(id)` resolves them and
`__diceDebug.towerPortalSpec(id)` is the debug surface tools read instead
of literals. A registry row opts in with `glbUrl`; models are authored with
z=0 at the socket plane and seated at the live z0. Loading is asynchronous
but SOCKETING IS NOT: `towerModelReady(id)` gates the roll-boundary flush,
a late-joining replay is HELD until the model arrives (then socket-first,
replay-second — the hello ordering law), and a failed load keeps the
current tower loudly rather than degrading to 'none'. The fetch is
`cache: 'no-cache'` — always revalidate, answered by server.js's ETag with
a body-less 304 — because a re-bake ships under the SAME url and a warm
browser must see it (`force-cache` shipped first and pinned round-4 mouths
on every returning browser, 2026-08-13; `tower-glb-freshness` is the
warm-cache proof the always-cold harness cannot give for free). Palette
VARIANTS (`glbUrls`) swap by RESKIN, not socket: a venue palette flip
keeps the tower id, so `towerReskin()` swaps the standing skin in place —
legal precisely because variants share portals and geometry digest
(volumes, colliders and the film are identical; a variant with different
portals is refused loudly). Materials wear the venue register's env
policy (`towerEnvPolicy`: 0.45 grounded, 0.08 fantasy — a dark baked
surface is mostly reflection, and the reflection must not be the grounded
room), applied at socket + reskin and asserted by the audit from the same
function. Proof for both: `venue-set`'s cross-flip re-dress claims — which
ride `towerSkinBoleShell` and no longer the earth berm they were written
against, because the berm was deleted with the mound (2026-08-14) and a
physics-adjacent claim anchored to a deletable cosmetic mesh is a claim with
an expiry date.

**What v2 changes about the film — a superseded decision.** The film is now
a function of (portal spec, seed) instead of (one fixed geometry, seed).
The old consequence "tower SKINS are per-viewer cosmetic candidates …
swapping skins can never change how a roll plays or replays" (still written
near the end of this doc) NARROWS to: towers sharing a portal spec — which
is all four classic towers — cannot change the film; towers with different
specs bake different films. Determinism is unchanged where it matters
(GOALS goal 15): the tower id is room state applied at roll boundaries, so
one seed still means one film on every client in the room. The residual
divergence risk is a stale client meeting an unknown tower id (it keeps its
own, now with a loud console.warn) — the same accepted class as tower
on/off before v2, bounded by the server's id allowlist. The film pins its
baking tower into `towerFilmInfo().filmTower` so a divergence is nameable.

**Proofs under v2** — same four, portal-derived inputs: (a) fits the room
envelope (tower-fit; classify thresholds now come from `v.cls`); (b)
occludes the derived transit regions from every shipped eye
(towerOcclusionCheck's grids recenter on the declared bore and scale with
`clearR`); (c) portal apertures meet limits and their throats are really
clear (check.py --tower at bake time; the loader at load time; the probe
matrix behaviorally); (d) zero colliders from the model — unchanged. The
proof TOOLS read `towerPortalSpec()` instead of reciting classic numbers
(tower-probe's HIDDEN/TRAY cut lines, tower-pour's tower argument,
registry-driven default lists). One instrument correction, measured during
the v2 build: tower-probe's collision timestamps and residual velocities
are NOISY across identical runs (A/A on unchanged code differs), so "the
probe sheet is byte-identical" claims below should be read as "the probe
VERDICTS are stable"; the byte-level determinism proof lives in
tower-roll's replay block (same seed → identical film, cross-client).

**The first portal-declared assets:** `tests/e2e/fixtures/tower_fixture.glb`
(the stress fixture — its portals off-classic within limits, its header
carrying the composite-buildability derivation the envelope forced; never
a picker row) and the rebuilt `hollowbole` shell (below).

---

## STATUS — shipped as a room setting (2026-08-12), three models (2026-08-14), the fourth model BAKED (2026-08-13, TOWER_CORE v2)

**THE FOURTH MODEL IS THE FIRST BAKED ONE, AND ITS SHAPE IS DONE.**
`hollowbole`'s shell is a forge-baked GLB under the portal contract
(recipe `tools/forge/recipes/hollowbole.py` → `models/towers/
hollowbole_{moonrise,foxfire}.glb`, one deterministic run, shared geometry
digest, palette as a bake input): the stump at 1.97:1, one ragged wound
with the doorway inside its lower lip, five uneven spires (tallest at
−58°), six gripping buttress roots, the delivery ramp baked as a root
TONGUE cladding the engine chute, and the interior a sealed dark throat.
**Its CURTAIN is now buried** (2026-08-14): the liner's upper curtain was
built to carry a cowl band that rode over the mouth, and when that band came
down to a despawning die's top (the COWL note in the classic-spec section
below) every ray it was the sole carrier of turned out to be at open air
above the rim. The curtain sits 0.129 UNDER the crown's own skyline now,
measured on the built mesh by `assert_curtain` — whose round-7 form asserted
the exact opposite and is what built the black cylinder Joe asked to have
removed. The code-side `towerSkinLining` followed it down: `yRing` tracks
`v.rimY` instead of a flat 11.4, and a baked shell declines the lining TUBE
outright (`SURF.liningTube === false`) because on a bake that radius IS the
outer wall. Declared portals:
in (0, −2.55, rim 9.40, clearR 2.20), out (0, sill 1.00, 5.00 × 4.50).
Battery on the baked shell: fit CLEAN (shell VENUE GROUNDS, tongue LIP
CLADDING), occlusion 99/99 SHAFT+COWL at all six eyes, probe matrix 6/6
CLEAN, pour 29/29, tower tag 8/8. The W3 dressing (moot, shelves, door,
veils) survived the swap through a raycast-synthesized surface descriptor
(`js/towerglbshell.js`) — and its θ convention is FIXED: the moot gap
faces front-left as designed (it sat back-right under the old shell's
convention for its whole life).

*(The section that follows is the PRE-BAKE status, kept as history — its
"shape is not finished" claim resolved 2026-08-13, and its general
finding — the towerskin kit's vocabulary is ARCHITECTURE; organic forms
want a different technique — is exactly what the portal contract + forge
path now provide.)*

**THE FOURTH MODEL IS REGISTERED AND ITS SHAPE IS NOT FINISHED.**
`hollowbole` (`js/towerhollow.js`) is the fae venue's tower — a rotted
hollow trunk, one build under both fae palettes — and it is the first
`venueOnly` row: no chip in the tower picker, because a venue is chosen as
one thing and its tower is part of what it is (GOALS goal 13). Everything
that is not the SHELL is done and proven: the registry row and its
`clunkVoice` (a `thud` at weight 0.5 / sustain 35 over the longest comb in
the set — a hollow log), the ember light behind a 0.24 × 0.40 lit door in a
root buttress, `lantern: {rake: 0.5}`, `motes: false` (the fae venues run
their own air), the server allowlist, the picker skip, the two-palette
value ladder, and the scenario `tower-hollowbole`.

The SHELL is interim and named `towerSkinBolePlaceholder` so nobody mistakes
it: the owner's reference is a broken STUMP (stocky, a torn frontal wound
opening into black, splinter spires, heavy buttress roots, pale barkless
fibre) and a `roundedBox` + `ExtrudeGeometry` stack cannot be that — a box
stack reads as a rectangular tower wearing bark however the boxes are
arranged. **The finding is the general one and it belongs in this
document: the towerskin kit's vocabulary is ARCHITECTURE. It made three
buildings well and it will not make an organic form.** A parametric
displaced shell (a radius field `r(θ, y)`) is a different technique. The
seam is explicit — one function, one SURFACE descriptor, and every prop on
the tower places itself by `(θ, y)` through it rather than by box corners —
so the replacement lands without touching the moot, the door, the palette
work or the proofs.

Proven against the interim shell, and the numbers carry over as the
harness rather than as the answer: fit CLEAN (21 overruns, every one a
named legal class; hull x[−3.15, 3.15] y[−1.15, 12.32] z(rel z0)[−5.13,
3.99]), occlusion 99/99 on SHAFT and COWL at all six shipped eyes, probe
8/8 CLEAN and byte-identical to Heartwood's resting sheet on the same seed
*(v2 correction: "byte-identical" overclaims — the probe's collision
timestamps and residual velocities have a measured noise floor even A/A on
unchanged code; the stable claim is identical VERDICTS, and byte-level
determinism is proven where it lives, in tower-roll's replay block)*,
dressing 7 meshes / 2644 tris / 7 draws inside the ≤4k / ~8 budget.

**A red check corrected this model's own header, the way Black Anvil's
did.** The front of the COWL band is carried REDUNDANTLY by the facade
plate and the unlit lining's back plane — each alone is 99/99, and only
removing BOTH goes red (cowl 10–36/99 at all six eyes). The crown ring's
height, which the file originally claimed was the load-bearing number,
closes the flanks and not the front.

## STATUS — shipped as a room setting (2026-08-12), three models (2026-08-14)

The lab is no longer the only place a tower exists. `tower` is a room-wide
setting whose value is a **tower id**, never a boolean: `none` (default),
`heartwood`, `bastion` and `blackanvil`, one `TOWERS` registry row per model
after that, and the settings modal shows a picker under the Felt swatches
rather than a switch.
Room-wide because it changes the FILM — every client must bake the same pour —
and it rides the zoom defer rule (`queueTower` / `tryFlushRoomChanges`), so a
change made mid-roll lands at the next roll boundary and never under a film
already baked against the other interior.

**THE FIRST LAW, from Joe, verbatim: "Don't change anything about how the
system works without a tower."** `tower: 'none'` is not a mode — it is the
whole app, untouched. Every tower branch is guarded, and the proof is that the
entire existing suite passes **unchanged**: 48/48, no scenario edited.

**What socketing does.** Deepen the mat by `matExtra` (4.5); send the back-wall
PLANE to z −1000 (moved, never removed — cannon's SAP enumerates pairs in body
order, and a removed body renumbers everything behind it) so the doorway boxes
are the back of the room; add the eight engine colliders — `doorL doorR lintel
towerBack towerL towerR ramp lip`, in that order, always, plus the slick-chute
contact material; add the skin. Unsocket runs it backwards and the world
returns to exactly its towerless configuration. `applyZoom` unsockets and
re-sockets across a preset change, because every offset here is relative to a
z0 the preset moves. ONE builder (`towerColliders`) serves both the lab's
isolated world and the shipped socket, so no world number is written twice.

**What the bake does.** `playRoll` produces a POUR film instead of a throw
film. Per die, from a stream derived from `roll.seed` alone: entry stagger,
a scripted gravity fall with NO physics body from the aim box to the despawn
line, a hidden window with 2–4 baffle clunks injected into the same `sounds`
array real impacts use (`at: null`, tagged `clunk: 'baffle'` so the per-skin
palette can voice them), then the body's first existence at the exit spawn with the
per-die graze height, lane spread, rolling spin and cascade-above-occupants
rule. Everything after that is the ordinary pipeline: real bounces, the
displacement terminator, nudges, face correction, values, chips, the result
card, the log. Sim steps run at 120 Hz (two explicit half-steps per film
frame). Playback hides the mesh outright through a hidden window — the
contract's guarantee, not the model's opacity.

**Exit guarantee, layer 3, as built.** A bake ending with any die hidden or out
of bounds is discarded and re-baked on a nudged sub-seed, up to five, best
kept, and a `console.warn` if all five fail. Two measured faults are recorded
in the code: a poured die going still inside the skin's shadow used to FREEZE
at `SETTLE_STILL` (0.45 s) — before the watchdog's 1.2 s stalled bar — so the
rescue never ran; and the tail cut ate the last-resort strand's own frame.
Measured after both: 1d20 / three-die / 8d6 ×10 / 20d6 all deliver every die on
the **first** bake at ~200 ms; 40d6 delivers 40/40, worst case five bakes and
two strands, 3.0 s of bake, 25 s of film.

**Camera ruling ① is amended for tower rolls** (see `CAM_EASE_S` in
`js/main.js`). A pour makes two camera moves DURING playback: the tower eye
when the film starts, and the framing ladder handed back at the film's FIRST
exit. The ruling's reason — never ask a player to track motion with a moving
frame — does not bind here, because a pour's first second is dice falling into
a fixed PLACE. The amendment's boundaries are its guarantee: those two moves
and no others, both eased over `CAM_EASE_S`, both refused under
`prefers-reduced-motion`, and a thrown roll untouched.

**Still lab-only:** `__diceDebug.towerCore/towerDrop/towerTune/towerLog` and
the isolated world behind them. They are the experiment bench and the shipped
socket does not read `TOWERLAB.tune` for anything but `matExtra`. *(This
sentence was ASPIRATIONAL until v2: `tune.lipTilt` fed the shipped lip
collider through towerVolumes. The portal seam froze the shipped value as
`TOWER_LIP_TILT` and confined the dial to `towerLabVolumes()`; a tower-tag
assertion now proves a dialed lab cannot move a shipped body.)*

**THE SECOND MODEL, AND WHAT IT PROVED (2026-08-13).** `bastion`
(`js/towerbastion.js`) is a stone turret: a battered rusticated plinth, a
drum of ashlar courses in running bond, a string course, a corbelled
crenellated crown, a dressed sandstone gateway with a projecting hood, and one
arrow slit. The shared techniques now live behind `export` in
`js/towerskin.js` — noise, the Sobel height→normal pass, roughness from the
same height field, rounded boxes, planar UVs, the vertex-AO bake, veils — and
Heartwood's rendered output is byte-for-byte what it was, which is the whole
point of exporting rather than forking. Three findings worth keeping:

- **The front of any tower here is a flat facade.** The bore's front tangent
  is `z0 + 0.125` and the SOCKET's face is `z0 + 0.25`: 0.125 of material,
  full stop. Heartwood calls its front board "thin by contract"; Bastion is a
  drum ENGAGED in the back wall for the same reason, round where radius is
  free and flat where it is not. A model's articulation on the facade has to
  be COLOUR, not relief. Relief belongs on the shoulders, the crown, and the
  gate hood.
- **Battlements decorate; a closed ring occludes.** An embrasure is a hole and
  a hole at the top of the shaft is a sightline onto the despawn line.
  Bastion's merlons stand on a solid parapet whose top (y 11.95) is the
  embrasure floor — measured 99/99 on both HARD bands at every shipped eye. A
  literal lid over the bore is NOT available to any model: the entry drop
  starts at y = 11.25 with dice up to 1.25 in radius.
- **Measure the bevel.** three's `ExtrudeGeometry` does not inset the body — it
  leaves the original contour at both ends and pushes the body OUT along each
  vertex's bisector, overshooting to `bevelSize/sin(θ/2)`. 0.041 for a 0.03
  bevel, which put every course outside the socket until it was paid for.

**THE SOUND PALETTE IS REAL (§6).** A `TOWERS` row may carry `clunkVoice` (an
`IMPACT_VOICES` shape), and the playback sound drain voices a `clunk:'baffle'`
event through the SOCKETED TOWER instead of the die set — heartwood a dry
`clack`, bastion a `thud` with a longer tail, blackanvil a `chime` weighted
right down to 0.85 with a 70 ms tail, where the body's sine partial stops
being crystal and becomes the ring off a cast-iron baffle. Every skinned model
must carry one and no two may be the same; `tower-roll` asserts both over the
registry. Render-time only: the knocks'
TIMES are baked from the seed and the bake never learns which tower is
standing, so films and replay hashes are untouched. And a towerless roll has
no clunk event at all, so the FIRST LAW holds by construction rather than by a
guard. The resolution lives in one named function (`impactVoice`) because the
scenario has to ask the same function the drain asks.

**THE THIRD MODEL, AND WHAT IT PROVED (2026-08-14).** `blackanvil`
(`js/toweranvil.js`) is the Emberforge family's forge: a soot-blackened anvil
block whose face carries a barred furnace grate over the casting channel, a
dark fire-brick stack strapped in oxidised bronze with one ember vent, and a
flared crucible lip blackened at the top edge. It cost what the registry
promised — a skin file, a row, one server id — and it moved `bakeStone` into
`js/towerskin.js` so the kit now holds coursed masonry as well as the noise,
the Sobel pass and the AO bake. That move was witnessed by running the
pre-move source and the moved one side by side on Bastion's four parameter
sets and counting differing bytes: 0 across all three canvases each, and
red-checked by moving the mortar's blue channel by one (31067 / 33112 / 4728 /
403 differing bytes). Four findings worth keeping:

- **A GLOW IS LEGAL, AND ONLY THIS ONE.** `emissiveMap` on a
  MeshStandardMaterial, baked from the same seeded canvas pass as the albedo
  and the height — no light, no bloom, no ShaderMaterial. The bake
  (`bakeEmber`) draws cracks as the CONTOUR LINES of a noise field, which is
  why they branch and close into cells the way cooling coal does, and a
  low-frequency heat envelope leaves most of the bed dead so the thing reads
  as banked coals rather than a strip of orange tape. `vertexColors`
  multiplies the diffuse only, so the AO bake darkens the char without
  dimming the seams. Intensities are Joe's dial: 0.90 at the grate, 0.50 at
  the vent.
- **THE FIRST CUT WAS TOO LIGHT, AND THAT IS A VALUE PROBLEM, NOT A COLOUR
  ONE.** Bastion's ledger records saturated buff reading as brass; Black
  Anvil's records mid-brown brick reading as a garden wall. Every ramp came
  down about a third and the tray came with it — a tower's delivery run was
  the brightest object on the table. A dark tower needs its range in the
  bottom third and its separation from TEMPERATURE, not from value.
- **A RED CHECK CAN CORRECT WHAT A FILE CLAIMS.** Deleting the shaft vent's
  emissive bed leaves the COWL band at 99/99 — the bed is the picture, and the
  unlit `towerSkin*` LINING behind it is the opacity. Remove both and the
  check goes red at all six eyes. A tool change was drafted on the first
  reading of that green and reverted once a second run showed the shipped
  sampling already catches a real hole: no churn in shared proof code for a
  bug that was not there.
- **BASTION'S ARROW LOOP IS A PICTURE FRAME.** Looked at in the three-tower
  lineup: its `shadowStone` slot sits 0.012 BEHIND a granite facade panel that
  spans the same x/y, so the granite is in front and the slot never shows —
  the loop reads as a sandstone surround with plain wall inside it. Cosmetic,
  pre-existing, not fixed here. Black Anvil CUTS its facade into panels around
  the grate and the vent for exactly this reason.
  **FIXED 2026-08-11** by the dressing pass, the way Black Anvil said: the
  granite field panel is cut into four around the surround, the slot's stone
  is the backmost surface in the hole, and the sandstone stands 0.06 in FRONT
  of the slot instead of 0.012 behind the field. Still not a hole — it is in
  the COWL band, the slot stone is opaque, the lining stands behind it, and
  occlusion is 99/99 at all six eyes.

## DRESSING — the props every tower carries (2026-08-11)

The three models were shipped as ARCHITECTURE and read as architecture: no
tower had a single thing on it that a person had put there. Dressing is the
pass that fixes that, and it is a distinct discipline from building a skin —
the skin is a shape, the dressing is a sentence about who uses it.

**THE FAMILY TRAIT: a warm focal light on every tower.** All three archetypes
converge on it independently (a cresset, a sconce, a forge), and it is the
single most-cited charm device in the reference material: *a LIT lantern
implies somebody lit it tonight; an unlit one is decoration*. So the registry
row's `ember` slot — added for Black Anvil's grate — is now carried by every
skinned model, and a row without one fails `tower-roll`. The `TOWERLIGHT` rig
turns it into a real PointLight at the coals, because an emissive map shines
and cannot illuminate: without the light a fire is a sticker on a wall. A row
may size its own fire (`intensity`, `dist`); the forge's 14-over-8 painted a
two-metre searchlight up Heartwood's corner post before that existed.

**Where a prop lives, and why the group name is the contract.**

- `towerSkinDress` — opaque props. The `towerSkin*` prefix means tower-fit
  MEASURES them against the socket and the occlusion proof COUNTS them as
  occluders. Both are wanted: a prop outside the socket has to be defended by
  name, and extra opacity can only help the cheat.
- `towerDressFx` — InstancedMesh fields (leaves, tufts, coal) and the smoke.
  Out of `bakeVertexAO`'s parts array, because `Box3.setFromObject` unions
  every instance into ONE box and that box would poison the whole tower's AO;
  and out of the fit hull, because a scattered or transparent thing measured
  as masonry is a lie. tower-fit REPORTS the group's extent under its own
  named class rather than skipping it.

**Every overrun is a named class or the fit is red.** `towerModelAudit`
classifies each mesh that leaves the socket against the engine volume that
grants it: APRON CLADDING, LIP CLADDING, GATE HOOD, FOOT DIP, FLUSH DRESS
(a patch lying on the facade, ≤0.06 proud) and DRESS REACH (a wall-hung prop
forward of the facade, above the play volume, no further out than the gate
hood already is). UNCLASSIFIED fails. **X IS THE ONE AXIS WITH NO SLACK:** the
socket wall is 3.25 and at `close` the mat's own wall is 3.35, so a sideways
prop is a prop through the side of the room. Forward and upward are
negotiable; sideways is not.

**Budgets, and the 3-px rule that sets them.** At the resting eye a world
unit is ~42 px, so 1 px ≈ 0.024 u: a feature needs ≥0.07 u to exist at all
and ≥0.12 u to read as a shape. Stylise up about 2×, then DELETE anything
still under 0.07 and paint it into the canvas instead — rivets, cage bars and
life-size ivy leaves are all textures here, never geometry. Per tower:
≤4k added triangles and a draw-call budget that only merging can meet (ten
props sharing a material are still ten draw calls in three; `mergeGeos`
exists for that).

**Gravity governs all weathering, and tiled UVs cannot express it.** Every
wall texture in this repo tiles at WORLD scale, so a stain painted into the
tile repeats wherever the tile does and cannot know where the bands are.
Weathering therefore lives in two places: broad gravity gradients in the
VERTEX COLOURS (`gravityStain`, world space, applied after the AO bake — zero
triangles, zero textures, zero draw calls), and fine directional runs as
alpha-tested quads sharing one canvas of streak patterns, merged into one
geometry (`bakeStainSheet` / `buildStains`).

**Idle motion is a function of the sim clock and nothing else.** Sway and
smoke ride `TOWERDRESS.t`, accumulated from tick's dt exactly like
SHADER_TIME and the ember breath, so `holdClock` freezes a dressed tower and
its screenshot is deterministic. The idiom is `stepTowerLantern`'s verbatim —
`0.65 sin(ωt) + 0.35 sin(2.63ωt + 1.7)`, non-harmonic so the loop never
closes visibly. `tower-roll` checks the angle against that FORMULA rather
than watching it change, because "it moved" is satisfied by a wall clock.

**PARTICLES ARE OFF-LIMITS.** `js/particles.js` is impact-keyed by contract
("no impact, no particles"). Black Anvil's plume is six fixed quads on a
loop, merged to one geometry with per-quad opacity on a `color` attribute at
itemSize 4, MeshBasicMaterial, never additive, peak alpha 0.30, zero opacity
at birth AND death so the wrap cannot pop.

**Per-tower manifests, as built.**

| | Heartwood | Bastion | Black Anvil |
|---|---|---|---|
| bold | hanging cresset, right post, lit + swaying | gonfalon off the battlement, a third across | smoke plume off the crown |
| | ivy up the shaded left corner (stem panel + 60 instanced leaves) | two heater shields, different devices, unequal | horseshoe beside the grate |
| | moss on the ground course and the shaded cornice slab, + tufts | iron sconce beside the arrow loop (lit) | tool rail: hammer plumb, tongs crooked, one hook empty |
| | hoist beam, slack rope, hung coil | one broken merlon + one pale mortar patch | coal heap at one wall-touching side of the base |
| | one pale replacement board + two sprung eaves boards | water out of the crenel gaps, growth at the damp foot | rust below the bands, soot at the rim, efflorescence mid-shaft, one unrusted band, a 4-link chain |
| dress meshes / tris / draws | 9 / ~1.5k / 9 | 8 / ~1.1k / 8 | 4 / ~1.4k / 4 |

**What the frames said that the plan did not.** Every one of these is a
change made after LOOKING, and they are the reusable part:

- **A cap hides the only face a downward camera can see.** The dossier's
  pagoda cap over the cresset made it render as a black bucket. Cut.
- **A bake's heat envelope is a lottery at prop scale.** `bakeEmber` leaves
  most of a bed dead; on a basket 0.5 across, whether the visible face
  sampled a live seam was luck. `heat: 1.8` for small fires.
- **An alpha-tested plane must not cast a shadow.** three's depth material
  does not carry the cutout reliably: the ivy panel printed a black slab up
  the post with its own stems showing through as pale ghosts. Cutouts light,
  they do not shade.
- **Weathering wants half the value you think.** Rust ran as red paint and
  efflorescence lifted a deliberately-black tower out of the bottom third of
  its range. Both roughly halved.
- **Dark props on dark walls do not exist.** Black Anvil's tools were cast
  iron on soot and invisible at the resting eye; worn steel is both the
  legible answer and the honest one (hands polish what they hold).
- **The crown is at the top of the frame.** The shipped cameras frame the
  MAT, so a plume rising 1.9 units above the crown spends most of its life
  outside the picture. Shortened to 1.15 — and it still reads only from the
  wider eyes, which is recorded rather than hidden.
- **Nothing may sit on the tray.** Dice come to rest there (a 20-die pour
  puts five of them on it) and a skin has no colliders, so a prop in the
  delivery run is a prop dice pass through. The brief's "tongs across the
  tray lip" became tongs on a rail.

**Not done, deliberately:** `tower` in the portable YAML `table:` block.

Scenario: `tower-roll` (tag `tower`), whose swap / socket / voice / pour block
is a LOOP over the registry's skinned models, so a new row is covered the day
it is registered rather than by copying a block. Tools:
`tools/steps/tower-pour.mjs` for the shipped pour, `tower-probe.mjs [n] [seed]
[secs] [tower]` and `tower-occlusion.mjs [tower]` for the lab (both take a
tower id and must be run for every model), `tower-fit.mjs [tower…]` for proofs
(a) and (d) — the socket hull per MESH and the collider count, which had no
tool until the second model needed one — `tower-resting-eye.mjs [tower]`
(parameterised 2026-08-14; it hard-coded heartwood until then) and
`tower-family-shots.mjs [tower] [sibling…]` for the review set a human looks at
before a skin merges, whose sibling list now defaults to every other
registered model. The dressing pass added three more:
`tower-dress.mjs [tower…]` (triangles, draw calls and idle-motion
registrations per group — the budget, measured), `dress-look.mjs [tower]`
(the resting eye plus a named close eye per prop cluster, because "does this
prop earn its triangles" is a different question from "does this tower belong
to the family" and needs a different distance), and `dress-bake-ab.mjs`
(the byte-identity witness for a kit refactor: the bake functions run side by
side against a snapshot of the pre-change source, differing bytes counted over
the shipped canvases, with `--redcheck` to prove the counter can move).

The engine owns one fixed core geometry; tower models are **occluding skins**
around it. The baked film — entry drop, despawn, hidden transit, clunk times,
exit spawn and trajectory — is a function of TOWER_CORE and the seed only,
NEVER of the model. Swapping skins can never change how a roll plays or
replays. (This is the same cheat the whole table runs on: the server declares
the values, the visuals are theater. The tower interior is simply more film.)

Scale anchors, from `js/dice.js` DIE_DEFS: the largest die is the d20,
circumradius 1.25 → Ø 2.5 bounding sphere. d6 edge 1.35. All units are world
units. **THE CORE SCALE `S = 1.25` (sixth lab look):** every dimension in
this document is a BASE value; the shipped core is base × 1.25. Dice are
fixed world-size, and at base scale the clearances were tight everywhere —
the pour proved it die by die. The slope angle and all clearance arithmetic
are scale-invariant; the tunneling thickness only gets safer. The anchor point is `A = (0, 0, z0)` where `z0 = -TABLE_D / 2` — the
midpoint of the back wall. The anchor moves with the zoom preset; the core's
offsets from it never do. Dice are fixed world size, so the tower is too: on
`close` it reads big, and that is physical honesty, not a bug.

## The six engine-owned volumes — since v2, the CLASSIC SPEC's derivation

*(v2 note: these numbers stopped being law and became the classic spec —
what `towerVolumes(DEFAULT_PORTALS)` derives, frozen bit-for-bit by the
contract golden. A portal tower gets the same STRUCTURE with its own
mouth/door numbers. Read this section for the reasoning each number
carries; read the portal contract section at the top for what a new model
actually declares. One correction: §2b's "width 3.0" was drift even before
v2 — the shipped door is 4.0·S, per the radius arithmetic in §5.)*

**1. SOCKET — the maximum exterior hull.** Every vertex of a model lives
inside: `x ∈ [-2.6, 2.6]`, `z ∈ [z0 − 4.2, z0 + 0.2]`, `y ∈ [0, 10]`.
The tower's body stands BEHIND the back wall, outside the play volume — it
spends apron, not felt. Nothing crosses `z0 + 0.2` toward the player except
the APRON.

**2. APRON — the delivery slope, and it runs the WHOLE tower floor.**
An engine-owned static box, rotated: the top surface is a 28° slope from
deep inside the tower (`z0 − 3.6` base, under the shaft) down through the
doorway sill `(z0, y 0.8)` to the felt at `z0 + 1.5` — the bottom baffle
IS the exit ramp, so the interior has no flat floor a knocked-back die
could rest on (probe run 9). A flat slick LIP (its own box, ~5° tilt,
0.08 proud of the felt) extends the outrun from the chute base to
`z0 + 3.9`: the die's first flat contact levels it without eating forward
speed, and the tilt drains parked dice — a dead-flat lip was a parking
lot that grew until it latched the door (probe run 5). Both faces are a
28°-family slope
(`atan(0.8/1.5)`), width `x ∈ [-1.9, 1.9]`, and it is a SLICK CHUTE: its
own contact material, friction 0.03, restitution 0.3 — polished slide,
not felt. At felt friction (0.25) dice stalled on the 28° slope (fourth
lab look); wall restitution (0.7) trampolined the first flat-tray cut;
and a step's edge hop read as artificial where a slope lets gravity make
the delivery ("let physics help us out more", third lab look). It also keeps settled dice from rolling under the exit,
and it is thick: 1.0 through its face — tunneling arithmetic, since a die
at hand-throw exit speed covers ~0.33 per 60 Hz step and the 0.3-thin
first ramp let dice pass straight through and vanish underneath (fifth
lab look). Sim steps near the tower run at 120 Hz for the same reason. Models may SKIN
it (a wooden chute, a stone slide) but never alter, extend, or duplicate
its collision. Models add zero colliders, ever; that is what makes a skin
swap replay-safe.

**2b. DOORWAY — the opening in the back wall.** While a tower is socketed,
the back wall is not an unbroken plane: it carries an engine-owned clear
opening centred on `x = 0`, width 3.0, height 3.6 (wall segments flank it).
The exit spawn sits BEHIND the wall plane, and the die flies out through
the doorway — this is what makes emergence read as travel. A model's port
must align with the doorway and may decorate its frame, never narrow it.

**3. MOUTH — the entry.** A clear vertical shaft of aperture ≥ Ø 3.4
centred on `(0, z0 − 1.6)`, rim top edge at `y = 7.0 ± 0.5`. The engine
drops dice through the aim box `|x| ≤ 0.4, |z − (z0 − 1.6)| ≤ 0.4` from
`y = 9`. The entry fall is SCRIPTED — hidden dice have no physics bodies,
and the mouth has no rim colliders — so a model cannot deflect an entry.
Aperture arithmetic: d20 radius 1.25 + aim jitter 0.4 → clear radius 1.65;
Ø 3.4 leaves 0.05 of visual margin. Do not shrink the mouth below Ø 3.4.

**The COWL (added 2026-08-12, first lab look):** the mouth's +z face must be
occluded from `y = 6.2` up to `y ≥ 8.6`. Derived, not styled: the shipped
cameras look in OVER the front rim, and at the `wide` eye the sightline
reaches y ≈ 6.4 inside an open-top shaft — below a d20's top at the despawn
line, so the vanish would be watchable. 8.6 closes the leak at every shipped
eye with margin. A hood, a canted funnel roof, a chimney cap — any shape
works if the +z projection covers that band. Dice remain visible falling
from above the cowl; the despawn happens in its shadow.

**SUPERSEDED 2026-08-14 — the VOLUME stayed, the sampled BAND came down**
(`js/main.js` `v.cowlY`, commit fe1987c). The `8.6` above is the top of the
cowl VOLUME, and for two days it was also the top of the band the occlusion
proof shot rays at. Those are not the same claim. The paragraph's own
reasoning says what the band is for — the sightline must not reach "a d20's
top at the despawn line" — and that is arithmetic, not a constant: a die
vanishes when its CENTRE crosses `despawnY`, so the last watchable point is
`despawnY + a d20 radius` and there is nothing above it to hide. The band is
capped there:

```
  ct = despawnY + 1.25      cb = ct − 2.4·S      samples [cb+0.15, mid, ct−0.15]
```

Classic top sample 10.60 → 8.10; Hollow Bole 11.25 → 8.75. Because
`despawnY` is `rimY − 1.4·S` for every spec, the band's top edge is
`rimY − (1.4·S − 1.25)` — **0.5 BELOW the mouth's rim at the shipped S, on
every tower that will ever register** — which is the whole point. (It is
S-dependent and not a law of the universe: an S under 0.893 would put the
cap back above the rim, and `tower-roll`'s rim bracket is what would say
so — correctly, because the band would again be sampling sky.) Over
a hooded architectural tower the old band was inside the building and cost
nothing; over a broken stump it was SKY, and every ray it fired was at a
point where a die is still visibly falling in and is *meant* to be seen. A
model that satisfied it there had to grow a black cylinder over its own crown
(Joe, at the round-7 frame: "I don't think we need the black cylinder visibly
sticking out the top of the stump"), and the proof was green the entire time
that object stood there. **The band was mis-derived, not the model
mis-built.** All four towers hold 99/99 on both bands at all six eyes after
the cap, and muting a shell still takes it red, so it can still fail.

The cowl VOLUME is untouched and still means what it meant: it is where a
facade occluder BELONGS on a tower built like a building. It was never the
same place as the points being shot at. Proofs: `tower-roll` brackets
`cowlY` against `despawnY + flight.r` and the declared rim for every
registered row; `tower-hollowbole` and `tower-glb-loader` assert 99/99 on
both hard bands at all six eyes.

**4. OCCLUSION — what a skin must hide, from every shipped camera** (the
steepest is the `close` preset's mini eye; check that one and the rest
follow). (a) The SHAFT: a falling die is fully hidden by `y = 5.8`; despawn
happens at `y = 5.6`. The model is opaque around the shaft from `y = 5.8`
down to the hood. (b) The HOOD: `x ∈ [-1.7, 1.7]`, `y ∈ [0.8, 3.2]`,
`z ∈ [z0, z0 + 0.5]` — the shadowed pocket over the apron where exit spawn
happens. A die materialising inside the hood must not be visible until its
own motion carries it out.

**5. EXIT — the spawn inside, the flight out.** The model leaves the hood's
front face clear: width ≥ 3.0, clear height from apron top (`y = 0.8`) up
to ≥ 3.4, aligned with the DOORWAY. The body first exists at
`P = (x: ±0.6 seeded, y: 2.0, z: z0 − 1.2)` — a full unit INSIDE the tower,
in occluded interior, already tumbling at exit speed. Emergence must read
as TRAVEL through the doorway, never materialisation at the spout (first
lab look; also: y = 1.6 overlapped the apron box at spawn for a d20, and
the penetration resolver's kick read as a launch — y = 2.0 clears it).
Velocity seeded from: speed 14–20 u/s — hand-throw speed (14–22 leaves
the hand on a normal roll); 9–15 stalled on the ramp, 6–11 read as
dribbling — yaw within ±12° of +z (chutes throw straight; ±30°
clipped the door jambs — clearance is radius arithmetic: 0.4 jitter +
tan 12°·0.9 travel + 1.25 d20 radius ≈ 1.84 against the door's 2.0),
pitch PARALLEL TO THE CHUTE: −28° ± 3° (seventh look — horizontal
launches fell ~2 units under g=−110 and arrived nearly vertical at
~20 u/s; the normal impulse plus its friction bite ate the forward
motion in one contact, and the pour jammed at its own doorstep; grazing
the slope, the speed survives). Spawn height is PER-DIE arithmetic
(eighth look — the first version forgot the gravity drop over the
run-up, and dice arrived below the sill, slammed its end-face, and
bounced back into the tower):

    y = sill + 0.15 margin + die radius
        + runup·tan(slope)                          (slope drop)
        + g/2 · (runup / (cos(slope)·speed))²       (gravity drop)

with `speed` this die's own seeded exit speed. One formula clears a d20
and a d4 alike; a fixed height cannot, because the radius and the
speed-dependent gravity term both move the answer by more than the
margin.

**DICE EXIT ROLLING (Joe, eleventh look — "the dice should have gained
angular momentum in the tower").** Exit spin is matched to the exit
velocity: ω = v/r about the horizontal axis perpendicular to travel
(tilted with the yaw), tumble jitter on top. This is not decoration; it
is the carry mechanism. A die SLIDING on felt is savaged by kinetic
friction (the "felt-slap tax" that made carry non-monotonic in speed and
drove the dial to 60–80); a die ROLLING at matched spin barely feels the
felt at all. Probe, the first clean sheet of the whole campaign: 8-die
pour, 8 exits, zero rescues, all 8 delivered to open felt, tray empty. The die rides the chute and leaves its end at a shallow angle
that skips across the felt — the felt itself is the shared table physics
and is never retuned for the tower.

**The EXIT GUARANTEE (probe runs 1–10):** a die may never rest hidden and
may never be lost. Three layers, each earned by a measured failure:

1. **No mutex — the pile is the mechanism.** Every wait-your-turn scheme
   deadlocked measurably (landing-zone guard: 3/20 out; behind-wall
   guard: pit dice blocking each other's rescue; spawn-sphere guard: a
   propped die 0.18 past the stalled cutoff latching everything). Exits
   never wait: a die whose lane is occupied spawns ABOVE the occupants
   (capped under the lintel) and cascades off the pile, which is exactly
   what a real tower's stream does to its own tray.
2. **The interior cannot hold a die.** The chute runs the whole tower
   floor (§2), so knocked-back dice slide back out by gravity; and a
   WATCHDOG catches the rest — a die LOST (out of bounds, under floor,
   NaN) or STALLED in the skin-occluded zone, slow and old, is RE-QUEUED:
   it stops being a body and re-enters the hidden-transit queue (a
   teleporting rescue deadlocked when its target was occupied; a die
   that does not exist cannot conflict). With a skin on this reads as
   time on a baffle.
3. **The bake is the last backstop.** The lab steps live; the FEATURE
   bakes the pour offline before frame one. A bake that ends with any
   die hidden is discarded and re-baked with a nudged seed — the one
   remaining lab failure class (a heavy-congestion seed leaving one die
   creeping behind the door) is solved by construction in the product.

Measured (probe, 25–45 s windows): 8-die pours CLEAN across seeds;
20-die pours CLEAN or 1-hidden on the worst congestion seed — the class
layer 3 exists to absorb. Everything
after spawn is the normal pipeline — real bounces, displacement
terminator, face correction, tempo curve — untouched.

**6. TRANSIT — the cadence and the sound.** All seeded. Entries POUR at
0.12–0.2 s per die — time-staggered, never height-staggered (equal height
gaps compress to ~50 ms arrival gaps at terminal speed; measured in the
first lab cut, which exited "kinda all at once"; 0.25–0.4 s then read as
too spread — the pour should feel like one motion of the hand). Hidden transit 0.5–1.6 s
per die; exits staggered ≥ 0.2 s apart. 2–4 synthetic baffle clunks per die
at seeded film times,
injected into the same film-time click gate the table already uses. Models
register a SOUND PALETTE (wood / stone / metal — a sample set), never
timings.

## What a model must prove

A tower model is valid iff: (a) it fits the SOCKET; (b) it occludes the
SHAFT and HOOD volumes from the shipped cameras; (c) it leaves the MOUTH
and EXIT apertures clear; (d) it contributes no colliders. Four checks, all
geometric, all testable headlessly against the model's mesh.

**THE TOWER BRINGS THE ROOM IT CONSUMES (twelfth look).** Its tray band
eats ~4 units of mat depth, so socketing a tower DEEPENS the mat by
`matExtra` (4.5 — Joe's dial, thirteenth look: "with that in place
everything works") — walls, shadow frustum and camera framing all
follow, exactly like a zoom change — and unsocketing restores the preset.
In the feature this rides the same room setting as tower on/off, so every
client agrees on the walls. Measured: with the deeper mat the 20-die
stress pour went fully CLEAN for the first time (15 felt / 5 tray, 4
re-queues, none hidden).

## Consequences worth naming

- *(NARROWED by v2 — see the portal contract section.)* Because the film
  never reads the model — only its portal SPEC — towers sharing a spec are
  per-viewer cosmetic candidates (ruling ② pattern), and all four classic
  towers share `DEFAULT_PORTALS`. Towers with DIFFERENT specs bake
  different films, exactly as tower ON/OFF always did, and ride the same
  room-setting defer rule (never mid-roll).
- The mouth/shaft sit behind the back wall plane. Scripted entries never
  touch physics, so the wall never sees them; the one body that ever exists
  near the wall is the exit spawn, placed inside it and moving away.
- MAX_DICE_ON_TABLE (40) and every settle/nudge invariant apply unchanged —
  the tower changes where dice enter the felt, not what they do on it.
