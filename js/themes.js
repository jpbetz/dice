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
        maps: { relief: { pattern: 'grain', strength: 0.55, digitDepth: 0.4 } },
      },
      mosstone: {
        label: 'Mosstone',
        body: '#46543c', text: '#e7e0c4', accent: '#8fae6f',
        glow: null,
        feel: { rough: 0.85, metal: 0.02 },
        maps: { relief: { pattern: 'hammer', strength: 0.5, digitDepth: 0.6 } },
      },
      sapamber: {
        label: 'Sap Amber',
        body: '#96601f', text: '#38240e', accent: '#ffd166',
        glow: { color: '#ffb54d', intensity: 0.09 },
        feel: { rough: 0.08, metal: 0.0 },
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
          relief: { pattern: 'ferns', strength: 0.5, digitDepth: 0.3 },
          roughPattern: 'ferns',
        },
      },
      firstfrost: {
        label: 'First Frost',
        body: '#9cc3de', text: '#1e3d5c', accent: '#eef4fa',
        glow: null,
        feel: { rough: 0.3, metal: 0.02 },
        maps: {
          relief: { pattern: 'ferns', strength: 0.35, digitDepth: 0.25 },
          roughPattern: 'ferns',
        },
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
          digitGlow: { color: '#ffd166', intensity: 1.1 },
          relief: { pattern: 'hammer', strength: 0.7, digitDepth: 0.45 },
        },
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
        maps: { relief: { pattern: 'scrimshaw', strength: 0.6, digitDepth: 0.75 } },
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
