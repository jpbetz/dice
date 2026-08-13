/*
 * Copyright 2026 The Dice Table Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// js/themes.js — themed-dice recipes (Tier 6 §9; docs/THEMES.md is the
// design authority). TWO LEVELS (Joe 2026-08-03): a THEME is a HOUSE — a
// browsing category with an identity — and each house holds one or more
// SETS, the concrete dice styles a player actually picks.
//
// A SET recipe is a SKIN over dice.js's (type, variant) seam — the
// variant id is the flat `house.set` key from SETS below. Geometry,
// physics and value reading are untouched (a set can never change how a
// die lands) and numbers stay readable on every body color.
//
// AESTHETIC PASS (Joe 2026-08-04): the deep pass on cheap/tacky
// effects landed as slices 0-2 today. Slice 0 = numeric turn-downs +
// retirements (firstfrost, mosstone, and eight over-loud effects the
// audit named) + the new CLASSICS house (unadorned dice — the honest
// option) + the `glyph` field (Vegas pips for ivorypips). Slice 1 =
// the `sound` field: a per-set voice replacing the single hard-coded
// click. Slice 2 = the `rate` field: a per-set retiming curve so
// weight and cushion read in motion, not just in materials.
//
// Recipe fields (a set uses whichever it earns; every one is optional):
// · body/text/accent colors · `feel` {rough, metal}
// · `glow` {color, intensity} — whole-body emissive (subtle at rest)
// · `glyph` — face-glyph family: default 'digit' or 'pip' (d6-only —
//   other die types fall back to digits, since pips are the traditional
//   d6 idiom; a full glyph library — roman, runes — is a later slice)
// · `sound` {body, weight, sustain} — impact voice. body ∈ chime |
//   thud | crackle | clack | hush; weight 0..1 (heavier = lower); sustain
//   ms of tail. Absent = the legacy click.
// · `rate` {rate, window} — retimes the LAST `window` fraction of the
//   roll's playback to `rate` playback speed. rate<1 = decelerate (vine
//   catch / glacial arrest / ceremonial hover). Physics untouched — only
//   the playback clock scales.
// · `maps` (Level 1, texture-space authoring):
//     digitGlow {color, intensity}  emissiveMap of the DIGITS alone
//     relief {pattern, strength, digitDepth}
//                                 height sketch → Sobel normal map:
//                                 'hammer' · 'grain' · 'ferns' ·
//                                 'scrimshaw'; digits engrave at depth
//     roughPattern                  roughnessMap: pattern = ROUGH over the
//                                 set's base finish
// · `particles` (Level 3, impact-keyed): {kind, colors, fadeTo?, scale?}.
//   A burst fires ONLY from a measured physics contact (strength = impact
//   velocity along the normal — the number the click sounds key off).
//   Kinds live in js/particles.js; each is a claim about why matter
//   leaves a die. Sets without `particles` shed nothing ON PURPOSE —
//   sealed resin and lacquer don't crumble; restraint is also identity.
// · `decal` (Level 4a, impact marks on the felt): {kind, colors, scale?,
//   life?}. Joe 2026-08-03 kept the ladder and turned OFF the residue —
//   DECALS_DEFAULT_ENABLED=false in js/decals.js gates stamping
//   everywhere. The recipe fields survive because the machinery does;
//   armed for experimentation via __diceDebug.decalsEnable(true).
// · `geo` (Level 3.5, geometry identity): the die the player SEES —
//   physics hull, values and reading stay canonical (dice.js).
//   bevel    edge-cut share (std 0.055): 0.02 machined-crisp, 0.13 tumbled
//   profile  'cut' flat chamfer facets · 'round' TRUE fillet arcs (§9c
//            Tier 2): Bézier strips bulged to the sharp edge, corner
//            domes, analytic normals — curved shading AND silhouette
//   segments 1..6 arc strips per round edge (default 3; 1 = flat strip
//            with fillet shading — the old look)
//   ink      0..1 darkness of the painted face outline + band material
//            (default .25, round band .12; 0 = self-colored edges)
//   wear     0..1 tumbled erosion, corners first (deterministic per set)
//   nicks    0..5 discrete chips at seeded corner sites
//   pillow   0..1 cushion-shaded faces (silhouette + digit plane stay flat)
// · `light` (Level 4b, a glow parented to the die): {color, intensity,
//   range, mode: 'wave'|'breathe'|'flicker'|'steady'}. Fixed budget of 4
//   table-wide (js/dielights.js steals oldest); negative intensity pools
//   shadow instead. Sets without either shed and cast NOTHING on purpose.
// · `post` (Level 5, js/post.js — amplification only): `bloom: true`
//   marks the set's dice as bloom SOURCES (whatever Levels 1-2 made
//   bright is exactly what burns — there is no strength knob here);
//   `ring` {amp, jolt?, speed?} fires ONE screen-space shock wave from a
//   roll's hardest recorded impact (negative amp implodes — Umbra);
//   `shimmer` {radius, strength} wobbles the air above the settled die.
// · `fog` (W4, venue fog response): {color, gain} — what a settled die of
//   this set breathes into a fantasy venue's fog lattice (js/fae-lab.js
//   brightenFog). Read by the venue's step, only while a venue is staged;
//   sets without `fog` get the venue's default breath. Outside a venue
//   the field is inert.
// · `venueOnly` (W4, mirrors the tower flag): the set ships in SETS (it
//   must resolve for materials, voices and the wire) but takes NO chip in
//   the picker — a venue stages it by overriding the table's dice at roll
//   creation (GOALS goal 13; the override lives in main.js venueDiceSet).
// · `rest` — the settled-die cadence (Slice 3, Joe 2026-08-04): sub-mm
//   motion at rest on the FELT that says "this material is buoyant /
//   creaking / sealed / remembering" without any new textures or lights.
//   Mesh transforms only (physics untouched, face-correction untouched;
//   number always reads). Shelved dice never cadence — the shelf is the
//   archive. Kinds:
//     'swell'       {yAmpM, yPeriodS, rollAmpRad, rollPeriodS} — sine
//                   Y drift + tiny world-X roll on incommensurate periods
//                   (seaglass: nothing under water sits still).
//     'creak'       {ampRad, periodAS, periodBS} — two-axis Lissajous
//                   orientation drift; both return to origin at LCM
//                   (heartwood: living wood relaxes).
//     'still'       IDENTITY assertion — the set explicitly declares
//                   stillness (sapamber: sealed resin does not shift).
//                   Reject `rest: null` for the same slot — the sentinel
//                   makes "this quiet is on purpose" visible.
//     'settle-tick' {delayMinMs, delayMaxMs, posBumpM, yawRad, tailMs} —
//                   one small kinematic adjustment ~200-400 ms after
//                   landing, then genuinely still forever (scrimshaw:
//                   it remembers).
//   Sets without `rest` do not cadence — same channel as decal defaults.

export const THEMES = {
  // THE CLASSICS — the honest option (Joe 2026-08-04). Unadorned dice for
  // players who don't want an opinion. Palette + material only; zero
  // particles, lights, post, shaders, glow, wear. Sound is the default
  // click. The civilian house — the control against which every themed
  // set actually reads as a theme. Ships at the top of the picker.
  classics: {
    label: 'Classics',
    line: 'unadorned dice — matte bodies, honest numbers',
    sets: {
      ivory: {
        label: 'Ivory',
        body: '#f3ead7', text: '#2a2018', accent: '#d8c9a3',
        feel: { rough: 0.42, metal: 0 },
      },
      ivorypips: {
        label: 'Ivory (pips)',
        body: '#f3ead7', text: '#1a1410', accent: '#d8c9a3',
        feel: { rough: 0.42, metal: 0 },
        // Vegas-standard d6 pips: 1 center · 2 opposite corners · 3 diagonal ·
        // 4 four corners · 5 corners+center · 6 two columns of three. Other
        // die types fall back to digits — pips are the traditional d6 idiom
        // and there is no established pipped d20. The first glyph variation;
        // roman + runes are a later slice.
        glyph: 'pip',
      },
      onyx: {
        label: 'Onyx',
        body: '#141416', text: '#e8e2d2', accent: '#3a3a3f',
        feel: { rough: 0.48, metal: 0.03 },
        // Onyx-on-black would render the geometry invisible with the
        // default black-toward-black lerp. Tint LIGHTER (toward the
        // die's own ivory numerals) so the bevel reads back — 14% is
        // a whisper, enough to see the edges without shouting.
        geo: { tint: '#e8e2d2', ink: 0.14 },
      },
      slate: {
        label: 'Slate',
        body: '#4a4e56', text: '#f0e9d8', accent: '#2f3238',
        feel: { rough: 0.5, metal: 0.03 },
      },
      crimson: {
        label: 'Crimson',
        body: '#7f1d1d', text: '#f0e9d8', accent: '#4a1010',
        feel: { rough: 0.42, metal: 0 },
      },
      cobalt: {
        label: 'Cobalt',
        body: '#1e3a7a', text: '#f0e9d8', accent: '#122250',
        feel: { rough: 0.42, metal: 0 },
      },
      emerald: {
        label: 'Emerald',
        body: '#1f4d2e', text: '#f0e9d8', accent: '#122d1c',
        feel: { rough: 0.42, metal: 0 },
      },
      brass: {
        label: 'Brass',
        body: '#9b7a2a', text: '#221807', accent: '#c9a54a',
        feel: { rough: 0.32, metal: 0.72 },
        // Brass with a pure-black edge reads too stark for a metallic
        // body — real brass ages to a dark warm patina at the seams,
        // not soot. Bronze-brown tint at 0.55 gives the die the honest
        // "handled and aged" look every classic brass object has.
        geo: { tint: '#3a2708', ink: 0.55 },
      },
    },
  },

  tidewrack: {
    label: 'Tidewrack',
    line: 'ocean & odyssey — sea-glass and drowned bronze',
    sets: {
      seaglass: {
        label: 'Sea-glass',
        body: '#0e3a3f', text: '#7fd1c3', accent: '#8a6f3c',
        glow: { color: '#58e6d9', intensity: 0.07 },
        feel: { rough: 0.15, metal: 0.1 },
        shader: { fresnel: { color: '#58e6d9', power: 2.4, intensity: 0.9 } }, // biolume rim
        // aesthetic pass 2026-08-04: iridescence 0.55 → 0.15 (was oil-slick /
        // soap-bubble — wrong material claim for sea-worn glass), envMap 1.15
        // → 1.0 (one less voice in the everything-says-teal chorus).
        spec: { iridescence: 0.15, iridescenceIOR: 1.3, envMapIntensity: 1.0 },
        // particles retired 2026-08-04: the additive-white "bubbles" sprite
        // was Joe's named cheap read (aquarium-decor "die farts bubbles").
        // The material's fresnel biolume rim + settle read + chime voice
        // carry "underwater fragment" without particles doing the work.
        geo: { bevel: 0.13, profile: 'round', wear: 0.6, pillow: 0.3 },
        // parented light retired 2026-08-04 (was intensity 14 range 7 wave):
        // was reading as a flashlight, spilling teal onto adjacent dice and
        // hard-hotspotting the die's own face. The at-rest glow + fresnel
        // biolume rim already carry the underwater self-light.
        decal: { kind: 'ring', colors: ['#071e22', '#a8dcd2'] }, // machinery only — kill-switch off
        post: { bloom: true }, // the biolume rim burns soft in the dark
        sound: { body: 'chime', weight: 0.15, sustain: 40 },
        // swell (Slice 3, 2026-08-04): a settled die drifts a slow
        // ±1.5 mm Y sine with a paired ±0.3° world-X roll on
        // incommensurate periods — nothing under water sits still, and
        // the number never leaves readable.
        rest: {
          kind: 'swell',
          yAmpM: 0.0015,
          yPeriodS: 2.6,
          rollAmpRad: 0.00524,
          rollPeriodS: 3.1,
        },
      },
    },
  },
  wildwood: {
    label: 'Wildwood',
    line: 'forest, fae, dryadic — the house of living things',
    sets: {
      heartwood: {
        label: 'Heartwood',
        body: '#5a4326', text: '#e9b54a', accent: '#6f8f4f',
        glow: { color: '#ffe9a3', intensity: 0.04 },
        feel: { rough: 0.72, metal: 0.05 },
        maps: { relief: { pattern: 'grain', strength: 0.9, digitDepth: 0.4 } },
        // particles retired 2026-08-04: "firefly motes" was Pinterest-fantasy
        // vocabulary (wood → forest → fireflies) — a carved hardwood cube on
        // wool did not summon fireflies. The vine-catch rate curve + creak
        // rest cadence + thud voice carry "living wood" without the literal
        // illustration. Fireflies belong to a later post-settle slice if at
        // all, and only after Joe reads a still without them.
        // Living wood + pure-black edges reads as a burn scar; a warm
        // dark-bark tint keeps the die in-material at its seams — the
        // color grain deepens into, not the color it never had.
        geo: { bevel: 0.09, profile: 'round', wear: 0.25, pillow: 0.35,
          tint: '#1a0a05', ink: 0.35 }, // hand-carved, long handled
        sound: { body: 'thud', weight: 0.5, sustain: 20 },
        // vine catch: the last 15% of the roll retimes to 0.55× — the die
        // decelerates unnaturally and settles soft, as if the forest caught it
        rate: { rate: 0.55, window: 0.15 },
        // creak (Slice 3, 2026-08-04): ≤0.4° per-axis drift on two
        // incommensurate periods; both sin terms hit zero together
        // every LCM(2, 3) = 6 s so the die visibly relaxes through
        // its origin — living wood is never quite done settling.
        rest: {
          kind: 'creak',
          ampRad: 0.00698,
          periodAS: 2.0,
          periodBS: 3.0,
        },
      },
      sapamber: {
        label: 'Sap Amber',
        body: '#96601f', text: '#38240e', accent: '#ffd166',
        glow: { color: '#ffb54d', intensity: 0.09 },
        feel: { rough: 0.08, metal: 0.0 },
        // clearcoat 0.85 → 0.55, IOR 1.55 → 1.4 (was reading as polished
        // plastic; softer clearcoat lets the fresnel warmth carry the resin
        // depth instead of a hard glaze). Aesthetic pass 2026-08-04.
        spec: { clearcoat: 0.55, clearcoatRoughness: 0.25, ior: 1.4, envMapIntensity: 1.05 },
        // no particles: sealed resin sheds nothing — the stillness reads as polish
        geo: { bevel: 0.1, profile: 'round', pillow: 0.5 }, // poured, never cut: a soft lozenge
        sound: { body: 'chime', weight: 0.2, sustain: 12 }, // shorter/drier chime — sealed
        // still (Slice 3, 2026-08-04): IDENTITY assertion — sealed
        // resin does not shift, and its silence is meaningful only in
        // contrast to heartwood's creak in the same house. The 'still'
        // sentinel (not a missing key) is what makes the declaration
        // visible to a code reader and to restInfo().
        rest: { kind: 'still' },
      },
    },
  },
  stormcall: {
    label: 'Stormcall',
    line: 'sky & tempest — a storm bottled in glass',
    sets: {
      boltglass: {
        label: 'Bolt-glass',
        body: '#3a4150', text: '#f2f6ff', accent: '#8f7fe8',
        glow: { color: '#8f7fe8', intensity: 0.09 },
        feel: { rough: 0.22, metal: 0.2 },
        // static crawl: the interior charge flickers along the surface.
        // aesthetic pass 2026-08-04: amp 2.4 → 1.4 (the isotropic mottling
        // was reading as "coffee stain" per the audit; anisotropic streak
        // would replace it but needs a shader mode change — that lands in a
        // later slice, so for now the softer amp is the honest turn-down).
        shader: { flow: { speed: 2.0, scale: 12.0, floor: 0.2, amp: 1.4 } },
        spec: { iridescence: 0.35, envMapIntensity: 1.05 }, // storm-oil shimmer
        particles: { kind: 'static', colors: ['#f2f6ff', '#b8a8ff'] }, // the charge grounds through the contact
        geo: { bevel: 0.03, nicks: 2 }, // fulgurite: razor facets, fracture chips
        // parented light REMOVED (was intensity 20 range 8 mode flicker):
        // the 22 Hz flicker was Joe's exact "always-drawing-eye" pattern
        // (2026-08-04 aesthetic pass). The post.ring pop and the crackle
        // voice carry "the die grounds through the table" now — light is a
        // consequence of an event, not an idle effect.
        // ring.amp 9 → 4 (was loudest in the file, competing with emberforge
        // without physical justification); ring.jolt removed (was firing on
        // every roll — the existing ringIdx gate is per-roll but jolt.jolt
        // even at that rate reads as UI feedback, not a physical event).
        post: { bloom: true, ring: { amp: 4 } },
        sound: { body: 'crackle', weight: 0.35, sustain: 25 },
      },
    },
  },
  rimehold: {
    label: 'Rimehold',
    line: 'frost & glacier — the cold is the mechanic',
    sets: {
      // firstfrost retired 2026-08-04 aesthetic pass: was "deepglacier at
      // brightness+1" (audit's word) — same ferns pattern at 40% strength,
      // same fresnel-frost read, no differentiating identity. Ship
      // deepglacier alone; add a frost-alt only when it earns a real
      // differentiator (dendrites that GROW after settle vs baked, etc.).
      deepglacier: {
        label: 'Deep Glacier',
        body: '#1e3d5c', text: '#eef4fa', accent: '#8fe3c0',
        glow: { color: '#a8d8f0', intensity: 0.06 },
        feel: { rough: 0.12, metal: 0.05 },
        maps: {
          relief: { pattern: 'ferns', strength: 0.85, digitDepth: 0.3 },
          roughPattern: 'ferns',
        },
        // fresnel intensity 0.75 → 0.55 (aurora sheen was broadcasting wider
        // than "glancing angles only" — 2026-08-04).
        shader: { fresnel: { color: '#8fe3c0', power: 3.2, intensity: 0.55 } },
        spec: { envMapIntensity: 1.2, specularIntensity: 1.1 }, // wet ice mirror
        particles: { kind: 'fog', colors: ['#dceefc', '#a8d8f0'] }, // impact knocks a breath of cold off the ice
        geo: { bevel: 0.075, profile: 'round', wear: 0.15 }, // melt-softened edges
        decal: { kind: 'frost', colors: ['#dceefc', '#7fb4d8'], scale: 1.35, life: 10 }, // machinery only — kill-switch off
        post: { bloom: true }, // the aurora sheen carries at grazing angles
        sound: { body: 'thud', weight: 0.85, sustain: 30 }, // glacial mass
        // glacial arrest: last 25% of the roll retimes to 0.4× — the die
        // slides into its final pose like a calving berg
        rate: { rate: 0.4, window: 0.25 },
      },
    },
  },
  emberforge: {
    label: 'Emberforge',
    line: 'fire & the smith — black iron, molten numbers',
    sets: {
      blackanvil: {
        label: 'Black Anvil',
        body: '#2b2622', text: '#ffd166', accent: '#ff8c42',
        // the digits carry ALL the fire (Level 1 emissiveMap): the iron
        // stays truly black
        glow: null,
        feel: { rough: 0.85, metal: 0.55 },
        // aesthetic pass 2026-08-04: digitGlow intensity 1.35 → 0.7 (was
        // reading as neon shop-sign glyphs floating above a black
        // rectangle; halving restores the iron-vs-hot-metal contrast the
        // theme lives on).
        maps: {
          digitGlow: { color: '#ffd166', intensity: 0.7 },
          relief: { pattern: 'hammer', strength: 1.1, digitDepth: 0.45 },
        },
        // shader.flow.gain 2.6 → 1.4 (2026-08-04): molten seams stop
        // obliterating the iron surface — the seams flow, they don't
        // erase.
        shader: { flow: { speed: 0.9, scale: 12.0, cool: '#5a1c06', hot: '#fff2c8', gain: 1.4 } },
        spec: { specularColor: '#ffb073', specularIntensity: 0.9, envMapIntensity: 0.6 }, // warm iron spark
        // struck iron sheds sparks — they cool from white-hot to dark ember
        particles: { kind: 'sparks', colors: ['#fff2c8', '#ffd166', '#ff9a3c'], fadeTo: '#571b05' },
        geo: { bevel: 0.1, wear: 0.2, nicks: 3 }, // forged: wide flat chamfers, hammer-marked
        // aesthetic pass 2026-08-04: parented light intensity 16 → 10 (the
        // die glows less at rest because the digits do less; overall theme
        // energy rebalances downward). shimmer strength 1.5 → 0.7 (was a
        // permanent blur under every landing).
        decal: { kind: 'scorch', colors: ['#070402', '#ff8c42'] }, // machinery only — kill-switch off
        light: { color: '#ff8c42', intensity: 10, range: 6.5, mode: 'breathe' },
        post: { bloom: true, ring: { amp: 6, jolt: 2.5, speed: 1100 }, shimmer: { radius: 2.2, strength: 0.7 } },
        sound: { body: 'thud', weight: 0.9, sustain: 30 }, // iron mass
      },
    },
  },
  arcanum: {
    label: 'Arcanum',
    line: 'runes & wizardry — the roll is a casting',
    sets: {
      focuscrystal: {
        label: 'Focus Crystal',
        body: '#2a2140', text: '#c9a6ff', accent: '#7fd9e8',
        glow: { color: '#7fd9e8', intensity: 0.08 },
        feel: { rough: 0.2, metal: 0.15 },
        maps: { digitGlow: { color: '#c9a6ff', intensity: 0.95 } },
        // aesthetic pass 2026-08-04: shader.pulse (breathing whole-emissive)
        // REMOVED — it was itself a subtle twinkle competing with the glow
        // and the fresnel for the same identity slot ("crystal, contained"),
        // and Joe's brief kills quiet-idle animations that don't earn their
        // per-frame cost. fresnel intensity 0.45 → 0.3 (one of three RGB
        // signals dropped so the remaining two — the digit emissive and the
        // rim — carry cleanly).
        shader: {
          fresnel: { color: '#7fd9e8', power: 3.0, intensity: 0.3 },
        },
        spec: { ior: 1.75, specularIntensity: 1.25, envMapIntensity: 1.2 }, // cut crystal
        // the casting grounds itself: rune-embers drift off the contact
        particles: { kind: 'motes', colors: ['#c9a6ff', '#7fd9e8'], scale: 0.8 },
        geo: { bevel: 0.02 }, // lapidary-cut: the facets ARE the discipline
        // parented light range 5 → 2 (2026-08-04): was putting a cyan halo
        // on adjacent dice, contradicting the "contained" claim; keep steady
        // mode so the contained hum still reads on a die at rest.
        light: { color: '#7fd9e8', intensity: 10, range: 2, mode: 'steady' },
        post: { bloom: true }, // contained power reads as a clean corona
        sound: { body: 'chime', weight: 0.3, sustain: 55 }, // crystal resonance
      },
    },
  },
  umbra: {
    label: 'Umbra',
    line: 'dark & unnatural — a die-shaped absence',
    sets: {
      voidgrain: {
        label: 'Void Grain',
        body: '#0b0a10', text: '#cfe98c', accent: '#43265b',
        glow: { color: '#43265b', intensity: 0.05 },
        feel: { rough: 1.0, metal: 0.0 },
        maps: { digitGlow: { color: '#cfe98c', intensity: 0.85 } },
        // aesthetic pass 2026-08-04: fresnel intensity 1.1 → 0.45 (the
        // bright violet halo was CONTRADICTING the absence claim — a die
        // that "eats light" cannot broadcast its own violet corona).
        shader: {
          fresnel: { color: '#43265b', power: 2.0, intensity: 0.45 },
          dissolve: { edge: '#cfe98c' },
        },
        // what it touches, it unmakes a little: dim ash, a rare live ember.
        // The unmake burn feeds the same palette out as wisps (lab.js).
        particles: { kind: 'ash', colors: ['#5a4a6a', '#cfe98c'] },
        geo: { bevel: 0.015 }, // UNNATURALLY perfect — nothing has ever worn it
        // parented light range 4.8 → 2.5 (2026-08-04): the hard black disc
        // was reading as spilled paint; keep negative intensity (voidgrain
        // pools local shadow instead of emitting), tighten the range so the
        // effect stays local to the die.
        light: { color: '#ffffff', intensity: -8, range: 2.5, mode: 'breathe' },
        // the discharge runs BACKWARD: an implosion ring (negative amp) —
        // the witchlight digits bloom, the body gives nothing
        post: { bloom: true, ring: { amp: -7 } },
        sound: { body: 'hush', weight: 0.4, sustain: 10 }, // subtracted click
      },
    },
  },
  reliquary: {
    label: 'Reliquary',
    line: 'bone & relic — aged ivory, scrimshaw numbers',
    sets: {
      scrimshaw: {
        label: 'Scrimshaw',
        body: '#e8dcc0', text: '#6b543a', accent: '#5f8f7a',
        glow: null,
        feel: { rough: 0.6, metal: 0.05 },
        maps: { relief: { pattern: 'scrimshaw', strength: 0.95, digitDepth: 0.75 } },
        // particles retired 2026-08-04: "old = dust" is the medium's oldest
        // illustration cliché (audit's exact language). The engraved-ink
        // digits (from the scrimshaw relief) + hollow clack voice + wear
        // geometry carry "century-old ivory" without the die literally
        // puffing dust on every landing.
        // Aged ivory takes SEPIA into its creases, never black — the
        // etch-brown text and this warm edge tint pull the whole die
        // into one coherent aged-bone palette (currently the only warm
        // note was the text ink; the bevel argued against it).
        geo: { bevel: 0.1, profile: 'round', wear: 0.45, pillow: 0.25, nicks: 4,
          tint: '#4a3520', ink: 0.5 }, // a century of hands
        decal: { kind: 'smudge', colors: ['#e8dcc0', '#c9b896'], scale: 0.85 }, // machinery only — kill-switch off
        sound: { body: 'clack', weight: 0.55, sustain: 25 }, // hollow bone
        // settle-tick (Slice 3, 2026-08-04): one small kinematic
        // adjustment ~200-400 ms after landing — a brief lift + yaw
        // that decays back to the archive pose in 80 ms and never
        // returns. "It remembers, then is genuinely still forever."
        rest: {
          kind: 'settle-tick',
          delayMinMs: 200,
          delayMaxMs: 400,
          posBumpM: 0.0003,
          yawRad: 0.00698,
          tailMs: 80,
        },
      },
    },
  },
  // THE FAE COURT (W4, 2026-08-13). The nocturnal counterpart of
  // Wildwood's sunlit living things — the spec draft's "cold nocturnal
  // light-logic" house, staged by the fae venues rather than picked
  // (FAE-VENUE-SPEC-DRAFT: the venue's set overrides per-player choice
  // while active — the GOALS 13 punt, delivered).
  moonmoot: {
    label: 'Moonmoot',
    line: 'the fae court at night — witchlight over still water',
    sets: {
      witchlight: {
        label: 'Witchlight',
        // TUMBLED LABRADORITE, WITCHLIGHT IN THE CARVINGS. A deep
        // twilight stone whose light lives inside — the Black Anvil value
        // structure inverted to cold: the body stays a quiet step above
        // the venue's void floor and the carved numerals carry ALL the
        // light (grammar rule 2: the dice are Ori, brightest by
        // construction under either palette). The digit color sits
        // BETWEEN moonrise's teal rim and foxfire's mint rim so one set
        // serves both skies without re-baking.
        body: '#2f3b4c', text: '#d9fbee', accent: '#8ff0e2',
        glow: { color: '#7fc9b8', intensity: 0.06 },
        feel: { rough: 0.3, metal: 0.05 },
        // "RUNE GLOW" WITHOUT A RUNIC ALPHABET — a deliberate refusal,
        // recorded: real runes for 1..20 would trade the one invariant a
        // set may never touch (numbers stay readable, GOALS legibility;
        // the glyph library note at the top of this file stands). The
        // rune-ness is the CARVING and the LIGHT: digits engraved deep
        // (digitDepth 0.7) into faintly banded stone, filled with
        // witchlight (digitGlow) that blooms in the dark.
        maps: {
          digitGlow: { color: '#d9fbee', intensity: 0.95 },
          relief: { pattern: 'grain', strength: 0.35, digitDepth: 0.7 },
        },
        // Labradorescence: the stone's internal cold flash at glancing
        // angles — one voice, the same under both venues (it is the
        // STONE's light, not the sky's). Modest per the aesthetic-pass
        // law: the digit emissive and this rim are the only two signals.
        shader: { fresnel: { color: '#6fd8c8', power: 2.6, intensity: 0.5 } },
        spec: { ior: 1.56, envMapIntensity: 0.9 },
        // Tumbled by the court for a hundred seasons: soft fillets, worn
        // corners, cushioned faces; edges deepen into the stone's own
        // dark, never a black scar.
        geo: { bevel: 0.11, profile: 'round', wear: 0.35, pillow: 0.3,
          tint: '#141c26', ink: 0.2 },
        // NO particles and NO parented light, on purpose: the VENUE
        // lights its dice (two followers, halos, the fog lattice) and a
        // set light inside that rig would double-glow every landing.
        // Restraint is also identity — the court does not shed.
        post: { bloom: true }, // the runes burn in the dark
        // A long faint cold ring — glass struck in another room. Distinct
        // from focuscrystal (nearer, brighter) and seaglass (wetter,
        // shorter). REASONED FROM THE TABLE, NEVER LISTENED TO — Joe's
        // dial, same honesty as every tower clunkVoice.
        sound: { body: 'chime', weight: 0.22, sustain: 65 },
        // The court holds its breath: the last 12% of a roll retimes to
        // 0.7× — a faint hover before the verdict, subtler than
        // heartwood's vine catch. Playback clock only; physics untouched.
        rate: { rate: 0.7, window: 0.12 },
        // Cold stone is STILL; the light does the living (the venue's
        // halos and fog breathe around it — the die itself never moves).
        rest: { kind: 'still' },
        // The set's breath into the venue fog (the W4 "fog response"):
        // paler and a touch stronger than the venue default, so a settled
        // witchlight die visibly owns its pocket of mist.
        fog: { color: '#9ff0dc', gain: 1.25 },
        venueOnly: true,
      },
    },
  },

  gildhall: {
    label: 'Gildhall',
    line: 'royal & heraldic — oxblood lacquer, gold leaf',
    sets: {
      oxblood: {
        label: 'Oxblood',
        body: '#4a1f1a', text: '#d4af37', accent: '#f3ead7',
        glow: null,
        feel: { rough: 0.18, metal: 0.4 },
        spec: { clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.25 }, // lacquer over gold
        // no particles: lacquer sheds nothing — the house's dignity is stillness
        geo: { bevel: 0.025 }, // casino-crisp machining under the lacquer
        sound: { body: 'clack', weight: 0.7, sustain: 20 }, // lacquered clack
        // ceremonial: the last 30% retimes to 0.65× — state moves slowly,
        // each landing arrives with weight (oxblood is the reference for
        // "restraint IS the style"; the rate curve is its only new beat).
        rate: { rate: 0.65, window: 0.3 },
      },
    },
  },
};

// The flat picker/variant registry: 'house.set' → recipe, annotated with
// its house. dice.js resolves variants here; the lab renders these rows.
export const SETS = {};
for (const [houseId, house] of Object.entries(THEMES)) {
  for (const [setId, recipe] of Object.entries(house.sets)) {
    SETS[`${houseId}.${setId}`] = {
      ...recipe,
      house: houseId,
      houseLabel: house.label,
      houseLine: house.line,
    };
  }
}
export const SET_IDS = Object.keys(SETS);

// Lab-only seam: the DICE LAB registers its GEO BENCH rows and the live
// SET BUILDER into THIS page's registry at load (module state is
// per-page, so the main table never sees them). SET_IDS — the published
// picker list — is frozen above and deliberately not extended here.
export function registerSet(id, recipe) {
  SETS[id] = recipe;
  return SETS[id];
}
