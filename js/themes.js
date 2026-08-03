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

// js/themes.js — themed-dice material recipes (Tier 6 §9; docs/THEMES.md
// is the design authority: nine houses, each with a palette, a material
// feel, and reasoned signature effects).
//
// A recipe is a SKIN over dice.js's (type, variant) seam: buildDie
// consults this registry when the variant names a theme, re-baking the
// face textures in the theme's body/number colors and dressing the
// materials in its finish. Geometry, physics and value reading are
// untouched — a theme can never change how a die lands (the ROADMAP §9
// constraint), and numbers stay readable (the GOALS legibility
// invariant: every `text` color here must hold contrast on its `body`).
//
// `glow` is the theme's INTERNAL light (emissive tint + intensity at
// rest); effects surge it, rest keeps it subtle (P1 binds themes too).
// `feel` is the surface: rough 0..1, metal 0..1.

export const THEMES = {
  tidewrack: {
    label: 'Tidewrack',
    line: 'ocean & odyssey — sea-glass and drowned bronze',
    body: '#0e3a3f',
    text: '#7fd1c3',
    accent: '#8a6f3c',
    glow: { color: '#58e6d9', intensity: 0.07 },
    feel: { rough: 0.15, metal: 0.1 },
  },
  wildwood: {
    label: 'Wildwood',
    line: 'forest, fae, dryadic — living wood and amber sap',
    body: '#5a4326',
    text: '#e9b54a',
    accent: '#6f8f4f',
    glow: { color: '#ffe9a3', intensity: 0.04 },
    feel: { rough: 0.72, metal: 0.05 },
  },
  stormcall: {
    label: 'Stormcall',
    line: 'sky & tempest — a storm bottled in glass',
    body: '#3a4150',
    text: '#f2f6ff',
    accent: '#8f7fe8',
    glow: { color: '#8f7fe8', intensity: 0.09 },
    feel: { rough: 0.22, metal: 0.2 },
  },
  rimehold: {
    label: 'Rimehold',
    line: 'frost & glacier — the cold is the mechanic',
    body: '#1e3d5c',
    text: '#eef4fa',
    accent: '#8fe3c0',
    glow: { color: '#a8d8f0', intensity: 0.06 },
    feel: { rough: 0.12, metal: 0.05 },
  },
  emberforge: {
    label: 'Emberforge',
    line: 'fire & the smith — black iron, molten numbers',
    body: '#2b2622',
    text: '#ffd166',
    accent: '#ff8c42',
    // Whole-material emissive TINTS THE BODY (0.14 read as rust, not iron
    // — lab rev 1); the true molten-numbers look needs an emissiveMap
    // baked from the number layer (v2). Until then: barely-warm iron.
    glow: { color: '#ff8c42', intensity: 0.045 },
    feel: { rough: 0.85, metal: 0.55 },
  },
  arcanum: {
    label: 'Arcanum',
    line: 'runes & wizardry — the roll is a casting',
    body: '#2a2140',
    text: '#c9a6ff',
    accent: '#7fd9e8',
    glow: { color: '#7fd9e8', intensity: 0.08 },
    feel: { rough: 0.2, metal: 0.15 },
  },
  umbra: {
    label: 'Umbra',
    line: 'dark & unnatural — a die-shaped absence',
    body: '#0b0a10',
    text: '#cfe98c',
    accent: '#43265b',
    glow: { color: '#43265b', intensity: 0.05 },
    feel: { rough: 1.0, metal: 0.0 },
  },
  reliquary: {
    label: 'Reliquary',
    line: 'bone & relic — aged ivory, scrimshaw numbers',
    body: '#e8dcc0',
    text: '#6b543a',
    accent: '#5f8f7a',
    glow: null,
    feel: { rough: 0.6, metal: 0.05 },
  },
  gildhall: {
    label: 'Gildhall',
    line: 'royal & heraldic — oxblood lacquer, gold leaf',
    body: '#4a1f1a',
    text: '#d4af37',
    accent: '#f3ead7',
    glow: null,
    feel: { rough: 0.18, metal: 0.4 },
  },
};

export const THEME_IDS = Object.keys(THEMES);
