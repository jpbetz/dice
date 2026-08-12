# TOWER_CORE — the tower geometry contract

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
socket does not read `TOWERLAB.tune` for anything but `matExtra`.

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

## The six engine-owned volumes

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

- Because the film never reads the model, tower SKINS are per-viewer
  cosmetic candidates (ruling ② pattern — like the camera, invisible to
  other players). Tower ON/OFF, by contrast, changes the film and is a
  room setting with the queueZoom defer rule (never mid-roll).
- The mouth/shaft sit behind the back wall plane. Scripted entries never
  touch physics, so the wall never sees them; the one body that ever exists
  near the wall is the exit spawn, placed inside it and moving away.
- MAX_DICE_ON_TABLE (40) and every settle/nudge invariant apply unchanged —
  the tower changes where dice enter the felt, not what they do on it.
