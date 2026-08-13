---
name: forge-model
description: Bake a complex 3D model to GLB through the forge pipeline (Blender headless + gates + preview) instead of writing inline three.js geometry. Use when asked to build/bake a sophisticated mesh, prop, scenery piece, or model asset — anything beyond simple primitives. The procedure, the budgets, the traps, and the look-before-done gate.
---

# Forging a model

A model is a PYTHON RECIPE under `tools/forge/recipes/`, baked headlessly
through pinned Blender into a gated, deterministic GLB. The pipeline, the
kit, and the decision record (why Blender; six-tool bake-off, 2026-08-12)
live in `tools/forge/README.md` — read it before your first bake. The seven
battery recipes ARE the pattern library: fillets+vertex color (B1_die),
architectural CSG (B2_turret), curve sweep (B3_helix), organic displacement
(B4_gnarl), recursive grammar + blends (B5_candelabra), text on a curved
face (B6_plaque), massive booleans (B7_storm). Steal from them; do not
re-derive what they already prove.

## 0. Scope check

- A dice TOWER is not a forge job by default: towers are code-built skins
  under the TOWER_CORE contract (`/new-tower`, docs/TOWER.md). Forge a tower
  component only if the new-tower process explicitly sends you here.
- The app loads no GLBs yet. A forged asset's deliverable is the GLB + its
  recipe + renders; wiring it into the app is a separate feature with its
  own proofs (README "Integration note").

## 1. Brief before code

Write the model's one-paragraph identity: what it is, its silhouette at
game distance, its material story. Then fix the NUMBERS before modelling:

- Size in table units (die radius ~1.25, tower ~12 tall; nothing visible
  under 0.07u — paint smaller detail into color, don't model it).
- Tri budget as a design input: hero prop 3k–8k, mid prop ≤2k, scatter
  ≤500. Pick it now; `check.py --max-tris` enforces it later.
- Color plan: vertex colors (COLOR_0, one primitive, stays watertight) vs
  per-part materials (splits primitives — each part must close itself).
  COLOR_0 is LINEAR: author every palette value as the linear of the sRGB
  you intend (0.545 "mid grey" displays at sRGB 0.76 — cost fae_arch a full
  bake+look cycle). House look: MeshStandardMaterial, value variation over
  flat color, fantasy-not-casino.
- Orientation: author Z-up in Blender; export is Y-up; front faces -Y in
  Blender (= +Z in glTF). `forge.spec_to_blender()` converts.
- Every dimensional design input becomes an assertion that measures the
  BUILT VERTICES, never the constants. fae_arch's constants-based opening
  check passed while three separate parts intruded into the corridor; the
  vertex-reading version failed instantly and named the plinth. A gate that
  reads constants re-states your assumptions back to you.

## 2. The bake loop

```bash
tools/forge/bootstrap.sh                       # once per machine
tools/forge/bake.sh tools/forge/recipes/<name>.py [--max-tris N] [--expect-colors]
```

Recipe shape: import the kit (`sys.path.insert(0, ...); import forge as F`),
`F.reset()`, build with bmesh/pydata/modifiers, end with `F.finish(slug,
objs, budget=N, smooth_deg=..., vertex_colors=...)` — finish runs the
proven tail: canonicalize + triangulate (byte-stable), smoothing, manifold
gate, grounding, budget, export. Colors painted before finish() survive it
(canonicalize carries color attributes — fixed after the first dogfood
found it silently dropping them). The battery recipes' hand-written tails
(B1/B4 order) remain legal with a reason in a comment. smooth_deg: 32 suits
organic; architectural/faceted work wants 12–16 (fae_arch uses 14 — 32
domed every displaced stone face into soap).

Non-negotiables the kit enforces — do not work around them:
- Bake twice before calling anything done; the `[forge] digest` lines must
  match run to run (canonicalize exists because exact booleans reorder
  vertices every run). `order` includes color attributes, `set` is geometry
  only — a color-only edit moves `order` alone, which is how you tell a
  look change from a shape change.
- Non-manifold edges are a stop, not a note. Bisect with `F.boolean_each` +
  `F.manifold_report` until the offending operand names itself; the fix is
  in the MODEL (tangent contacts, shared cap centres, mirror planes on
  facet edges — README traps 5–7), not in blaming the solver.
- `F.clean_slivers` is a recorded repair, not a default.

## 3. LOOK before done

`~/opt/dice-forge/venv/bin/python tools/forge/preview/serve.py`, then
render through `preview/viewer.html?m=/tools/forge/out/<slug>.glb` (or
sheet.html for batches) and READ THE PIXELS — check gates pass broken-
looking models happily. Minimum look: lit 3/4 view, `mode=normal` when any
shading claim is in play, one close look at the detail that justifies the
budget. A hidden Browser pane still works: pages render explicitly and POST
PNGs to `tools/forge/shots/` via the /save endpoint. Never report a visual
done without having seen it rendered (the project rule exists because a
green check masked a broken thing more than once — including inside this
very pipeline's bake-off, twice: shadow acne read as model damage, and a
tool's normals shipped as position data and rendered black).

A builder agent without the Browser pane self-checks by rendering headlessly
in Blender (re-import the exported GLB — that also proves colors survived —
sun+sky, hero/front/detail/game-distance/unlit-albedo; fae_arch's dogfood
established the pattern). Know what that proxy CANNOT show: the first
fae_arch passed its friendly-sky Cycles look while the three.js viewer
showed joint gaps glowing against the dark table. The main-session viewer
look is binding; the proxy is triage. And do not over-polish to the viewer
either — its light rig is not the app's; residuals that depend on the rig
go in the ledger for the feature that ships the asset.

Two W2c additions to the look itself:
- **A model judged against a venue is judged ON that venue's floor**: the
  forge rig has no ground, so stand the model on a disc of the venue's own
  floor tone in the preview scene — color-seam and value claims ("earth
  darker than the glade floor") are unjudgeable against void. Report value
  as measured pixel RATIOS (vs floor, vs the model's own mid), not
  adjectives.
- **Baked palette VARIANTS get their sheets side by side** — one palette's
  LOOK is half a LOOK for a two-palette asset, and the app-side flip has
  its own bug history (TESTING.md P8).

## 4. Review gate (main session, when a builder agent baked)

- **Shape work STOPS at contact sheets.** For anything judgment-heavy
  (organic forms, grounding geometry, silhouettes), the builder renders
  sheets and STOPS for the main session's LOOK verdict BEFORE running the
  long battery or committing — an agent iterating a shape to "done" alone
  ships the wrong shape with green gates (W2c's first berm: a ramp with
  parapets, caught by the user, not the gates). Course corrections are
  CONSTRUCTION SPECS — footprints, fields, caps, laws with numbers — never
  adjectives; an agent given a mood re-delivers the same shape politely.
- Re-run the bake + gates yourself; the builder's green is a claim.
- Diff the two digests across your rerun — determinism is part of done,
  and it proves STABILITY only: pair it with a content check on what the
  bytes SAY (TESTING.md P9 — a bake can reproduce the wrong thing forever).
- LOOK at the renders before presenting; screenshot paths in the report.
- Deliverables: recipe (Apache header, header comment with the brief and
  the measured numbers), gated GLB, shots, honest ledger (what was skipped,
  what needed repair and why, what is debt).
- Fold new traps back into tools/forge/README.md and this skill — a scar
  that isn't recorded will be paid for again.

## Known traps (the expensive ones; full list in README)

- Blender exits 0 on a traceback — never invoke bare `blender -b`; use
  bake.sh (`--python-exit-code 1`).
- A watertight, correctly-shaped solid can be INSIDE OUT and invisible in
  three.js; `F.assert_outward`/check.py catch it — don't bypass the gate.
- COLOR_0 exports only if a material READS the color attribute
  (`F.vertex_color_material`); a green export without it is silently
  colorless — `--expect-colors` proves it landed.
- Two materials on one mesh = two OPEN glTF primitives; watertight + multi
  material needs each part closed. Vertex colors avoid the split.
- 4.x smoothing is `sharp_edge` flags (`F.smooth_by_angle`); tutorials
  mentioning `use_auto_smooth`/`set_sharp_from_angle` predate the pin.
- Pin is Blender 4.5.12 LTS. Upgrading = bump bootstrap PIN, re-bake the
  battery, diff digests, re-look. Never drift.
