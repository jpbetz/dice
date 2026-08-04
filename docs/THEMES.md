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
