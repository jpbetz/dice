/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// THE TUNABLES REGISTRY (docs/DEVMODE.md §5). Node-pure: no DOM, no three,
// no cannon. Two things live here:
//
//   DIALS  — the dial tree: metadata and the DEFAULT for every leaf the
//            declaration (dice.yaml) may name, at the same path. A dial is
//            look (per-viewer: light, camera, pacing) or film (feeds the
//            shared bake: physics, toss, spawn, table geometry), and says
//            when a write lands: frame / roll / apply / reload.
//   createTune — the live tree. SHIPPED is defaults ⊕ declared, frozen;
//            T is its mutable clone, the one object every consumer reads.
//            `set` is THE writer (panel, hooks, paste all come through it)
//            and refuses unknown paths, the static leaves (STATIC_PATHS),
//            film writes while the film is locked, type changes and enum
//            values outside the list.
//
// Defaults here are the SHIPPED values of the objects they mirror in
// main.js / places.js / faelife.js as of 2026-09-02. tests/tune.test.mjs
// pins dice.yaml to them, so a default that drifts from the file fails
// the drift test in whichever direction it drifted.
//
// NO BOOLEANS (Joe, revision 3). A two-state value is an enum with two
// named states — `state: enabled | disabled`, `prefer: dice | table` — so
// `pick` is the only way to declare one and createTune throws on a boolean
// anywhere. AND NO STATE IS A BOOLEAN WORD: an enum state is never one of
// `true false yes no on off y n` in any case, because the YAML reader
// refuses those as booleans (js/yaml.js), so a state spelled `on` could
// only be written quoted and read back as a string that LOOKS like a flag —
// 2026-09-02, the first draft of dice.yaml did exactly that and apologised
// for it in a comment. The state says what it means, or it is not a state.
//
// THE DECLARATION IS CHECKED AT BIRTH, AND THE CODE IS THE FALLBACK. A live
// edit of dice.yaml reaches createTune unreviewed (server.js re-reads on
// every request, and keeps last-good only for PARSE errors), so the merge
// DROPS, per path, a declared value whose type disagrees with its dial, an
// enum value outside the options, a map where the tree has a dial and a
// scalar where it has a map — the default stands, one console line names
// the path (DEVMODE §3, §6), and `tune.refusals` holds every drop for the
// panel. It never throws for a bad value: a throw here happens during
// main.js module evaluation and blanks the whole table for one dead dial.
// Without the check the dial would be born dead anyway: SHIPPED would hold
// the wrong type and every set() on it would be refused with no message. A
// null at a dial (`y:` with nothing after it) is ABSENT, not a value: the
// default stands, which is what "every leaf is optional" means. Keys
// containing a dot are dropped the same way until phase 3 puts asset ids
// under `sets:`/`felts:` — every path in this module is also a dotted
// string, and a dot inside a key would make it ambiguous. A boolean
// anywhere still throws: the YAML reader refuses booleans at parse, so one
// can only arrive from code, and that is a programming error.
//
// BINDERS RUN AFTER THE WHOLE PATCH LANDS. The binder DEVMODE §5 prescribes
// is `bind('light.*', () => applyMoodLights())` — a re-apply that reads T,
// not the (path, value) it is handed — so every accepted leaf of a patch is
// written into T first and each distinct binder runs once afterwards.
// Running it at the first covered leaf would show the scene a T that the
// later leaves of the same Reset, Paste or multi-leaf set had not reached.

import { parseYaml, patchYaml, emitYaml, toPath, pathKey } from './yaml.js';

export { toPath, pathKey };

const READS = ['frame', 'roll', 'apply', 'reload'];
const CLASSES = ['look', 'film'];

function dial(label, def, range, options, cls, read, why) {
  if (typeof label !== 'string' || !label) throw new Error('dial: label is required');
  if (!CLASSES.includes(cls)) throw new Error(`dial ${label}: cls must be look|film, got ${cls}`);
  if (!READS.includes(read)) throw new Error(`dial ${label}: read must be one of ${READS.join('|')}, got ${read}`);
  const d = { label, def, range: range || null, cls, read, why: why || '' };
  if (options) d.options = options.slice();
  return d;
}

// A per-viewer dial: light, fog, camera, pacing, chrome. Never locks.
export function look(label, def, range, read, why = '') {
  return dial(label, def, range, null, 'look', read, why);
}

// A dial that feeds the shared bake. Live at a table of one; locked when a
// second viewer is present (GOALPOST 2: no forked film).
export function film(label, def, range, read, why = '') {
  return dial(label, def, range, null, 'film', read, why);
}

// An enum. `options` is the law: `set` refuses a value outside it.
export function pick(label, def, options, cls, read, why = '') {
  if (!Array.isArray(options) || options.length < 2) throw new Error(`dial ${label}: an enum needs at least two options`);
  return dial(label, def, null, options, cls, read, why);
}

export function isDial(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x)
    && typeof x.label === 'string' && 'def' in x
    && CLASSES.includes(x.cls) && READS.includes(x.read);
}

const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x)
  && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);

// The dial tree with every dial replaced by its default.
export function defaultsOf(dials) {
  const out = {};
  for (const [k, v] of Object.entries(dials)) {
    if (isDial(v)) out[k] = Array.isArray(v.def) ? v.def.slice() : v.def;
    else if (isPlain(v)) out[k] = defaultsOf(v);
    else out[k] = v;
  }
  return out;
}

// Deep merge; `over` wins; only plain objects recurse — arrays and every
// other value replace. Neither input is mutated.
export function merge(base, over) {
  const out = {};
  if (isPlain(base)) for (const [k, v] of Object.entries(base)) out[k] = cloneVal(v);
  if (isPlain(over)) {
    for (const [k, v] of Object.entries(over)) {
      if (isPlain(v) && isPlain(out[k])) out[k] = merge(out[k], v);
      else out[k] = cloneVal(v);
    }
  }
  return out;
}

function cloneVal(v) {
  if (isPlain(v)) return merge(v, {});
  if (Array.isArray(v)) return v.map(cloneVal);
  return v;
}

// Every leaf path in a tree, in tree order. A leaf is anything that is not
// a plain object (arrays count as leaves; `merge` replaces them whole).
export function leaves(tree, prefix = []) {
  const out = [];
  if (!isPlain(tree)) return out;
  for (const [k, v] of Object.entries(tree)) {
    if (isPlain(v)) out.push(...leaves(v, prefix.concat(k)));
    else out.push(prefix.concat(k));
  }
  return out;
}

export function getLeaf(tree, path) {
  let cur = tree;
  for (const k of toPath(path)) {
    if (!isPlain(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function hasLeaf(tree, path) {
  const p = toPath(path);
  if (!p.length) return false;
  let cur = tree;
  for (const k of p) {
    if (!isPlain(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return false;
    cur = cur[k];
  }
  return !isPlain(cur);
}

// Sets a leaf, creating intermediate maps. Throws when the path runs
// through an existing scalar.
export function setLeaf(tree, path, v) {
  const p = toPath(path);
  if (!p.length) throw new Error('setLeaf: empty path');
  let cur = tree;
  for (let i = 0; i < p.length - 1; i++) {
    const k = p[i];
    if (!Object.prototype.hasOwnProperty.call(cur, k) || cur[k] === undefined) cur[k] = {};
    else if (!isPlain(cur[k])) throw new Error(`setLeaf: ${p.slice(0, i + 1).join('.')} is a scalar`);
    cur = cur[k];
  }
  cur[p[p.length - 1]] = v;
  return tree;
}

// An accessor view over a tree: `alias(T, { lampY: 'light.lamp.y' })` gives
// an object whose `lampY` reads and writes `T.light.lamp.y`. Getters are
// enumerable, so `{ ...view }` and `Object.assign(view, patch)` both work,
// which is what lets a tune object such as MOOD.tune keep its identity and
// its existing hooks while its values live in the declaration.
export function alias(tree, map) {
  const view = {};
  for (const [name, path] of Object.entries(map)) {
    const p = toPath(path);
    Object.defineProperty(view, name, {
      enumerable: true,
      configurable: false,
      get: () => getLeaf(tree, p),
      set: (v) => { setLeaf(tree, p, v); },
    });
  }
  return view;
}

// No dial may reach the RNG, the values, the faces, the seed or the clock
// (GOALPOST 2). The unit test walks every dial path against this.
export const FORBIDDEN_LEAF = /(^|[^a-z])(rng|value|values|face|faces|seed|fixedDt)([^a-z]|$)/i;

// THE STATIC LEAVES: declared, drawn, never written by a running tab.
// `app.mode` is the production switch (DEVMODE §4: "not a dial: no panel
// control writes it … a Save from a running dev session can never flip
// it"). The panel already drew it static and skipped it on Reset, but the
// refusal has to live at THE writer, or it is not a refusal: 2026-09-02 the
// B3 review flipped it from the console (`tuneSet({'app.mode':
// 'production'})`) and from the panel's own Paste box, and both escaped —
// every mutating hook went null, the backtick stopped folding, and
// Download carried `mode: production` to disk. `set`, `reset` and
// `applyPatchText` all run through `apply`, so one check here covers every
// door; the reason is 'static'. The list is exported so devmode.js draws
// the same leaves static that this refuses, from one source.
export const STATIC_PATHS = Object.freeze(['app.mode']);

// ---------------------------------------------------------------------------
// THE DIAL TREE (phase 1). Shape = docs/DEVMODE.md §3. Ranges are the
// slider's, not the law's: the number field beside a slider takes any
// finite value. Source of each default is named beside its section.
// ---------------------------------------------------------------------------

const ENABLED = ['enabled', 'disabled'];
const surface = (friction, restitution, why) => ({
  friction: film('friction', friction, [0, 1.5, 0.01], 'apply', why),
  restitution: film('restitution', restitution, [0, 1, 0.01], 'apply', why),
});

export const DIALS = {
  app: {
    title: look('title', 'Dice Table', null, 'reload', 'the document title'),
    mode: pick('mode', 'development', ['development', 'production'], 'look', 'reload',
      'the production switch; DICE_MODE overrides it at deploy. Not a panel control.'),
    version: look('version', 1, [1, 99, 1], 'reload', 'bumped in the commit that renames or removes a key'),
  },
  table: {
    scale: film('table scale', 2.5, [1, 4, 0.05], 'apply',
      'the one dial for table size (Joe 2026-09-01) — TABLE_SCALE; a bigger table IS smaller dice'),
    ceilingY: film('ceiling', 22, [8, 60, 1], 'reload', 'the roof plane the walls close under'),
  },
  light: {
    // MOOD.tune (main.js) — the lamp and the room, lampY → lamp.y etc.
    lamp: {
      y: look('lamp height', 24, [5, 80, 0.5], 'apply', 'pool ~27 at the felt over a 13.75 table'),
      z: look('lamp z', 1.5, [-20, 20, 0.1], 'apply', 'over the felt, nudged to the front'),
      angle: look('lamp cone', 0.85, [0.1, 1.5, 0.01], 'apply', 'widened 0.5 → 0.85 for the round table'),
      penumbra: look('lamp penumbra', 0.75, [0, 1, 0.01], 'apply'),
      intensity: look('lamp intensity', 2.8, [0, 12, 0.05], 'apply'),
      color: look('lamp colour', '#ffe8c4', null, 'apply'),
    },
    room: {
      hemi: look('room hemi', 0.1, [0, 2, 0.01], 'apply', 'the room level while the mood is on'),
      key: look('room key', 1.7, [0, 6, 0.05], 'apply'),
      rim: look('room rim', 0.4, [0, 3, 0.05], 'apply'),
    },
    fog: {
      near: look('fog near', 15, [0, 80, 0.5], 'apply', 'the back corners already sit inside it at medium'),
      far: look('fog far', 46, [5, 200, 1], 'apply'),
    },
    // MOOD.moteTune — dust in the lamp cone; `on` → state.
    motes: {
      state: pick('motes', 'enabled', ENABLED, 'look', 'apply'),
      count: look('mote count', 200, [0, 1000, 10], 'apply', 'Joe 2026-08-15: "this looks good"'),
      size: look('mote size', 0.19, [0.02, 1, 0.01], 'apply'),
      peak: look('mote peak', 0.07, [0, 0.5, 0.005], 'apply'),
      spread: look('mote spread', 1.15, [0.1, 4, 0.05], 'apply'),
      rMax: look('mote radius', 12, [1, 40, 0.5], 'apply'),
      yMin: look('mote floor', 1.2, [0, 20, 0.1], 'apply'),
      yMax: look('mote ceiling', 10, [0, 40, 0.5], 'apply', 'not the full shaft: high motes read as a night sky'),
      fall: look('mote fall', 0.35, [0, 2, 0.01], 'apply'),
      wander: look('mote wander', 0.28, [0, 2, 0.01], 'apply'),
      twinkleHz: look('mote twinkle', 0.11, [0, 2, 0.01], 'apply'),
    },
    // BREATH — the declare beat told in light; every dial a fraction of
    // the shipped room. `t` and `target` are the beat's own clock, not
    // dials, and stay on the object.
    breath: {
      state: pick('breath', 'enabled', ENABLED, 'look', 'apply', 'device-local; the reduced-motion path skips the traverse'),
      dur: look('breath duration', 0.6, [0.05, 3, 0.05], 'apply', 'seconds, each way'),
      hemiDrop: look('hemi drop', 0.65, [0, 1, 0.01], 'apply', 'the ambient falls furthest — it is what closing in is'),
      rimDrop: look('rim drop', 0.75, [0, 1, 0.01], 'apply'),
      keyDrop: look('key drop', 0.45, [0, 1, 0.01], 'apply', 'the key stays halfway: dice must not go unreadable'),
      lampLift: look('lamp lift', 0.12, [0, 1, 0.01], 'apply', 'the pool comes UP, so it reads as focus'),
      angleNarrow: look('cone narrow', 0.3, [0, 1, 0.01], 'apply'),
      // NO `depth` HERE (2026-09-02, found wiring B1): BREATH.depth is the
      // CLOTH's number, pushed by applyFeltTheme — obsidian, the default felt,
      // pushes 1.5 at boot — so a dial for it read "changed" on every fresh
      // tab and a Save would have written the felt's value over the file's.
      // It becomes `felts.<id>.breath` when the felt rows migrate (phase 3).
    },
    // TOWERLIGHT.tune — the socketed tower's lantern rake and ember.
    tower: {
      rakeIntensity: look('rake intensity', 2.4, [0, 10, 0.1], 'apply'),
      rakeColor: look('rake colour', '#ffd9a0', null, 'apply'),
      rakeX: look('rake x', -10, [-30, 30, 0.5], 'apply', 'eye: side'),
      rakeY: look('rake y', 5.5, [0, 30, 0.5], 'apply', 'eye: height'),
      rakeOut: look('rake out', 7.5, [0, 30, 0.5], 'apply', 'eye: z0 + out'),
      rakeAngle: look('rake cone', 0.62, [0.1, 1.5, 0.01], 'apply'),
      rakePenumbra: look('rake penumbra', 0.6, [0, 1, 0.01], 'apply'),
      emberIntensity: look('ember intensity', 14, [0, 50, 0.5], 'apply'),
      emberDist: look('ember distance', 8, [0, 30, 0.5], 'apply'),
      breathDepth: look('ember breath', 0.22, [0, 1, 0.01], 'apply'),
      breathHz: look('ember breath rate', 0.11, [0, 2, 0.01], 'apply'),
    },
    // LIFE_TUNE (faelife.js) — the fae venue's fireflies, wisps and moot.
    life: {
      count: look('firefly count', 260, [0, 1000, 10], 'apply', 'in-frame density, not total'),
      size: look('firefly size', 0.5, [0.05, 2, 0.05], 'apply', 'size was the whole problem; 0.5 reads as drifting specks'),
      peak: look('firefly peak', 0.42, [0, 1.5, 0.01], 'apply', '→ ~0.17 luma, under the tertiary ceiling'),
      blinkPow: look('blink power', 4, [1, 12, 0.5], 'apply', 'dark ~3/4 of the cycle'),
      blinkHz: look('blink rate', 0.22, [0, 2, 0.01], 'apply', 'a flash every 3–8 s'),
      wander: look('firefly wander', 0.45, [0, 3, 0.05], 'apply'),
      wispCount: look('wisp count', 4, [0, 12, 1], 'apply', 'one lead + three followers; a fifth would be a swarm'),
      wispSize: look('wisp size', 1.15, [0.1, 4, 0.05], 'apply'),
      leadPeak: look('lead peak', 0.95, [0, 2, 0.01], 'apply', '→ ~0.40 luma, inside secondary'),
      wispPeak: look('wisp peak', 0.38, [0, 2, 0.01], 'apply'),
      wispLoopSec: look('wisp lap', 78, [10, 300, 1], 'apply', 'one lap; slow enough to be a route'),
      wispLampRange: look('wisp lamp range', 5.5, [0, 20, 0.5], 'apply'),
      wispLampGain: look('wisp lamp gain', 2.2, [0, 10, 0.1], 'apply', 'first dial to move if Joe finds it loud'),
      nearArcU: look('near arc', 0.3, [0, 1, 0.01], 'apply', 'overridden by the venue'),
      leanGain: look('lean gain', 0.35, [0, 2, 0.01], 'apply'),
      leanDwell: look('lean dwell', 0.55, [0, 0.95, 0.01], 'apply', 'must stay < 1 or the route reverses'),
      dimGain: look('dim gain', 0.3, [0, 1, 0.01], 'apply', 'what survives while the film runs'),
      flareGain: look('flare gain', 0.8, [0, 3, 0.05], 'apply', 'the crit beat, on wisps'),
      moot: {
        lapHz: look('moot lap', 0.085, [0, 1, 0.005], 'apply', 'a word goes round the ring in ~12 s'),
        quiet: look('moot quiet', 0.85, [0, 1, 0.01], 'apply'),
        visit: look('moot visit', 0.45, [0, 1, 0.01], 'apply'),
        nearIn: look('moot near in', 1.2, [0, 10, 0.1], 'apply', 'standing in it, not passing near it'),
        nearOut: look('moot near out', 3, [0, 20, 0.1], 'apply'),
        dimGain: look('moot dim', 0.55, [0, 1, 0.01], 'apply'),
        flareGain: look('moot flare', 0.5, [0, 3, 0.05], 'apply'),
        flareLap: look('moot flare lap', 3, [0.5, 10, 0.1], 'apply'),
      },
    },
  },
  camera: {
    // FRAMING (main.js) — preferDice: true → prefer: dice.
    framing: {
      prefer: pick('prefer', 'dice', ['dice', 'table'], 'look', 'frame',
        'what the fit favours when both cannot be held'),
      floor: look('fit floor', 1, [0.25, 1.5, 0.01], 'frame', 'the eye never comes closer than the zoom says'),
      gain: look('fit gain', 1.15, [0.5, 3, 0.01], 'frame'),
    },
  },
  throw: {
    physics: {
      gravity: film('gravity', -110, [-400, -20, 1], 'apply', 'the sim is in slow motion by arithmetic; the tempo curve is the fix'),
      solverIterations: film('solver iterations', 14, [1, 40, 1], 'roll'),
      // PHYS (main.js): floorFriction → floor.friction etc.
      floor: surface(0.6, 0.15, 'the felt: deadened, gripping'),
      dice: surface(0.4, 0.2, 'die on die'),
      wall: surface(0.2, 0.5, 'the rim'),
      damping: {
        linear: film('linear damping', 0.01, [0, 0.5, 0.001], 'apply'),
        angular: film('angular damping', 0.01, [0, 0.5, 0.001], 'apply'),
      },
    },
    // DAMPGATE — speed-gated felt damping; gate 0 is off.
    dampgate: {
      gate: film('damp gate', 4, [0, 40, 0.5], 'apply', 'a velocity threshold on lengthSquared; 0 is off'),
      slowLinear: film('slow linear', 0.1, [0, 1, 0.01], 'apply'),
      slowAngular: film('slow angular', 0.14, [0, 1, 0.01], 'apply'),
    },
    // SLEEP — what dice.js already sets, not cannon's defaults.
    sleep: {
      speed: film('sleep speed', 0.4, [0, 4, 0.05], 'apply'),
      time: film('sleep time', 0.35, [0, 3, 0.05], 'apply'),
    },
    // SPAWN — where the throw lines up.
    spawn: {
      axis: pick('spawn axis', 'clamp', ['width', 'own', 'clamp'], 'film', 'apply',
        'clamp shipped 2026-08-14; own was measured and refused'),
      pad: film('spawn pad', 4.4, [0, 12, 0.1], 'apply', 'the total clearance the clamp reserves'),
      per: film('spawn per die', 2.6, [0.5, 8, 0.1], 'apply', 'the spacing the spread wants'),
    },
    // NUDGE — what to do about a die that stops at an angle.
    nudge: {
      budget: film('nudge budget', 3, [0, 10, 1], 'apply'),
      lift: film('nudge lift', 7, [0, 30, 0.5], 'apply', 'a vertical hurl'),
      spread: film('nudge spread', 4, [0, 30, 0.5], 'apply'),
      spin: film('nudge spin', 14, [0, 60, 1], 'apply'),
      cockedDot: film('cocked dot', 0.6, [0, 1, 0.01], 'apply', '~53°: lets a die rest against its neighbour'),
      cockedDotD4: film('cocked dot d4', 0.7, [0, 1, 0.01], 'apply'),
      pileScale: film('pile scale', 1.05, [0, 2, 0.01], 'apply', 'tidy on (Joe 2026-08-11); 0 is off'),
      pileSpread: film('pile spread', 12, [0, 40, 0.5], 'apply'),
    },
    // PLACE_AIM (places.js) — the seat's aim; on → state.
    aim: {
      state: pick('aim', 'enabled', ENABLED, 'film', 'roll'),
      speed: film('aim speed', 0.5, [0, 2, 0.05], 'roll'),
      h: film('aim height', 0.45, [0, 3, 0.05], 'roll', 'a low hand'),
      box: film('aim box', 0.25, [0, 1, 0.01], 'roll', 'the fraction of the run the box is cut to'),
      corner: pick('aim corner', 'enabled', ENABLED, 'film', 'roll', 'enabled: a lane sets the box against its corner'),
      own: pick('aim own', 'enabled', ENABLED, 'film', 'roll', 'enabled: the seat throws along its own axis'),
      spin: film('aim spin', 1, [0, 4, 0.05], 'roll'),
    },
    // SETTLEGATE — the settle terminator.
    settle: {
      mode: pick('settle mode', 'displacement', ['velocity', 'displacement'], 'film', 'apply',
        'displacement shipped 2026-08-11; velocity is the pre-flip predicate'),
      eps: film('settle eps', 0.02, [0.005, 0.2, 0.005], 'apply', 'a fraction of a die width'),
    },
    // THROW_TARGET — how wide the throw aims.
    target: film('throw target', 0.4, [0, 1, 0.02], 'apply', 'the middle ±target/2 of the table'),
  },
  pace: {
    // TEMPO — the projector's curve; never the bake.
    tempo: {
      k: look('tempo', 1, [0.25, 4, 0.05], 'frame', 'playback speed, never the bake'),
      flight: look('flight tempo', 0.8, [0.1, 4, 0.05], 'frame', 'the tumble, a touch slower than raw'),
      settle: look('settle tempo', 25, [1, 60, 0.5], 'frame', 'the tail is effectively skipped'),
      rampS: look('tempo ramp', 2, [0, 6, 0.1], 'frame', 'film seconds; the glide that hides the cut'),
      anchorSpeed: look('anchor speed', 8, [0.5, 40, 0.5], 'frame', 'where tumbling ends, in units/s'),
    },
    // CEREMONY_* consts — read once at boot.
    ceremony: {
      declareS: look('declare dwell', 1.35, [0, 4, 0.05], 'reload', 'incl. the commit dock'),
      hitstopS: look('hitstop', 0.11, [0, 1, 0.01], 'reload'),
      budgetS: look('ceremony budget', 1.6, [0, 5, 0.05], 'reload', 'post-settle ceiling'),
      dismissMs: look('dismiss', 7000, [0, 30000, 250], 'reload', 'the flow-to-collected clock'),
    },
    clear: {
      sinkS: look('sink', 0.3, [0.05, 2, 0.05], 'reload', 'how long a cleared die takes to leave'),
    },
  },
  sound: {
    // CLICKGATE — which clock gates the impact clicks.
    click: {
      mode: pick('click gate', 'film', ['film', 'wall'], 'look', 'apply',
        'film is invariant to the tempo curve; wall is the pre-curve gate'),
    },
  },
};

// ---------------------------------------------------------------------------
// The live tree.
// ---------------------------------------------------------------------------

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

function deepClone(x) {
  if (Array.isArray(x)) return x.map(deepClone);
  if (isPlain(x)) { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = deepClone(v); return o; }
  return x;
}

const same = (a, b) => a === b
  || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null
    && JSON.stringify(a) === JSON.stringify(b));

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function findBooleans(tree, prefix = []) {
  const out = [];
  if (Array.isArray(tree)) {
    tree.forEach((v, i) => out.push(...findBooleans(v, prefix.concat(String(i)))));
  } else if (isPlain(tree)) {
    for (const [k, v] of Object.entries(tree)) out.push(...findBooleans(v, prefix.concat(k)));
  } else if (typeof tree === 'boolean') out.push(prefix.join('.'));
  return out;
}

function checkDials(dials, prefix = []) {
  for (const [k, v] of Object.entries(dials)) {
    const p = prefix.concat(k);
    if (isDial(v)) {
      const path = p.join('.');
      if (typeof v.def === 'boolean') throw new Error(`dial ${path}: a boolean default; use pick() with named states`);
      if (v.def === undefined) throw new Error(`dial ${path}: def is required`);
      if (v.options && !v.options.includes(v.def)) throw new Error(`dial ${path}: def ${JSON.stringify(v.def)} is not one of its options`);
      if (v.range && (!Array.isArray(v.range) || v.range.length !== 3 || !v.range.every(Number.isFinite))) {
        throw new Error(`dial ${path}: range must be [min, max, step]`);
      }
    } else if (isPlain(v)) checkDials(v, p);
    else throw new Error(`dial tree ${p.join('.')}: not a dial and not a map`);
  }
}

// Type is the law for a write: a leaf keeps the type SHIPPED gave it. The
// one opening is a dial-less leaf the file left empty (`note:` → null): it
// has no type yet, so it takes any scalar — otherwise it would refuse every
// value with 'type' and no way to give it one.
function typeFits(shipped, v) {
  const want = typeOf(shipped);
  if (want === 'null') return v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
  return typeOf(v) === want && (want !== 'number' || Number.isFinite(v));
}

// The declaration against the dial tree: returns a copy of `decl` with
// every null at a dial or a dial map dropped (absent: the default stands),
// and every leaf whose type, option or shape disagrees with its dial, or
// whose key holds a dot, dropped through `refuse(path, reason, message)`.
// A leaf with no dial is kept as it is — a typed value.
function reconcile(decl, dials, prefix, refuse) {
  const out = {};
  for (const [k, v] of Object.entries(decl)) {
    const p = prefix.concat(k), path = p.join('.');
    if (k.includes('.')) {
      refuse(path, 'key', `key ${JSON.stringify(k)} under ${prefix.length ? prefix.join('.') : 'the root'} contains a dot; dotted keys are not supported until phase 3, so it is dropped`);
      continue;
    }
    const d = isPlain(dials) ? dials[k] : undefined;
    if (isDial(d)) {
      if (v === null) continue;
      const want = typeOf(d.def);
      if (isPlain(v)) { refuse(path, 'shape', `expected ${want}, got a map; the default stands`); continue; }
      if (typeOf(v) !== want || (want === 'number' && !Number.isFinite(v))) {
        refuse(path, 'type', `expected ${want}, got ${JSON.stringify(v)}; the default stands`);
        continue;
      }
      if (d.options && !d.options.includes(v)) {
        refuse(path, 'option', `expected one of ${d.options.join('|')}, got ${JSON.stringify(v)}; the default stands`);
        continue;
      }
      out[k] = v;
    } else if (isPlain(d)) {
      if (v === null) continue;
      if (!isPlain(v)) { refuse(path, 'shape', `expected a map, got ${JSON.stringify(v)}; the defaults stand`); continue; }
      out[k] = reconcile(v, d, p, refuse);
    } else if (isPlain(v)) {
      out[k] = reconcile(v, null, p, refuse);
    } else {
      out[k] = cloneVal(v);
    }
  }
  return out;
}

// `onRefuse(r)` is called once per dropped declaration leaf with
// r = { path, reason: 'type'|'option'|'shape'|'key', message }; without it
// each drop is one console.warn line. Either way `tune.refusals` keeps them.
export function createTune({ declared, dials = DIALS, source = '', onRefuse = null } = {}) {
  if (declared === undefined || declared === null) declared = {};
  if (!isPlain(declared)) throw new Error('createTune: declared must be a plain object');
  if (onRefuse !== null && typeof onRefuse !== 'function') throw new Error('createTune: onRefuse must be a function');
  checkDials(dials);
  const bools = findBooleans(declared);
  if (bools.length) throw new Error(`createTune: boolean at ${bools[0]}; use an enum with named states`);
  const refusals = [];
  const refuse = (path, reason, message) => {
    const r = Object.freeze({ path, reason, message: `${path}: ${message}` });
    refusals.push(r);
    if (onRefuse) onRefuse(r);
    else if (typeof console !== 'undefined' && console.warn) console.warn(`tune: declared ${r.message}`);
  };
  declared = reconcile(declared, dials, [], refuse);
  Object.freeze(refusals);

  const SHIPPED = deepFreeze(merge(defaultsOf(dials), declared));
  const T = deepClone(SHIPPED);
  const binders = new Map();

  const dotted = (p) => toPath(p).join('.');

  function dialAt(path) {
    const d = getLeaf(dials, path);
    return isDial(d) ? d : null;
  }

  function get(path) { return getLeaf(T, path); }

  function binderFor(path) {
    const p = toPath(path);
    const exact = binders.get(p.join('.'));
    if (exact) return exact;
    for (let i = p.length - 1; i >= 1; i--) {
      const fn = binders.get(p.slice(0, i).join('.') + '.*');
      if (fn) return fn;
    }
    return binders.get('*') || null;
  }

  function bind(pattern, fn) {
    if (typeof pattern !== 'string' || !pattern) throw new Error('bind: pattern must be a non-empty string');
    if (typeof fn !== 'function') throw new Error('bind: fn must be a function');
    binders.set(pattern, fn);
  }

  function entriesOf(patch) {
    if (patch instanceof Map) return Array.from(patch, ([k, v]) => [toPath(k), v]);
    if (!isPlain(patch)) throw new Error('set: patch must be an object or a Map');
    return Object.entries(patch).map(([k, v]) => [toPath(k), v]);
  }

  // THE writer, in two passes. First every accepted leaf lands in T
  // (refusals, in order: unknown, static, film, type, option);
  // reload-class leaves no binder covers are reported as pending. Then
  // each distinct binder runs ONCE, after the whole patch is in T, as
  // fn(firstPath, firstValue, covered) where covered is every [path, value]
  // of this patch it covers, in patch order — a re-apply that reads T sees
  // the whole patch, and one that takes (path, value) sees the first. A
  // binder that throws refuses EVERY leaf it covered ('binder': each value
  // is put back and the error goes to the console) and the rest of the
  // patch still stands — one failing hook may not leave a patch
  // half-applied or turn a {diff, refused, pending} result into an
  // exception.
  function apply(entries, { filmLocked = false } = {}) {
    const refused = [], pending = [];
    const runs = new Map();                       // fn → Map(key → { p, v, before })
    for (const [p, v] of entries) {
      const key = p.join('.');
      if (!hasLeaf(SHIPPED, p)) { refused.push([key, 'unknown']); continue; }
      if (STATIC_PATHS.includes(key)) { refused.push([key, 'static']); continue; }
      const spec = dialAt(p);
      if (spec && spec.cls === 'film' && filmLocked) { refused.push([key, 'film']); continue; }
      if (!typeFits(getLeaf(SHIPPED, p), v)) { refused.push([key, 'type']); continue; }
      if (spec && spec.options && !spec.options.includes(v)) { refused.push([key, 'option']); continue; }
      const before = getLeaf(T, p);
      const moved = !same(before, v);
      setLeaf(T, p, cloneVal(v));
      const fn = binderFor(p);
      if (fn) {
        let run = runs.get(fn);
        if (!run) { run = new Map(); runs.set(fn, run); }
        const prev = run.get(key);                // the same leaf twice in one patch: the first `before` is the real one
        run.set(key, { p, v, before: prev ? prev.before : before });
      } else if (spec && spec.read === 'reload' && moved) pending.push(key);
    }
    for (const [fn, run] of runs) {
      const covered = Array.from(run.values(), (c) => [c.p.join('.'), c.v]);
      try {
        fn(covered[0][0], covered[0][1], covered);
      } catch (e) {
        for (const c of run.values()) {
          setLeaf(T, c.p, cloneVal(c.before));
          refused.push([c.p.join('.'), 'binder']);
        }
        if (typeof console !== 'undefined' && console.error) console.error(`tune: binder for ${covered[0][0]} threw:`, e);
      }
    }
    return { diff: diff(), refused, pending };
  }

  function set(patch, opts = {}) { return apply(entriesOf(patch), opts); }

  function diff() {
    const out = [];
    for (const p of leaves(SHIPPED)) {
      const shipped = getLeaf(SHIPPED, p), live = getLeaf(T, p);
      if (same(shipped, live)) continue;
      const spec = dialAt(p);
      out.push({
        path: p.join('.'), shipped, live,
        cls: spec ? spec.cls : null, read: spec ? spec.read : null,
        declared: hasLeaf(declared, p),
      });
    }
    return out;
  }

  function changes() {
    const out = {};
    for (const d of diff()) out[d.path] = d.live;
    return out;
  }

  function reset(scope = 'all') {
    let root = SHIPPED, prefix = [];
    if (scope !== 'all') {
      prefix = toPath(scope);
      root = getLeaf(SHIPPED, prefix);
      if (root === undefined) return { diff: diff(), refused: [[dotted(prefix), 'unknown']], pending: [] };
    }
    const paths = isPlain(root) ? leaves(root, prefix) : [prefix];
    const entries = [];
    for (const p of paths) {
      const shipped = getLeaf(SHIPPED, p);
      if (!same(shipped, getLeaf(T, p))) entries.push([p, shipped]);
    }
    return apply(entries, { filmLocked: false });
  }

  function exportYaml() {
    if (!source) throw new Error('exportYaml: no source text to patch');
    return patchYaml(source, changes());
  }

  // The "Copy patch" fragment. Nothing changed is an empty fragment (which
  // parses to an empty map), not a root-level `{}`.
  function patchText() {
    const tree = {};
    for (const [k, v] of Object.entries(changes())) setLeaf(tree, k, v);
    return Object.keys(tree).length ? emitYaml(tree) : '';
  }

  function applyPatchText(text, opts = {}) {
    const { tree } = parseYaml(String(text ?? ''));
    const entries = isPlain(tree) ? leaves(tree).map((p) => [p, getLeaf(tree, p)]) : [];
    return apply(entries, opts);
  }

  function sections() { return Object.keys(SHIPPED); }

  return {
    SHIPPED, T, refusals, dialAt, get, set, diff, reset, bind, binderFor,
    changes, exportYaml, patchText, applyPatchText, sections,
  };
}
