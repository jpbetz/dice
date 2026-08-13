# forge — baking complex GLB models for the table

Author a model as a Python recipe, bake it headlessly through Blender, gate
it mechanically, LOOK at it, then hand the GLB to whatever will ship it.
This replaces writing inline three.js geometry code for anything beyond
simple primitives. The `forge-model` skill (`.claude/skills/forge-model/`)
is the working procedure; this file is the tool reference and the decision
record.

## Quick start

```bash
tools/forge/bootstrap.sh                 # once per machine: Blender 4.5 LTS + check venv (~/opt/dice-forge)
tools/forge/bake.sh tools/forge/recipes/B1_die.py --expect-colors --max-tris 8000
~/opt/dice-forge/venv/bin/python tools/forge/preview/serve.py   # then open viewer.html?m=/tools/forge/out/B1_die.glb
```

- `forge.py` — the kit a recipe imports (runs inside Blender's Python).
  Scene reset, bmesh/pydata builders, boolean helpers (single / bisectable /
  collection), smooth-by-angle, materials + COLOR_0 vertex colors,
  canonicalize (byte-stable output), refusal gates, `finish()`.
- `bake.sh` — headless run (`--python-exit-code 1` — Blender otherwise exits
  0 on a traceback) + `check.py` gate on the newest GLB.
- `check.py` — refuses inverted winding, un-watertight-after-weld, degenerate
  faces, blown tri budgets, missing COLOR_0 when expected, and broken NORMAL
  accessors; `--tower` adds the portal contract (below). Every gate exists
  because a green bake shipped that exact defect during the bake-off.
  Red-checked: it fails on planted defects.
- `preview/` — three.js viewer (same vendored r160 the app uses) + contact
  sheet + serve.py with a /save endpoint so a hidden Browser pane can still
  write PNGs to `shots/`. Lit/normal/wire modes; shadow bias pre-tuned so
  acne never reads as model damage.
- `recipes/B1..B7` — the bake-off battery, kept as living worked examples:
  fillets+pip colors (B1), architectural CSG (B2), curve sweep (B3), organic
  displacement (B4), recursive grammar + blends (B5), text on a curved face
  (B6), 121-operand boolean stress (B7). They re-bake byte-identically; if a
  Blender upgrade changes that, the pin caught something.

Conventions: table units (die radius ~1.25, tower ~12 tall, min visible
feature 0.07u), author Z-up in Blender, export is Y-up GLB, front toward
+Z (Blender -Y). Budgets: hero prop 3k–8k tris, mid prop ≤2k, scatter ≤500.
Uncompressed GLB; no Draco/meshopt (decoder cost outweighs savings at our
sizes; gzip on the wire does the rest).

## Tower portals

A tower model does not ship colliders, cameras or a film plane. It ships two
PORTALS and the engine derives the rest from them. See
[docs/TOWER.md](../../docs/TOWER.md) for the contract itself — what the engine
owns, and what it promises a model in return.

**Frame.** Portal numbers are APP-FRAME: y up, +z toward the player, z=0 the
back-wall socket plane, so the model mostly lives at z<0. Units are table
units (d20 radius 1.25). You author in that frame and `spec_to_blender` puts
it on Blender's Z-up axes; `export_yup=True` brings it back, so a glTF node
translation IS the app-frame position with no conversion at either end.

**Authoring.** `forge.tower_portals(in_spec, out_spec)` returns two empties:

```python
pin, pout = F.tower_portals(
    {"x": 0.0, "rimY": 8.75, "z": -2.0, "clearR": 2.125},
    {"x": 0.0, "sillY": 1.0, "w": 5.0, "clearH": 4.5})
F.export_glb("my_tower", [skin, pin, pout], vertex_colors=True)
```

One datum, one home: the node NAME says which portal it is, the node
TRANSLATION says where it is (visible in Blender's viewport and in any glTF
viewer, with no second copy to fall out of sync), and node EXTRAS carry the
scalars. Pass the empties to `finish()`/`export_glb()` alongside the meshes —
they join the selection, every geometry gate steps over them, and grounding
shifts them with the model. Mesh nodes an occluder must hide behind get the
engine's `towerSkin*` prefix, exactly as for code-built skins.

**Gating.** `check.py --tower` (via `bake.sh <recipe> --tower ...`) adds five
refusals to the usual ones: both portals declared at the scene root with
parseable extras; every number inside `TOWER_PORTAL_LIMITS` (mirrored from
js/main.js — **keep the two in sync**); the APPROACH column really clear, by
25 rays down the entry disc from above the rim to despawnY; the EXIT throat
really clear, by 25 rays out through the door; and at least one `towerSkin*`
mesh node. The two ray gates are the point: a model can declare a perfect
doorway and wall it up behind the declaration, and the numbers alone would
never notice.

**The fixture.** `recipes/tower_fixture.py` bakes
`tests/e2e/fixtures/tower_fixture.glb` — a deliberately plain leaning
monolith whose eight portal numbers are ALL off the shipped defaults and all
inside the limits, so anything that quietly assumes the classic values fails
on it. It is a TEST ASSET, never a picker row. Its header carries the
declared values and the three defects its own measurements caught.

## Why Blender (bake-off, 2026-08-12)

Six tools implemented the same 7-model battery under an honest-metrics
contract; all 42 GLBs were gated mechanically and judged visually in the
app's own three.js build. Full report, per-tool evidence, research annexes
and the re-open protocol: [docs/FORGE-BAKEOFF.md](../../docs/FORGE-BAKEOFF.md);
raw materials (battery spec, rubric, every tool's sources and metrics) in
`bakeoff/` (headline table below). Blender was the only tool that delivered every
capability at spec AND a defect-free GLB pipeline: true fillets, native
sweeps, font text on curved faces, noise displacement, recursion in plain
Python, materials + per-vertex COLOR_0, correct normals, native Y-up GLB.

| tool | score /100 | the one-line story |
|---|---|---|
| blender 4.5 LTS | 87 | everything worked; kit-fixable weaknesses, kit included |
| openscad nightly | 69 | shockingly reliable CSG, but no color path to GLB, no sweep |
| cadquery 2.8 | 68 | exact B-rep ops; organic-poor; opaque `StdFail` kernel errors |
| manifold-3d 3.5 | 68 | best kernel + richest GLB API; sharpest silent edges (shipped 5/7 black-rendering normals) |
| sdf (marching cubes) | 61 | organic beauty; budget-hostile (storm = 1.27M tris) |
| jscad 2.13 | 55 | easiest install; BSP T-junctions → 5/7 not watertight |

Version pin: Blender **4.5.12 LTS** (supported to mid-2027). Upgrading (5.2
LTS is current) is a deliberate act: bump `PIN` in bootstrap.sh, re-bake the
battery, diff the digests, re-run the gates, LOOK at the sheets. bpy churn is
real — 4.1 removed `use_auto_smooth`, and `set_sharp_from_angle` does not
exist in 4.5; forge.smooth_by_angle writes `sharp_edge` flags directly.

## The traps (each observed live; the kit guards all of them)

1. Blender exits 0 on script tracebacks → bake.sh passes --python-exit-code 1.
2. Inside-out solids pass watertight checks and vanish under back-face
   culling → assert_outward / check.py volume gate.
3. Exact-boolean vertex ORDER is nondeterministic run to run →
   forge.canonicalize + explicit triangulate before export.
4. `export_apply=False` silently exports pre-modifier geometry;
   `export_vertex_color='MATERIAL'` silently drops COLOR_0 unless a material
   READS the attribute → forge.export_glb sets apply, vertex_color_material
   wires the node, check.py --expect-colors proves it landed.
5. Geometry failures are silent (pinches, slivers, tangent contacts) → gate
   on non-manifold edges 0 / degenerate 0; bisect unions with boolean_each.
6. Mirror planes landing exactly on facet edges pinch → rotate radial arrays
   half a segment off phase.
7. Tangent primitives (equal-radius crossing tubes, cap centres shared at a
   fork) degenerate → overlap by epsilon, never touch exactly.
8. trimesh reports 'texture' visuals when a material exists and misses
   COLOR_0 behind it; watertight needs a weld first → check.py reads the GLB
   JSON and welds a copy.
9. Preview shadow acne masquerades as model damage → preview lights carry
   tuned bias; verify shading claims in mode=normal.
10. A hidden Browser pane never fires rAF → viewer/sheet render explicitly
    and POST pixels to serve.py.

## Integration note (deliberately not done yet)

The app does not load GLBs today; towers/props are code-built. When the
first baked asset ships: vendor three r160's GLTFLoader.js +
BufferGeometryUtils.js into `vendor/` (preview/ carries reference copies),
add a small loader helper, and load the GLB as a named group — house rules
(MeshStandardMaterial, envMapIntensity 0.45, towerSkin* naming for occluders,
zero colliders) apply to baked assets exactly as to coded ones. That change
belongs to the feature that needs it, with its own proofs.
