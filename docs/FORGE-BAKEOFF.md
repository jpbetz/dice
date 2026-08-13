# The mesh-tool bake-off (2026-08-12) — why forge is Blender

The decision record for `tools/forge/` and the `/forge-model` skill: six
scriptable mesh-generation tools implemented an identical 7-model battery,
all 42 GLBs were gated mechanically and judged visually in the app's own
vendored three.js r160, and Blender headless won 87/100 against a 68–69
cluster. This document carries the full verdict, the per-tool evidence, the
research annexes (GLB/three facts, the 2026 tool landscape), and the
protocol for re-opening the question. Operational how-to lives in
[tools/forge/README.md](../tools/forge/README.md); raw materials (battery
spec, scoring rubric, every tool's sources and honest metrics) in
`tools/forge/bakeoff/`.

## Method

- Two research agents surveyed the landscape and GLB-baking practice with
  sources (annexes A/B below distill them).
- Six evaluation agents — one per tool, blind to each other — implemented
  the SAME battery from `bakeoff/BATTERY.md` in table units: **B1**
  chamfered die with colored pips, **B2** crenellated turret with blind
  arrow slits, **B3** helical chute (sweep), **B4** gnarled stump
  (organic + noise), **B5** recursive candelabra (grammar), **B6** engraved
  text following a bowed plaque, **B7** cube minus 120 seeded spheres plus
  a rotated knife (robustness/perf). Honest-metrics contract: real attempt
  counts, real minutes, DNF-with-notes explicitly valued over faked passes,
  determinism required (two runs, identical bytes).
- Judging (main session, not delegated): mechanical gates via trimesh
  (weld-then-watertight, signed volume, degenerates, tri counts, COLOR_0
  read from the GLB JSON) + visual pass over every item in a three.js r160
  viewer with the app-ish light rig, lit and normal modes.
- Rubric weights: mesh quality 25, expressiveness 25, LLM-authorability 20,
  pipeline fit 20, footprint/ops 10 (`bakeoff/SCORING.md`).

## Verdict

| tool | version | /100 | one-line story |
|---|---|---|---|
| **blender (bpy headless)** | 4.5.12 LTS | **87** | every capability at spec AND a defect-free GLB pipeline; its weaknesses came with kit-shaped fixes, now shipped as forge.py |
| openscad | 2026.08.09 nightly (Manifold) | 69 | zero language failures, storm in 1.4 s (147× the CGAL backend) — but no color path to GLB, no sweep operator |
| cadquery | 2.8.0 / OCCT 7.9.3 | 68 | exact fillets/sweeps/text; organic-poor; kernel failures are one opaque `StdFail_NotDone`, sometimes a 13-minute hang |
| manifold-3d | 3.5.1 | 68 | best kernel + richest direct-GLB API; sharpest silent edges — shipped 5/7 files with POSITION data in the NORMAL slot (rendered black) |
| sdf (fogleman + marching cubes) | git d58a6fc | 61 | organic blends and booleans that cannot fail; thin features fray under forced decimation; storm cost 1.27 M tris |
| jscad | @jscad/modeling 2.13.0 | 55 | 3-second install; BSP T-junctions on every curved cut → 5/7 not watertight; 55 s storm |

Scorecard by criterion:

| criterion | blender | openscad | cadquery | jscad | manifold | sdfpy |
|---|---|---|---|---|---|---|
| Mesh quality /25 | 23 | 17 | 18 | 12 | 14 | 15 |
| Expressiveness /25 | 23 | 18 | 18 | 13 | 21 | 15 |
| LLM-authorability /20 | 15 | 15 | 14 | 12 | 11 | 13 |
| Pipeline fit /20 | 19 | 12 | 12 | 10 | 13 | 13 |
| Footprint & ops /10 | 7 | 7 | 6 | 8 | 9 | 5 |

Per-item visual rankings (main-session judgment from renders):

- B1 die: manifold ≈ blender > jscad > sdfpy ≈ cadquery > openscad
- B2 turret: blender ≈ openscad ≈ manifold(after normal repair) > cadquery ≈ jscad > sdfpy
- B3 helix: blender > manifold(rep.) ≈ cadquery > jscad > openscad (hull-chain stair-stepping) > sdfpy (frayed crests)
- B4 stump: manifold > blender > sdfpy ≈ openscad > jscad > cadquery
- B5 candelabra: blender > openscad ≈ cadquery > manifold(rep., zebra normals at grazes) > jscad ≈ sdfpy
- B6 plaque: blender > manifold ≈ openscad ≈ cadquery > jscad > sdfpy
- B7 storm: geometry identical everywhere (the deterministic spec worked);
  efficiency manifold 41k > cadquery 42k > jscad 54k > blender 62k >
  openscad 92k ≫ sdfpy 1,273k; bake time manifold 1.3 s ≈ openscad 1.4 s >
  cadquery 5.6 s > blender 8.4 s (0.32 s with its new Manifold solver) >
  sdfpy 24 s > jscad 55 s

The robustness check on the verdict: grant manifold-3d its normals fix (it
is kit-shaped, like Blender's fixes) and it still trails by ~14 on
organic-vs-text breadth, junction shading at SDF grazes, and export-frame
traps (undocumented mm-scale node + Z-up wrapper). Blender's own silent
failures were solved BY the evaluation — canonicalize, assert_outward,
clean_slivers, boolean bisection — and shipped as the kit.

## Per-tool detail (condensed from `bakeoff/metrics/*.json` — read those for the full stories)

**blender** — 7/7 done, all watertight, 0 degenerates, native GLB,
byte-identical reruns after canonicalize. True bevel fillets; native curve
sweep (helix: first try, 2 min); FONT-curve text cut by a bowed cutter;
Clouds-texture displacement; 26-solid recursion. Cost centers: B5's fork
degeneracies (4 distinct tangency traps, found by bisecting unions) and the
discovery that a watertight, correct-silhouette stump can be INSIDE OUT and
invisible in three.js. Geometry errors are silent; RNA introspection makes
the API self-documenting (`bpy.ops.export_scene.gltf.get_rna_type()`).

**openscad** — 7/7, all watertight, zero parse failures across the battery
(every .scad ran first try — the DSL's reputation underrates it when a
Genus/Facets summary is gated on). Manifold backend is decisive: B7 1.4 s
vs 212 s CGAL, and minkowski stopped being a trap. Fatal for us: STL-only
export (no normals/color; 3MF color exists but trimesh can't read it),
no sweep (the linear_extrude-twist trick shears U-channels — wall heights
come out radius-dependent), silent wrong-geometry paths (undefined variable
→ default-size solid, exit 0).

**cadquery** — 7/7; the exact-B-rep wins are real (fillet = one call; helix
sweep via makeHelix+MakePipeShell worked on the FIRST execution; text
wrapped on the bow by intersecting a prism with a shell; tessellation
tolerance re-meshes the same shape at any density). The costs: OCCT fillets
on branching geometry fail/hang unpredictably (same op: times out at
r=0.09, raises at 0.06, succeeds at 0.03 — no diagnostics), organic is
analytic-only, and the native GLB writer emits one primitive PER B-REP FACE
(99 meshes for a die) plus zero-area pole facets unless you reach past
CadQuery into `RWGltf_CafWriter.SetMergeFaces`.

**manifold-3d** — 7/7, all watertight, genuinely the fastest loop
(0.26 s edit-to-GLB) and the best B4 stump in the field (levelSet SDF +
smooth-min + fbm). COLOR_0 survives booleans (paint the cutter, subtract,
dents come out dark). But: `extrude`'s scaleTop declared `Vec2|number`
reads a scalar as `[s,0]` (silently halves the volume); empty/inverted
results return `status()==NoError`; the exporter wraps everything in an
undocumented -90°X + 1/1000-scale node (authoring is Z-up millimetres);
and the property-channel wiring shipped position data as NORMAL on all five
non-SDF items — black in-engine, invisible to its own 156 geometric
self-checks. Watch-list runner-up: one wiring kit from contention.

**sdfpy** — 7/7 watertight native GLB via trimesh; blends and seams are
states the representation cannot express, so B4/B5 are effortless; fields
survive meshing, enabling repairs mesh tools cannot do (Newton
snap-to-surface after decimation, gradient normals, color from the same
field that made the shape). The structural law learned: artifact severity
tracks the DECIMATION RATIO, not the final count — thin features force fine
grids force 8–36:1 decimation which eats exactly those features. Uniform
grids cannot spend triangles adaptively (B7: 1.27 M tris, 31.6 MB).
Install is git-only (`pip install sdf` is an unrelated HDF5 package).

**jscad** — 7/7 attempted, honest partials on B3/B6; `extrudeHelical` is a
real native sweep and the grammar item took ~30 lines. Structural finding:
BSP booleans leave T-junctions wherever a cut plane crosses a faceted
curved surface (bisected: subtract(cylinder, coaxial cylinder) alone is
non-watertight; extrudeRotate of the same annulus is clean) — no in-tool
repair. Stroke-only fonts, no displacement, no bend/warp, color drops at
the STL boundary.

## The instrument findings (this project's failure mode, reproduced in the lab)

Every one of these was a green check masking a broken thing, inside the
bake-off's own instruments; each now has a standing guard in forge/check:

1. Shadow acne in the judging viewer read as model damage on every Blender
   render until the light rig got bias/normalBias — the models were clean.
2. trimesh reports `visual.kind == 'texture'` whenever a material exists,
   hiding real COLOR_0 → the checker reads the GLB JSON instead.
3. Angle-split smooth normals legitimately un-weld vertices, so every
   converted mesh read "not watertight" → weld a copy before the check.
4. A NORMAL accessor can be present, well-formed, and be POSITION data —
   `has_normals: true`, renders black → check.py asserts unit length.
5. A watertight, right-shaped, right-sized solid can be wound inside out —
   invisible under back-face culling; nothing in a metrics contract catches
   it → signed-volume gate.
6. The winner's own exporter: `--python-exit-code` absent means tracebacks
   exit 0; `export_apply=False` exports pre-modifier geometry;
   `export_vertex_color='MATERIAL'` silently drops COLOR_0 unless a
   material reads the attribute.

## Annex A — GLB/three.js baking facts (verified against sources, Aug 2026)

**Vertex colors.** glTF COLOR_0 is LINEAR; Blender's picker shows sRGB
(0.5 sRGB ≈ 0.216 linear — "my colors got dark" is correct behavior). The
current exporter does no conversion (`# colors are already linear` in
primitive_extract.py; zero `srgb` hits in glTF-Blender-IO). In bpy write
`.color` (linear) or `.color_srgb` (authored hex). three r160's GLTFLoader
sets `material.vertexColors` ITSELF when the attribute exists; vertex color
MULTIPLIES `material.color` (keep it white); a VEC4 attribute triggers
USE_COLOR_ALPHA (a fresh bpy attribute defaults to (0,0,0,0) — fill
alpha=1); an attribute named with a leading underscore exports via
`export_attributes` but is treated as an instancing attribute, never vertex
color. Encoding: VEC4 → normalized u16 (8 B/vert), VEC3 → float
(12 B/vert) — alpha makes it cheaper, not dearer.

**Normals.** The exporter reads evaluated corner (split) normals; 4.1+
derives them from `sharp_edge` flags/custom normals (Auto Smooth is gone —
it became a "Smooth by Angle" MODIFIER, and with `export_apply=False` that
modifier is NOT evaluated: every crease vanishes silently). Edge-split
modifiers and calc_normals_split-era advice are obsolete. In three, never
set `flatShading: true` on a baked asset — the shader recomputes
per-triangle normals from derivatives and discards every baked bevel;
conversely `export_normals=False` gets an all-facets look for free
(loader falls back to flat) and saves 12 B/vert.

**Budgets (2026 web-game practice).** Hero prop 3k–8k tris, mid prop
≤2k, scatter ≤500; draw calls dominate triangles (<100/frame target — one
merged mesh with one material beats a 12-object hierarchy). Byte math:
POSITION+NORMAL+COLOR_0 ≈ 32 B/vert uncompressed; a 6k-tri prop ≈ 200 KB.

**Compression: don't.** Draco decoder ≈ 100 KB gzipped (more than our
assets), meshopt ≈ 6.3 KB but still a runtime dep and a loader hook —
both net-negative under 1 MB with vendored three. The zero-cost option if
ever needed: `KHR_mesh_quantization` (three reads it natively since r111,
no decoder; ~2× smaller; Blender can't write it — apply offline via
gltfpack/gltf-transform at build time). gzip/brotli on the wire does the
rest.

**Determinism.** The exporter writes no timestamps (generator string is
version-only); byte-identical GLBs are achievable given pinned Blender,
--factory-startup, seeded random — the drift sources are yours (and the
EXACT boolean's vertex ordering, which forge.canonicalize sorts away).

**LLM authoring (published evidence).** Text2CAD-Bench (2026): the same
tasks expressed as Python/CadQuery vs a command DSL — invalidity 11–20%
vs 32–67% across seven models; "code-based representations better leverage
LLMs' pretrained capabilities". OpenSCAD-specific failure modes match what
our battery saw: coordinate-frame confusion, solid-vs-void tracking, $fn
drift, and preview-correct/mesh-broken divergence; the universal
mitigation, also ours: render and LOOK every iteration, gate on numbers
(genus, volume, bounds), not exit codes.

## Annex B — the 2026 landscape (researched, not run, with reasons)

- **Replicad** 0.23 — OCCT in JS with a real Node CLI (documented only in
  the package README) and fillets; no glTF; embeds manifold-3d whose mesh
  format would bridge. Worth a look if a JS-native path ever matters.
- **libfive** — best sharp-feature SDF meshing on paper; zero releases
  ever, dormant since 2025-11, source-build (Guile) only.
- **Curv** — moved to Codeberg, alive-ish; STL/OBJ/X3D only (X3D carries
  vertex color); 2021 release; `-O jit` needs a C++ toolchain at bake time.
- **Zoo/KittyCAD KCL** — excellent CLI that does export GLB — through
  their CLOUD engine, token + per-second billing; parse is local, geometry
  is not. Disqualified for a zero-dependency OSS project.
- **Fornjot** — archived 2026-06-19 ("goals were never reached").
- **Truck** (Rust B-rep) — alive on master, crates stale since 2024, no
  glTF, no vertex colors; distinctive `ShellCondition` verifier.
- **Sverchok** — healthy Blender node addon; its new GLB-export node
  dereferences `bpy.context.window` → crashes in `--background`; usable
  headlessly only via a Viewer node + the standard exporter.
- **geometry-script** dormant (2025-07); **geonodes** (al1brn) active and
  pythonic but has NO license file — legal risk; **NodeToPython** alive.
- **Cascade Studio / cascade-core** — restructured 2026 into a "no GUI
  deps" core that still constructs a browser `Worker` unconditionally —
  Deno/Bun only, not Node; STEP/STL/OBJ, no glTF.
- **Nodi v2** — closed source; the open `@nodi3d/modular` evaluates graphs
  but writes no files and graphs are authored in the closed web app.
- **Structure Synth** dead (SourceForge-only); **Fragmentarium/FragM**
  alive but render pixels, not meshes; **L-Py** (openalea) alive for
  L-systems, conda-only. No maintained, headless shape-grammar tool
  reaches GLB in 2026 — the grammar layer is host-language code by
  necessity, which is exactly what forge recipes are.
- **PythonSCAD** — OpenSCAD fork with native Python AND the Manifold
  engine, cp313 wheels, releasing actively (1.1.2, 2026-07); still
  STL/3MF-bound. The best "OpenSCAD but Python" if that itch returns.
- **bitbybit-occt** — OCCT WASM with a real in-WASM glTF writer that runs
  in Node; 105 MB unpacked, per-part colors only.
- **BRL-CAD** (glTF via bundled assimp, ballistics-heritage kernel),
  **FreeCAD headless** (works, ~GB, engineering-tuned), **POV-Ray** (no
  mesh export at all), **Houdini** (Apprentice: non-commercial, watermarked
  formats; Indie: revenue caps + node-locked + Engine licensing) — all
  disqualified for cause.
- **AI mesh generation** (TRELLIS, Hunyuan3D, TripoSG) — GPU/cloud-bound,
  organic high-poly needing retopo, non-deterministic: wrong tool for
  reproducible scripted assets. Reassess if a concept-art-to-scenery need
  appears.

## Re-opening the question

Add a contender by implementing `bakeoff/BATTERY.md` under its honesty
rules (archived per-tool sources in `bakeoff/src/` show the expected
shape), gating with tools/forge/check.py, and scoring per
`bakeoff/SCORING.md` against the numbers in `bakeoff/metrics/`. Triggers
worth the effort: manifold-3d ships a sane default export path (it is one
wiring kit from contention); the Blender pin becomes a liability; a
maintained grammar-to-GLB tool actually appears. The Blender 5.2-LTS
upgrade is NOT a re-open — it's bootstrap PIN bump + battery re-bake +
digest diff + look, per tools/forge/README.md.

Not archived (regenerable or session-only): the 42 baked GLBs and the
judging PNGs — Blender items re-bake byte-identically from
tools/forge/recipes/; the other tools' rebake from bakeoff/src/ given
their (recorded) installs. The bake-off's Blender battery sources in
bakeoff/ are superseded by the LIVING copies in tools/forge/recipes/,
which is why bakeoff/src/ has no blender/ directory.
