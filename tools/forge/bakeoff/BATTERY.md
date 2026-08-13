# Mesh-tool bake-off battery — spec v1

Seven fixed test models. Every candidate tool implements the SAME spec in its
native grammar. The consumer is a three.js tabletop app (stylized, fantasy,
low-to-mid poly, MeshStandardMaterial); "table units": a die has radius ~1.25,
a dice tower stands ~12 units, minimum visible feature ~0.07u (42 px/unit at
the game camera).

## Ground rules

- Use the tool's NATIVE grammar for geometry (primitives, booleans, sweeps,
  noise). Host-language glue math (loops, vectors) is fine and encouraged —
  that's part of what we're evaluating. Do NOT import meshes made elsewhere.
- Deterministic: fixed seeds only. Two runs must produce identical geometry.
- Output per item: `eval/out/<tool>/B<n>_<slug>.glb`, Y-up, sized per spec,
  centered on origin, standing ON y=0 (min y ≈ 0), front toward +Z where a
  front exists.
- If the tool cannot export GLB natively, export STL (or OBJ/3MF) and convert
  with `harness/stl2glb.py in.stl out.glb --zup --angle 30`. Record which path
  was used. `--zup` rotates Z-up→Y-up; use it for CAD tools that are Z-up.
- Color: on B1 (pips darker than body) and B4 (cut top vs bark), attempt ANY
  color mechanism the tool has (per-part materials, vertex colors, 3MF color).
  Record "none" honestly if the tool can't.
- Tri budgets are CEILINGS. Also record whether the tool lets you CONTROL
  density up AND down (segment counts, tessellation tolerance, decimation).
- Time-box: ≤ 25 min authoring per item. A DNF with honest notes is a valid
  result. Record real attempt counts including failed compiles/runs.
- Never test against port 8123. Work only under your eval dir, ~/opt/dice-forge
  and the scratchpad.

## Items

### B1 chamfered-die — hard-surface precision
Cube edge 2.0. Edge treatment radius 0.10 — true rounded fillet preferred,
flat chamfer acceptable (record which). Pips: spherical dents, sphere r 0.22
sunk to depth ~0.08, standard d6 layout (1-6, 2-5, 3-4 on opposite faces).
Pip rims should read crisp but not visibly faceted at game distance.
≤ 8k tris.

### B2 turret — architectural CSG + arrays
Cylindrical tower: outer r 1.6, total height 10.0, wall implied thickness
0.35. Base flares to r 2.1 over the bottom 1.2 (taper or molding). Top rim:
8 crenellation merlons (w 0.55 × h 0.7 × d 0.35) in a radial array. 3
arrow-slit RECESSES (w 0.15 × h 0.9, depth 0.12 — must NOT pierce; the app's
towers forbid holes into the shaft) at differing heights/angles. One arched
doorway at ground, 1.1 w × 2.2 h, piercing the wall as a tunnel with a
visible interior return. ≤ 15k tris.

### B3 helix-ramp — sweeps/lofts
Central column r 0.5, h 8.0. Around it an open helical chute: U-channel
profile (floor width 1.2, side walls height 0.35, material thickness 0.12)
swept along a helix of radius 1.55 (measured to floor center), pitch 2.6 per
turn, 2.25 turns, descending from near the top. Clean planar end cuts.
Watertight solid. ≤ 22k tris.

### B4 gnarl — organic
A gnarled old tree stump: height ~2.6, base spread ~3.0 with 4–6 root
flares, top slightly concave. Bark relief via noise displacement (feature
scale ≥ 0.07u, amplitude ~0.08). NO hard CSG edges anywhere; silhouette must
read organic. Optional second color for the cut top. ≤ 30k tris.

### B5 candelabra — recursion/grammar power
From a round base (r 0.7), trunk r 0.22 rises 1.2, then splits into 3 arms
(spread 35–45°), each arm curves upward and splits into 2; at each of the 6
tips a drip-pan (r 0.28) and short candle cup. Radii taper ×0.75 per
generation. Junctions must not show open seams; smooth blends preferred.
Total height ~3.2. Deterministic. ≤ 20k tris.
This item exists to measure the GRAMMAR: recursion, transforms, reuse.

### B6 plaque — text on curved surface
Plaque 2.6 w × 1.8 h × 0.25 thick, face gently bowed (cylinder radius ~4,
axis vertical). Raised border frame (0.18 wide, raised 0.06). Text "DICE"
ENGRAVED 0.05 deep, centered, following the bowed face. Any decent font.
Stands upright facing +Z (a wall plaque). ≤ 14k tris.

### B7 boolean-storm — robustness + performance
Cube edge 3.0 centered at (0, 1.5, 0). SUBTRACT all 120 spheres from
`harness/spheres.json` (fields x,y,z,r — already positioned). Then SUBTRACT
one box 3×3×3 centered (1.8, 2.7, 0) rotated 25° about Y (reveals the
sponge interior). Record total bake wall-time, watertightness, tri count,
and whether the result needed repair. No tri budget — report what you get.

## Metrics contract — metrics.json

Write `eval/out/<tool>/metrics.json`:

```json
{
  "tool": "", "version": "",
  "install": {"method": "", "minutes": 0, "disk_mb": 0, "issues": []},
  "items": [
    {"id": "B1", "status": "done|partial|failed", "authoring_minutes": 0,
     "attempts": 0, "bake_seconds": 0.0, "tris": 0, "watertight": true,
     "file_kb": 0, "color_support": "vertex|material|none",
     "export_path": "native-glb|stl-convert|obj-convert|3mf-convert",
     "notes": ""}
  ],
  "iteration_loop": {"edit_to_glb_seconds_typical": 0.0,
                     "error_quality_notes": ""},
  "overall_notes": ""
}
```

Fill tris/watertight/file_kb from `harness/inspect_glb.py <file>` — do not
eyeball. Keep all source files: `eval/src/<tool>/B<n>_<slug>.<ext>` — they are
part of the deliverable (we will judge readability).

Honesty rules: real minutes, real attempts, DNFs recorded as DNFs. Do not
game budgets by post-hoc decimation unless the tool itself offers density
control (and record it if used).
