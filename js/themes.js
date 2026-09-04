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

// js/themes.js — the themed-dice RECIPE GRAMMAR, and the catalogue's shape
// (Tier 6 §9; docs/THEMES.md is the design authority). TWO LEVELS (Joe
// 2026-08-03): a THEME is a HOUSE — a browsing category with an identity —
// and each house holds one or more SETS, the concrete dice styles a player
// actually picks.
//
// THE RECIPES THEMSELVES LIVE IN dice.yaml UNDER `houses:` since 2026-09-03
// (developer mode phase D1). What is here is what the recipes MEAN, which is
// documentation of the code that reads them, plus the three exports the app
// resolves a set through — filled from the declaration by `installCatalogue`
// at the bottom of this file. Every dated ruling below still stands: it is
// the reason a field is (or is not) in a row of that file.
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
// · `sound` {body, weight, sustain} — impact voice. body ∈ felt | click |
//   chime | bell | thud | crackle | clack | hush (js/voices.js
//   IMPACT_VOICES); weight 0..1 (heavier = lower); sustain ms of tail.
//   ABSENT = IMPACT_DEFAULT_BODY (`felt`) at weight 0 and sustain 0 — the
//   ordinary knock every unthemed die makes. This line said "the legacy
//   click" until 2026-08-18 and had been wrong since `felt` took the default
//   seat; it is load-bearing now, because Joe's *"just use a normal sound"*
//   for the fae venues was delivered by DELETING a recipe (see witchlight).
// · `rate` {rate, window} — retimes the LAST `window` fraction of the
//   roll's playback to `rate` playback speed. rate<1 = decelerate (vine
//   catch / glacial arrest / ceremonial hover). Physics untouched — only
//   the playback clock scales.
// · `maps` (Level 1, texture-space authoring):
//     digitGlow {color, intensity}  emissiveMap of the DIGITS alone
//     relief {pattern, strength, digitDepth}
//                                 height sketch → normal map (the code is
//                                 `heightToNormal` in js/dice.js, NOT here,
//                                 and it is a 4-tap CENTRAL DIFFERENCE, not
//                                 a Sobel — this line said "Sobel" and the
//                                 mats handoff cited THIS FILE for it):
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
//   NAME BOTH OR NEITHER. A set that names no `bevel` and no `profile`
//   wears THE STANDARD EDGE — `{bevel: .09, profile: 'round'}` since
//   2026-08-18 (§9c decided; dice.js STD_EDGE) — as a unit, which is what
//   the Classics do. Name either one and you are stating your own edge:
//   the per-field fallbacks are then .055 and 'cut', so `bevel: 0.02`
//   still means a lapidary CUT.
//   bevel    edge-cut share: 0.02 machined-crisp, 0.13 tumbled
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

// ---------------------------------------------------------------------------
// THE CATALOGUE IS DATA NOW (developer mode phase D1, 2026-09-03)
// ---------------------------------------------------------------------------
//
// Everything above this line is the RECIPE GRAMMAR — what a field means, why a
// set may not have one, and the dated rulings behind a dozen turn-downs. It
// stays here because it is documentation of the CODE that reads the recipes.
// The recipes themselves moved into `houses:` in dice.yaml, where the panel
// can show them as knobs, where the server accepts a set id because the file
// names it, and where adding a set is a diff to one file rather than a diff to
// this one (DEVMODE §9: "the shipped catalogue migrates").
//
// TWO TRANSLATIONS, and they exist because THE FILE MAY NOT HOLD A BOOLEAN
// (js/yaml.js refuses `true`/`false`/`yes`/`no`/`on`/`off` at parse, and a
// two-state value is an enum with named states):
//
//     venueOnly: true   ⇄   where: venue      (options anywhere | venue)
//     beta: true        ⇄   channel: beta     (options stable | beta)
//     post.bloom: true  ⇄   post.bloom: source (options plain | source)
//
// The RECIPE keeps the old field names, because every consumer in the app
// reads them: `venueOnly` in main.js's picker, `beta` through js/stability.js,
// `post.bloom` in dice.js's `mesh.userData.bloom`. The translation is here, in
// one function, and nothing downstream learns that the file said it
// differently.
//
// A THIRD SHAPE DIFFERENCE, recorded so the next reader does not go looking:
// three sets wrote `glow: null` to say "the digits carry ALL the light" and
// the file writes the same line, but a null in the declaration is ABSENT
// (js/tune.js: "a null at a dial is absent, not a value"), so the built recipe
// has no `glow` key rather than a null one. dice.js tests `def.glow` for
// truth, so the die is byte-identical either way; the LINE is what carries the
// intent, and it is still in the file.
//
// THE OBJECTS ARE FILLED IN PLACE, NEVER REPLACED. `THEMES`, `SETS` and
// `SET_IDS` are imported by js/dice.js, js/main.js, js/portable.js,
// js/diceart.js and server.js — a module that reassigned them would
// leave every one of those holding last boot's catalogue. `installCatalogue`
// empties and refills them, which is the same move js/places.js makes for
// PLACE_AIM and SEAT_TOSS, and for the same reason: this file is imported by
// server.js and so may not import js/tune.js.
//
// WHO CALLS IT: js/main.js at module eval, before the first read of `SET_IDS`
// (the stored-set validation and the picker); server.js from `setDeclaration`,
// which is the ONE place its parsed tree is assigned, so a set added to
// dice.yaml is accepted on the wire on the next request with no restart; and
// each Node test or tool that reads recipes. (js/lab.js was a third caller
// until 2026-09-03, when the dice lab retired into the developer-mode panel's
// sets editor — DEVMODE §9.)
// The catalogue is EMPTY until somebody does — which is the honest state for a
// module whose data lives in a file it is not allowed to read.

// A house as the declaration writes it → a house as this file has always
// written it. `dice:` is the file's name for what THEMES calls `sets` (see
// js/tune.js HOUSE_ROW for why the file says `dice`).
const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

function recipeOf(declared) {
  const r = {};
  for (const [k, v] of Object.entries(declared)) {
    // A NULL IS ABSENT, HERE TOO (the D1 review, 2026-09-03). The comment
    // above says the file's `glow: null` lines mean "absent, on purpose", and
    // js/tune.js drops them before the browser ever calls this — but
    // server.js installs the RAW parsed tree, so this function is
    // the first thing that sees such a line, and `post: null` walked straight
    // into `Object.entries(null)`. A file the app itself considers valid
    // stopped the server booting, with a TypeError reported as
    // `dice.yaml:0: Cannot convert undefined or null to object` — a parse
    // failure at a line that does not exist. The two paths agree now: a null
    // field is a field this recipe does not have.
    if (v === null || v === undefined) continue;
    if (k === 'where') { if (v === 'venue') r.venueOnly = true; continue; }
    if (k === 'channel') { if (v === 'beta') r.beta = true; continue; }
    if (k === 'post') {
      // The one branch that DEREFERENCES, so it is the one that has to ask.
      // A scalar where a map belongs is dropped, which is what the reconciled
      // path does with it ("expected a map, got 5; the defaults stand") — and
      // dropping is the whole of this file's contract for a malformed
      // declaration: a smaller catalogue, never a broken one.
      if (!isPlainObject(v)) continue;
      const post = {};
      for (const [pk, pv] of Object.entries(v)) {
        if (pk === 'bloom') { if (pv === 'source') post.bloom = true; continue; }
        post[pk] = pv;
      }
      r.post = post;
      continue;
    }
    r[k] = v;
  }
  return r;
}

// The three shapes the app reads, built from a declared `houses` tree. Pure:
// nothing here touches the module's own exports, so a caller can build a
// catalogue to compare against without disturbing the live one (the drift
// guard in tests/catalogue.test.mjs does exactly that).
export function buildCatalogue(houses) {
  const THEMES = {}, SETS = {};
  for (const [houseId, house] of Object.entries(houses || {})) {
    if (!isPlainObject(house)) continue;
    const sets = {};
    for (const [setId, recipe] of Object.entries(house.dice || {})) {
      if (!isPlainObject(recipe)) continue;
      sets[setId] = recipeOf(recipe);
      SETS[`${houseId}.${setId}`] = {
        ...sets[setId],
        house: houseId,
        houseLabel: house.label,
        houseLine: house.line,
      };
    }
    THEMES[houseId] = { label: house.label, line: house.line, sets };
  }
  return { THEMES, SETS, SET_IDS: Object.keys(SETS) };
}

// TWO LEVELS (Joe 2026-08-03): house → sets. The browsing tree the picker
// draws its headers from.
export const THEMES = {};

// The flat picker/variant registry: 'house.set' → recipe, annotated with its
// house. dice.js resolves variants here; the lab renders these rows.
export const SETS = {};

// The published picker list, in file order. `SET_IDS.includes(id)` is what the
// server answers a roll's `set:` with, so a house the file adds is on the wire
// as soon as the server re-reads it.
export const SET_IDS = [];

// Fill the three exports from a declared `houses` tree, in place. Idempotent:
// calling it again with a new tree is how the server adopts an edited file.
export function installCatalogue(houses) {
  const built = buildCatalogue(houses);
  for (const k of Object.keys(THEMES)) delete THEMES[k];
  for (const k of Object.keys(SETS)) delete SETS[k];
  Object.assign(THEMES, built.THEMES);
  Object.assign(SETS, built.SETS);
  SET_IDS.length = 0;
  SET_IDS.push(...built.SET_IDS);
  return { THEMES, SETS, SET_IDS };
}

// Lab-only seam: the DICE LAB registers its GEO BENCH rows and the live SET
// BUILDER into THIS page's registry at load (module state is per-page, so the
// main table never sees them).
//
// IT APPENDS TO SET_IDS NOW (the C4 review, 2026-09-03, citing DEVMODE §9's
// own rule: "merge before the id lists are computed — today `registerSet` runs
// after, and a critic found a registered set invisible in the picker and
// rejected on the wire"). SET_IDS used to be frozen at build time and this
// function deliberately did not extend it, which was right while the only
// caller was the lab and its rows were page-local by design — but the same
// function is the one a sets editor calls to make a new set real, and a set
// the picker cannot list is not real. The lab's own rows are filtered by
// prefix where it matters (tests/e2e: "SET_IDS stays free of lab rows" reads
// the MAIN table's module, which no lab code has ever touched).
export function registerSet(id, recipe) {
  SETS[id] = recipe;
  if (!SET_IDS.includes(id)) SET_IDS.push(id);
  return SETS[id];
}
