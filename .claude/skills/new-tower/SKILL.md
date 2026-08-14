---
name: new-tower
description: Ship a new dice tower — a forge-baked GLB MODEL with declared dice-in/dice-out portals, a registry row, and a sound palette — at contract rigor. The portal contract, the bake gates, the four proofs, the agent split, the review gate, and the traps, in order.
---

# Shipping a new dice tower (v2 — the portal + GLB path)

A tower is a **MODEL** (a forge-baked GLB that declares its two PORTALS), a
**REGISTRY ROW** (id, label, glbUrl, title, `clunkVoice`, `ember`, flags),
and optionally code-side **DRESS** (idle-motion FX the bake cannot carry).
Nothing else. The physics, the film, the exit guarantee, the camera and the
socketing are DERIVED by the engine from the model's portal declaration —
`towerVolumes(spec)` computes the whole core from `{in: {x, z, rimY,
clearR}, out: {x, sillY, w, clearH}}` — so a model asks for its mouth and
its doorway and receives a consistent tower around them. docs/TOWER.md's
"THE PORTAL CONTRACT" section is the law; if a tower seems to need engine
changes, stop: either the contract has a gap (fix docs/TOWER.md first,
separately) or the design is wrong.

The three CLASSIC towers (heartwood, bastion, blackanvil) are code-built
skins on `DEFAULT_PORTALS` from before this contract; they are maintained,
not imitated — see the appendix. NEW towers take this path.

## 0. Read first, in this order

0. **If you are a worktree agent: `git merge --ff-only master` before
   anything** — this stack landed recently and an old worktree may predate
   all of it.
1. docs/TOWER.md — the portal contract section (what you declare, what is
   derived, the limits and their arithmetic), then the classic-spec section
   (the REASONING each engine number carries — read it before arguing with
   a limit).
2. tools/forge/README.md ("Tower portals" + the trap list) and the
   `/forge-model` skill — the bake pipeline your model goes through.
   tools/forge/recipes/hollowbole.py is the worked organic example;
   tools/forge/recipes/tower_fixture.py is the minimal portal example.
3. js/towerglb.js (the loader: extras → portals, validation, house-rules
   pass, the z0 seat) and the TOWERS registry in js/main.js (search
   `const TOWERS`) with its theme-family pairing comment.
4. The proof surface: `__diceDebug.towerPortalSpec(id)` (the numbers tools
   read), `towerModelStatus(id)`, the step tools (tower-fit, tower-occlusion,
   tower-probe, tower-pour, tower-resting-eye, tower-family-shots,
   tower-dress, dress-look — all take a tower id; fit/dress default to the
   whole registry), and scenarios `tower-roll`, `tower-glb-loader`,
   `tower-contract-freeze` in tests/e2e/scenarios.mjs.

## 1. Design before code

Write the tower's one-paragraph identity first: material, silhouette
(three parts — base, shaft/body, crown — readable at the resting eye), and
its theme-family pairing (towers are named for a die in a theme house; the
pairing list lives in the TOWERS registry comment — extending it is part
of the deliverable). Then:

**1.5 Plan the PORTALS before you sculpt** — this replaced the old "measure
the free volume" step, and it is cheaper: you are not fitting a skin around
fixed volumes, you are choosing where the volumes go.

- portalIn (the mouth): where dice fall in. `clearR ≥ 1.6·S = 2.0` is
  dice arithmetic, not taste — and it is MEASURED arithmetic (2026-08-13
  portal-floors campaign): entry is a scripted fall whose worst-case
  reach is exactly aim jitter 0.566 + d20 circumradius 1.25 = 1.816, so
  the floor keeps a 0.18 reserve and nothing more. The approach column
  (disc of clearR, from rimY + 2.5 down to rimY − 1.4·S) must be
  genuinely open — crown decoration leans OUT of it. Entry is scripted
  (no colliders), so the mouth cannot deflect a die; it only has to be
  visually believable and contractually clear.
- portalOut (the doorway): where dice fly out. Near-classic sill is the
  cheap path ("entry cheap, exit reopens the probe campaign" — the limits
  exist so the tuned delivery physics generalizes, and any off-classic exit
  answers to the probe matrix). THE HEIGHT FLOOR IS ABOUT PILE-UPS, NOT
  THE BIG DIE (the campaign's central finding): a lone d20 needs only
  r·(1 + 1/cos(pitch)) + 0.2 ≈ 2.85 over the sill and cleared a 2.6 door
  single-file in every probe, but dice climbing dice at the doorway push
  higher, and exit-guarantee retries turn up at 3.0. `clearH ≥ 2.7·S =
  3.375` runs every realistic pool clean; a door AT the floor makes 20+
  dice pools spend occasional extra offline bakes, and 40d6 already
  exhausted the guarantee at the classic 4.5 door (the recorded worst
  case — the floor did not create it). `w ≥ 3.2·S = 4.0`: jambs CHANNEL
  rather than jam (a wide die deflects inboard and leaves), so the width
  floor is about giving congestion somewhere to shed under a low lintel,
  not about fitting one die. Design the WOUND to the floor, not above it,
  when the form wants a tight mouth — that is what the floor is for.
- Re-probing an exit: `node tools/drive.mjs tools/steps/portal-probe.mjs`
  (baseline/sweep/confirm) measures envelopes and retry knees against any
  candidate spec via `towerProbePortals` — the campaign is repeatable
  whenever the pour physics or the spawn formula changes.
- Check every number against TOWER_PORTAL_LIMITS *while designing* — the
  bake gate and the loader both refuse violations, but a refused bake is an
  hour late to a decision a sketch could have made.
- The limits are NECESSARY, not sufficient: the ENVELOPE decides what can
  be BUILT around a legal spec. The composite arithmetic (derived five
  pinch-rounds deep in tower_fixture.py's header): body half-width ≥
  |in.x| + clearR + side wall; interior depth ≥ the bore's whole diameter
  + two walls; and at max clearR the envelope PINS in.z to ~classic. Run
  that arithmetic at sketch time.
- The model is authored with z = 0 at the back-wall socket plane, y up,
  +z toward the player, world units (d20 radius 1.25). The engine seats it
  at the live z0. Hull stays inside x ±3.25 (X HAS NO SLACK — the mat's
  physics wall is 3.35); backward is the venue-grounds budget; height is
  framing judgment, not law (crown ≈ 12-13 reads at the resting eye).

HOUSE VISUAL RULES (enforced by the loader + audits, so design to them):

- The loader normalizes materials (MeshStandardMaterial family from glTF,
  envMapIntensity 0.45, shadows on, baked lights STRIPPED — the tower's one
  light is the registry `ember`). ShaderMaterial is off-policy. Emissive
  belongs to material emissive, small and palette-tinted.
- Vertex colors are LINEAR COLOR_0 and they are the whole paint story —
  seeded, procedural, in-recipe. Value discipline: the tower is a tertiary
  field under the room's light; dice are always brightest. Set material
  ROUGHNESS deliberately (forge trap 11: the 0.5 default is a specular haze
  that fakes value on everything matte).
- OPACITY IS LOAD-BEARING. The interior is empty and the fall is a film.
  Every sightline through ANY opening (mouth, wound, window) must end on
  opaque `towerSkin*`-named geometry — for an organic form that means an
  interior LINER shell, sized to the dice FLIGHT ENVELOPE and painted so
  dark wins with depth (deepest visible < any lip value — measure pixels,
  don't argue). An open crown is legal only if the despawn point is
  invisible from every shipped eye — the occlusion proof decides, not the
  argument.
- NAME YOUR OCCLUDERS: every mesh that hides the cheat is `towerSkin*` in
  Blender (names survive the GLB). check.py refuses a model with none; the
  audits measure only named groups.

## 1b. Grounding geometry — where the model meets the ground (W2c)

The MODEL owns its transition into the venue's floor (composition rule 11;
the venue paints only the ground's answer). The construction that works,
learned by rejecting the one that doesn't (hollowbole round 6's first berm
was an extruded profile with parapet rails — a ramp in a dirt costume):

- **The pile is the object; the functional surface is CARVED through it.**
  Build terrain as a HEIGHTFIELD over a footprint of 3–4 overlapping
  noisy-rim lobes (each falling to zero at its own boundary — no end-cap
  face can exist), then carve the dice lane: collider plane EXACT inside
  the lane, a capped shoulder blend that keeps the throat gate clear by
  construction, pure mound beyond. Never model the lane and decorate its
  edges — that ordering is the ramp trap regardless of paint.
- **Silhouette law**: no straight outline run over ~0.8 u in any rendered
  view; the crest visibly broken by asymmetric shoulders. Trace it on your
  own sheets before returning.
- **Feather under the floor** (top y just below the venue ground plane at
  every outer edge); part-sunk clods where skirts meet ground — but every
  solid stays OUT of collider footprints and dice lanes; expect the
  aesthetic spec to meet the gates and resolve TOWARD the gate, recording
  each collision as a reversible decision in the recipe.
- **Paint is the finisher, never the fix** (a 0.39 value drop left round
  4's tongue a plank). Earth sits near the venue's soil family, below the
  trunk's value; ground-moss constants MIRROR the venue's builder tones
  with a cross-referenced drift warning; no material story may be
  "it is a ramp".
- **Judge value against the venue's floor**: the forge rig has no ground,
  so add a disc of the venue's floor tone under the model in preview —
  "no color seam with the glade" is unjudgeable without one. Measure
  (rendered-pixel ratios vs floor and trunk), don't argue.
- **Palette variants carry palette earth** — and the APP swaps them by
  RESKIN on venue flip (towerReskin; variants must share portals + geometry
  digest or the swap is refused). If your variants differ only subtly,
  test the flip anyway: pale-wood rounds hid a never-re-dressed bug for
  two rounds (TESTING.md P8).

## 1.9 THE LOOP — plan, bake, look in the room. In that order.

This replaced "iterate in the forge preview" on 2026-08-13, and the reason is
measured rather than preferred: on the nullstone build the LOOK LOOP COST MORE
THAN EVERYTHING ELSE IN THE JOB PUT TOGETHER — more than reading the contract,
authoring the recipe, integrating it and proving it, combined. The gates cost
four minutes of machine time across seven bakes and caught five real defects.
The loop is the thing to make cheap.

```bash
# 1. what does this spec leave me room to BUILD?      (seconds, no Blender)
~/opt/dice-forge/venv/bin/python tools/forge/towerplan.py --recipe <recipe>.py
# 2. bake + the nine refusals                          (~30 s)
tools/forge/bake.sh <recipe>.py --tower --expect-colors --max-tris 15000
# 3. six views IN THE ROOM, one sheet, gates printed   (~40 s)
node tools/drive.mjs tools/steps/tower-try.mjs tools/forge/out/<slug>.glb
```

- **PLAN FIRST.** Four of nullstone's five gate failures were pure arithmetic
  on the socket and the spec — a rear facet inset past its budget until the
  outer skin was inside the bore, splinters 2.08 from the axis inside a 2.20
  drop. `towerplan.py` prints the per-heading budget, the doorway's jambs, the
  lane's planes, and **how tall the front must be**. Read the table; do not
  discover it one refusal at a time. §7's front-height table has TWO columns
  and `need` is their max: HIDE (the occlusion ray) and VANISH (a die must
  blink out at or below the mouth, never in mid-air over it). Either can
  bind — on nullstone VANISH wins at every eye, and while it went unprinted a
  model built exactly to the published figure was refused by its own bake.
  The section proves its answer against the gate's inequality before printing
  it, so if that line ever says BAD, believe it over the table above it.
- **NEVER JUDGE VALUE IN THE FORGE PREVIEW.** Its rig is not the room's. Four
  rounds of nullstone's colour were decided there and every one was retaken
  the moment an app frame existed: at an albedo that read as black stone under
  the preview's lamps, the model was a cut-out in the grounded room with no
  facets, no fissures, and an ember lighting nothing. The preview answers "did
  it bake"; only `tower-try` answers "is it a tower". Use the preview for
  geometry sanity and nothing else.
- **ONE SHEET, NOT SIX FRAMES.** "This reads as a wastebasket" is a judgement
  about the whole object and no single frame carries it. `tower-try` sockets a
  raw `tools/forge/out/*.glb` through a throwaway registry row — nothing is
  promoted, nothing is committed — so a rejected round leaves no trace.
- **THE GATES CANNOT SEE A WASTEBASKET.** nullstone round 1 passed every
  refusal in the contract (occlusion 99/99 at six eyes, lane clad 243/243,
  throats clear) and rendered as a picket fence around a bucket. The contract
  proves a tower is LEGAL. Only a frame says it is a tower.
- **MASS, THEN DETAIL.** What fixed that round was one solid with grooves cut
  INTO it, replacing parts arranged around a void. Get the silhouette and the
  massing right on the sheet before spending a round on paint.

## 2. The build, agent-shaped

- Model builder agent (opus) iterates the RECIPE in a worktree via the
  `/forge-model` skill: brief → **towerplan** → recipe → `bake.sh <recipe>
  --tower --expect-colors --max-tris 15000` → **tower-try sheet in the room**
  → repeat (§1.9 — the preview is for geometry, never for value). A recipe is
  a SHAPE and a PAINT: the battery comes from `towerkit.run_battery`, which
  returns the gates it ran so nothing is asserted by a hand-kept manifest.
  Budget:
  hero ≤ 8k tris including liner/roots/cladding; min feature 0.07 u.
  Digest-stable across consecutive bakes. The chute may be skinned INTO the
  model (the exit gate is ramp-aware); a model may clad the engine apron/lip
  for its own declared sillY by mirroring the engine slope arithmetic.
- App integration (same or second agent, worktree — another session may be
  writing js/main.js): registry row `{id, label, glbUrl, title, clunkVoice,
  ember, …}` + the theme-pairing comment line + the id in server.js
  SETTING_SPECS' tower row (server.js changed ⇒ ONE restart of the live
  8123 at merge time, from the main session only) + the GLB(s) SHIPPED with
  `node tools/forge/promote.mjs <slug…>`, which does the bytes, the
  static-cache list and the digest baseline (including the file `sha`) as one
  reviewed diff — read it, that is the gate. The manifest-less server serves
  anything under ROOT, so the TEST is what notices a missing file, and the
  `sha` is what notices a STALE one: `static-cache` refuses a shipped model
  that is not what the recipe writes. A promote is a MAIN-SESSION act and
  `bake.sh` deliberately does not do it.
- The main session (Fable) holds the review gate and never delegates it.
- The dogfood order is fixed: bake gates green BEFORE integration; the
  review gate LOOKs at preview sheets BEFORE the app sees the model, and at
  in-app frames before anything merges.

Sound palette: `clunkVoice` is an IMPACT_VOICES shape ({body, weight,
sustain, shaft}), resolved through `impactVoice()` — render-time only; the
film never learns the tower's voice. No two rows may share a palette
(tower-roll asserts it). Every skinned row carries an `ember` (the family
trait: a lit lantern implies somebody lit it tonight).

## 3. The proofs

All headless, all against the BUILT state (bake gates against the GLB,
audits against the loaded scene graph). Rules about proofs themselves:

- **Red-check every assertion you add — and the WITNESS too.** Break the
  subject, watch red; break the checker, confirm it can move. Keep the
  ledger in the scenario/tool header comments.
- **A geometric proof forces `updateMatrixWorld()`** (the audits do; a new
  one must).
- **Before comparing a tool's output across a change, run it A/A on
  unchanged code first** — tower-probe's timestamps have a real noise
  floor; verdict CLASSES are the stable claim. Chasing phantom drift and
  shrugging at real drift are the same mistake with opposite signs.
- **A green from the wrong frame is still green**: the loader once seated a
  model at z=0 (mid-felt) and portals, colliders, mat depth and delivery
  ALL stayed green — only the z0-relative hull audit could see it. Fit
  runs are not optional.

The gates and proofs, in order:

- (bake) `check.py --tower`: portals present/legal, approach + exit throats
  clear by raycast (ramp-aware), the SOCKET ENVELOPE per mesh node
  (tilt-aware — pass your skin's lean via --tower-tilt-deg), towerSkin*
  present, budget, plus the standard mesh gates. Red-checked planted
  defects live in its history. "Bake gates green" and "the model fits"
  used to be different sentences; the envelope gate exists because the
  first shipped bake proved it.
- (load) js/towerglb.js re-validates portals and applies house rules; a bad
  model is REFUSED loudly and the table keeps its current tower.
- (a) FIT — `tools/steps/tower-fit.mjs <id>`: hull vs the room envelope,
  every overrun a named legal class, eight colliders exactly, restore on
  unsocket.
- (b) OCCLUSION — `tools/steps/tower-occlusion.mjs <id>`: shaft + cowl
  bands 99/99 from every shipped eye; the grids follow YOUR declared bore.
- (c) THROATS/BEHAVIOR — `tower-probe.mjs 8 42 14 <id>` CLEAN (cut lines
  come from your spec), `tower-pour.mjs '<pools>' <id>` for the shipped
  pour, and for an off-classic exit: the probe matrix (multiple seeds ×
  pool sizes) before calling the sill final.
- (d) ZERO COLLIDERS — tower-fit asserts the world body count.
- e2e: `tower-roll`'s registry loop covers a new row the day it registers
  (voice distinct, pour delivered, swap through the towerless body list),
  and `tower-dressing` — the COSMETIC lane, `--only look`, 13s and no dice —
  covers its groups, its skin as an aggregate, its dressing budget and its
  ember. `tower-glb-loader` pins the loader path itself. A venueOnly tower
  keeps its venue scenario. **`tower-contract-freeze` will go RED on a new
  row and that is the gate working**: every registered tower must have a
  frozen contract, so re-capture with
  `node tools/drive.mjs tools/steps/tower-contract-capture.mjs` and review
  the diff — a new tower ADDS rows and moves no number. If an existing
  number moved, you changed the classic core, which is not what shipping a
  tower is.
- `npm test` — the FIRST LAW is measured by the untouched suite: with
  tower 'none' the app is byte-for-byte the old one.

## 4. The review gate (main session, never skipped)

1. Re-run npm test, the tower tag, fit/occlusion/probe for the new id
   YOURSELF — the builder's green is a claim.
2. LOOK before accepting: preview sheets (several az/el, lit + normal) at
   recipe time; in-app frames at integration time — resting eye (the frame
   players see most), tower eye, wound/door close, crown, pour mid-flight
   (expect a sliver — the film probes are the real entry evidence), family
   lineup (`tower-family-shots.mjs`), and BOTH palettes for a palette-
   variant tower. Judge against the design brief's gap list, item by item,
   and send it back with a NUMBERED verdict — "make it better" is not a
   review.
3. Read the load-bearing diff yourself (registry/server/loader paths,
   first-law eyes on).
4. `git merge --ff-only` to master; restart 8123 iff server.js changed.
5. Docs land WITH the build: TOWER.md STATUS, UX.md §7.31 (or the venue's
   §), ROADMAP. A registry row without its docs is not shipped.
6. Report with an honest ledger: what was skipped, what is debt, what is
   pre-existing red. Production deploy only when Joe asks.
7. Fold what the build taught back into THIS FILE and the forge trap list.

## 5. Dressing (unchanged discipline, new split)

The dressing pass (props, weathering, idle motion) keeps its own rules —
pixel budget at ~42 px/unit, density odd counts, gravity-down weathering,
`towerSkinDress` vs `towerDressFx` groups, sim-clock sway — see the
appendix for the full text. NEW under v2: STATIC dress (mushroom shelves,
stones, bark plates) bakes INTO the GLB (embed by epsilon — floating props
read as glitches at any distance); only MOVING dress (sway, smoke,
attendants) stays code-side, declared on the registry row so the e2e loop
knows what to assert. bakeVertexAO never runs on a baked model — its
colors arrive final.

## Known traps (each cost a real debugging session)

- The GLB frame: a model is authored at z=0-at-the-wall and owes exactly
  ONE offset (the z0 seat, applied by towerGlbSkin). Everything else being
  green does not prove the seat — only the z0-relative hull does.
- The port mask sizes to the dice FLIGHT ENVELOPE (~2.05 half-width), not
  the collider gap — cutting the full door width tears the front off (the
  "black rectangle incident").
- Interior value order: a liner that is painted dark but LIT reads pale
  through the wound (roughness! — forge trap 11). Measure pixels at depths;
  deepest visible must win.
- Portal empties are scene-root, translation + extras, ONE home per datum;
  `export_extras` and the non-mesh selection path are already handled by
  `forge.tower_portals()` — do not hand-roll empties.
- A registered-but-unloaded GLB row resolves to classic volumes with a
  console.warn — a probe/pour run right then is measuring the WRONG core;
  tools wait on `towerModelStatus(id).ready` (tower-probe shows the idiom).
- TDZ: renderTowerPicker runs during module evaluation — registry
  references must be declared above it.
- `clearTable()` does not end a roll — `settle()` first, then switch
  towers, or the swap parks in pendingTower.
- A tower→tower swap passes through the towerless body list (SAP order);
  never mutate in place.
- aria-checked (not aria-pressed) for picker chips; the chosen chip must be
  PAINTED differently (tower-roll pins it).
- Do not touch applyZoom's unsocket/re-socket bracket.
- An alpha-tested plane must not castShadow (prints a filled rectangle).
- `vertexColors: true` over a geometry with no color attribute renders
  BLACK. The loader sets the flag from the attribute — keep it that way.
- Two n-gons sharing a diagonal can leave FOUR faces on one edge after
  canonicalize+triangulate (forge trap 12) — poke the hazard faces.
- Upward-facing surfaces out-value walls at EQUAL albedo (they aim at the
  key light): the hollowbole tongue's attributes measured under the shell's
  yet rendered brightest on the model. Compensate in the bake, and verify
  by RENDER measurement — pixel probes classified by raycast against the
  live meshes — never by comparing attribute values.
- A scalar albedo gain preserves LINEAR contrast and flattens what the eye
  reads (sRGB compression): the tongue's streak spread went 0.024 → 0.009
  under a pure gain and needed the fiber term doubled as a second lever.
- The occlusion COWL band over a high-rimmed open crown is carried by the
  interior liner's upper CURTAIN (rays through crown notches die on dark
  liner), not by wall — and the curtain's required height is a RAY
  CROSSING to measure, not a number to estimate (the estimate leaked;
  the measurement said 11.78, built 12.03).

## Appendix — the classic code-skin path (maintenance only)

heartwood/bastion/blackanvil are code-built skins (`build*Skin(v)`) on
`DEFAULT_PORTALS`, sharing the exported towerskin.js kit (seeded canvas
bakes + Sobel normals, roundedBox, planarUV, raycast vertex-AO, black
BackSide lining, veils, contact shadows). Maintaining them follows the v1
process this file used to describe — kit changes move INTO towerskin.js
with an A/B bake witness (differing bytes counted over the owner's
parameter sets, red-checked by moving one channel); the front of a classic
tower is a flat facade (0.125 of relief); battlements need a closed
occluder behind them; measure ExtrudeGeometry's bevel (it pushes OUTWARD by
bevelSize/sin(θ/2)). The full v1 text lives in git history
(`git log --follow .claude/skills/new-tower/SKILL.md`) and docs/TOWER.md's
classic-spec section carries every number's reasoning. Do NOT build a new
tower this way.
