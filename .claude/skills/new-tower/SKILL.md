---
name: new-tower
description: Ship a new dice tower (skin + registry row + sound palette) at Heartwood rigor — the contract, the four proofs, the agent split, and the review gate, in order.
---

# Shipping a new dice tower

A tower is a SKIN over engine-owned geometry, a REGISTRY ROW, and a SOUND
PALETTE. Nothing else. The physics, the film, the exit guarantee, the camera
choreography and the socketing all belong to the engine and are identical for
every tower — that is the TOWER_CORE contract, and it is what makes this
process repeatable. If a tower seems to need engine changes, stop: either the
contract has a gap (fix docs/TOWER.md first, separately) or the design is
wrong.

## 0. Read first, in this order

1. `docs/TOWER.md` — the contract. Every volume the skin must respect
   (SOCKET, MOUTH, COWL, SHAFT/OCCLUSION, DOORWAY, EXIT apertures) and the
   failure ledger explaining why each number is what it is.
2. `js/towerskin.js` — Heartwood, the reference implementation. The shared
   techniques live here: seeded canvas textures + Sobel normal maps, rounded
   boxes, planar UVs, raycast vertex-AO bake, the black BackSide interior
   lining, gradient veils, contact shadows.
3. The TOWERS registry in `js/main.js` (search `const TOWERS`) and the
   `tower` row in server.js `SETTING_SPECS`.

## 1. Design before code

Write the tower's one-paragraph identity first: its material, its silhouette
(three parts — base, shaft, crown — read at game camera distance), and its
theme-family pairing (towers are named after a die in a theme family:
Heartwood ← Wildwood). Then check it against the HOUSE VISUAL RULES:

- MeshStandardMaterial only; envMapIntensity 0.45; NO new lights, NO
  ShaderMaterial, NO userData.bloom. Emissive maps on standard material are
  the only glow allowed.
- Value variation everywhere: seeded canvas textures (never solid colors),
  normal maps derived by Sobel from the same bake, roughness variation.
- Edges beveled (0.03–0.06 radius), dark warm edge tones — never pure black.
- Fantasy, not casino.
- OPACITY IS LOAD-BEARING. The interior is empty and the fall is a film;
  the skin's occlusion is what keeps the secret. No transparent or
  translucent shells over the SHAFT/HOOD volumes, ever (this is why clear
  ice can never be a tower).

## 2. The build, agent-shaped

- Builder agent (opus), in a WORKTREE — another session may be writing
  js/main.js. Small commits as it goes.
- The main session (Fable) holds the review gate and never delegates it.

What the builder produces:

1. `js/tower<name>.js` — `build<Name>Skin(v)` taking the towerVolumes()
   object, returning one THREE.Group with ZERO colliders. Reuse
   towerskin.js helpers by EXPORTING them — never fork them. The export
   refactor must leave Heartwood byte-identical (adding `export` is the
   only allowed edit near its code).
2. Registry row in TOWERS: `{ id, label, skin, title, clunkVoice }`.
3. Server validation: add the id to the `tower` row in SETTING_SPECS.
   (server.js changed ⇒ the live 8123 needs ONE restart at merge time,
   from the main session only.)
4. Sound palette: `clunkVoice` is an IMPACT_VOICES resolution — the sound
   drain voices `clunk:'baffle'` events through the SOCKETED TOWER's voice,
   not the die set's. Timings stay in the film; palettes are render-time,
   so replay hashes are untouched.
5. Proof tooling runs (below) + screenshots into the scratchpad for the
   reviewer to LOOK at.

## 3. The four proofs (docs/TOWER.md "What a model must prove")

All headless, all against the built mesh — run them, don't argue them:

- (a) SOCKET FIT — the group's bounding box stays inside the SOCKET volume.
- (b) OCCLUSION — `tools/steps/tower-occlusion.mjs`: the SHAFT and HOOD
  volumes are invisible from every shipped camera eye (target 99/99 rays;
  a single leaked ray is a visible teleporting die for someone's viewport).
- (c) APERTURES CLEAR — MOUTH and EXIT/DOORWAY unobstructed; a model may
  decorate the doorway frame, never narrow it.
- (d) ZERO COLLIDERS — `worldBodies()` count is identical before skin add
  and after; the eight engine colliders are the only tower bodies.

Then the behavioral proofs, which are already written — run, don't rewrite:

- `tools/steps/tower-probe.mjs` with the new tower socketed — CLEAN verdict.
- `tools/steps/tower-resting-eye.mjs` — the resting camera transitions.
- `npm test` — and the FIRST LAW is measured by the UNTOUCHED suite: with
  tower 'none' the app must be byte-for-byte the old one, proven by every
  non-tower scenario passing without edits.
- Extend `tower-roll` in tests/e2e/scenarios.mjs where the new tower adds a
  NEW claim (a third picker chip, the palette resolution, tower-to-tower
  swap passing through the towerless body list). Don't duplicate the
  heartwood assertions per tower — parameterize or spot-check.

## 4. The review gate (main session, never skipped)

1. Re-run `npm test` + tower tags YOURSELF in the worktree — the builder's
   green is a claim, not a verification.
2. LOOK at the screenshots before presenting (never report a visual done
   without seeing it rendered): idle resting eye, pour entry, exit spread,
   both zoom extremes, and one with the OTHER towers for family resemblance.
3. `git merge --ff-only` to master; restart 8123 iff server.js changed.
4. Update docs: TOWER.md STATUS, UX.md §7.31, ROADMAP. Registry row counts
   as shipped only with its docs.
5. Report with an honest ledger: what was skipped, what is debt, what is
   pre-existing red. Production deploy (`/usr/bin/make deploy`) only when
   Joe asks.

## Known traps (each cost a real debugging session)

- TDZ: renderTowerPicker runs during MODULE EVALUATION — the registry and
  anything it references must be declared above it (the ROOM/LS_NAME/
  TOWERLAB trap).
- The occlusion cheat is absolute: cowl sightlines reach y≈6.4 inside the
  shaft at the wide eye. If the crown is open (battlements!), the HOOD
  occluder must still close the sightline — check (b) from ALL preset eyes,
  both mini and full.
- aria-checked, not aria-pressed, for picker chips (U22) — and the chosen
  chip must be PAINTED differently, which is pinned by tower-roll.
- Do not touch `applyZoom`'s unsocket/re-socket bracket; preset changes pass
  through the towerless configuration by design.
- A tower→tower swap is unsocket + socket, never an in-place mutation (the
  SAP body-order rule).
