---
name: new-venue
description: Compose or integrate a venue's scene — the diorama discipline. The thirteen composition rules, the eye-first process, the placement law, the connective-tissue idioms, and the gates, in order.
---

# The venue skill — one scene, not set pieces

A venue is a DIORAMA: watched from one composed eye (the resting eye)
plus one secondary (the spread), never walked. This skill is the process
for composing a new venue's stage or integrating an existing one —
commissioned by Joe's W2b verdict ("good set pieces… the scene lacks
integration"), and it is the composition counterpart to `/new-tower`'s
portal arithmetic.

## Read first, in this order

1. **docs/VENUE-COMPOSITION.md** — the THIRTEEN RULES with their CHECKs
   (10 composition + 11 grown-not-placed, 12 engine-furniture-wears-the-
   world, 13 the scenery tier). They are the law of this skill; this
   file is the procedure.
2. docs/FAE-VENUE-SPEC-DRAFT.md — palette law, the four Vegas gates,
   legibility laws (fog under die tops, ≥2.5:1 face contrast).
3. GOALS goals 13–15 — the venue doctrine (atomic set, two registers,
   atmosphere serves the roll).
4. The PLACEMENT LAW as shipped: `venue-set` asserts it off
   `venueInfo().stage` — flank features dice-unreachable at their
   NEAREST EDGE (beyond the widest back wall z −4.3, clear of the tower
   envelope |x| 3.3), the beam on the resolve area, three dense sheets
   below every die top. Composition works INSIDE this; it never argues.

## The process

1. **Eyes before opinions.** Render the resting + spread frames first:
   `node tools/drive.mjs tools/steps/glade-look.mjs` (add `probe` for
   hide-one-at-a-time element forensics — when a frame won't cohere,
   stop theorizing and start hiding). Judge everything at these eyes;
   plan-view reasoning is only for the triangle check.
2. **Diagnose against the ten rules.** Walk the dossier's CHECKs in
   order and write numbered findings (the W2b glade diagnosis in the
   dossier is the worked example). Rule 8's check is a grayscale pass —
   desaturate the frame (`magick shot.png -colorspace Gray …` or judge
   value deliberately) and re-walk the eye circuit.
3. **Plan placements as a triangle, inside the law — then verify AT THE
   EYE.** Unequal depths, unequal distances, resolve area inside. For
   every feature carrying ground half-extents rx/rz: nearest edge =
   center ± extent, and THAT is what the law bounds. Keep ≥0.3 margin
   beyond the wall — the wide zoom is the binding case. The plan
   triangle is necessary, never sufficient (rule 6 as amended — the
   W2b/W2c lesson): the back band compresses to one screen strip, so
   the composition verdict is rendered on the FRAME with angular size,
   overlap, and the foreground band — never with plan depth alone.
4. **Implement tissue with the stage's own idioms** (js/fae-lab.js):
   baked canvas gradients (ground lobes, damp rings), small-mesh spills
   sharing an existing builder's vocabulary (stray caps from the moot's
   own geometry), base transitions, biased noise (the mist band's bites
   take a weighting). ZERO new lights; tissue must never read as new
   glow SOURCES (the countable-sources Vegas gate) — strays are dim or
   dark, gradients are value not emission. Ownership split (rule 11):
   where a feature is a BAKED MODEL, transition geometry that belongs
   to the feature (roots, berms, skirts, creep) goes in the MODEL's
   recipe — the venue paints only the ground's answer. Canvas value
   alone cannot ground a model whose geometry ends in a prop edge.
5. **Dress engine furniture as terrain** (rule 12). The ramp, lip and
   jamb margins wear the venue's own ground story; inside the dice
   lane the visible surface IS the collider plane (dice ride physics —
   any visual deviation there is a die sinking into scenery); lumps
   and wings stay outside the lane. Write the one-sentence material
   story for each functional surface before modeling it.
6. **Populate the scenery tier** (rule 13): small, value-quiet,
   non-focal bits in the between-space and the FOREGROUND band — but
   PROBE the band first: `__diceDebug.worldToScreen(x, y, z)` says what
   the resting eye actually keeps in frame (most of the near field is
   cropped; expect one corner wing, not a symmetric pair). Near-corner
   legality is outside the dice box at every point — past the front
   wall OR past the x wall, since the box is the walls' intersection.
   Nothing in the tier may be the first thing the eye visits, emit
   light, or enter a dice lane.
7. **Move a placement, move its claim.** Any position change lands in
   `venue-set`'s assertions as a DOCUMENTED NEW CLAIM (the layout comes
   off `venueInfo().stage`, so the scenario reads the contract — keep
   it that way).
8. **The LOOK loop.** Re-render both palettes after every increment; a
   composition change that reads in moonrise can die in foxfire's value
   floor. Judge: the circuit (rule 2 trace), the rims (rule 4), the
   FRAME triangle (rule 6 as amended — screen space, not plan), the
   dissenters (rule 7 list), the seams (rule 11 silhouette trace).
9. **Gates.** `npm test` + `--only fx,settings`; the Vegas gates at
   LOOK (≤8% bloom, ≤2 glow hues + 1 warm accent, tier separation,
   countable sources); the placement law green in `venue-set`.

## Traps (each one shipped or nearly shipped)

- **The pasted-prop rim.** A feature whose boundary ends in a hard
  circle on featureless ground reads as furniture. Every base fades,
  spills, or reaches (rule 4/9) — and the fade is TISSUE, authored,
  not a blur.
- **Bookends.** Two supports at mirrored positions and equal depth
  (the W2 moot/pool, both at z −6.5) read as symmetry no forest has.
  Break depth first — it is the cheapest asymmetry and it recruits the
  background layer (rule 5/6).
- **The dissenting arrow.** One directional element pointing off-stage
  (a glint axis copying a beam tilt instead of aiming anywhere) undoes
  the other five that agree. List EVERY arrow; fix the list, not the
  vibe (rule 7).
- **Composition creep into W5.** Living things — wisps, fireflies, the
  moot in session — are the LIVING LAYER's tier, not tissue. If the fix
  moves, it is out of scope here; tissue is static.
- **Tissue in the dice's way.** Everything new obeys the same placement
  law as the features it connects: a spill that wanders inside the
  wall line is a die-collision-with-scenery bug waiting for a seed.
- **The extents lie of centers.** The law bounds NEAREST EDGES. A
  center that obeys with its extent forgotten is the fixture-pinch
  class of error — carry rx/rz through every move.
- **The plan-space triangle.** W2b "broke the bookends" by moving the
  pool 0.8 in plan z — and the resting eye, compressing the whole back
  band into one screen strip, photographed no change at all (while the
  move pushed the pool half out of frame). Composition verdicts are
  rendered on the FRAME; plan space is only for the placement law.
- **Paint-grounding a prop.** A tinted prop is still a prop: the
  delivery tongue took a 0.39 value drop (round 4) and still read as a
  gangplank, because its GEOMETRY ended in a prop edge. Grounding is
  shape work (rule 11) — transition geometry in the model, the ground's
  answer in the venue — with value as the finisher, never the fix.
- **The machine showing.** An engine surface left in its functional
  shape (the ramp as a plank) breaks the fiction at the exact spot
  every roll ends (rule 12). Dress it as terrain; keep the dice lane on
  the collider plane to the millimeter.
- **One palette's LOOK is half a LOOK.** Foxfire's value floor is a
  different world; both palettes gate every increment (rule 8 is
  cheapest to break in the dark one).
