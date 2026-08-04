# Themed Dice — the taxonomy (Tier 6 §9)

Joe's brief (2026-08-03): *cool-looking dice of different materials and
types, natural AND supernatural — faerie dice, dryadic dice, wizard dice,
warrior dice. Special effects and strong themes merged subtly into the
dice themselves. Broad categories, not just dungeon stuff; 6–10 major
groupings, each with a concrete look & feel and color palette.*

Standing constraints (ROADMAP §9): theme lives in **material, edge, glow
and face treatment** — never noise on top. Numbers stay readable (GOALS
legibility invariant). A theme is a **skin over dice.js geometry +
materials**; physics and face correction are untouched. Gold `#d4af37`
stays the app's *roll-verb* color — themes may visit it (Gildhall) but
no theme's ambient glow should read as "roll me".

**Effects doctrine — every effect has a CAUSE.** An effect is the
physical consequence of what the die *is*: lightning discharges (pop
flash), mass arrives (table jolt), cold arrests (frozen landing), the
void feeds (the room dims). Ingredients per effect are drawn from, never
all at once: light flash · environment lighting shift · motion/blur ·
weight & impact · shake/rattle · internal glow · liquid · destruction of
the die · dramatic transformation. Effects are SHORT (≤700 ms unless
they are a settle-behavior), and quiet at rest — P1 binds themes too.

---

## 1. Tidewrack — ocean & odyssey

Dice pulled from a wreck: sea-glass worn smooth, drowned bronze, a light
that behaves as if underwater.

- **Palette**: abyss `#0e3a3f` · sea-glass `#7fd1c3` · foam `#eef7f2` ·
  drowned bronze `#8a6f3c` · biolume `#58e6d9`
- **Material**: translucent sea-glass body (low roughness, zero metal,
  faint teal self-light); bronze numbers, slightly worn.
- **Signature effects**
  - **Swell** *(nothing underwater sits still)* — settled dice bob on a
    slow sine, a few millimeters, out of phase with each other.
  - **Biolume wake** *(disturbed plankton light up)* — on settle, an
    internal cyan glow blooms from the impact face and fades over ~1 s.
  - **Droplet ring** *(a wet die strikes)* — impact stamps a brief
    expanding ring on the felt, one per bounce, fading fast.

## 2. Wildwood — forest, fae, dryadic, elven

Living wood with the bark left on the corners; moss in the recesses;
numbers of backlit amber sap.

- **Palette**: heartwood `#5a4326` · moss `#6f8f4f` · sap amber
  `#d9a441` · petal `#cdbe8a` · firefly `#ffe9a3`
- **Material**: satin wood (rough ~0.7), moss-dark faces, sap-amber
  numbers with the faintest inner warmth.
- **Signature effects**
  - **Vine catch** *(the forest cushions what falls in it)* — the last
    bounce doesn't happen: the die decelerates unnaturally and settles
    soft, as if caught.
  - **Firefly drift** *(the woods noticed)* — after settle, two or three
    warm motes rise off the die and wander out over ~1.5 s.
  - **Sap gleam** *(amber backlights when read)* — hovering the result
    warms the numbers like sun through resin.

## 3. Stormcall — sky, tempest, charged air

A storm bottled in glass: thunderhead grey with light moving inside it.

- **Palette**: thunderhead `#3a4150` · charge violet `#8f7fe8` · flash
  white `#f2f6ff` · rain steel `#9fb0c0`
- **Material**: smoky glass body with a violet charge-glow that lives in
  the interior, not the surface; flash-white numbers.
- **Signature effects**
  - **Discharge pop** *(lightning grounds through the table)* — at first
    impact: a single white point-flash at the die, one frame of
    brightened environment, a 2 px camera jolt. Sharp, done in 150 ms.
  - **Static crawl** *(charge seeks a path)* — while tumbling, the
    interior glow flickers along edges.
  - **Rolling thunder** *(the sky answers)* — a crit dims the room for a
    beat, then double-flashes.

## 4. Rimehold — frost, glacial, winter court

Glacier ice with frost ferns etched under the surface; the cold is the
mechanic.

- **Palette**: deep ice `#1e3d5c` · glacier `#a8d8f0` · frost `#eef4fa` ·
  aurora `#8fe3c0`
- **Material**: clouded ice body (high clarity at edges, frosted faces),
  frost-white numbers, an aurora-green specular that only shows at
  glancing angles.
- **Signature effects**
  - **Frost lock** *(cold arrests motion)* — the die does not bounce to
    rest: at first solid contact it STOPS, and frost crackles outward
    from the contact point across the felt (~400 ms decal), retreating
    slowly.
  - **Breath fog** *(warm room, cold die)* — a small fog puff on impact.
  - **Aurora sheen** *(polar light finds ice)* — on a crit, a green-
    violet sheen sweeps once across every face.

## 5. Emberforge — fire, molten metal, the smith

Black iron with molten seams; the numbers are poured, not painted.

- **Palette**: coal `#1a1512` · iron `#2b2622` · ember `#ff8c42` ·
  molten `#ffd166`
- **Material**: rough cast iron body; edge seams and numbers EMISSIVE
  (molten), breathing very slowly at rest.
- **Signature effects**
  - **Anvil slam** *(mass arrives)* — landing hits harder: one decisive
    table jolt, no elastic wobble afterward, a low thud hook. The felt
    takes a brief scorch glow under the contact.
  - **Stoke** *(agitation feeds the fire)* — while tumbling or when
    rerolled, the seams surge brighter; they cool back over ~2 s.
  - **Spark spit** *(struck iron)* — first impact throws 3–5 spark
    streaks that die in 300 ms.

## 6. Arcanum — runes, wizardry, contained power

A crystal focus engraved with rune-numbers; the roll is a casting.

- **Palette**: deep indigo `#2a2140` · violet `#b48ede` · rune cyan
  `#7fd9e8` · white-hot `#f5f0ff`
- **Material**: faceted crystal body (dark, clear), rune-engraved
  numbers that carry the glow; a faint idle hum-pulse (~4 s period,
  barely visible).
- **Signature effects**
  - **Rune charge** *(the roll IS the spell)* — while the die tumbles,
    its rune-numbers brighten in sequence; settle releases the charge as
    one soft flash from the top face.
  - **Containment hum** *(power idles, contained)* — the at-rest pulse
    above; disable-able, it is the ambient test case.
  - **Overload** *(the matrix vents)* — on a crit, an implosive beat:
    the glow collapses inward to a point, one frame of dark, then the
    release flash. Reads as intake-before-detonation.

## 7. Umbra — dark, evil, unnatural

A die-shaped absence. Light does not reflect off it so much as decline
to.

- **Palette**: void `#0b0a10` · bruise violet `#43265b` · old blood
  `#7a1f1f` · witchlight `#cfe98c`
- **Material**: light-swallowing matte black (roughness 1.0), witchlight
  numbers — a pale sickly green-white that seems lit from somewhere
  wrong.
- **Signature effects**
  - **Light recoil** *(it eats light)* — on landing, the die does not
    flash: the ENVIRONMENT dims ~20% for 300 ms instead. The inversion
    is the identity.
  - **Creep** *(the shadow arrives after)* — a soft shadow blot spreads
    from under the settled die a beat later, then retracts.
  - **Unmaking** *(it was never fully here)* — when cleared, the die
    crumbles upward into ash motes instead of whisking away. The one
    destruction-of-the-die effect in the core set.

## 8. Reliquary — bone, ivory, ancient relics

Museum-case pieces: aged ivory, scrimshaw etching, verdigris fittings, a
wax seal on the high face.

- **Palette**: old ivory `#e8dcc0` · etch brown `#6b543a` · verdigris
  `#5f8f7a` · seal red `#a34632`
- **Material**: matte aged ivory with darkened engraving (the numbers
  are the scrimshaw); verdigris edge fittings on the high-rank dice.
- **Signature effects**
  - **Dry rattle** *(hollow ivory)* — settle gains one extra micro-click
    bounce; the sound hook is the point (dice-click pitched up).
  - **Dust bloom** *(a case long closed)* — first impact puffs a small
    dust cloud that drifts, not falls.
  - **Seal flare** *(the relic answers)* — on a crit, the wax-seal
    emblem on the top face glows through, red-gold.

## 9. Gildhall — royal, gilded, heraldic

The house set: oxblood lacquer and gold leaf. Deliberately adjacent to
the app's own dress (this is the one theme allowed to speak gold, and it
must still whisper it).

- **Palette**: oxblood `#4a1f1a` · lacquer black `#1a0f0c` · gold leaf
  `#d4af37` · ivory `#f3ead7`
- **Material**: deep lacquer body with mirror polish; gold-leaf numbers,
  crisp.
- **Signature effects**
  - **Weight of state** *(ceremony moves slowly)* — extra damping on the
    settle: fewer, more decisive bounces.
  - **Fanfare gleam** *(gold finds the light)* — on settle, a single
    glint travels across the faces, once.
  - **Standard raise** *(the house acclaims)* — on a crit, a brief
    vertical shaft of warm light stands over the die for half a second.

---

## Houses hold SETS (Joe 2026-08-03)

A theme is a HOUSE — the browsing category with an identity — and every
house holds multiple SETS, the concrete dice styles a player actually
picks. Wildwood is one house; **Heartwood** (living wood, sap-amber
digits), **Mosstone** (weathered standing-stone, carved lichen-pale
digits) and **Sap Amber** (polished resin, dark inclusion digits) are
three of its sets. Rimehold splits into **Deep Glacier** (dark ice,
frost-white digits) and **First Frost** (pale morning ice, dark digits).
js/themes.js is two-level to match: `THEMES[house].sets[set]`, flattened
to `SETS['house.set']` — the dice.js variant key and the future picker's
unit. New styles join as sets of an existing house first; a new HOUSE has
to earn its place by not fitting any of the nine.

## Expansion directions (not in the core nine)

Starfall (night-sky bodies, constellation pips, aurora — split from
Arcanum if the astral read deserves its own house) · Clockwork (brass,
gears, escapement ticks) · Carnival (trickster lacquer, confetti pop) ·
Plaguewild (Umbra-adjacent rot/bloom). The taxonomy holds nine so each
grouping stays BROAD; sub-sets live inside a grouping (Rimehold hosts
"first frost" and "deep glacier" variants, not new houses).

## The effects sophistication ladder (agreed with Joe 2026-08-03)

The v1 lab used only UNIFORM knobs — body/number color, whole-material
finish and glow, transforms, light dimming. The climb from there, in
leverage order for this zero-dep codebase:

1. **Texture-space authoring** — the face baker gains per-CHANNEL maps,
   all authored in the 2D canvas we already draw with: `emissiveMap`
   (molten DIGITS on black iron — glow where the theme means it, not a
   body tint), `normalMap` baked from a canvas height sketch via Sobel
   (engraved scrimshaw, wood grain, hammered iron, frost ferns — light
   rakes real-feeling relief at zero geometry cost), `roughnessMap` /
   `metalnessMap` (matte frost ferns over glassy ice; gold leaf worn
   through at corners). Craftsmanship level: where "theme merged subtly
   into the die itself" actually lives. **← STARTED first.**
2. **Shader injection** (`onBeforeCompile`, core Three, no post stack) —
   fresnel rim glow (biolume edges, aurora sheen, Umbra's wrong halo),
   time-driven uniforms (flowing molten seams, runes charging in
   sequence, frost creeping via an expanding mask), view-angle hue shift
   (sea-glass iridescence), and the dissolve shader (noise-threshold
   alpha + glowing edge) that IS Umbra's unmaking.
3. **Particles & trails** — a tiny instanced system (~100 lines): sparks,
   firefly motes, rising ash, dust, breath fog, bubbles. Keyed off REAL
   impacts: the physics already reports collision strength to the sound
   system, so "the reason behind the effect" is literal physics.
   **← SHIPPED 2026-08-03.** `js/particles.js`: one `THREE.Points` ring
   pool (1024), procedural soft-dot sprite, additive blending; CPU
   integration with per-particle gravity/drag/wobble, size + color lerps,
   and a per-particle fade-out knee (a bubble POPS at 0.94; fog has been
   fading since 0.35). Kinds — each a claim about why matter leaves a
   die: `sparks` (struck iron; cool white→ember, gravity wins), `static`
   (charge grounds; no weight, gone in 0.2s), `motes` (knocked-loose
   pollen/spores/rune-embers; buoyant, wandering), `fog` (a breath of
   cold off the ice, spreading low), `bubbles` (trapped sea-air; rises,
   sways, POPS), `dust` (old bone; puffs then settles), `ash` (the
   unmaking; dim violet-grey, one in five a live witchlight ember).
   Recipes live per-set in themes.js (`particles: {kind, colors,
   fadeTo?, scale?}`); Sap Amber and Oxblood have NONE on purpose —
   sealed resin and lacquer shed nothing, restraint is identity.
   `ParticleField.burst(recipe, at, strength)` is stateless about WHEN:
   the lab's DROP RIG (a real cannon-es d6, main-table gravity -110 and
   contact params, one at a time into the zoomed row) fires it from live
   `collide` events at the measured contact point; the main table will
   fire it from its fast-forward recording by extending roll.sounds'
   {time, strength} events with the contact position — same playback
   clock, same seam. The unmake burn also feeds `field.wisp()` per frame
   while uDissolve rises, so Umbra's ash rides the dissolve clock, not a
   timer of its own. Gotcha for later integrations: cannon-es worlds
   default `allowSleep` to FALSE — without `world.allowSleep = true` the
   settled die never sleeps and cleanup waits on the hard timeout.
3.5. **Geometry identity** — the die the player SEES gets a shape
   character while the physics hull, values and reading stay canonical
   (createDieBody/readValue always use the std entry — a skin can never
   change how a die lands). **← SHIPPED 2026-08-03.** Per-set `geo`
   recipe: `bevel` (edge-cut share — 0.015 razor to 0.13 tumbled; std is
   0.055), `profile` ('cut' flat chamfer facets vs 'round' fillet-shaded
   band — sphere normals BLENDED 0.65 over recomputed facet normals; a
   full replacement erased wear-crater shading and dents went black),
   `wear` (0..1 tumbled erosion: coarse lumps + fine crinkle, biased
   exposure² toward corners, POSITION-KEYED hashing so the triangle soup
   stays watertight), `nicks` (seeded chip scoops at corner sites — wide
   and shallow; narrow+deep read as cracks), `pillow` (0..1
   cushion-SHADED faces: normals tilt toward the rim, silhouette and the
   digit plane stay flat — legibility invariant). Round-profile sets
   darken their edge band half as much (a worn edge is frosted, not
   inked). Deterministic per (type, variant); geometry cache is per
   variant so std/shroud are untouched. Fingerprint: bounding radius
   orders exactly by character — Void Grain 1.158 (nothing has ever worn
   it) > Focus Crystal > Oxblood > Bolt-glass > First Frost > std 1.127 >
   Deep Glacier > Heartwood > Sap Amber > Black Anvil > Scrimshaw >
   Mosstone > Sea-glass 1.069 (decades in the surf). `__lab.geoStats()`
   asserts the ordering headlessly.
4. **The environment joins the theme** — felt decals from the landing
   point (frost crackle, droplet rings, scorch; the mat-text decal
   machinery is the seam) and a colored light PARENTED to the die (a
   biolume die casts teal on its patch of felt; Umbra pools local
   shadow instead of dimming the world).
5. **Hand-rolled postprocessing** — selective bloom, shock rings, heat
   shimmer (~150 lines each, no examples/jsm). Ranked LAST on purpose:
   it amplifies identity the other levels create, it creates none.

Side-channel: render-only child meshes (the bevel already works this
way) can change the SILHOUETTE — verdigris corner caps, crystal spurs,
vine loops — while the physics hull stays canonical.

## The lab

`lab.html` is the experimentation rig (dev chrome, not player UI): every
theme × every die type in one grid, idle-rotation toggle, per-theme
effect trigger buttons, a ⬇ drop button per set (the Level 3 rig — a
real physics die whose measured contacts fire the set's bursts; sets
without particles prove the restraint), and one-click PNG capture.
`tools/lab-shots.mjs` drives it headless over CDP and drops PNGs for
side-by-side review. Themes land in `js/themes.js` as material recipes;
the main app consumes NOTHING from the lab until a set graduates
(picker + wire come later — §9's (type,setId) cache, per-player identity
set, saved-pool override).
