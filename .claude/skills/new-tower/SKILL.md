---
name: new-tower
description: Ship a new dice tower (skin + registry row + sound palette) at contract rigor — the process proven by Heartwood and corrected by Bastion. The four proofs, the agent split, the review gate, and the traps, in order.
---

# Shipping a new dice tower

A tower is a SKIN over engine-owned geometry, a REGISTRY ROW, and a SOUND
PALETTE (`clunkVoice`). Nothing else. The physics, the film, the exit
guarantee, the camera choreography and the socketing all belong to the
engine and are identical for every tower — that is the TOWER_CORE contract,
and it is what makes this process repeatable. If a tower seems to need
engine changes, stop: either the contract has a gap (fix docs/TOWER.md
first, separately) or the design is wrong.

## 0. Read first, in this order

0. **If you are a worktree agent: `git merge --ff-only master` before
   anything.** The tower work all landed recently; a worktree cut from an
   older HEAD may contain none of it — no docs/TOWER.md, no towerskin.js,
   not even this skill. (Cost the Bastion builder its first half hour.)
1. `docs/TOWER.md` — the contract. Every volume the skin must respect
   (SOCKET, MOUTH, COWL, SHAFT/OCCLUSION, DOORWAY, EXIT apertures) and the
   failure ledger explaining why each number is what it is.
2. `js/towerskin.js` (Heartwood) and `js/towerbastion.js` (Bastion) — the
   reference skins. The shared kit is EXPORTED from towerskin.js: seeded
   canvas bakes + Sobel normals, roundedBox, planarUV, raycast vertex-AO,
   black BackSide lining, veils, contact shadows. Import it; never fork it.
3. The TOWERS registry in `js/main.js` (search `const TOWERS`), the
   `impactVoice` resolver near towerSocket, and the `tower` row in
   server.js SETTING_SPECS.
4. The proof tools: `tools/steps/tower-fit.mjs`, `tower-occlusion.mjs`,
   `tower-probe.mjs`, `tower-resting-eye.mjs` — all take a tower id.
   (`tower-shots.mjs` does NOT — it renders whatever skin `towerLabSkin`
   was last left holding; set it explicitly. If you find a proof tool that
   doesn't take the id this list claims, parameterising it is in scope —
   that's how resting-eye got its parameter.)

## 1. Design before code

Write the tower's one-paragraph identity first: its material, its
silhouette (three parts — base, shaft, crown — read at game camera
distance), and its theme-family pairing. Towers are named after their theme
family's world (Heartwood ← Wildwood, Bastion ← Classics); the pairing list
lives in the TOWERS registry comment — record it there.

**1.5 Then measure the free volume before you draw — a settled brief can be
geometrically impossible.** Check every design element against the numbers:
bore radius, socket face depth (the front of the drum has ~0.125 of relief —
every tower's front is a shallow facade, so silhouette must come from the
shoulders and crown), entry drop (dice of radius up to 1.25 fall in at
y≈11.25 — nothing may roof the bore), doorway aperture (decorate, never
narrow). Ten minutes here saved an hour on Bastion, where both "a round
drum" (front must be flat) and "a closed cap over the bore" (dice fall
through it) died on measurement.

HOUSE VISUAL RULES:

- MeshStandardMaterial only; envMapIntensity 0.45 unless the material
  argues otherwise in a comment (Heartwood's iron runs 1.0, deliberately);
  NO new lights, NO ShaderMaterial, NO userData.bloom. Emissive maps on
  standard material are the only glow allowed.
- Value variation everywhere: seeded canvas textures (never solid colors,
  never Math.random — seeded PRNG only), normal maps derived by Sobel from
  the same bake, roughness variation.
- Edges beveled (0.03–0.06 radius), dark warm edge tones — never pure black.
- Fantasy, not casino.
- OPACITY IS LOAD-BEARING. The interior is empty and the fall is a film;
  the skin's occlusion is what keeps the secret. No transparent or
  translucent shells over the SHAFT/HOOD volumes, ever (this is why clear
  ice can never be a tower). An open crown (battlements) is legal only if
  a closed occluder inside it blocks every sightline — prove it, don't
  argue it.
- NAME YOUR OCCLUDERS: every mesh group that is claimed to hide the cheat
  must be named `towerSkin*` — the occlusion and fit proofs measure those
  groups and ignore decoration (veils, contact shadows). An unnamed
  occluder proves nothing.

## 2. The build, agent-shaped

- Builder agent (opus), in a WORKTREE — another session may be writing
  js/main.js. Small commits as it goes.
- The main session (Fable) holds the review gate and never delegates it.

What the builder produces:

1. `js/tower<name>.js` — `build<Name>Skin(v)` taking the towerVolumes()
   object, returning one THREE.Group with ZERO colliders. Reuse the
   exported towerskin.js kit; if a helper you need isn't exported yet, the
   export refactor is its own commit with NO behavioural edit — comments
   and `export` keywords only. A technique that a LATER skin invented and
   you now need (Bastion's bakeStone was the first) MOVES into
   towerskin.js — never copy sibling-skin code into a third file. Either
   way the owning skin's output must be unchanged, and the witness for
   that is the BAKE FUNCTIONS run side by side on the owner's parameter
   sets with differing pixels counted — NOT a before/after PNG compare;
   two runs of identical code produce different PNG bytes in this harness,
   so that red means nothing (measured on Bastion's bakes: the honest
   witness reads 0/0/0, and moving one channel by one unit reads
   thousands). Commit the A/B run's numbers in the commit message.
   Put the §1.5 measurement table in the skin file's header — it is for
   the NEXT reader, not just for you.
2. Registry row in TOWERS: `{ id, label, skin, title, clunkVoice }`, PLUS
   a line in the registry comment's theme-family pairing list (Heartwood ←
   Wildwood, Bastion ← Classics, Black Anvil ← Emberforge) — the pairing
   is part of the deliverable, not decoration. Mind the module-evaluation
   TDZ trap the registry comment documents.
3. Server validation: add the id to the `tower` row in SETTING_SPECS.
   (server.js changed ⇒ the live 8123 needs ONE restart at merge time,
   from the main session only.)
4. Sound palette: `clunkVoice` is an IMPACT_VOICES shape ({body, weight,
   sustain}). Resolution happens in ONE named function — `impactVoice(s,
   fxSet)` — which the e2e calls directly; inline resolution in the drain
   is untestable (a registry-only test stays green with the drain wired
   straight back to the die set — red-checked on Bastion). Palettes are
   render-time only: film timings, bakes and replay hashes never learn
   which tower is standing.
5. Proof runs (below) + screenshots into `shots/` at the WORKTREE root
   (gitignored; report absolute paths) for the reviewer to LOOK at.

## 3. The proofs (docs/TOWER.md "What a model must prove")

All headless, all against the BUILT MESH — geometry libraries do things
source-reading cannot predict (three's ExtrudeGeometry bevel does not
inset: it pushes the body OUTWARD by bevelSize/sin(θ/2) — measured 0.041
for a 0.03 bevel, enough to put every drum course outside the socket).
Two rules about the proofs themselves:

- **A geometric proof must force `updateMatrixWorld()` before raycasting.**
  A freshly built skin has never been rendered; an answer that depends on
  whether a rAF happened to run between build and query is not a proof.
  (Bastion's first occlusion run reported hood 18/18 occluded; the truth
  was 0/18 — the project's "green check masks a broken thing" failure
  mode, inside the proof tooling itself.)
- **Red-check every assertion you add — and red-check the WITNESS too.**
  Break the thing each new claim is about and watch it go red before
  trusting the green; then break the CHECKER and confirm the instrument
  can move at all. Both of the third build's best catches were instrument
  failures, not subject failures: a nondeterministic PNG compare whose red
  meant nothing, and a green that survived deleting the emissive bed
  because the opacity lived in the lining behind it — the green was true
  but about a different thing than assumed. tower-roll's comments record
  every red-check it has survived; keep that ledger.
- **If your model has an aperture in the facade (slit, vent, window),
  verify it by removing EVERYTHING behind it — not just the piece that
  fills it.** The occlusion sampling stops at r 2.0 and the bore is 2.125,
  so a narrow facade opening can fall between sample rays; 99/99 does not
  automatically cover it. The recess must resolve to a closed `towerSkin*`
  occluder somewhere behind the opening, and only stripping the whole
  stack proves which layer is doing the work.

The four contract proofs:

- (a) SOCKET FIT — `tools/steps/tower-fit.mjs <id>`: measures the
  `towerSkin*` occluder groups per mesh against the SOCKET volume, and
  knows the legal deviations (apron/lip cladding and the hood reach into
  engine volumes a model is invited to skin; tiny foot dips from the
  lean). A naive whole-group bounding box is red on every shipped tower —
  contact shadows reach past the tray by design.
- (b) OCCLUSION — `tools/steps/tower-occlusion.mjs <id>`: SHAFT and COWL
  bands 99/99 from every shipped eye (ZOOM_PRESETS full + mini). EXIT and
  HOOD are reported, not gated — no legal geometry can occlude them; the
  darkness layers carry those (the tool header explains the arithmetic).
- (c) APERTURES CLEAR — MOUTH and EXIT/DOORWAY unobstructed (tower-fit
  reports; the pour probe is the behavioural check).
- (d) ZERO COLLIDERS — tower-fit asserts world body count is unchanged by
  the skin and restored to baseline on unsocket.

Then the behavioral proofs, which are already written — run, don't rewrite:

- `tools/steps/tower-probe.mjs 8 42 14 <id>` — CLEAN, and resting
  positions byte-identical across skins (zero-physics, measured).
- `tools/steps/tower-resting-eye.mjs` — the resting camera transitions.
- `npm test` — and the FIRST LAW is measured by the UNTOUCHED suite: with
  tower 'none' the app must be byte-for-byte the old one, proven by every
  non-tower scenario passing without edits.
- Extend `tower-roll` with the NEW claims only (a swap passes through the
  towerless body list; the picker layout holds at N chips; the palette
  resolves through impactVoice — and assert the other half: an ordinary
  landing still takes the die set's voice). Don't duplicate per-tower what
  heartwood already pins; parameterize or spot-check — and REFACTORING an
  existing per-tower block into a registry loop IS the blessed way to
  parameterize; that edit to a shipped scenario is not a violation of
  "new claims only", it is how the scenario scales.

## 4. The review gate (main session, never skipped)

1. Re-run `npm test`, the tower tag, occlusion and the probe YOURSELF in
   the worktree — the builder's green is a claim, not a verification.
2. LOOK at the screenshots before presenting (never report a visual done
   without seeing it rendered). What each frame can actually show: (1) the
   idle resting eye — the frame a player sees most; (2) pour entry at
   ~10 ticks — a die clears the crown for only ~0.1 s, so expect a sliver,
   and treat the film probes as the real evidence of entry; (3) the exit
   spread; (4) wide vs close idle — a statement about the tower-relative
   resting eye (they will look near-identical; that is shipped behaviour),
   NOT about the framing ladder; (5) ALL the other towers at the same
   angle for family resemblance — tower-family-shots.mjs shoots the whole
   registry; the review set's cost grows with the family, and that is the
   price of a shelf worth returning to; (6) a close look-only detail shot,
   including any emissive/special-material feature the tower ships.
3. Read the load-bearing diff yourself — anything touching the shared
   drain/registry/server path, first-law eyes on.
4. `git merge --ff-only` to master; restart 8123 iff server.js changed.
5. Docs land WITH the build (builder's job, reviewer confirms): TOWER.md
   STATUS, UX.md §7.31, ROADMAP. A registry row without its docs is not
   shipped.
6. Report with an honest ledger: what was skipped, what is debt, what is
   pre-existing red. Production deploy (`/usr/bin/make deploy`) only when
   Joe asks.
7. Fold what the build taught back into THIS FILE. The builder's friction
   notes are a deliverable; a skill that doesn't absorb them repeats them.

## Known traps (each cost a real debugging session)

- TDZ: renderTowerPicker runs during MODULE EVALUATION — the registry and
  anything it references must be declared above it (the ROOM/LS_NAME/
  TOWERLAB trap).
- `clearTable()` does not end a roll. After a pour the table still reports
  busy, so `setTower` parks in pendingTower and a waitFor on the new tower
  hangs until the harness gives up. `settle()` first, then switch.
- The occlusion cheat is absolute: sightlines reach y≈6.4 inside the shaft
  at the wide eye. Battlements, slits and every crown opening must resolve
  to a closed `towerSkin*` occluder behind them — check (b) from ALL
  preset eyes, both mini and full. An arrow slit is a dark RECESS, never a
  hole.
- aria-checked, not aria-pressed, for picker chips (U22) — and the chosen
  chip must be PAINTED differently, which is pinned by tower-roll.
- Do not touch `applyZoom`'s unsocket/re-socket bracket; preset changes
  pass through the towerless configuration by design.
- A tower→tower swap is unsocket + socket, never an in-place mutation (the
  SAP body-order rule). tower-roll red-checked the mutation shape: body
  count must return to the towerless 6 between towers.
- `towerLabSkin` leaves the lab wearing the last skin asked for — global
  state; a later lab step must set what it needs, not assume heartwood.
