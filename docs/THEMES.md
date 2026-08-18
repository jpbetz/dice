# Themed Dice — the taxonomy (Tier 6 §9)

*Latest: 2026-08-04 aesthetic pass (Slice 0+1+2). See §0 below.*

## §0 — The 2026-08-04 aesthetic pass (slice 0+1+2)

Joe: "look for tacky and cheap effects, or overdone effects. Each
effect should be subtle and tasteful and combine to produce a
consistent atmosphere and feel. Try to expand the language used…
combinations of subtle effects instead of one super turned up effect."
Ran as a judged workflow (audit × 3 · vocabulary × 4 · redesign ·
critique × 3). Landed as three slices in one commit:

**Slice 0 — turn-downs, retirements, new house.**
- The audit's cheap-reads: boltglass parented flicker light REMOVED
  (was Joe's own "always-drawing-eye" pattern); seaglass parented
  light REMOVED, iridescence 0.55→0.15; blackanvil digitGlow
  1.35→0.7, flow.gain 2.6→1.4, shimmer 1.5→0.7, light 16→10;
  voidgrain fresnel 1.1→0.45 and light range 4.8→2.5; arcanum shader
  pulse REMOVED, light range 5→2, fresnel 0.45→0.3; deepglacier
  fresnel 0.75→0.55; sapamber clearcoat 0.85→0.55.
- Retired the eight "cut-before-shipping" effects the critics agreed
  on: heartwood firefly motes (Pinterest cliché), seaglass bubble
  particles (aquarium-decor "die farts bubbles"), scrimshaw dust
  particles ("old = dust" is the medium's oldest cliché); the four
  proposed-but-not-shipped additions (arcanum rune-charge digit
  cursor, oxblood arrival lacquer bloom, blackanvil hit-punch on
  every landing, boltglass white-hot flash) never got added.
- Retired two derivative sub-sets: `rimehold.firstfrost`
  ("deepglacier at brightness+1") and `wildwood.mosstone`
  ("heartwood at 0.5") — the workflow's redesign couldn't
  differentiate them without inflating the primitive count.
- Added THE CLASSICS house (Joe: "I'm personally a bit bummed we
  don't have simple things like basic color die sets"): 8 unadorned
  variants — Ivory, Ivory (pips), Onyx, Slate, Crimson, Cobalt,
  Emerald, Brass. Palette + matte material only. No particles, no
  lights, no post, no shaders, no glow, no wear. The honest option —
  the civilian house — the control against which themed sets read as
  themes. Ships at the TOP of the picker.

**Slice 0.5 — the `glyph` field.** First glyph-family variation:
`glyph: 'pip'` on `classics.ivorypips` draws canonical Vegas d6 pips
(1 center · 2 corners · 3 diagonal · 4 corners · 5 corners+center · 6
two columns of three). Other die types fall back to digits — pips are
the traditional d6 idiom only. Roman numerals and rune-glyph sets are
a later slice (need legibility work + a glyph library).

**Slice 1 — the `sound` field: IMPACT VOICE.** The single hard-coded
click (bandpass over white noise, 45ms) becomes five bodies: `chime`
(glass/crystal — bandpass + decaying sine partial), `thud`
(iron/stone — lowpass, long tail), `crackle` (storm charge — sharp
attack), `clack` (dry bone/lacquer — narrow bandpass), `hush` (umbra
— barely-audible filtered breath). Every themed set carries a
`sound: {body, weight, sustain}`; Classics use the default click.
Weight 0..1 shifts frequency down (heavier = lower); sustain ms
extends the tail. On the mixed-pool wire, every recorded contact
knows which die hit — so an iron die THUDS while its glass companion
CHIMES in the same roll (§9 mixed pools carried through).

**Slice 2 — the `rate` field: PLAYBACK RETIMING.** A per-set curve
retimes the LAST `window` fraction of the roll's playback to `rate`
playback speed. Physics untouched; face correction untouched — pure
playback-clock scaling like cinematic slow-mo. Three sets earn a
curve today: `heartwood` (vine catch, last 15% → 0.55× — the forest
cushions), `deepglacier` (glacial arrest, last 25% → 0.4× — cold
arrests motion), `oxblood` (ceremonial hover, last 30% → 0.65× —
state moves slowly). Set-identity for a mixed pool is undefined
(heartwood cannot cushion just half a pool) — mixed rolls ride the
default cadence, same rule as singular-set gating for spawn.

**What lands next (from the workflow's ship-order):** Slice 3 — the
`rest` cadence hook (settled dice breathe/creak/settle-tick per set,
sapamber explicitly held at zero as identity). Requires the S3 perf
finding to land first (shelf-bloom leak — see memory/perf-baseline).
Slice 4+ (arrival/departure beats, env-light-shift, mass rumble
tail, geo.wear → digit-map coupling) queued behind that.

**Roster after the pass:** 10 houses, 17 sets. Classics (8) leads;
the themed houses hold 1-2 sets each (Wildwood keeps heartwood +
sapamber as its two poles: living and preserved). The full workflow
output — audits, vocabulary explorations, per-theme stacks, critique
rounds — lives in the session transcript.

**W4 (2026-08-13): 11 houses, 18 sets — and the first STAGED house.**
Moonmoot (§10 below) joined outside the picker entirely: its set is
`venueOnly` and the fae venues deal it at roll creation (ROADMAP W4,
UX §7.34). It also added two recipe fields — `fog` (what a settled die
breathes into a venue's fog lattice) and `venueOnly` — documented in
js/themes.js's header.

---

# The taxonomy (original brief)


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

## 10. Moonmoot — the fae court at night (W4, 2026-08-13)

The nocturnal counterpart of Wildwood's living things — the venue spec's
"cold nocturnal light-logic" house, and the first house a player cannot
pick: the fae venues STAGE it (GOALS goal 13 — the venue is the dice
choice while it stands). It earned its place under this file's own rule
by not fitting any of the nine: Wildwood is sunlit and warm by charter,
and no other house's light lives inside a cold stone.

- **Palette**: twilight stone `#2f3b4c` · witchlight `#d9fbee` · spectral
  rim `#8ff0e2` · labradorescence `#6fd8c8`
- **Material**: tumbled labradorite — deep cool stone, soft fillets, worn
  corners; ALL the light in the deep-carved numerals (the Black Anvil
  value structure inverted to cold). The digit color sits between the two
  venue palettes' rims so one set serves both skies.
- **Signature effects**
  - **Rune glow** *(the carving holds the light)* — engraved digits
    filled with witchlight, blooming in the dark. Deliberately NOT a
    runic alphabet: numbers stay readable (the legibility invariant);
    the glyph library remains a later slice.
  - **Labradorescence** *(the stone's internal flash)* — a cold rim at
    glancing angles, the same under either sky: it is the stone's light,
    not the venue's.
  - **Fog breath** *(the mist knows them)* — a settled die exhales a
    paler, stronger pocket into the venue fog lattice (the `fog` recipe
    field; the venue's whole thesis made per-set).
  - **The court holds its breath** *(fae time)* — the last 12% of a roll
    retimes to 0.7×, a faint hover before the verdict.
- **Voice**: a long faint cold chime — glass struck in another room.
  Reasoned from the table, never listened to; Joe's dial.

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
   recipe: `bevel` (edge-cut share — 0.015 razor to 0.13 tumbled). **THE
   STANDARD EDGE is `{bevel: 0.09, profile: 'round'}` since 2026-08-18**
   (§9c decided; UX §7.54) and it applies as a UNIT to every recipe that
   names NEITHER `bevel` nor `profile` — std, shroud and the eight
   Classics. A recipe that names either one states its own edge and keeps
   the per-field fallbacks (0.055, 'cut'), which is what stops
   `bevel: 0.02` from meaning a 0.02 fillet. `profile` ('cut' flat chamfer facets vs 'round' TRUE fillet
   arcs since 2026-08-04, ROADMAP §9c Tier 2: each edge becomes
   `segments` (1..6, default 3) quadratic-Bézier strips bulged toward
   the original sharp edge — tangent to both faces by construction,
   never below the resting plane — with corner DOMES fanned over shared
   arc instances and ANALYTIC normals, face-exact at the rims; on WORN
   sets the displacement pass recomputes facets and restores roundness
   with the 0.65 sphere-normal blend — a full replacement erased
   wear-crater shading and dents went black), `ink` (0..1 darkness of
   the painted face outline + the matching band material; defaults .25,
   round bands .12; 0 = self-colored edges),
   `wear` (0..1 tumbled erosion: coarse lumps + fine crinkle, biased
   exposure² toward corners, POSITION-KEYED hashing so the triangle soup
   stays watertight), `nicks` (seeded chip scoops at corner sites — wide
   and shallow; narrow+deep read as cracks), `pillow` (0..1
   cushion-SHADED faces: normals tilt toward the rim, silhouette and the
   digit plane stay flat — legibility invariant). Round-profile sets
   darken their edge band half as much (a worn edge is frosted, not
   inked). Deterministic per (type, variant); geometry cache is per
   variant so std/shroud are untouched. Fingerprints re-based by the
   §9c fillet arcs (2026-08-04): a round set now BULGES past its cut
   twin (the arc reaches back toward the sharp edge), so the old
   strictly-by-character radius ladder no longer holds numerically —
   the lab-geo-bench scenario asserts the current invariants instead
   via `__lab.geoStats()`: cut radii monotone in bevel, fillets above
   their cut twins but inside the sharp corner, ink/pillow
   silhouette-neutral, wear pulling inward, and every render mesh
   WATERTIGHT (the unpaired-directed-edge probe).
4. **The environment joins the theme** — felt decals from the landing
   point and a colored light PARENTED to the die (a biolume die casts
   teal on its patch of felt; Umbra pools local shadow instead of
   dimming the world). **← SHIPPED 2026-08-03 — and the MARKS half was
   RETIRED TO A KILL SWITCH the same evening** (Joe: loved everything
   but the residue on the table). `DECALS_DEFAULT_ENABLED = false` in
   js/decals.js gates DecalField.stamp for table and lab alike;
   `__diceDebug.decalsEnable(true)` / `__lab.decalsEnable(true)` re-arm
   one page for trials, and flipping the constant brings the marks back
   for good. Recipes keep their `decal:` fields (inert while off), die
   lights are untouched, and themed-fx locks the clean-felt default
   while proving the machinery behind the toggle still works. Two
   modules, both impact-honest like Level 3:
   - `js/decals.js` (DecalField): transient marks the felt keeps for a
     few seconds after a measured floor contact. NOT the mat-text felt
     composite (that texture is event-driven; animating it would
     re-upload 16 MB a frame) — one instanced quad draw just above the
     felt plane, fixed pool of 64, dead slots collapse to degenerate
     quads. The procedural atlas is TWO-TONE: R channel picks between
     the recipe's two colors, A is coverage — one shared atlas serves
     soot-dark scorch and frost-pale bloom alike. CPU envelopes (grow,
     hold, fade; scorch's ember rim COOLS to soot over the first 2 s).
     Kinds, each a claim about what the die DID to the table: `frost`
     (cold spreads — hoarfrost needles, not a snowflake), `ring` (water
     dries to a wobbling tide-line + dark wet disc), `scorch` (heat
     kisses: soot core, ember rim), `smudge` (dust settles — the grains
     carry the read, not the wash). Per-kind `minGap` suppresses a
     fresh same-kind stamp landing on top of one younger than 1.2 s —
     a die bouncing in place deepens ONE mark, it doesn't pile donuts
     (rings keep a small gap on purpose: overlapping tide-lines read
     true). Marks are transient BY CONTRACT: reload/replay never
     reconstructs them (replaySettledRoll's silent landing skips the
     drain), and the felt always recovers.
   - `js/dielights.js` (DieLightRig): a PointLight at the die's CENTER
     — no shadow casting, so the glow passes through the body and pools
     on the felt beneath: lit from within, which is the claim every
     glowing set makes. The pool is FIXED SIZE and lives in the scene
     from boot at intensity 0, because three.js recompiles every lit
     program when the light COUNT changes and a recompile stutter
     mid-tumble is worse than any glow is good; attach/steal only ever
     touch uniforms. Budget of 4 doubles as restraint; a full pool
     steals from the OLDEST attachment (the fresh throw is where the
     eyes are). Envelope modes: `wave` (biolume, tidal), `breathe`
     (molten iron), `flicker` (charge seeking a path — stepped value
     noise), `steady` (containment hum) — and NEGATIVE intensity for
     Umbra: white light at −8 subtracts evenly, which is exactly what
     a shadow does. Phases are seeded (roll.seed ⊕ constant, or a
     rollId hash at reveal) so every client flickers identically.
   Recipes per set (`decal:` / `light:` in themes.js), with restraint:
   six sets mark the felt, five glow (Umbra darkly); Oxblood, Sap
   Amber, Heartwood and Focus-crystal leave the table untouched on
   purpose — and Bolt-glass marks nothing because glass leaves no
   residue; the LIGHT is its mark. Lights live on FELT dice only: a
   collect puts the flame out (placeCluster releases), a reveal ignites
   it (beginRevealFlip attaches), a shroud smothers it from the start,
   and the rig self-heals any mesh that left the scene by a path that
   forgot to call release. Testing lesson: `sim()` runs simulated
   SECONDS, long enough for a live mark to fade honestly mid-test — so
   the assertion surface is `stampedTotal` (monotonic marks-ever-laid,
   via `__diceDebug.fxInfo()`), never the live count.
5. **Hand-rolled postprocessing** — selective bloom, shock rings, heat
   shimmer. Ranked LAST on purpose: it amplifies identity the other
   levels create, it creates none. **← SHIPPED 2026-08-03 — the ladder
   is complete.** `js/post.js` (PostStack), core three only — no
   examples/jsm, no EffectComposer:
   - **Selective bloom, by construction not by tuning**: the scene
     renders a second time with every non-glowing object BLACKED OUT
     (custom-shader meshes hidden — a basic-material swap would ignore
     their instanced attributes), so only flagged glow sources
     (mesh.userData.bloom: themed dice with emissive identity, set at
     createDieMesh from the recipe's `post.bloom`; the particle pool)
     reach the threshold → half-res separable blur → composite chain.
     A std or shrouded die CANNOT bloom, and occlusion stays honest — a
     std die in front of a molten one blacks out its halo. There is
     deliberately no per-set strength knob: whatever Levels 1-2 made
     bright is exactly what burns.
   - **Shock rings**: ONE screen-space displacement wave per roll, from
     the roll's HARDEST recorded landing (pre-picked from roll.sounds at
     playback build; never fires under strength 10 — a pop needs a
     slam), plus a ~120 ms frame jolt. NEGATIVE amplitude runs the wave
     inward: Umbra's discharge is an implosion.
   - **Heat shimmer**: world-projected wobble sources over shimmer-set
     dice on the felt, biased UPWARD (hot air lives above the iron; the
     first pass wrapped the whole die and read as glass, not heat).
   - **The tone-mapping lesson (do not relearn)**: three r160 applies
     renderer.toneMapping ONLY when rendering to the null target
     (WebGLPrograms checks currentRenderTarget === null), so every
     scene value reaches the stack LINEAR and un-tonemapped. That is
     the RIGHT place for bloom to add — light sums before the camera
     curve — and the composite's `#include <tonemapping_fragment>` +
     `<colorspace_fragment>` then encode exactly as a direct render
     would. Skipping that was a visible 29 dB washout; with it, a
     frozen std frame measures 61.8 dB PSNR against the direct path
     (imperceptible) and the felt is byte-identical region-sampled.
     All intermediates are HalfFloat (8-bit linear bands on dark felt);
     rtBase carries MSAA 4. The threshold (0.9) disciplines LINEAR
     luminance — emissive digits run well past 1.0, key-lit body faces
     don't (Sap Amber stays unflagged regardless: a corona would argue
     with the house's stillness).
   - **The bypass**: the main table renders the released direct path
     unless a bloom-flagged die exists anywhere, particles are alive, or
     a ring/shimmer is running — a std table never pays for the stack
     and never risks it. `__diceDebug.postForce(true)` pins the two
     paths against each other; `postInfo()` is computed LIVE from sim
     state, never from the last painted frame (a backgrounded tab stops
     painting but keeps simulating — a render-gated flag froze at
     stale-false while rings fired; e2e reads must be sim-stable).
     Scenario gotcha, recorded twice now: dice.diceset.v1 is per-origin
     localStorage and OUTLIVES a scenario's room — a scenario that
     asserts std behavior must SET std first.

Side-channel: render-only child meshes (the bevel already works this
way) can change the SILHOUETTE — verdigris corner caps, crystal spurs,
vine loops — while the physics hull stays canonical.

## The lab

`lab.html` is the experimentation rig (dev chrome, not player UI): every
theme × every die type in one grid, idle-rotation toggle, per-theme
effect trigger buttons, a ⬇ drop button per set (the Level 3 rig — a
real physics die whose measured contacts fire the set's bursts; sets
without particles prove the restraint), and one-click PNG capture.

THE GEO BENCH (2026-08-04, softer edges Tier 0 — ROADMAP §9c): nine
lab-only rows sweep the Level 3.5 `geo` space over otherwise-standard
dice, seated under the std row (cut and fillet widths, an ink-.04
self-colored row, pillow, and two worn-character rows). Two seams make them honest: a set may
omit body/text to inherit the std per-type colors, and house-less sets
clamp to the std envMapIntensity whisper — so a bench row differs from
std by its geo recipe ALONE. They register through themes.js
`registerSet` into the page's own SETS instance; SET_IDS (the published
picker) never sees a `lab.*` id.

THE SET BUILDER (same date): the ⚗ panel makes every recipe knob live —
geometry, colors (or inherit-std), feel, specular identity, internal
glow, surface maps, glyphs — rebuilding a dedicated grid row on change
(`bustDie` evicts the variant's cached builds, then the row remakes its
meshes). Seeds load from std, any bench row, or any house set; sections
the panel can't tune (shader, particles, decal, light, post, sound,
rate) ride along and print. The copy-out is a themes.js-shaped recipe
body, omit-at-default, paste-ready. Scriptable: `__lab.builderSet(patch)`
/ `__lab.builderRecipe()`.

Every sidebar row carries THE READOUT — its full recipe in one glance,
std defaults spelled out where a section is absent. Detail navigation:
click a die on the felt for a HERO frame (`__lab.zoomDie(rowId, type)`),
↑/↓ flip the SAME die type across sets while framed, ←/→ walk the die
types, scroll dollies, esc refits the grid; the bench section header
frames the whole std→builder span (`__lab.zoomRows`). e2e:
lab-geo-bench (tag `lab`); stills: `tools/geo-bench-shots.mjs`.

For Level 4 the drop rig grew table furniture: a COUPON of felt fades in
under the die (marks and glow act on a table; the rig floats over a
void — the coupon is deliberately brighter than the table's felt, since
the lab's lights are a fraction of the table's), rails at the coupon's
edges (a tumbling die converts spin to lateral walk and drifts off an
unfenced floor — the rails hug the dropView frustum so a pinned die
still shows), a post-settle linger of 3.5 s (Level 4's point is the mark
that REMAINS; the old 900 ms cleanup suited Level 3's fast-dying bursts
and swept the felt before a mark could be seen), and `dropView(id)` — a
~57°-down framing, because the zoom view reads the felt edge-on, which
is exactly the angle a flat decal vanishes at. Diagnostics: `stamps` in
dropState, `decalCount/decalDump`, `lightInfo`, and `sampleWorld(p)` —
average framebuffer RGB around a projected world point, which settled
"is that mark pale or dark" with numbers when review-distance eyeballs
couldn't (answer: pale, +8 RGB — the dark blobs were something else).

## On the main table (shipped 2026-08-03)

Sets graduated: "Dice set" in settings ("Just you") picks a per-player
identity that rides every roll/claim request as `set` — present-or-
absent like exp, validated server-side (400 unknown_set), stamped by
whoever THROWS (a claimed offer wears the claimer's set; rerolls the
reroller's), and kept through redaction (cosmetic identity, like name
and color — values never ride it). Precedence: shroud > set > std —
a hidden roll is obsidian, sheds no particles, and reveal restores the
set (geometry AND materials — a set may wear its own bevel and wear).
The table scene gained the lab's painted-equirect PMREM environment
(std/shroud materials pin envMapIntensity 0.35 so the released look
holds), the SHADER_TIME clock in tick() (holdClock freezes Level 2/3
alike), and a ParticleField fed by the fast-forward's recorded contacts
— roll.sounds grew a contact point: {time, strength, at} — exactly the
integration seam Level 3 was designed around. Client ingress note for
future fields: the SSE 'roll' case, replaySettledRoll and the playback-
object build in playRoll are explicit whitelists — a new entry field
must be added to all three or it silently vanishes (set was dropped by
the first two on the first pass). 2D chrome wears the set too (shipped
2026-08-03): diceart.js bakes per (type, variant) — a chip is a
portrait of the die in its skin, not a tint (identity is material, not
hue: a flat tint can't tell Bolt-glass from Focus Crystal at 30px).
One lazy warm per variant (all seven types, ~tens of ms, GL context
released after each), unknown ids normalize to std, failed slots fall
back to std art — art still never gates function. Prospective surfaces
(palette tiles, tray/pool/offer strips) wear MY set and re-dress in
place on a set change via refreshDieArt (their chips carry
data-art-type; log chips deliberately don't). The LOG wears each
roll's own set on every screen — the log is a record, not a preview —
and a hidden entry wears obsidian chips: shroud > set > std, the
felt's precedence, in 2D. e2e: themed-chrome (tag `themes`).

Saved pools carry a set override (shipped 2026-08-03 — §9's last open
engineering seam): `g.set` on the group record — absent (follow the
roller), 'std' (PIN the classics even under a house set; it resolves
through the wire's present-or-absent rule at roll time), or any SETS
id. EVERY DIE WEARS ITS OWN POOL'S SET (Joe, same evening: physical
dice — the first cut collapsed a mixed draft to one set and that read
as broken): staging stamps each die's override into traySets (aligned
with traySources); a uniform draft rides the old singular `set` field
and a mixed one sends per-die `sets` — aligned to the BASE dice, null
= the roll-level set, 'std' legal per-die as a pin; server-validated
(bad_sets / unknown_set), redaction-preserved (skins are identity, not
values), and carried by all three client ingress whitelists. Consumers
resolve through rollDieSet / entryDieSet, which chase perDie/origin
provenance so explosion children, advantage partners and reroll
replacements wear their base die's skin. The impact seam records WHICH
die hit (sounds[].di, from the contact body — client-side, never wire
data), so bursts, marks and the shock ring fire each die's own recipe:
an iron die sparks beside a glass one in the same roll, and the ring
pre-pick takes the hardest landing AMONG ring-set dice. Die lights,
bloom flags, shimmer, the shelf, reveals and log chips (grouped by
skin × type) are all per-die. Hand-editing the command box still
resets overrides (notation carries no set; the box is the notation
escape hatch). Save-morph and Save-as-variant inherit a uniform
draft's set; rerolls carry the entry's per-die sets — the pool's die
stays the pool's die — while the roll-level set stays the RE-roller's
own; claims and offers keep shipped semantics. A teammate's rack shows
THEIR WORLD (Joe 2026-08-04: "identical to what that player sees"):
each tile resolves explicit pool `set` → the owner's published DEFAULT
→ the classics, and every foreign strip is PINNED (data-art-set always
present) so the viewer's own skin can never leak in at paint. Both
layers ride the same `/api/pools` publish — the pool's `set` per
record (sanitizePools keeps it; the first cut dropped it there, which
is exactly how a whitelist loses identity silently) and the owner's
default as a top-level present-or-absent `set` (wireSet(): absent =
standard; 'std' and unknown ids normalize to absent server-side). The
default re-publishes on every setDiceSet (debounced) and on hello, the
no-op guard compares BOTH pools and set, and it relays through
pools-changed + the roster projection so late joiners see it too — the
pools-changed ingress carrying it forward was the third leg of the
same whitelist lesson. Staging a FOREIGN pool SNAPSHOTS what the tile
showed (Joe's same-day correction: the tray "switched to the local
players default" — superseding the first cut's borrower-skin rule):
the resolved skin rides as a pin, explicit set or owner default alike,
and an std-world pool pins 'std' rather than following the borrower.
Your OWN rack stages unpinned — tile and tray both follow you, so
they agree without pinning and keep repainting when you re-skin.
The
override rides every identity vehicle: a `set` field on the stored
record and an `@ 'set-id'` suffix after the quoted notation in the
portable YAML, both failing closed on unknown ids (migrateGroup and
the parser drop the override, never the pool). *(The URL codec grew a
v4 field for it too; the codec was dropped 2026-08-04 — GOALS §7.)* Chosen through ONE control everywhere (Joe: consistency): a
compact select — pill button + body-level floating menu, house-grouped,
keyboard-driven, one open menu app-wide — in the settings row AND the
popover identity strip (which adds a 'Your set — <name>' default row).
The tile strip previews the override via data-art-set, pinned against
refreshDieArt. e2e: pool-set-override (tags `themes`, `groups`); the
YAML shape unit-tested in portable.test.mjs.

Level 4 rides the same seams (shipped 2026-08-03; the marks are DARK BY
DEFAULT since the same evening — the decals.js kill switch): the impact
drain in stepPlayback stamps `decal` recipes from the recorded contacts
— gated
to floor-height contacts (`at[1] < 0.6`; a wall click leaves no felt
mark), real hits (strength ≥ 6), and ≤ 6 marks per roll (drama, not
mud) — and playRoll attaches `light` recipes to a lit set's dice at
spawn with a separate seeded rng stream (identical flicker on every
client, zero draws stolen from the throw physics). Releases: sink
(removeRollDice), collect (placeCluster — the shelf is the archive),
sweep (resetTableSurface), plus the rig's parentless-mesh self-heal;
reveal on the felt re-attaches. Shrouded rolls stamp and cast nothing —
the drain gate and the attach gate both read the shroud flag.

Level 5 closes the ladder (shipped 2026-08-03): the tick render path
gains the PostStack bypass (see the ladder entry for the architecture
and the tone-mapping lesson), the drain pops the pre-picked hardest
landing's shock ring, collectShimmerSources feeds the heat wobble from
unshrouded shimmer-set dice still on the felt, and both reveal paths
restore mesh.userData.bloom right along with the materials (the mesh
was born shrouded — without the flag restore, a revealed molten die
never burned). e2e: themed-post (tag `themes`).
`tools/lab-shots.mjs` drives it headless over CDP and drops PNGs for
side-by-side review. Themes land in `js/themes.js` as material recipes;
the main app consumes NOTHING from the lab until a set graduates
(picker + wire come later — §9's (type,setId) cache, per-player identity
set, saved-pool override).
