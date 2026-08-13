# Bake-off scoring rubric — as applied 2026-08-12

Weights (100):
- 25 Mesh quality for three.js — shading/normals control, watertightness,
  tri efficiency at equal visual quality, degenerate/repair incidents.
  Evidence: check-style metrics + viewer renders (lit + normal modes).
- 25 Expressiveness — hard-surface CSG, fillets, sweeps (B3), organic (B4),
  recursion/grammar (B5), text (B6). Breadth of what the tool could DO at
  spec, from item statuses and renders.
- 20 LLM-authorability — attempts + authoring minutes to done, error
  quality, source readability, blind-agent verdicts.
- 20 Pipeline fit — native GLB or clean conversion, color reaching
  COLOR_0/materials, Y-up correctness, bake speed, headless ergonomics.
- 10 Footprint & ops — install size/fragility/time, no-sudo viability,
  project health, license.

Final scores (judged in the main session from `metrics/*.json` + renders;
verdict rationale in docs/FORGE-BAKEOFF.md):

| Criterion | blender | openscad | cadquery | jscad | manifold | sdfpy |
|---|---|---|---|---|---|---|
| Mesh quality /25 | 23 | 17 | 18 | 12 | 14 | 15 |
| Expressiveness /25 | 23 | 18 | 18 | 13 | 21 | 15 |
| LLM-authorability /20 | 15 | 15 | 14 | 12 | 11 | 13 |
| Pipeline fit /20 | 19 | 12 | 12 | 10 | 13 | 13 |
| Footprint /10 | 7 | 7 | 6 | 8 | 9 | 5 |
| **TOTAL /100** | **87** | **69** | **68** | **55** | **68** | **61** |

Verdict rules that were applied:
- Every scored cell backed by at least the lit render; shading disputes
  settled in mode=normal.
- Scores reflect what SHIPPED (manifold's 5/7 garbage-NORMAL files score as
  shipped, with the underlying geometry quality acknowledged in
  Expressiveness; the counterfactual is argued, not scored).
- An item DNF would cap the matching Expressiveness capability at 0 — no
  partial credit for "could probably". (All six tools completed 7/7, so
  this rule never fired; JSCAD's B3/B6 honest partials cost points without
  zeroing.)
