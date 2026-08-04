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
// browsing category with an identity — and each house holds multiple
// SETS, the concrete dice styles a player actually picks. Wildwood is
// one house; heartwood, mosstone and sap-amber dice are three of its
// sets.
//
// A SET recipe is a SKIN over dice.js's (type, variant) seam — the
// variant id is the flat `house.set` key from SETS below. Geometry,
// physics and value reading are untouched (a set can never change how a
// die lands) and numbers stay readable on every body color.
//
// Recipe fields: body/text/accent colors · `feel` {rough, metal} ·
// `glow` {color, intensity} whole-body emissive (subtle at rest — P1
// binds themes too) · `maps` (Level 1, texture-space authoring):
//   digitGlow {color, intensity}  emissiveMap of the DIGITS alone
//   relief {pattern, strength, digitDepth}
//                                 height sketch → Sobel normal map:
//                                 'hammer' · 'grain' · 'ferns' ·
//                                 'scrimshaw'; digits engrave at depth
//   roughPattern                  roughnessMap: pattern = ROUGH over the
//                                 set's base finish
// · `particles` (Level 3, impact-keyed): {kind, colors, fadeTo?, scale?}.
//   A burst fires ONLY from a measured physics contact (strength = impact
//   velocity along the normal — the number the click sounds key off).
//   Kinds live in js/particles.js; each is a claim about why matter
//   leaves a die. Sets without `particles` shed nothing ON PURPOSE —
//   sealed resin and lacquer don't crumble; restraint is also identity.
// · `geo` (Level 3.5, geometry identity): the die the player SEES —
//   physics hull, values and reading stay canonical (dice.js).
//   bevel    edge-cut share (std 0.055): 0.02 machined-crisp, 0.13 tumbled
//   profile  'cut' flat chamfer facets · 'round' fillet-shaded band
//   wear     0..1 tumbled erosion, corners first (deterministic per set)
//   nicks    0..5 discrete chips at seeded corner sites
//   pillow   0..1 cushion-shaded faces (silhouette + digit plane stay flat)
// · `decal` (Level 4a, impact marks on the felt): {kind, colors: [A, B],
//   scale?, life?}. Stamped only from a measured floor-height contact
//   (js/decals.js) and always transient — the felt recovers. Each kind is
//   a claim about what the die DID to the table: 'frost' (cold spreads),
//   'ring' (water dries), 'scorch' (heat kisses), 'smudge' (dust settles).
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

export const THEMES = {
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
        spec: { iridescence: 0.55, iridescenceIOR: 1.3, envMapIntensity: 1.15 }, // wet glass sheen
        particles: { kind: 'bubbles', colors: ['#d8f4f0', '#8fe3d9'] }, // trapped sea-air escapes on impact
        geo: { bevel: 0.13, profile: 'round', wear: 0.6, pillow: 0.3 }, // decades in the surf: fully tumbled
        decal: { kind: 'ring', colors: ['#071e22', '#a8dcd2'] }, // sea-wet glass: the felt darkens, dries to a tide-line
        light: { color: '#58e6d9', intensity: 14, range: 7, mode: 'wave' }, // biolume: teal on its patch of felt
        post: { bloom: true }, // the biolume rim burns soft in the dark
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
        particles: { kind: 'motes', colors: ['#ffe9a3', '#d8e8a0'] }, // a knock shakes pollen loose
        geo: { bevel: 0.09, profile: 'round', wear: 0.25, pillow: 0.35 }, // hand-carved, long handled
        // no decal, no light: pollen drifts, it doesn't stain — and wood neither scorches the felt nor glows
      },
      mosstone: {
        label: 'Mosstone',
        body: '#46543c', text: '#e7e0c4', accent: '#8fae6f',
        glow: null,
        feel: { rough: 0.85, metal: 0.02 },
        maps: { relief: { pattern: 'hammer', strength: 0.85, digitDepth: 0.6 } },
        particles: { kind: 'motes', colors: ['#c9e8a0', '#8fae6f'], scale: 0.7 }, // spores off damp moss
        geo: { bevel: 0.12, profile: 'round', wear: 0.5 }, // river stone
        decal: { kind: 'smudge', colors: ['#10150c', '#42573a'], scale: 1.1 }, // a damp moss-print — dark water, green flecks
      },
      sapamber: {
        label: 'Sap Amber',
        body: '#96601f', text: '#38240e', accent: '#ffd166',
        glow: { color: '#ffb54d', intensity: 0.09 },
        feel: { rough: 0.08, metal: 0.0 },
        spec: { clearcoat: 0.85, clearcoatRoughness: 0.22, ior: 1.55, envMapIntensity: 1.1 }, // polished resin
        // no particles: sealed resin sheds nothing — the stillness reads as polish
        geo: { bevel: 0.1, profile: 'round', pillow: 0.5 }, // poured, never cut: a soft lozenge
        // no post: its 0.09 glow sits under the bloom threshold anyway, and
        // a corona would argue with the house claim — stillness IS the polish
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
        // static crawl: the interior charge flickers along the surface
        shader: { flow: { speed: 2.0, scale: 12.0, floor: 0.2, amp: 2.4 } },
        spec: { iridescence: 0.35, envMapIntensity: 1.05 }, // storm-oil shimmer
        particles: { kind: 'static', colors: ['#f2f6ff', '#b8a8ff'] }, // the charge grounds through the contact
        geo: { bevel: 0.03, nicks: 2 }, // fulgurite: razor facets, fracture chips
        // no decal: glass leaves no residue — the LIGHT is its mark
        light: { color: '#b8a8ff', intensity: 20, range: 8, mode: 'flicker' }, // charge seeking a path
        post: { bloom: true, ring: { amp: 9, jolt: 2 } }, // DISCHARGE POP: the bottled storm grounds through the table
      },
    },
  },
  rimehold: {
    label: 'Rimehold',
    line: 'frost & glacier — the cold is the mechanic',
    sets: {
      deepglacier: {
        label: 'Deep Glacier',
        body: '#1e3d5c', text: '#eef4fa', accent: '#8fe3c0',
        glow: { color: '#a8d8f0', intensity: 0.06 },
        feel: { rough: 0.12, metal: 0.05 },
        maps: {
          relief: { pattern: 'ferns', strength: 0.85, digitDepth: 0.3 },
          roughPattern: 'ferns',
        },
        shader: { fresnel: { color: '#8fe3c0', power: 3.2, intensity: 0.75 } }, // aurora at grazing
        spec: { envMapIntensity: 1.2, specularIntensity: 1.1 }, // wet ice mirror
        particles: { kind: 'fog', colors: ['#dceefc', '#a8d8f0'] }, // impact knocks a breath of cold off the ice
        geo: { bevel: 0.075, profile: 'round', wear: 0.15 }, // melt-softened edges
        // glacial mass: the bloom is WIDE and slow to leave. No light — ice does not emit.
        decal: { kind: 'frost', colors: ['#dceefc', '#7fb4d8'], scale: 1.35, life: 10 },
        post: { bloom: true }, // the aurora sheen carries at grazing angles
      },
      firstfrost: {
        label: 'First Frost',
        body: '#9cc3de', text: '#1e3d5c', accent: '#eef4fa',
        glow: null,
        feel: { rough: 0.3, metal: 0.02 },
        maps: {
          relief: { pattern: 'ferns', strength: 0.6, digitDepth: 0.25 },
          roughPattern: 'ferns',
        },
        particles: { kind: 'fog', colors: ['#eef4fa', '#c8e4f4'], scale: 0.7 }, // a thinner frost-breath
        geo: { bevel: 0.045 }, // fresh-cut ice, still crisp
        decal: { kind: 'frost', colors: ['#eef4fa', '#a8cce4'], scale: 0.85 }, // first frost: a crisp, quick crackle
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
        maps: {
          digitGlow: { color: '#ffd166', intensity: 1.35 },
          relief: { pattern: 'hammer', strength: 1.1, digitDepth: 0.45 },
        },
        // the digits FLOW: high-frequency bands of white-hot travel
        // through dark-ember strokes — visible at table distance
        shader: { flow: { speed: 0.9, scale: 12.0, cool: '#5a1c06', hot: '#fff2c8', gain: 2.6 } },
        spec: { specularColor: '#ffb073', specularIntensity: 0.9, envMapIntensity: 0.6 }, // warm iron spark
        // struck iron sheds sparks — they cool from white-hot to dark ember
        particles: { kind: 'sparks', colors: ['#fff2c8', '#ffd166', '#ff9a3c'], fadeTo: '#571b05' },
        geo: { bevel: 0.1, wear: 0.2, nicks: 3 }, // forged: wide flat chamfers, hammer-marked
        decal: { kind: 'scorch', colors: ['#070402', '#ff8c42'] }, // hot iron kisses the felt: ember rim cooling to soot
        light: { color: '#ff8c42', intensity: 16, range: 6.5, mode: 'breathe' }, // the molten interior, breathing
        // ANVIL SLAM: one decisive table jolt off the hardest landing, then
        // the air above the settled iron keeps wobbling — mass and heat
        post: { bloom: true, ring: { amp: 6, jolt: 2.5, speed: 1100 }, shimmer: { radius: 2.2, strength: 1.5 } },
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
        // containment hum (the idle pulse) + a faint rune-cyan rim
        shader: {
          pulse: { speed: 1.6, min: 0.6, max: 1.3 },
          fresnel: { color: '#7fd9e8', power: 3.0, intensity: 0.45 },
        },
        spec: { ior: 1.75, specularIntensity: 1.25, envMapIntensity: 1.2 }, // cut crystal
        // the casting grounds itself: rune-embers drift off the contact
        particles: { kind: 'motes', colors: ['#c9a6ff', '#7fd9e8'], scale: 0.8 },
        geo: { bevel: 0.02 }, // lapidary-cut: the facets ARE the discipline
        // no decal: a focus leaves no residue — containment is the point
        light: { color: '#7fd9e8', intensity: 10, range: 5, mode: 'steady' }, // the containment hum, held
        post: { bloom: true }, // contained power reads as a clean corona
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
        // the wrong halo, and the unmaking (dissolve — witchlight edge)
        shader: {
          fresnel: { color: '#43265b', power: 2.0, intensity: 1.1 },
          dissolve: { edge: '#cfe98c' },
        },
        // what it touches, it unmakes a little: dim ash, a rare live ember.
        // The unmake burn feeds the same palette out as wisps (lab.js).
        particles: { kind: 'ash', colors: ['#5a4a6a', '#cfe98c'] },
        geo: { bevel: 0.015 }, // UNNATURALLY perfect — nothing has ever worn it
        // no decal: what it unmakes is GONE, not marked. The light is
        // negative — Umbra pools local shadow instead of dimming the world.
        light: { color: '#ffffff', intensity: -8, range: 4.8, mode: 'breathe' },
        // the discharge runs BACKWARD: an implosion ring (negative amp) —
        // the witchlight digits bloom, the body gives nothing
        post: { bloom: true, ring: { amp: -7 } },
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
        particles: { kind: 'dust', colors: ['#e8dcc0', '#c9b896'] }, // old bone gives up its dust
        geo: { bevel: 0.1, profile: 'round', wear: 0.45, pillow: 0.25, nicks: 4 }, // a century of hands
        decal: { kind: 'smudge', colors: ['#e8dcc0', '#c9b896'], scale: 0.85 }, // where the shed dust settles
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
