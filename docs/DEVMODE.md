# Developer mode

*Status: phase 1 landed, phase 2 landing (2026-09-02) — the Save route (§6)
and the bench: HUD, clock, seeded throw, replay and A/B (§7, §8). Revision 3
is the design as built: the primitives, the wiring, the door, the apply tool
and the proving scenarios (§11; `node tests/e2e/run.mjs --only dev`).
Binding authority is
[GOALPOST.md](GOALPOST.md); every other rule this design touches is guidance,
and §2 says which ones it sets aside.*

*Brief (Joe, 2026-09-02): "dramatically build out the demo section of the
app … think of the app as having a developer mode … a UX for building out
improvements … anyone doing some keyboard shortcut can go into developer
mode (an upgrade from `?demo=1`) … its own UI elements and capabilities … a
lot of the system constants modifiable … all developer mode settings
exportable to a config file … possible for me to actually overwrite a file
in the repo with that file … one option to turn off demo mode in production
… the ability to define dice sets or mats or other assets."*

*Revision 2: "a strong preference toward .yaml … make it a declaration of
the app … goal is STRUCTURE … so long as I don't have to see [a generated
file] … we do need to be able to extract it."*

*Revision 3: "I don't need `?demo=1` once this is implemented … allow
fields to be optional if there is a sane default … avoid boolean values
(always use enums, e.g. `mode: development` or `mode: production`, not
multiple boolean fields)."*

## 1. The pitch

`dice.yaml`, at the repo root, is **the declaration of the app**: one
structured document that says what the table is. Its top-level fields are
the app's nouns, `app`, `table`, `light`, `camera`, `throw`, `pace`,
`sound`, `cards`, `sets`, `felts`, `towers`, `venues`, and every system
constant developer mode can move is a leaf somewhere under one of them.
Every leaf is optional: a leaf you leave out takes the default the code
carries. No leaf is a boolean: a two-state value is an enum with two named
states, and no state is a boolean word (`enabled | disabled`, never
`on | off`, because the reader refuses `on` and `off` as booleans).
Comments are welcome; the file is meant to be read.

Press `` ` `` on any table and a panel folds out of the right edge with
those leaves as dials, grouped the way the file is. Drag one and the scene
moves. The panel diffs your dials against the declaration, and **Save**
rewrites `dice.yaml` touching only the lines whose values changed, adding a
line only for a leaf you changed that the file did not yet name, so
`git diff dice.yaml` is the review and `git commit` is the ship. Nothing
generated is ever on disk: the server parses the declaration at boot and
serves the client the module it needs, in memory.

The same panel is where the demo cast (fake players, region overlay, throw
from any seat) now lives, and where dice sets and mats get defined as rows
under `sets:` and `felts:` in the same file. `app.mode: development` in
the declaration, overridable by `DICE_MODE=production` at deploy time, is
the production switch, left on development for now.

Five separate developer doors existed when this was written (`?demo=1`,
`lab.html`, `chrome-lab.html`, `TOWERLAB` inside main.js, and ~250
`__diceDebug` console hooks). Developer mode becomes the one door; `?demo=1`
was removed in phase 1 and `lab.html` retired in phase D3 (§9), leaving the
chrome lab, TOWERLAB and the hooks.

## 2. Assumptions challenged

| Inherited assumption | Decision |
|---|---|
| **Demo is solo-only** (demo.js header, TESTING.md, argued as a GOALPOST 2 law). | **Replaced by a rule per dial, not per door.** GOALPOST 2 forbids forking the shared film; GOALPOST 7 says framing and pacing may differ per viewer. So each dial is classed **look** (per-viewer: light, fog, camera, pacing, chrome) or **film** (feeds the shared bake: physics, toss, spawn, table geometry). Look dials work at any table. Film dials work while you are the only seat, and lock when a second viewer arrives. |
| **Every plain visit mints a room**, so a solo-only shortcut would refuse on the very tab Joe has open (main.js:159). | Handled by the rule above: a room of one is a table of one. |
| **`?demo=1` must survive** because the harness and the tools/steps scripts ride it. | **Dropped** (Joe, revision 3). The harness boots an ordinary tab and calls `__diceDebug.devOpen()` then `devDeal(n)`; a room of one is all the bench needs. The URL then carries no dev state at all, and the room-mint suppression in the ROOM iife goes with it. |
| **Constants are `const`s beside their consumer** (~120 frozen primitives across 9 files). | The *value* moves to the declaration and its *default* to the dial's entry in code; the *reason* moves to a comment beside the value, or to the dial's `why`. Week one moves the fifteen tune objects that already have re-apply functions (zero consumer edits) plus a few named consts. The rest move one per commit when wanted, not by inventory. |
| **A config file lists every value.** | **Set aside** (Joe, revision 3). Every leaf is optional; the code carries the default. The first commit still writes a full file, because a declaration you can read is the point, but any line may be deleted and the table still stands. |
| **Booleans are values.** | **Set aside** (Joe, revision 3). No leaf is a boolean. `devmode: true` becomes `mode: development`; `preferDice: true` becomes `prefer: dice`. The reader refuses `true`, `false`, `yes`, `no` as scalars, with a line number. |
| **The server injects nothing into the client.** | **Set aside.** The server already owns static serving; it now also serves one generated module built from `dice.yaml`. That is what lets the declaration be YAML with no build step and no generated file on disk, and gives the production switch an env override. |
| **Zero-dep, no build step.** | Kept. YAML needs a reader, so `js/yaml.js` is a small first-party parser and line-patching writer for the subset this file uses (maps, lists, scalars, comments). No npm package. |
| **The URL carries no user state.** | Kept, and strengthened: with `?demo=1` gone there is no dev param at all. The key sets a tab-local boolean; nothing stored, mirrored or stripped. |
| **The demo panel is inline styles, no stylesheet.** | Set aside. `css/dev.css` is injected when the door opens and removed when it shuts; the unpressed tab still loads nothing. |
| **The felt owns zero standing chrome on the right.** | Set aside while open, as an **overlay, not a column**. A rail that resizes the felt makes you judge a frame no player has (GOALPOST 8). Fold hides the panel entirely with values held. |
| **Repo writes are a main-session act.** | Set aside narrowly: Download plus a one-line Node tool in phase 1; an env-armed loopback route on the local server in phase 2. |
| **`DEMO_LIGHT_DIALS`, `DEMO_LIGHT_BASE`, `demoLight`, `resolveDemo`, the inline panel.** | Hard drop. They were the prototype of this. |

## 3. The declaration

```yaml
# dice.yaml — the declaration of the dice table.
#
# Every value here is a shipped default. Every leaf is optional: delete a
# line and the code's default stands. No leaf is a boolean: a two-state
# value is an enum with two named states. Developer mode reads this file,
# shows its leaves as dials, and Save rewrites ONLY the lines whose values
# changed — comments, order and blank lines stay as you wrote them.
# Labels, ranges, defaults and the look/film class of each dial: js/tune.js.

app:
  title: Dice Table
  favicon: 🎲
  mode: development        # development | production  (DICE_MODE overrides at deploy)

table:
  scale: 2.5               # the one dial for table size (Joe 2026-09-01)
  ceilingY: 22
  seats:
    spot: 0.5              # your target, as a fraction of the ring radius
    tossBack: 0.4          # spawn this far behind the spot
    tossHeight: 0.3
    tossSpeed: 0.12
    perDie: 1.5            # spread per die thrown
  cards:
    standoff: 1.2
    width: 2.2

light:
  lamp:
    y: 24
    z: 1.5
    angle: 0.85
    penumbra: 0.75
    intensity: 2.8
    color: "#ffe8c4"       # pool ~27 at the felt over a 13.75 table
  room:
    hemi: 0.1
    key: 1.7
    rim: 0.4
  fog:
    near: 15
    far: 46
  breath: { period: 6, depth: 0.08 }
  motes:  { count: 240, drift: 0.3 }

camera:
  framing:
    spot: 0.35             # disc around each seat's spot the fit must hold
    prefer: dice           # dice | table — what the fit favours when both cannot be held
  zoom:
    near:  { eye: 14, fov: 42 }
    table: { eye: 22, fov: 42 }
    far:   { eye: 30, fov: 42 }

throw:
  physics:
    gravity: -110
    solverIterations: 14
    floor: { friction: 0.6, restitution: 0.15 }
    dice:  { friction: 0.4, restitution: 0.2 }
    wall:  { friction: 0.2, restitution: 0.5 }
    damping: { linear: 0.01, angular: 0.01 }
  spawn: { height: 6, jitter: 0.15 }
  nudge: { strength: 0.3 }

pace:
  tempo:    { k: 1, flight: 0.8, settle: 25 }
  ceremony: { declareS: 1.35, hitstopS: 0.11, dismissMs: 7000 }
  clear:    { afterMs: 12000 }

sound:
  master: 0.8
  impact: { gain: 0.9, spread: 0.2 }

sets:                      # dice sets authored as data (shipped sets stay in themes.js for now)
  house-ember:
    label: Ember
    body: "#4a1d12"
    text: "#ffd9a0"
    accent: "#ff7a30"
    feel: { rough: 0.35, metal: 0.1 }
    geo:  { bevel: 0.09, profile: round }     # round | crisp
    sound: { body: chime, weight: 0.6 }

felts:
  house-moss:
    name: Moss
    cloth: felt            # felt | silt | oak | image  (FELT_CLOTHS)
    feltBase: "#1f3a22"
    sceneBg: "#0c120d"
    breath: 0.9
    mottle: 1
  house-leather:
    name: Leather
    cloth: image                       # the picture comes from the file
    texture: models/mats/leather.png   # under models/, served and deployed
    tile: 1.25                         # world units one repeat covers
    feltBase: "#3a2a1e"                # MULTIPLIES the picture: the tint
    sceneBg: "#14100c"
    breath: 1.1
    mottle: 0.1
    gloss: { mid: 0.9, swing: 0.09 }   # absent = the painter's own row
    sound: { tail: 1.3, grind: 1.2 }   # absent, field by field, likewise
```

**A row id carries no dot** (`house-moss`, not `house.moss` — a narrowing
taken in phase 2, and the example above used to read the other way).
Every path in `js/tune.js`, in `tune.changes()`, on a panel row and in what
the Save route posts is a DOTTED STRING, so an id with a dot in it stops
being one path and becomes two readings of one string, and the flat
`{ path: value }` map the route was built around has nowhere to say which
was meant. `js/yaml.js` is ready for the day this is lifted (`formatKey`
quotes a dotted key; `readKey` refuses an unquoted one), and the day is
when `sets:` arrives, because a dice-set id genuinely carries dots today
(`emberforge.blackanvil`). Until then `ASSET_ID_RE` is the law and a dotted
id is refused with its path.

(Names and numbers above are illustrative; the first commit writes the
real file from the shipped values. Two the sketch got wrong and the file
gets right: `cards:` is a section of its own, not `table.cards` — a name
card belongs to the ring of chairs, not to the mat, and it is the one
section every leaf of which is ⟳ — and `sound.impact` carries `gain`
alone, because the seven contact bodies beside the default one are
authored against its number and a dial over all eight would unsolve them. Sections are the app's nouns; a leaf's
place in the tree is its meaning, so `light.lamp.y` needs no other label.
`towers:` and `venues:` arrive in phase 3 and are simply absent until then,
which is what optional means.)

### Optional leaves, defaults, enums

- **Every leaf is optional.** The dial tree in `js/tune.js` carries each
  leaf's default; the live tree is `defaults ⊕ file`. A leaf absent from
  the file shows in the panel like any other, with a faint *default* mark.
  When you change one, Save inserts the line under its section, in the
  tree's order, two-space indented, and from then on it is a line like any
  other. A whole absent section (`towers:`) is inserted the same way.
- **The file is the authority, the code is the fallback.** After a Save the
  file says 30 and the code still says 24; that is intended. The code's
  number is what stands if you delete the line, nothing more. A dial entry
  with no default fails the drift test; a leaf in the file with no dial
  entry is a typed value with no slider (exported, diffed, reset).
- **No booleans.** A two-state value is an enum whose states say what
  they mean: `mode: development | production`, `prefer: dice | table`,
  `profile: round | crisp`. An enum dial declares its `options`, the panel
  draws a segmented control, and `tuneSet` refuses a value outside the
  list. The reader refuses `true`, `false`, `yes`, `no`; the drift test
  refuses a boolean default.

**The YAML subset**, read and written by `js/yaml.js`: block maps, block
lists, flow maps and lists on one line (`{ a: 1, b: 2 }`, `[1, 2]`), plain
and quoted scalars (number, string, null), `#` comments, blank lines,
two-space indent. Refused with a line number: booleans, anchors, tags,
multi-document, block scalars (`|`, `>`), tabs. This is a few hundred lines
and a unit test, not a YAML library. The reader records the line and column
of every scalar so the writer can patch in place, and the line after each
section's last child so it can insert.

## 4. Structure

### Files

| Path | Role |
|---|---|
| `dice.yaml` | **New, checked in, hand-editable.** The declaration. The file Save rewrites. |
| `js/yaml.js` | **New, Node-pure.** `parseYaml(text)` → `{ tree, spans }`; `patchYaml(text, spans, changes)` → text with only changed scalar lines rewritten and absent leaves inserted; `emitYaml(tree)` for a fresh subtree. Shared by browser, server and tests. |
| `js/tune.js` | **New, Node-pure.** `DIALS` (metadata and defaults, mirroring the tree), `SHIPPED` (defaults ⊕ file), `T` (the live tree), `bindDial`, `tuneSet / tuneDiff / tuneReset`. No DOM, no three, no cannon. |
| `js/tunables.js` | **Generated, never on disk.** `GET /js/tunables.js` is served by `server.js` from `dice.yaml` as `export const DECLARED = {…};`, ETag from the YAML's hash, re-read when the file's mtime changes locally. Added to `.gitignore` so a stray build can never commit it. |
| `js/devmode.js` | **New.** The panel. Dynamic `import()` only when the door opens. |
| `css/dev.css` | **New.** Panel styles on the existing tokens. Injected on open, removed on shut. |
| `tools/dice-apply.mjs` | **New.** `node tools/dice-apply.mjs ~/Downloads/dice.yaml` validates against the dial tree, patches the checkout's `dice.yaml` line by line, writes atomically, prints the diff summary. Shared validator with the phase-2 route. |
| `js/main.js` | Tune objects aliased into `T`; `bindDial` beside each re-apply; `const DEMO` and the `?demo=` read and the room-mint suppression removed; `devState`; backtick in the global key switch; hooks. |
| `js/demo.js` | `resolveDemo` removed; `dealDemo` and the arrival sweep stay as the cast's logic. |
| `server.js` | Parses `dice.yaml` at boot; serves the generated module; honours `DICE_MODE`. Phase 2: `POST /api/dev/write`, mounted only under `DICE_DEV_WRITE=1`. |

### Loading

`server.js` reads `dice.yaml` once at boot with `js/yaml.js`, and again
whenever its mtime changes (locally, a hand edit is live on the next
reload). It serves `GET /js/tunables.js` as a module whose body is the
parsed tree as JSON, with the same `no-cache` plus content-hash ETag the
other `js/` files get. `js/tune.js` imports that module and merges it over
the defaults, so the whole client module graph waits on nothing: no fetch,
no top-level await (there is none in the codebase today and this adds
none), no race with the ~85 module-evaluation consumers. Node tests never
touch the server: they read `dice.yaml` with `fs` and build `T` through
the same `js/tune.js`.

Why not have the client fetch `dice.yaml` itself: it would need top-level
await before every module evaluates, adding one serial round trip to every
boot including the harness's hundreds, and the production switch would
have no place to be overridden. The server already owns static serving.

### The door

- **Key:** unmodified backtick, matched on `e.code === 'Backquote'` (so
  it works on layouts where `e.key` is `Dead`), added to the global key
  switch beside `?`. It inherits the existing guards: not while typing, not
  under a modal, no repeat. A chord was rejected: `Ctrl/Cmd+Shift+D` is
  Chrome's bookmark-all-tabs, and main.js reserves `Ctrl/Cmd+K` as the one
  allowed chord.
- **Second press folds** the panel: hidden entirely, every value held, one
  corner glyph reading `DEV · 3 changed`. Esc inside the panel folds too.
- **Shut** (a button) resets every dial to shipped, clears the cast, removes
  the stylesheet. After Shut the tab measures identical to a tab that never
  opened the door; that is the `dev-door-shut` test.
- **The harness door** is the hook: `__diceDebug.devOpen()` after an
  ordinary boot, then `devDeal(n)` for the cast. `ctx.demoTab` in
  harness.mjs becomes `ctx.devTab`, which does exactly that. The
  tools/steps scripts (`place-view`, `ring-look`, `place-card`) move to it
  in the same commit. No URL param.
- **Cheat sheet:** the `?` overlay gains one row, `` ` `` developer mode,
  hidden in production mode.

### The film lock

`devState = { panel: 'shut' | 'open' | 'folded', film: 'live' | 'locked' }`.
Film dials and the cast are live when `placeRows().length <= 1`. When a
second seat appears in the roster, film values reset to shipped, the cast
is cleared, and the rows show ▲ with one line: *a second viewer is here;
film values are shared.* When the seat leaves, the rows unlock. Look dials
never lock.

### The production switch

`app.mode` in `dice.yaml`, `development` or `production`, and `DICE_MODE`
in the environment. The server applies the env override when it serves the
generated module, so production can be switched with one
`--update-env-vars` and no commit, and back the same way. In production
mode the key does nothing, `devmode.js` is never imported, and every
mutating `dev*` / `tune*` hook returns null. `app.mode` is **not a dial**:
no panel control writes it, `tune.set` refuses it by name (`STATIC_PATHS`
in `js/tune.js`, reason `static`, so the console, the Paste box and a reset
are all refused at the one writer), and the line-patching Save only
rewrites lines a dial changed, so a Save from a running dev session can never flip it. It
is a lock, not a boundary: `__diceDebug.moodTune` stays on the console as
it does today, and that is enough because developer mode can only affect
the tab that opened it.

**ABSENT, NOT JUST OFF** (built 2026-09-03, phase D3). `.gcloudignore` names
`js/devmode.js`, `js/devui.js`, `css/dev.css` and — since the pop-out landed
in D5 — `dev.html`, so the deployed image does not carry the panel at all —
`tools/` was already excluded, and `tools/devshell.html` goes with it. That is the SECOND answer, and it is the
one that does not depend on a value in a file: `app.mode` is a line somebody
can edit, an upload is bytes that are not there.

The two answers are independent, and the build may disagree with the
declaration — a fork's deploy, a hand rsync, a `.gcloudignore` that grew a
line — so the door has to survive a build that says `development` and does
not have the panel. It does: `devOpen` catches the dynamic import's failure,
**latches** (`devAbsent`), returns null, and prints ONE `console.warn`, so a
second backtick makes no second request and no second line. The tree is
untouched by any of this — `tuneSet` still moves the lamp, because the
declaration is what the app is configured by and the panel is only a way to
turn its knobs. `dev-absent-in-prod` (tag `dev`) boots a tab from a tree with
exactly those four files deleted and asserts each clause — `/dev.html`'s own
404 included, because the happy half of `tests/static-cache.test.mjs` asserts
it IS served locally and a line re-added to the upload would otherwise be
invisible to the whole suite (the D5 review, 2026-09-03).

## 5. The tunables registry

Values are `dice.yaml`. Metadata and defaults are `DIALS` in `js/tune.js`,
a tree of the same shape as the declaration, so a leaf and its dial sit at
the same path in both:

```js
// js/tune.js
const look = (label, def, range, read, why = '') => ({ label, def, range, cls: 'look', read, why });
const film = (label, def, range, read, why = '') => ({ label, def, range, cls: 'film', read, why });
const pick = (label, def, options, cls, read, why = '') => ({ label, def, options, cls, read, why });

export const DIALS = {
  app: { mode: pick('mode', 'development', ['development', 'production'], 'look', 'reload') },
  table: {
    scale: film('table scale', 2.5, [1, 4, 0.05], 'apply', 'the one dial for table size'),
    seats: { spot: film('target', 0.5, [0.2, 0.9, 0.01], 'roll'),
             tossHeight: film('toss height', 0.3, [0, 2, 0.05], 'roll') },
  },
  light: {
    lamp: { y: look('lamp height', 24, [5, 80, 0.5], 'apply'),
            angle: look('lamp cone', 0.85, [0.2, 1.4, 0.01], 'apply'),
            color: look('lamp colour', '#ffe8c4', null, 'apply') },          // '#…' string → colour input
    room: { hemi: look('room light', 0.1, [0, 1, 0.01], 'apply') },
    fog:  { far: look('fog far', 46, [10, 120, 1], 'apply') },
  },
  camera: { framing: { prefer: pick('prefer', 'dice', ['dice', 'table'], 'look', 'frame') } },
  throw:  { physics: { gravity: film('gravity', -110, [-300, -20, 1], 'apply') } },
  pace:   { tempo: { k: look('tempo', 1, [0.25, 4, 0.05], 'frame', 'playback speed, never the bake') },
            ceremony: { declareS: look('declare dwell', 1.35, [0, 4, 0.05], 'reload', 'read once at boot') } },
};
```

- `def` is the default that stands when the file omits the leaf. `SHIPPED`
  is `defaults ⊕ DECLARED`; `T` starts as a clone of it.
- `cls` is **look** or **film** (§4). `tuneSet` refuses a film write while
  the film is locked.
- `read` says when a value lands: `frame` (read every tick, live for
  free), `roll` (next roll), `apply` (a binder calls an existing re-apply
  function), `reload` (read once at module evaluation; the row shows ⟳ and
  *Save & reload* is the verb).
- Ranges are the slider's, not the law's: the number field beside every
  slider takes any finite value, because "the range was wrong" is a thing
  developer mode exists to discover. Type is the law, and for an enum the
  option list is the law.
- **And where a range genuinely is not enough, a `law` is** (phase D4,
  js/tune.js `LAWS`). Two kinds of value are not "any finite number": one the
  code DIVIDES BY (`pace.tempo.k` gates the impact drain on
  `IMPACT_MIN_GAP_MS / k`, so 0 silences every landing and −1 runs the
  projector backwards — `law: 'positive'`, refused `range-law`), and one that
  has to hold against ANOTHER leaf (`cards.standoff − cards.depth / 2` is the
  clear ground that licenses a card's depthWrite, its real shadow and the
  seating raycast — `law: 'cardClear'`, refused `geometry`). A law is judged
  at every door the value can arrive through: `tune.set`, the declaration at
  birth (`createTune`), `tools/dice-apply.mjs` and the armed Save route. A
  PAIR law reads the whole patch rather than one leaf, so the two halves of
  `{ standoff: 2, depth: 3.9 }` are judged together and not in whichever order
  `Object.entries` handed them over; and where the pair fails in the FILE, the
  whole group goes back to the code's defaults, which hold by construction.
  Sliders never offer a value a law refuses — the `cards` ranges were clamped
  so the worst pair they can reach is exactly zero clear ground — because a
  refusal in the middle of a drag is a refusal nobody asked for.
- **What "every door" cost to actually mean** (the D4 review, 2026-09-03).
  Three of the doors were ajar, each in the same shape: a judge that could
  only see one leaf at a time.
  - The armed Save route posts a FLAT patch, and `validateChanges` ran
    `judgeValue`, which skips pair laws by design. So a tab that named one
    half of a pair — two dev tabs, or a checkout edited after the tab booted
    — wrote a file the next boot refused WHOLE, taking the checkout's own
    line back to the default with it. The route judges the file it *would
    write*: the posted patch merged onto the checkout it holds
    (`validateChanges(changes, { base })`, js/dice-apply-core.js).
  - A preset row is a sparse subtree of the dial tree, so its leaves are the
    app's own leaves and answer the app's own laws — judged inside the row
    (its other half, or the dial's default where the row is silent), by
    `createTune`, `addRow`, `tune.set`, `validate` and the route alike
    (js/tune.js `lawScopes`). A preset may not name a STATIC leaf either:
    `presets.dusk.app.mode` is a row whose Apply could only ever be refused.
  - And a pair goes back TOGETHER. A revert of one half was judged against
    the half still standing, so a typed value had no way home from either
    `tune.reset` or the panel's ↺; both widen a scope that names one leaf of
    a group to the whole group (`tune.lawMates`), which is the widening the
    birth check already did and is legal by the same argument.

```js
// js/tune.js
import { DECLARED } from './tunables.js';          // the generated module (in the browser)
export const SHIPPED = deepFreeze(merge(defaultsOf(DIALS), DECLARED));
export const T = structuredClone(SHIPPED);          // the live tree every consumer reads
const binders = new Map();                          // 'light.lamp.*' | 'table.scale' → fn
export function bindDial(pattern, apply) { binders.set(pattern, apply); }

export function tuneSet(patch) {                    // THE writer: panel, hooks and paste all come through here
  const ran = new Set(), refused = [], pending = [];
  for (const [path, v] of Object.entries(patch)) {  // path = 'light.lamp.y'
    const spec = dialAt(path);
    if (!leafExists(SHIPPED, path))                    { refused.push([path, 'unknown']); continue; }
    if (spec?.cls === 'film' && filmLocked())          { refused.push([path, 'film']);    continue; }
    if (typeof v !== typeof leaf(SHIPPED, path))       { refused.push([path, 'type']);    continue; }
    if (spec?.options && !spec.options.includes(v))    { refused.push([path, 'option']);  continue; }
    setLeaf(T, path, v);
    const fn = binderFor(path);                   // exact, then a.b.* then a.* then *
    if (fn && !ran.has(fn)) { ran.add(fn); fn(path, v); }
    else if (spec?.read === 'reload') pending.push(path);
  }
  return { diff: tuneDiff(), refused, pending };
}
```

### How a constant becomes tunable

**(a) A tune object that already has a re-apply: one line changed, one
added.** This is the whole of week one. `MOOD.tune`, `MOOD.moteTune`,
`BREATH`, `TOWERLIGHT.tune`, `LIFE_TUNE`, `FRAMING`, `PHYS`, `DAMPGATE`,
`SLEEP`, `SPAWN`, `NUDGE`, `TEMPO`, `SETTLEGATE`, `CLICKGATE`, `PLACE_AIM`:
fifteen objects, about ninety leaves, zero consumer edits, and every
existing `__diceDebug.set*` hook keeps working because the object identity
is preserved. Where the declaration's shape is nicer than the object's
(`light.lamp.y` rather than `MOOD.tune.lampY`), the alias is a one-line
view. Any boolean these objects hold today (`FRAMING.preferDice`) becomes an
enum at the same time, at its read sites.

```js
const MOOD = { on: true, lamp: null, base: {…}, tune: T.light.lampFlat };   // was a literal
bindDial('light.*', () => applyMoodLights());
```

**(b) A frozen primitive with a re-apply somewhere: the const reads `T`, a
binder calls the existing function.**

```js
const TABLE_SCALE = T.table.scale;
bindDial('table.scale', (_, s) => queueZoom(() => { rewriteZoomPresets(s); applyZoom(currentZoom); }));
```

`applyZoom` already moves the walls in place, re-derives the shadow
frustum, fog floor, camera fit, tower socket and placard relay. It
unsockets the tower and is gated by the roll-boundary queue, so the row is
a stepper that commits on release and reads "applies when the table is
quiet". Same shape for gravity, camera FOV, light colours, bloom threshold.

**(c) A frozen primitive read once with no re-apply: only the declaration
changes; the row is reload-class by construction.**

```js
const CEREMONY_DECLARE_S = T.pace.ceremony.declareS;   // four read sites untouched
```

The change lands in the export and *Save & reload* applies it, because `T`
is built from the declaration before any module reads it. When a
`rebuildFloor()` or `rebuildDice()` exists later, one `bindDial` promotes
the row to live.

**Shared with the server.** `places.js` is imported by `server.js`, and its
toss constants (`RING_SPOT`, `TOSS_*`, `PLACARD_*`) are exactly the kind of
thing that belongs under `table.seats` in the declaration. Because the
server reads `dice.yaml` too, phase 2 lets `places.js` take those values
from the parsed tree on both sides, so one edit moves the client's toss and
the server's stamp together. Phase 1 leaves them as constants.

**Not in the tree, on purpose:** `FIXED_DT`, the RNG, `AIM_ZERO`,
`PLACE_MAX` and `MAX_PHYSICAL_DICE` (wire limits), copy strings.

**Venues:** the fae venue `Object.assign`s the mood tune wholesale at
moonrise and restores it on exit. Phase 1: while a venue is active, `light`
rows carry a **venue** badge and Save refuses the section with one line.
Phase 2: the venue's light becomes `venues.<id>.light` in the declaration,
composed through `tuneSet`.

## 6. Export, diff, and the repo round trip

**Save rewrites only what changed.** `parseYaml` records a span for every
scalar (line, column, raw text) and an insertion point for every map.
`patchYaml(text, spans, changes)` replaces the raw text of each changed
scalar on its own line, inserts a line for a changed leaf the file did not
name, and leaves every other byte alone: comments, blank lines, key order,
quoting style. So the export of an unchanged tree is the file itself, byte
for byte (a unit test), and after a dial moves `git diff dice.yaml` is
exactly the lines that moved or arrived, with their comments still beside
them. A new row (a set, a felt) is emitted with `emitYaml` and appended
under its section.

**Three ways out of the browser:**

1. **Download** (phase 1): the patched file, then
   `node tools/dice-apply.mjs ~/Downloads/dice.yaml` validates it against
   the dial tree, re-patches the checkout's own file (so a comment you
   added locally in the meantime survives), writes atomically and prints
   the diff summary.
2. **Save** — *built, 2026-09-02 (phase C1)*:
   `POST /api/dev/write { file: 'dice.yaml', changes: { 'light.lamp.y': 30 } }`.
   The client posts the *changes*; the server patches its own copy of the
   file with the same `patchYaml`. Nothing posted is ever written verbatim.
   Mounted only under `DICE_DEV_WRITE=1` (which `make deploy` never sets —
   DEPLOY.md), and unarmed the two paths are **not mounted at all**: they
   fall through to the ordinary `/api/` 404, so an unarmed server does not
   even admit the route exists. Armed, `GET /api/dev/status` answers
   `{ armed: true, file: 'dice.yaml' }` and the panel's primary verb becomes
   *Save*; unarmed it stays *Download*, and Download stays available under
   Save either way.

   Every one of these is required, and a failure is a 403 carrying one word:
   the **socket** address is loopback (`loopback` — a header could be a
   client's opinion, and this is the one door where that must not open it),
   the POST's `Origin` is this server's own **and the `Host` it names is
   itself a loopback name** (`origin`, which also refuses a POST with no
   Origin at all — and the second half is what refuses a DNS-rebinding page,
   whose `Host` and `Origin` agree on a foreign name pointing at 127.0.0.1
   and so satisfied equality alone until the C1 review caught it),
   `Sec-Fetch-Site` is `same-origin` when sent
   (`site`), and `Content-Type` is `application/json` (`type`, so a
   cross-origin form's `text/plain` is never a body this reads). A body over
   1 MiB is a 413 (`large`) before it is buffered. `file` is checked against
   a frozen allowlist of one; the write lands under `DICE_DEV_ROOT` (the
   directory `server.js` lives in unless the environment names another,
   which is how the tests get a scratch tree); every path is validated
   against the dial tree by the same `js/dice-apply-core.js` that
   `tools/dice-apply.mjs` runs, and `app.mode` and every other static path
   are refused by name with a 400. The write is atomic (sibling temp file,
   then rename) and answers `{ ok, bytes, sha1, changes: [{path, from, to}] }`.
   The served `js/tunables.js` is re-read on mtime — and the bytes that
   landed are adopted immediately, so a reload in the same millisecond still
   boots on them — which the answer's `note` says out loud, because a dial's
   *value* is on the next boot, not on this frame.

   Two refusals live on the client side of the verb: **a venue's light is not
   this tab's to save** (while `FAECONCEPT.on` holds the light, `MOOD.tune`
   carries the glade's moon and a Save would write the venue's sky into the
   table's lamp — so the rows `venueLightPatch()` names, and only those, are
   dropped from the patch and the panel says how many rows were held; a light
   row no venue holds, such as `light.motes.*`, saves as any other row does),
   and the film lock is upstream of all of it because a locked film leaf was
   never allowed to change.

   The one log line a write makes is `bytes` and `sha1` — never the text,
   never a path beyond the allowlisted filename.

   Proofs: `tests/dev-write.test.mjs` (unarmed 404s, the four conditions one
   wrong thing at a time, the rebinding shape through raw `node:http`, the
   allowlist, `app.mode`, unknown paths, wrong types, enums, two writes at
   once, `isLoopback` as a predicate) and the `dev-write-route` scenario (the
   panel's Save clicked through the DOM against a scratch tree, exactly two
   lines moved with their comments, a fresh tab from that server booting on
   them, and a leg under a raised venue where the held light rows are dropped
   while a motes row and a pace row still land).
3. **Copy patch** (phase 1): clipboard, changes only, as a YAML fragment
   (`light: { lamp: { y: 30 } }`), for a phone, another tab, or a commit
   message. **Paste patch** previews then merges, never replaces.

**Diff vs shipped.** The File section lists every changed path as
`path · shipped → live · class` with per-row revert, per-section reset and
reset-all, and below it the line diff of the patched file.

**Versioning.** `app.version` is an integer, optional, default 1. A patch
of another version is offered as a download before it is dropped, never
silently. Bumping it is a deliberate act in the commit that renames or
removes a key; unknown paths in a patch are dropped per path with one
console line each.

**No localStorage draft in phase 1.** Three critics found it the most
complex piece and the least needed: it leaks across e2e scenarios on one
origin and would be the only path by which a stored blob feeds film values
into a tab at boot. The file is the transport.

## 7. UI

Desktop: a fixed overlay at the right edge, 320px wide, z-index below the
modal layer so Settings still disables it honestly. The panel stops key
propagation (today's demo panel leaks `c` from a focused button and clears
the table), handles its own Esc, and is not in the app's Esc chain, so `r`,
`c` and digits stay live while dialing.

```
┌──────────────────────── felt (the player's frame, untouched) ────────────────┐
│                                                     ┌─ DEV ──────── ` fold ─┐│
│                                                     │ table light camera    ││
│                                                     │ throw pace sound      ││
│                                                     │ cast felts clock ab   ││
│                                                     │ file                  ││
│                                                     │ find a dial ________  ││
│                                                     │───────────────────────││
│                                                     │ LIGHT · 3 changed  ↺  ││
│                                                     │ lamp                  ││
│                                                     │   height   ━━━●━━  30 ││
│                                                     │   cone     ━━●━━  .85 ││
│                                                     │   colour  [■ #ffe8c4] ││
│                                                     │ room                  ││
│                                                     │   hemi     ━●━━━  .10 ││
│                                                     │ fog                   ││
│                                                     │   far      ━━━●━━  46 ││
│                                                     │ ▸ breath  ▸ motes     ││
│                                                     │───────────────────────││
│                                                     │ CAMERA                ││
│                                                     │ framing               ││
│                                                     │   prefer  [dice|table]││
│                                                     │───────────────────────││
│                                                     │ THROW · film ▲ locked ││
│                                                     │ physics               ││
│                                                     │   gravity ━━━●━━ -110 ││
│                                                     │ table scale ⟳ [2.5] ▴▾││
│                                                     │───────────────────────││
│                                                     │ 1600×900 @1 · 41 fps  ││
│                                                     │ 5 changed · 1 reload  ││
│                                                     │ [Save] [Copy] [Reset] ││
│                                                     │ [Shut]                ││
│                                                     └───────────────────────┘│
│   folded: one glyph top-right reads  DEV · 5 changed  and nothing else       │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Sections are the declaration's top-level keys**, and the panel's
  sub-headings are its nested maps, so the panel *is* the file, drawn.
  **Find** filters by label or path; a hundred dials need it more than tabs
  do.
- **Rows** are generated from the dial tree: number → range plus a
  typeable value; `#rrggbb` → colour input; enum → segmented control; a
  leaf with no dial → a plain typeable value. A changed row gets a dot and
  a hover revert; a leaf the file omits gets a faint *default* mark; film
  rows ▲ when locked; reload rows ⟳ with a stepper. There is no switch
  control, because there is no boolean.
- **Cast** is today's demo rows verbatim: players 0–8, reshuffle, sit
  prev/next, **overlay** (`disabled | regions | framing | all` — phase 2,
  built; one enum, because "regions on, framing off" and its opposite are the
  two questions actually asked and a pair of switches would have offered four
  states to answer two of them), throw from seat, throw from
  every seat — and, under them, the **bench** (phase 2, built): a seed box, a
  Throw and a Replay. A blank box draws a fresh seed and then SHOWS it, so the
  next press is a repeat rather than a second stranger; a word is hashed, so
  `moss` is a seed you can write down. Replay rethrows the last seed under the
  dials as they now stand, with the whole roll rebuilt from its SPEC — pool,
  mods, dc and the `# comment` — and not from the log label; a bench throw
  comes back face for face, any other roll as the same film with fresh faces
  (§10).
- **Clock** (phase 2, built) — `freeze: running | frozen`, a step button that
  advances exactly one baked frame **while frozen** (`devStep()` refuses on a
  running clock, as the button has always been disabled there: stepping a
  clock that is already advancing puts the film one frame ahead of where the
  clock says it is), and a scrub over the running film's keyframes. It is a **look**-class instrument and it is deliberately NOT
  behind the film lock: the film is baked and playback is per viewer
  (GOALPOST 7), so a frozen projector here cannot desync anybody. Fold keeps
  the freeze and the corner glyph reads `DEV · frozen`; Shut releases it — and
  releases only a freeze the panel itself asked for, because
  `__diceDebug.holdClock` is the scenarios' own and predates this by months.
  The scrub moves the projector rather than previewing over it (posing the
  meshes alone was tried: the next tick painted over it, held clock and all),
  and it walks the impact cursor past what it skipped WITHOUT voicing it — the
  drain is a one-way cursor by construction and a scrub that re-stamped a
  landing would be a picture of something that never happened.
- **A/B** (phase 2, built) — two slots, `Hold A` / `Hold B` capturing
  `tune.changes()` **minus the light a venue holds** (the glade's moon shows
  in `tuneDiff` while it stands, and a slot that captured it would write the
  sky onto the table's own lamp when applied — the same drop Save makes),
  `A` / `B` putting one on, and `x` inside the panel flipping between them. The flip replays the last seed **exactly when** the
  two patches differ on a film-class path: a felt that re-threw itself under a
  lamp change would be a picture of two different things at once, and a lamp
  comparison whose dice moved is not a comparison. One status line says which
  slot is live, what the next flip will do, and whether the last one replayed
  — and "live" is a MEASUREMENT, not a memory: dial one slider off a slot and
  the line stops naming it, because the panel's only remembered state must
  never tell a story about the tree.
- **Overlay** (phase 2, built) — the cast's row, grown from two states to
  four. `regions` is the layer that shipped with the cast: each occupied
  station's landing region, aim box, spawn line and number, in its own hue.
  `framing` is the second picture, and it answers the other question — not
  *where may a die land* but *what is the camera obliged to hold, and what is
  the room doing to it*: the **fit hull** (`framingPoints()`'s own point set,
  each point ticked, the convex loop closed round them, a cross at the centre
  the fit aims at), the **frame disc** per seat (`ringRadius × FRAME_SPOT` —
  wider than the toss spot, deliberately: the spot is where dice are aimed,
  the disc is where they may roll and stay in shot), the **footprint** of
  every card that STANDS (js/places.js `placardFootprint`, the same OBB
  `placardGap` separates two cards with — and a table of one stands none, so
  it draws none: the layer rides `placardRebuild`'s own gate rather than the
  roster), the **lamp's cone** where it meets the felt (taken off `MOOD.lamp`
  itself — breath-narrowed, orbit-swung — so it is the lamp lighting the
  table, not the one the file asked for; nothing is drawn for a cone that
  never reaches the felt, nor for one so wide the pool swallows the room —
  the shipped lamp's pool is already wider than the felt, and at the ends of
  its own ranges it is hundreds of table-widths across, so the mark is bounded
  to twice the room and `framing.lamp.fit` says which of `inside`, `clipped`,
  `covers` and `missed` this is), and the **four walls** as lines,
  read off the physics bodies, so a socketed tower's shifted back wall reads
  as the shifted wall it is. `all` draws both.

  Every mark is a function the film itself calls; none is a second copy of
  the arithmetic, which is the only property that makes the picture worth
  trusting. It is **render-only**: one `LineSegments` per kind (five draw
  calls however many chairs stand), `depthWrite: false`, renderOrder 9, zero
  bodies, and `disabled` is no geometry at all rather than `visible = false`.
  It is rebuilt wholesale on the flush the cards ride and on the `table.*`,
  `light.lamp.*` and `camera.*` binders, so a dial moves the picture with
  nobody asking. `dev-framing-overlay` holds all of it against the film's own
  answers.
- **Presets** (phase D4, built) — the A/B slots, written down. `Hold as
  preset` captures the dials as they now stand into a row under `presets:`,
  `Apply` merges one back, `Remove` takes it away, and Save puts it in the
  file, so "the light I liked on Tuesday" outlives the tab. It is the one
  section with NO FORM, and deliberately: a preset's fields ARE the panel's
  other sections, so what belongs here is a list and three verbs. Three
  things it does that read as decisions rather than details:
  - **Apply is a PASTE**, refused exactly where a paste is. At a shared table
    the look rows land and the film rows come back refused by name on the
    status line, so the button stays live under the lock — a preset is not
    all-or-nothing the way a felt is, and disabling it would hide the half
    that still works.
  - **Hold drops the sky and drops rows.** The venue's light goes, the same
    drop Save and the A/B slots make (`devSlotPatch` — a preset that captured
    the glade's moon would write it onto the table's own lamp the next time it
    was applied), and so does any `felts:` / `houses:` leaf: an asset is a ROW
    and a preset that carried one would be a second copy of it under another
    name. Clone is the verb that copies a row.
  - **A preset of nothing is refused by name.** `changes()` and `diff()` speak
    in LEAVES, so an empty row has none: Save would write no line for it and
    the panel would list a preset the file could never come to hold.
- **Footer:** the judged viewport and DPR (so a screenshot says what it
  measured), then the HUD — fps and draw calls on one line, triangles, physics
  bodies and the last film's settle seconds on the next (phase 2, built) —
  then the changed and pending counts, then the verbs.
- **Sync:** the panel holds no state. It repaints from `T` after every
  `tuneSet` and once per animation tick while open, so console
  `moodTune(...)` writes and slider writes converge without wrapping hooks.
- **Phone** (phase D5, built) — under 640px OR on a coarse pointer the panel
  stops being a column and becomes a **bottom sheet**: full width, `45dvh`
  tall, folded by default, one section at a time, 44px rows, and a STEPPER
  wherever the desktop draws a slider. One media query, read in two places
  that have to agree — css/dev.css for the dress, `DEV_PHONE_QUERY` in
  js/devmode.js for the two things a stylesheet cannot do (start folded,
  change the control kind). Three decisions worth the words:
  - **A slider is a mouse control.** A 4px thumb dragged with a fingertip is a
    control that cannot hit a value, and hitting values is the panel's whole
    job — so a range dial becomes ± the dial's own step with the typeable
    number between them. Same commit path, same refusals, no drag the page
    would rather read as a scroll.
  - **The chrome had to earn its pixels.** Measured at 390×844 the first cut
    gave the scroller 82 of the sheet's 380px — two rows of a panel that is
    rows. The find box moved up beside the title (the panel's children become
    a grid), the section bar scrolls sideways instead of wrapping, and the
    footer's three lines flow as one block, which leaves ~180px: four rows and
    a fifth in reach. The 44px floor was not touched to get there.
  - **The sheet is opaque, and the card is not.** `--surface-card` is 94%, and
    the 6% coming through under the dials was the roll log's own white rows.
    A card floating over the felt is meant to let a little of it through; a
    sheet that owns the bottom of the screen is not.
  - *(The pre-D5 phone loop — dial on the desktop → Save → reload on the phone,
    or Copy patch → Paste — still works and is still right for a long session;
    the sheet is for the change you want to make while looking at the phone.)*
- **Recorder** (phase D5, built) — `devRecord('start' | 'stop')` writes down
  every `tune.set` patch, cast deal and seeded throw, and **Download step** in
  the file section emits a `tools/steps/<name>.mjs` skeleton of them. It is a
  LISTENER, not a wrapper: it arms `tune.watch`, so a dial that moved is in the
  step whatever door it came through — a slider, `tuneSet` from the console, a
  preset Apply, an A/B flip. And it is a DOWNLOAD, never the armed route: a
  step is CODE, and the route is safe precisely because it writes one file and
  validates every byte of it against the dial tree.
  - **A CLONE IS AN OP** (the D5 review, 2026-09-03). `tune.set` refuses a
    field of a row that is not there — the row is the unit — so a reel that
    heard only `set` events had to drop every recipe edit of a set the session
    had just authored, and the whole of a sets-editing session emitted a step
    that reproduced none of it. `tune.watch` fires `addRow`/`removeRow` too;
    the reel writes the row down WHOLE at the moment it landed, and the step
    replays it through `devRowAdd(where, id, row)` / `devRowRemove(where, id)`
    — `tune.addRow`'s own signature, and the one door a step needs that the
    editors' own verbs are the wrong shape for. A field the reel still cannot
    carry (a row that was there before Record was pressed and that `dice.yaml`
    has never heard of) comes out as a `// note ·` line in the file, naming the
    paths; a reel of nothing but notes emits them rather than the "nothing was
    recorded" skeleton, because the notes ARE the answer to why it is empty.
- **Pop-out** (phase D5, built) — `dev.html`, the panel in its own window on a
  second monitor, opened by the file section's **Pop out**. It mounts THE SAME
  `js/devmode.js` panel over a MIRROR of the table tab's tune, on a
  `BroadcastChannel` — origin-scoped by construction, so it is not a network,
  reaches no other viewer and cannot leave the browser (GOALPOST 2, 4). **The
  table tab is the only writer**, and everything follows from it: one tune in
  the world, so a value can never be two things at once; the mirror's `set`
  posts and the table's next snapshot is the truth, so a refused write comes
  straight back by name; and closing either window is one side of a channel
  going quiet. What does NOT travel is the cast, the bench, the clock, the A/B
  slots and the three asset editors: every one of them is an instrument aimed
  AT THE FELT, and an instrument whose picture is on the other screen is a
  worse instrument, not a portable one.
  - **ONE TABLE, LATCHED** (the D5 review, 2026-09-03). A `BroadcastChannel`
    is origin-scoped, and an origin is not a tab: with two table tabs open —
    the ordinary local two-player test — the window heard both, one `set` moved
    BOTH lamps, and the mirror then drew the two trees alternately at about
    1 Hz with nothing on screen to say which felt was being dialled. So every
    table stamps its messages with its own id, the window keeps the FIRST it
    hears, everything it says after that is addressed, and a table that is not
    the addressee stays quiet. While the link is dead the hello goes out
    unaddressed again, which is how the window re-homes after its own tab goes.
  - **AND IT IS A WINDOW, NOT A PHONE.** **Pop out** opened at 420px, which is
    inside the phone query, so a second-monitor panel arrived in the sheet
    dress — every slider a stepper, and the `file` section clipped off a bar
    that scrolls sideways without saying so. The sheet exists because a felt is
    behind the panel, and here there is none: the window opens at 700×940
    (published on `devInfo().popout`, so the tested configuration is the
    shipped one) and mounts with `phone: 'never'`, with dev.html's own stylesheet
    undoing the grid and the `nowrap` bar. The 44px touch sizing stays.
  - **AND A ROW MAY NOT LIE.** The mirror's write is optimistic because the
    table's next snapshot corrects it a beat later; with no table there is no
    snapshot, so a drag left the row showing a value nobody held. The panel
    locks the moment the link goes stale and the mirror refuses the write by
    name ('gone').

## 8. Capabilities

| Capability | What it does | Phase | Size |
|---|---|---|---|
| `dice.yaml` + `js/yaml.js` | the declaration; parser with spans and insertion points, line-patching writer, emitter; unit tests | 1 | M |
| Served module | `GET /js/tunables.js` generated from the declaration; mtime re-read; `DICE_MODE` override | 1 | S |
| `js/tune.js` | dial tree with defaults, `SHIPPED`/`T`, `bindDial`, `tuneSet/Diff/Reset`, enum and type refusals | 1 | M |
| Key door, fold, Shut | backtick on any tab; fold holds values; Shut resets and removes | 1 | S |
| Film lock | film dials and cast live at a table of one; reset and lock when a second seat appears | 1 | S |
| `?demo=1` removed | the harness and tools/steps move to `devOpen()` + `devDeal(n)`; the room-mint suppression goes | 1 | S |
| `app.mode` switch | `development | production`, env override; hides the cheat-sheet row; never a dial | 1 | S |
| Fifteen tune objects bound | light, camera, throw, pace sections; ~90 leaves; zero consumer edits; their booleans become enums | 1 | M |
| `table.scale` + a few named consts | preset rewrite through `applyZoom`; reload-class rows | 1 | S |
| Panel + stylesheet | overlay, sections from the tree, find, generated rows, Cast, File, footer | 1 | M |
| Diff, revert, reset, Download, Copy, Paste | the loop without a server route | 1 | S |
| `tools/dice-apply.mjs` | validate, patch, atomic write, diff summary | 1 | S |
| Hooks | `tuneGet()`, `tuneDiff()`, `devInfo()` zero-arg; `tuneSet(p)`, `tuneExport()`, `devOpen()`, `devClose()`, `devFold(b)`, `devDeal(n)` | 1 | S |
| Save route | `POST /api/dev/write`; env-armed, loopback, same-origin, one file, atomic | 2 · **built** | M |
| Server reads `table.seats` | `places.js` takes toss and card values from the declaration on both sides | 2 | M |
| Sound, Post, Cards sections | `sound.master` on the master GainNode and `sound.impact.gain` on the default contact body (both look; `voices.js` keeps the shipped numbers); `post.bloom.threshold` on the `uThresh` uniform; `cards.standoff/width/depth` on `places.js` PLACARD, film — ⟳ at C5, LIVE since D4 (`rebuildPlacards`, at the placard flush) | 2 · **built** | M |
| HUD | fps ring, `renderAudit` calls and tris, bodies, settle time | 2 · **built** | S |
| Clock | freeze, step one frame, scrub the running film's keyframes | 2 · **built** | S |
| Seeded bench and replay | throw with a chosen seed (labelled *bench* in the log; values still through `composeRoll`); replay the last seed | 2 · **built** | S |
| A/B slots | hold two patches, flip on `x`, replay the last seed when a film key differs | 2 · **built** | S |
| Framing overlay | the fit hull, spots, placard frames, lamp cone, walls, drawn from the film's own functions | 2 · **built** | M |
| Rebuild choke points | `rebuildPlacards()` — `cards.*` promoted from ⟳ to apply, re-baked at the placard flush; `rebuildFloor()` / `rebuildDice()` still owed | 3 · **cards built** (D4) | M |
| Presets | named patches under `presets:` in the declaration, held from the dials and applied like a paste | 3 · **built** (D4) | S |
| Venue light as a layer | `venues.<id>.light` composed through `tuneSet`; until then the Save verb drops the rows `venueLightPatch()` names while a venue holds them (`devWriteSave`, js/main.js) | 3 | M |
| `felts:` editor | felt row form; live on the felt; Save appends the row | 2 · **built**; every row editable and the catalogue in the file since E1; a mat is YAML-only since E2 | M |
| `sets:` editor | the lab's set builder moved onto the live felt; full recipe, live reskin of the standing dice, Clone / Throw one of each / Use at table / Remove | 3 · **built** (D2) | L |
| Shipped catalogue migrates | `themes.js` sets and `FELT_THEMES` rows move into the declaration, one kind per commit | 3 · **built** — dice sets D1 (`houses:`), mats E1 (`felts:`), 2026-09-03 | M |
| Towers and venues rows | cosmetic rows over `towerRegisterGlb` and `VENUES`; meshes stay forge bakes | 3 · **deferred by Joe 2026-09-03** ("I want to defer for now. I'm not sure what I'm going to do with towers and venues yet") — no `towers:` / `venues:` section, no venue-light layer, `TOWERLAB` stays | L |
| Retire `lab.html`, `lab.js`, two shot tools | the sets section hosts the recipe knobs on the real felt; `TOWERLAB` stays, with towers | 3 · **built** (D3) — what the lab measured and the editor does not, §9 | S |
| Phone sheet | a bottom sheet at `45dvh`, folded by default, 44px rows, steppers instead of sliders, one section at a time; one media query read by css/dev.css and `DEV_PHONE_QUERY` alike | 3 · **built** (D5) | M |
| Absent in production | `.gcloudignore` drops `js/devmode.js`, `js/devui.js`, `css/dev.css` and `dev.html`; `devOpen` latches on the import miss | 3 · **built** (D3, `dev.html` D5) | S |
| Recorder | `devRecord('start'\|'stop')` arms `tune.watch`; every patch, deal, seeded throw and asset-row CLONE to a `tools/steps` skeleton (`emitStep`), replayed through `devRowAdd` / `devRowRemove`; what it still cannot carry comes out as a `// note ·` line in the file; a download only, never the route — a step is code | 3 · **built** (D5) | L |
| Pop-out window | `dev.html` mounts the same panel over a MIRROR of the table's tune on a `BroadcastChannel`; the table tab stays the only writer; the dials, the diff and the file verbs travel, the felt's own instruments do not. A channel is origin-scoped and an origin is not a tab, so every table stamps its messages and the window LATCHES one (D5 review); and the window is not a phone — `mount({ phone: 'never' })` | 3 · **built** (D5) | L |

## 9. Assets

The rule: **an asset is a row under `houses:` (the dice catalogue; `sets:`
was the sketch's name for it, and the section is two levels because a house
holds sets), `felts:` (the mat catalogue — both migrated whole, D1 and E1),
or — later — `towers:` / `venues:` in the declaration;
the app resolves ids at use time; the editor writes the row, calls the kind's
cache-bust and re-apply, and Save appends it.** Code-only stays code-only, and the panel says so ("a new cloth is a
painter function; see FELT_CLOTHS"). A row's fields are optional the same
way a dial is: a set with only `body` and `text` is a legal set, and the
recipe's defaults fill the rest. A row's two-state fields are enums
(`profile: round | crisp`), never flags.

- **Merge before the id lists are computed.** `themes.js` merges
  `DECLARED.sets` into `SETS` before `SET_IDS` is built (today `registerSet`
  runs after, and a critic found a registered set invisible in the picker
  and rejected on the wire). `main.js` merges `felts` before the swatches
  render. The server parses the same file, so it accepts a new id on the
  wire after a restart, and after the mtime re-read in phase 2. Ids carry a
  house prefix so a custom row never shadows a declared one. (Through C4 a
  collision was possible — the eleven mats lived in code and the file could
  name one — and the shipped row stood with a console line naming it. Phase E1
  removed the second list, so what protects `taproom` now is that Add refuses
  an id the file already declares: `tune.addRow` writes a row whole, and the
  mat a golden and eleven months of screenshots mean may not be redefined by a
  panel whose job is authoring new ones.)

  The second half of "the server parses the same file" is easy to half-ship
  and was: a Save ADOPTS the tree it just parsed rather than re-reading the
  file, so for about an hour a felt saved from the panel was in the served
  module and still 400'd at `/api/settings` until some later, unrelated edit
  — a house felt that worked alone and failed the moment anybody else sat
  down. Every assignment to `declaration` now goes through one setter.
- **Dice set** (phase D2, **built**). The recipe was already pure data and is
  now a row (`houses:`, phase D1), so the editor is a `sets` section on the
  live felt: a house picker, a set picker, and the whole recipe as knobs in
  the file's own grouping, with **Clone** / **Throw one of each** / **Use at
  table** / **Remove**. Code-only, still: a new pattern, particle or decal
  kind, voice body, die type.

  **The repaint, and what it costs.** A write to `houses.*` does two things.
  The immediate one is `installCatalogue`, so `SETS` and `T` never disagree
  and every site that READS a recipe — the rate graph, the rest cadence, the
  lights and particles a throw attaches — reads the edit at once. It does NOT
  move what a die is BUILT from: js/dice.js caches a build per (type,
  variant) and `installCatalogue` cannot see that cache, so a die created
  inside the 140 ms window wears the old geometry until the flush reaches it
  (it is on the felt by then, so it does). The expensive one — `bustDie` →
  `bustArt` → `reskinStanding` → `refreshDieArt` + `renderDiceSetPicker` —
  rides a 140 ms trailing timer, the felts editor's number for the felts
  editor's reason: it rebuilds seven geometries and their baked face textures,
  so a slider dragged at 60 Hz must not ask for sixty a second. A commit and
  every `devSet*` hook flush the timer instead, so what they answer with is
  the table after the repaint. `reskinStanding` swaps geometry and materials
  on the meshes IN PLACE — bodies, poses, values, corrections, picks and
  parented lights untouched, a departing die included — and it runs in the
  same task as the bust, which is how js/dice.js's "drop every mesh before
  busting, disposed textures render blank" is actually kept.

  **What a live edit cannot reach**, said here so nobody has to find out: a
  set's `light`, `particles`, `decal` and `post.ring` are attached or fired AT
  THE THROW from the recipe as it stood then, so an edit to those shows on the
  next throw. `rate` is read at every playback step (`uniformRollRate`), and
  `rest` is re-derived at the repaint (`restReskin`) — the D2 review measured
  it moving in NEITHER direction, because `initRest` captures
  `SETS[id].rest` once at playRoll and `installCatalogue` builds fresh objects
  (a seaglass clone dialed from `yAmpM: 0.0015` to 0.2 still swelled at
  0.0015 over 400 frames). A paragraph whose whole job is that nobody finds
  this out by accident had to be made true rather than narrowed, so
  `reskinStanding` now re-reads the cadence off the catalogue as it stands,
  carrying the die's three phase seeds and its `settleAt` across so it does
  not jump phase — and putting a die whose cadence was dialed OFF back on its
  archive pose, since stepResting will never touch it again. (A settle-tick
  that has already fired does not re-fire while the kind is unchanged: its
  moment passed, and re-arming it on an unrelated colour edit would be a pop
  nobody asked for.) A cadence is also ARITHMETIC over a sparse row, so the
  block is read through its dial defaults (`REST_DEFAULTS`): every shipped set
  names its whole `rest`, but the panel writes one field at a time, and
  `rest.kind: swell` typed on its own used to divide by an absent period and
  put the die at NaN — reachable only now that the field moves live, and
  already what the `default` mark promises about a field a row does not carry.
  **Throw one of each** exists partly for the rest of it:
  one button puts a fresh d4 d6 d8 d10 d12 d20 of the set on the felt, down
  the C2 bench path (local, labelled `bench`, values from the seed through
  `composeRoll`).

  **Use at table waits for the file**, which is the one gate here that is not
  a lock (the D2 review, 2026-09-03). `SETS[id]` says this TAB can draw the
  set; what `diceSet` needs is that the SERVER can resolve it, and the server
  resolves a rolled set out of dice.yaml (`readSetField` → `unknown_set`). A
  clone wears perfectly on the felt and 400s every roll from the moment it is
  worn — measured twice, with an empty console and a page banner reading
  `unknown dice set: house.ivory-2` as the only evidence. That is the failure
  `devSetLiveFlush` already closes in the other direction (a row that goes
  away takes the viewer's choice with it), and it was open in this one. So
  `devSetApply` refuses a row the file does not declare with the reason
  `unsaved`, the button is drawn disabled carrying that sentence, and **Save
  is what lifts it — in the same tab, with no reload**: the route's own
  success is the gate (`devSetInFile`), because the server re-reads and
  re-installs the catalogue as part of the write while this tab's `SHIPPED`
  stays the boot snapshot it was. The player's own settings chip is the same
  door and takes the same clause, in `openSetMenuFor` beside `venueOnly` and
  `beta`: an unsaved row is not offered there either. On a tab that never
  opened the door the clause passes everything, because every set in `THEMES`
  came out of the file.

  **Three differences from the felts editor**, each with a reason:
  - **the section is two levels deep** (a house holds sets), so it carries a
    house picker above the set picker. ("Every row is editable" was the first
    of these until phase E1, when the mats moved into the file too and the
    felts editor grew the same freedom.)
  - **the form is sparse.** A field the row does not carry is drawn at its
    dial's default wearing the `default` mark, because that is what the die is
    already doing (js/tune.js RECIPE records where every default came from).
  - **the film lock holds two verbs and one field, not the section.** A felt
    is ROOM state, so every verb of that editor is refused at a shared table.
    A recipe is PLAYBACK — two clients with different dice.yaml files already
    draw the same roll in different materials, which is what GOALPOST 7 means
    — so what is held is **Use at table** and **Throw one of each** (both put
    an invented set in front of another viewer) and `faces`, the one
    film-class field in a recipe, which `tune.set` refuses on its own.

  **Remove is for the rows you author** — the `house` house, and anything this
  session added anywhere. A shipped set stays, and is refused by name: a saved
  pool's override, another player's roll payload and a dozen goldens all
  resolve `emberforge.blackanvil`, and a catalogue that can lose one of those
  from the panel is one click away from a table that cannot draw somebody
  else's dice. **Clone** copies into the `house` house at `<set>-2` and
  deliberately drops `where: venue` and `channel: beta`: both decide where a
  set may be PICKED, and a clone that inherited either would be a set you just
  authored and cannot find. A clone given an id BY NAME is refused (`taken`)
  when a row already wears it: `tune.addRow` writes a row whole, so the
  auto-numbering walk past the taken ids was the only thing standing between a
  second clone and somebody's unsaved edits — and a clone whose id is illegal
  now answers `id: null` rather than naming a row that was never created (both
  the D2 review, 2026-09-03).

  Two small things the panel had to grow: `rowSelect` in the kit (a native
  select where an enum has more states than a segmented row can show — the
  face table has twelve, and the control column is ~145px, where twelve
  segmented cells measured as one letter each), and a footer count read off
  the DIFF rather than off the dial rows wearing the changed mark. The old
  count was the whole diff before asset rows existed; with a set cloned it
  read `0 changed` in the corner beside a file section that read the truth.
- **Mat** (phases 2, E1 and E2, **built**). A row form: two colour pickers,
  breath and mottle sliders, a cloth select, a texture path and a tile scale,
  and two sub-groups — `gloss` and `sound` — whose fields read faint at the
  painter's own value until the row names one. Apply = bust the felt tile +
  `applyFeltTheme` + re-render swatches. Code-only: a new PAINTER; a mat that
  is a picture is not one.

  **A mat is YAML-only** (phase E2, 2026-09-03). E1 moved the eleven ROWS into
  the file and left every SURFACE in `js/main.js`, so a new mat was still one
  of three painters in a new colour — the "one mat in nine colours" ceiling one
  level up. A row now carries its own surface:
  - `cloth: image` with a `texture:` under `models/` and a `tile:` (world units
    per repeat). `paintImageCloth` draws the picture as a whole number of
    repeats across the 1024px felt tile — the tile is what wraps on the floor,
    so a fractional repeat would be a seam every five units in a grid — then
    tints with `feltBase` through `multiply`, which is why a texture for this
    slot is a near-white greyscale: the row's hex stays the mat's one opinion
    about colour, and the mottle, the gloss and the fog pipeline never learn
    that the ink came from a PNG. `tile`'s slider is stepped 0.05 over
    [0.25, 5] because the model behind it is `round(5 / tile)` whole repeats:
    a step that could not express the shipped 1.25 rewrote the mat on a
    click, and everything past 10/3 is the same one repeat (the E2 review).
    The path is judged by `assetPath` (under
    `models/`, no `..`, no percent-escape) because `models/` is what server.js serves and
    `.gcloudignore` ships; a path outside it is a mat that works on the
    author's disk and 404s for everybody else. **The path rides nowhere**: a
    felt id is room state, but every client reads the same declaration and
    fetches the same origin-relative path, so there is nothing to send.
  - **loading is asynchronous and costs the table nothing.** The mat stands on
    its flat `feltBase` while the fetch is in flight; on arrival the tile cache
    key is busted and the cloth (and its swatch chip) repaint once; on failure
    the flat colour stands and one `console.warn` names the path. Nothing
    throws and nothing blocks — chrome that can take the app down with a typo
    in a YAML string is the wrong trade. `devFeltSurface(id)` reports
    `loaded: none | pending | ready | failed`.
  - `gloss:` and `sound:` are **sparse groups inside a filled row**
    (`js/tune.js` `sparse`), and that is the load-bearing decision. Their
    defaults are not written in dice.yaml at all — they are the PAINTER's rows
    (`FELT_GLOSS`, `js/voices.js` `CLOTH_VOICES`) — so a filled group would
    have handed all eleven mats wool's numbers, silt and oak included, and
    changed two shipped surfaces with the file unmoved. Absent means the
    painter answers, field by field, so a mat that names neither behaves byte
    for byte as it did before E2 **by construction**. Three of the six are
    CLAMPED in `clothVoiceFor`, not by their sliders, because dice.yaml is a
    file a person edits: `gain` at 1 (§5's mix plan is a ceiling), `tail` at
    `CLOTH_TAIL_MAX` (past `1 / TAP_E` the settle cluster stops decaying and
    the taps GROW — at the dial's first maximum the sixteenth tap was louder
    than the landing) and `fizz` at 0.95 (it is subtracted: `1 - fizz`, so
    past one the modulation inverts). The E2 review found the last two
    uncapped; the tail dial now stops where its clamp does.
  - one resolver, and every consumer reads it: `feltSurfaceOf(row)` merges the
    registries under the row, and `paintGloss`, `clothVoice`, the swatch
    signature and the readouts all go through it. `clothVoiceFor` took the
    overrides as a third argument rather than merging at the call site, so the
    one function that owns the covering rule ("a venue lays its floor over the
    mat") owns it for a row's overrides too. `tests/felt-image.test.mjs` scrapes
    `js/main.js` for a second reading of either registry, because a fourth
    reader added later would silently ignore the row — it would look right.
  - shipped: `models/mats/linen.png` (256px greyscale weave, tileable, ~23 kB
    — per-scanline adaptive filtering, and the rest is the weave's own noise:
    96 levels over 65,536 pixels; 128px would halve it and lose the 1:1 the
    mat exists to show — baked by a throwaway `node:zlib` encoder) and the `linen` row that uses it,
    so the image path is exercised by the file the app ships and by
    `dev-image-mat`. The same test checks the PNG's chunk CRCs and that its
    wrap is not the sharpest edge in the picture.

  **The whole catalogue is the file** (phase E1, 2026-09-03 — Joe: "make a new
  mat as YAML-only as a new dice set is now"). C4 shipped the editor beside
  ELEVEN mats that lived in a literal in `js/main.js`, which meant the section
  had two kinds of row in it and said so on every surface: shipped rows drawn
  read-only with "a shipped felt lives in js/main.js — Clone it to edit", a
  collision refusal so a declared `taproom` could not shadow the code's, a
  shipped-tile guard in the cache bust, and three hand-kept id lists that
  `tests/felt-ids.test.mjs` existed to keep in agreement. E1 moved the eleven
  into `felts:` — rows, comments and all — and every one of those went with
  them:
  - `js/main.js` `FELT_THEMES` starts EMPTY and `installFelts(DECLARED.felts)`
    fills it IN PLACE (the `installCatalogue` move, one catalogue over), above
    `floorGeo`, which is the first line in the file that reads a row. The cache
    bust became a PRUNE — the tile key (`${cloth}|${base}` then; `feltTileKey`
    since E2) fully determines a PAINTED cloth's canvas, so a row returned to
    needs no bust and what a bust is for is dropping the keys no row wears any
    more. E2's image cloth is the one row where the key does not decide the
    canvas — it is painted flat while the fetch is in flight — and that is the
    bust `onFeltImage` still does.
  - `server.js` reads its wire list off the tree it already parsed
    (`syncFeltIds`, through the one `setDeclaration`), still filtered by
    `ASSET_ID_RE`; `js/portable.js` holds no list at all and is handed one by
    `declareFelts`. A reader that is never told refuses every `felt:` line and
    says which question it could not answer — under Node that is the test's job,
    exactly as installing `houses:` is.
  - the panel: **every row is editable**, which is the sets editor's first
    difference arriving one editor late, and **Remove is for the rows you
    author** — `devFeltRemovable` is `devSetRemovable`'s rule, and a declared
    mat leaves by having its lines deleted. `devFelts()` answers `inFile` and
    `removable` where it used to answer `shipped`. Editable rows mean fields
    that can MOVE, so the section marks the moved FIELD, not the row, and
    each one carries its own ↺ (the E1 review, 2026-09-03: the header read
    "· 1 changed" over six rows that all said nothing had).
  - **"in the file" means in the file NOW**, on both editors. `SHIPPED` is a
    boot snapshot, so the row this session just SAVED through the armed route
    is one dice.yaml carries and `tune.rowIsDeclared` does not know about
    until the next reload. `devRowSaved` — the ledger `devSetInFile` already
    kept — is filled from the route's own applied-paths list and read by
    `devFeltInFile` too, so Remove refuses the mat you just saved, Add will
    not redefine it whole, and the player's swatch picker grows its chip at
    the moment of the Save rather than one boot later.
  - `tests/felts-catalogue.test.mjs` pins the deleted literal ONCE and compares
    the file to it field for field and in id order (the picker draws in the
    file's order); `tests/felt-ids.test.mjs` reads the declaration and now
    guards that no file grew a literal back, plus the four cloth mirrors, which
    did not move.

  What shipped in phase 2, and the four places it touches:
  - `js/tune.js` grew `ASSET_SECTIONS`, `ASSET_ROWS` (a section's ROW SHAPE,
    as dials — so `felts.<id>.cloth` type-checks and enum-checks through the
    same `tune.set` a dial does), `ASSET_ID_RE`, and `addRow` / `removeRow` /
    `rowsOf` / `rowIsDeclared`. A row lands and leaves WHOLE: there is no
    per-leaf write that can create one, because a half-built felt is a felt
    the merge site would have to guess the rest of. `diff()` walks SHIPPED ∪
    T, so an added row reads `shipped: undefined` and a removed one
    `live: undefined`. `sections()` hides asset sections from the dial bar —
    the panel draws them bespoke, and two sections of one name would collide.
  - `js/dice-apply-core.js`'s `dialFor` resolves an asset path through the row
    shape, so the apply TOOL and the armed Save ROUTE accept a felt row with
    no second idea of what a legal value is.
  - `js/main.js` `installFelts()` (C4's `feltThemesSync`) fills `FELT_THEMES`
    from `T.felts` before the first `renderFeltSwatches`, prunes the tile-cache
    keys no row wears any more, hands the ids down to `js/portable.js`
    (`declareFelts`), and falls the table back when the felt it is wearing is
    removed. `server.js` does its half from the tree it parsed (`syncFeltIds`,
    refilled by the one `setDeclaration`) — **filtered by `ASSET_ID_RE`, the
    same law the browser drops a row by**, or the wire would accept a room felt
    no client can resolve (the C4 review, 2026-09-03: the inverse of
    `tests/felt-ids.test.mjs`'s failure).
    The PLAYER's swatch picker draws only rows the catalogue can defend — the
    ids the FILE declares — because a chip's click is `selectFelt`, which POSTs
    the room setting; a row minted this session reaches the table through the
    panel's Apply and through Save + reload.
  - the panel's `felts` section: a picker over every felt the file declares
    plus any row this session minted, a form built from the row shape, Clone /
    Apply to table / Remove, and a 140 ms debounce on a dragged field (a felt
    apply redraws a 1024px tile, the gloss map and the whole mottle attribute —
    sixty of those a second is not a slider).
  Two things a reader should not have to discover: **Apply to table is
  LOCAL** (it wears the felt on this tab and never sends the room setting —
  a felt only this checkout declares is one nobody else could resolve, and
  Save + reload is how it becomes the table's felt for real), and **the Save
  route cannot carry a REMOVAL** (`changes()` speaks in leaves and
  `undefined` does not survive JSON; Download + `tools/dice-apply.mjs` does
  carry one, and `exportYaml` takes the row's lines out as a row rather than
  leaf by leaf, or the reader would fill the empty row back out with
  defaults) — and **the status line says so at the moment of the Save**,
  naming the rows it could not carry and reading as a warning, because §10's
  rule is that the line at the moment of the act must say what happened (the
  C4 review, 2026-09-03: it read "saved 0 changes … reload the tab to boot on
  them" over a silently dropped removal). The Paste box cannot MINT a row
  either, for the same reason nothing else can write one leaf at a time:
  `felts.<id>.cloth` for an id neither tree has is refused `unknown`, and for
  a row that was REMOVED it is refused `row` — one field may not put back
  half of a row, or `installFelts` would guess the other five out of the
  row defaults. A field of a row this session minted DOES land (that is how
  the editor's own sliders write), and the preview says so, because the
  preview must list exactly what Apply will do. Clone is the verb that makes
  a row; paste moves the fields of one that exists.
- **Tower / venue** (phase 3). `towerRegisterGlb(id, url, opts)` already
  mints a row at runtime; the row is the cosmetic half only. The mesh stays
  a forge bake; portals stay in the GLB.
- **The shipped catalogue.** The DICE SETS migrated on 2026-09-03 (phase D1):
  `houses:` in dice.yaml is the catalogue — every house, every set, every
  recipe field under the same names — and `js/themes.js` keeps the recipe
  GRAMMAR (what a field means, and every dated ruling behind a turn-down) plus
  the three objects the app resolves a set through, which `installCatalogue`
  fills IN PLACE from the declared tree. What that took, and the parts a
  reader should not have to re-derive:
  - **A section can be two levels deep now.** A row's field may be a nested
    group of dials (`geo`, `feel`) or a COLLECTION of further rows
    (`js/tune.js` `rows(RECIPE)` — a house's `dice:`), and one walk resolves
    any of it: `assetDialFor`, `assetRowDefaults`, `reconcileRows`, `addRow`
    (which now takes a PATH to the collection), `removeRow`, `reset` and the
    export's row collapse all read the same shape. `assetRowPath` is the one
    law for "which row does this leaf belong to" — a felt is two segments and
    a dice set is four, and the panel, the diff and the dropped-rows line
    stopped counting to two.
  - **`houses:` is SPARSE and `felts:` is FILLED** (`ASSET_SPARSE`). A felt row
    the file half-writes takes the row defaults for the rest, so the merge site
    never guesses. A recipe may NOT: js/themes.js's own rule is "a set uses
    whichever it earns; every one is optional", and a filled recipe would give
    every set particles, a decal, a parented light and a rest cadence it was
    written to refuse. The dial defaults are still there — they are the code's
    own fallbacks, read out of dice.js/voices.js/post.js — and are what an
    empty field in the panel shows.
  - **A SPARSE ROW'S ABSENT FIELD IS WRITABLE** (the D1 review, 2026-09-03),
    and had to be made so: `tune.set`'s "neither tree names this leaf" guard
    was written for FILLED rows, where a missing leaf really does mean a
    missing dial, and it refused roughly eighty of a recipe's ninety knobs as
    `unknown` on every shipped set. A write mints the leaf — with the nested
    group under it if the row has none, and only the field named, never the
    group's defaults — provided the ROW exists and the shape declares a dial;
    the value is judged by that dial as any other write is. The row is still
    the unit that takes it back (`reset` at the row's path), a row nobody ever
    had is still `unknown`, and a declared row this session removed is still
    `row`.
  - **Three booleans became enums**, because the file may not hold one:
    `venueOnly: true` → `where: venue`, `beta: true` → `channel: beta`,
    `post.bloom: true` → `post.bloom: source`. The built recipe keeps the OLD
    field names, so no consumer learned that the file says it differently.
  - **`faces` is the one film-class field in a recipe.** A face table is not a
    value — the server still rolls 1..6 — but it is a READING two clients have
    to agree on, so it locks the moment a second seat is present. It is also
    the one path in the file `FORBIDDEN_LEAF` bites, and that regex stays: it
    is the law for the DIAL TREE, where a fixed path named `faces` could only
    be the rolled values themselves (`tests/tune.test.mjs` names the exemption).
  - **A list dial has three laws**: how many entries the code reads (`len` —
    six faces, one or two decal colours, a palette of one to eight), that an
    entry is a string, and — where the entries come from a fixed vocabulary —
    which strings (`each`). The D1 review found the middle one missing: a
    palette declares `each: null` because there is no list of legal colours,
    and that was read as no law at all, so `colors: [1, 2]` passed the reader,
    `tune.set` and the armed route on its way to `hexRGB`. Refusals are
    `'range'` for the count and `'type'` for the entry.
  - **Ids stayed dotless.** `emberforge.blackanvil` is a JOIN, not an id: the
    two levels were always there, so `houses.emberforge.dice.blackanvil` needs
    no quoted dotted key and `ASSET_ID_RE` is unchanged. The server filters
    both levels by it before the ids reach the wire.
  - **Who installs it**: js/main.js at module eval (before the first read of
    `SET_IDS`, DEVMODE §9's own merge-before-the-ids rule); server.js from
    `setDeclaration`, the one place its parsed tree is assigned, so a set added
    to the file is on the wire on the next request with no restart; and each
    Node test or tool that reads recipes. The catalogue is EMPTY until somebody
    does — js/themes.js is imported by server.js and so may not read the file
    itself. (js/lab.js was a fourth caller until the lab retired, below.)
  - `tests/catalogue.test.mjs` is the drift guard: nothing in `houses:` may be
    silently dropped by reconciliation, every recipe enum's options are
    compared against the keys the code actually defines (their modules import
    three.js, so their sources are read), and `SET_IDS` is pinned in order.
  The FELT rows followed on the same day (phase E1, above): `felts:` in
  dice.yaml is the mat catalogue, `installFelts` is `installCatalogue` one
  catalogue over, and `tests/felts-catalogue.test.mjs` is its drift guard.
- **THE DICE LAB RETIRED 2026-09-03** (phase D3), and this is the list of what
  went with it. `lab.html`, `js/lab.js`, `tools/lab-shots.mjs`,
  `tools/geo-bench-shots.mjs`, the `lab-geo-bench` e2e scenario (its tag `lab`
  with it) and `verdict-shots.mjs`'s `bench` and `set` frame groups are gone;
  `chrome-lab.html` and `TOWERLAB` stay (the chrome lab poses through hooks the
  panel has no section for, and towers are deferred).

  The lab existed to turn every recipe knob and look at the result, and the
  `houses` section does that on the REAL felt — under the real lamp, with the
  standing dice reskinned in place and *Throw one of each* through the bench
  path — which is a better place to judge a set from than a page with its own
  renderer, no roll, no ceremony and no sound (docs/IMMERSION.md's reading of
  the lab, and the reason this retirement was worth taking).

  **What the sets editor cannot do yet. Owed, not lost:**
  - **The watertight probe.** `lab-geo-bench` walked every render mesh on the
    page and asserted each directed edge was paired by its reverse — the check
    that caught a doubled band triangle and a pure-black hole on every beveled
    edge of every die (Joe found the hole, 2026-08-04). Nothing re-makes it.
    It needs a hook that hands out a die's position array; `dieGeoStats` answers
    counts and radii only. **This is the one on the list that guards a shipped
    law rather than a review convenience, and it is the one to build first.**
  - **The geo sweep's orderings.** Nine bench rows across the Level 3.5 `geo`
    space, asserted as a ladder: cut radii monotone in bevel, a fillet bulging
    past its cut twin but inside the sharp corner, ink and pillow
    silhouette-neutral, wear pulling inward, segments growing the fillet mesh.
    Every one of those is reachable from `dieGeoStats` + a cloned row, so this
    one is a scenario to write, not a hook to add.
  - **Recipe omit-at-default.** `builderRecipe()` printed a themes.js-shaped
    body with defaults omitted, and the scenario asserted a profile flip snapped
    an untouched `ink` to the new profile's default. The editor writes the FILE
    instead, and `exportYaml` has its own rules; the claim is not the same one
    and is currently made nowhere.
  - **Hero framing and face dumps.** `zoomDie(row, type)` framed one die at a
    fixed distance and `faceDump` read the baked face canvases' average RGB —
    which is how "does a carved-and-lit digit bloom in the dark" was answered
    with numbers. The felt has no hero camera and no face-canvas reader.
  - **`sampleWorld(p)`** — average framebuffer RGB around a projected world
    point, the instrument that settled "is that mark pale or dark" when
    review-distance eyeballs could not.
  - **Firing one set's effect on demand.** `__lab.effect(setId, name)` played a
    named burst without waiting for a roll to produce it, and
    `tools/lab-shots.mjs` sampled it at named milliseconds mid-flight — which
    is how docs/IMMERSION.md's voidgrain `unmake` demo was costed at "zero new
    code". The editor can wear a set and throw six dice; it cannot make one
    effect happen.
  - **The drop rig's furniture.** A felt coupon, rails, a 3.5 s post-settle
    linger and a ~57°-down `dropView` existed so a flat decal could be judged
    at the angle it does not vanish at. On the real felt the decal kill switch
    is off by default and the camera is the table's.
  - **Every theme at once.** The grid showed every set × every die type side by
    side; the editor shows the one set you are editing. A contact sheet of the
    catalogue is a picture nobody can take today.

## 10. Honesty and safety

- **Nothing on the wire** (GOALPOST 2). `tuneSet` never calls `net`; no
  dial, cast row, bench roll or A/B slot leaves the tab — with one exception,
  named here because this is the section a reader checks the claim in: an
  *armed* Save posts the changed dials to the loopback dev-only route on this
  same origin (§6), which exists only under `DICE_DEV_WRITE=1`. Never through
  `js/net.js`, never to a room, never to another viewer. Film writes are
  refused while a second seat is present, and reset when one arrives. Proof:
  `dev-room-look`: a two-browser room, the second browser opens the panel,
  a gravity write is refused, a lamp write takes, and after a roll both
  keyframe hashes are equal.
- **No rigged values** (GOALPOST 2). No dial reaches face correction, the
  RNG, the server parse or reveal framing. The seeded bench draws values
  through `composeRoll` from a chosen seed, never chosen faces, and is
  stamped *bench* in the log: one number feeds `mulberry32` at BOTH ends — the
  composer's rng and the physics bake — so the same seed is the same faces and
  the same poses, and there is no way to name a face from anywhere in the
  panel. It is also LOCAL, because the server draws its own seed and a bench
  throw that reached it would be a bench that lied about the one number it
  exists to hold fixed.
  **The both-ends promise is the BENCH's, not every roll's** (measured, the C2
  review 2026-09-02): a roll the server drew took its values from the server's
  rng, and only its FILM seed is knowable in this tab — so Replay of one is
  the same throw with fresh faces, right for judging a film dial and wrong for
  reading a total. `devBenchInfo().last.bench` says which kind the last film
  was, and the panel's last-film line says it in words. Proof: a unit test walks every leaf path against a
  denylist (`rng`, `values`, `face`, `seed`, `fixedDt`), and `dev-bench` throws
  one seed twice, a second seed once, and reads the room's log from a SECOND
  browser to find it empty.
- **Nothing in the URL** (GOALPOST 4). Proof: `dev-key-door` asserts
  `location.search` and localStorage unchanged after open, fold, shut, and
  a `?demo=1` visit behaves exactly like a plain visit.
- **Nothing modal** (GOALPOST 5). The panel never enters the modal stack.
- **The write route cannot be used against Joe.** Changes in, patch out;
  env-armed; loopback; same-origin; one allowlisted file; atomic. Proof: a
  spawned-server test under a scratch `DICE_DEV_ROOT`: unarmed → 404;
  armed → the re-parsed file deep-equals; refuses `../`, a foreign origin,
  a non-allowlisted file, and a request whose `Host` and `Origin` agree on a
  foreign name that resolves to loopback (the DNS-rebinding shape, posted
  with raw `node:http` because `fetch` will not set `Host`). The
  loopback condition itself rides the SOCKET, so no request a test can make
  can be non-loopback: it is proven as the predicate `isLoopback` instead,
  exported from `server.js` and walked over an address table. No test ever
  writes into the checkout.
- **The unpressed tab is the tab it was.** No stylesheet, module, scene
  object or draw call until the door opens. Proof: `dev-door-shut` (today's
  `demo-door-shut`, re-pinned): a never-opened tab and an
  open-dial-shut tab deep-equal on framing, places, placard budget,
  bodies, extents and draw count, and on `feltPoses` after one seeded
  throw.
- **The switch is real, and its proof fires.** A second server started
  with `DICE_MODE=production` boots a tab, presses the key through
  `devOpen()`, and asserts null, no panel, cheat-sheet row hidden; a second
  leg starts one from a scratch copy whose `dice.yaml` says
  `mode: production`.
- **The declaration round-trips.** `patchYaml(text, spans, {}) === text`
  for the checked-in file; for every scalar in it, patching a new value and
  re-parsing yields the new value with every other leaf and every comment
  line unchanged; and for every leaf the file omits, patching it inserts
  exactly one line under the right map.
- **No boolean, no missing default.** The unit test walks the dial tree:
  every entry has a `def` of the leaf's type, no `def` is a boolean, every
  enum's `def` is in its `options`, and the checked-in file contains no
  boolean scalar.
- **Goldens move only when a film value ships.** A film-class change is
  visible in `git diff dice.yaml`, and the commit that ships it re-records
  the one-seed-one-film golden and says why.

## 11. Phases

**Phase 1, the loop exists.** Five commits, each green alone:

1. `js/yaml.js` with its unit tests (parse, spans, insertion points,
   patch, insert, emit, refusals including booleans).
2. `dice.yaml` written from the shipped values; the served module;
   `js/tune.js` with the dial tree and defaults; the fifteen tune objects
   aliased and bound, their booleans turned to enums; `table.scale` and a
   few reload-class consts; `tests/tune.test.mjs` (drift, defaults, no
   booleans, denylist, round trip).
3. The door: `devState`, backtick, fold, Shut, film lock, `app.mode` and
   the env override, hooks including `devOpen`/`devDeal`; `?demo=1`,
   `resolveDemo` and the room-mint suppression removed; `ctx.demoTab` →
   `ctx.devTab`; tools/steps moved; cheat-sheet row.
4. `js/devmode.js` + `css/dev.css`: sections from the tree, find, generated
   rows, Cast moved in, the inline panel deleted, File with diff, Download,
   Copy, Paste.
5. `tools/dice-apply.mjs` and the scenarios `dev-door-shut`,
   `dev-key-door`, `dev-room-look`, `dev-mode-production`,
   `dev-export-roundtrip`.

*Proves it:* `dev-export-roundtrip` boots a tab, opens through `devOpen()`,
sets lamp height and table scale, asserts the lamp moved and the extents
widened at the roll boundary, and asserts the exported text equals
`patchYaml` of the checked-in file with the same two changes under Node.
And Joe's own moment: on the 8123 preview, press `` ` ``, widen the lamp,
fold, look at exactly the player's frame, unfold, Download, run the apply
tool, and `git diff dice.yaml` is two lines with their comments intact.

**Phase 2, the loop closes into the repo and into tests.** The Save route;
`places.js` reading `table.seats` on both sides; sound, post and cards
sections; clock, bench, replay, A/B, HUD; framing overlay; rebuild choke
points; presets; venue light as a layer; the felts editor.

*Proves it:* `dev-write-route`; `dev-hud` (every footer number against an
independent witness, and fps still reporting under a frozen projector);
`dev-clock` (freeze holding the felt across half a second of WALL time with a
film in flight, one step advancing exactly one keyframe, the scrub moving the
projector and the next step continuing from it); `dev-bench` (the same seed
twice giving the same poses AND the same faces, a different seed giving
neither, the row labelled `bench`, and a second browser at the same room whose
log is empty — the proof that nothing reached the wire); `dev-ab-same-seed` (A
and B differing on lamp height give identical `feltPoses` while the lamp moves;
differing on floor friction give different poses on the same seed —  at 0.05
rather than 0.95, because a friction ABOVE the shipped 0.6 was MEASURED to bake
an identical film, the dice never sliding far enough for the extra grip to
bite); `dev-felt-roundtrip` (a felt minted in the tab and WORN — the mean of
25 samples off the tile itself, not the row that describes it, so the cache
bust is proved rather than assumed — the panel's own picker locking a shipped
row and unlocking a house one, Clone, Save through the armed route into a
scratch checkout, and a FRESH tab there where the felt is simply one of the
felts: in `devFelts()`, in the settings swatch picker, and accepted by the
server on the wire, which is the half that decides whether a house felt works
at a shared table or only alone).

**Phase 3, assets in depth, and shape.** Sets editor with the full recipe;
the shipped catalogue migrating into the declaration; tower and venue rows;
retire the labs; phone sheet; absent in production; recorder; pop-out.

*Proves it:* `dev-set-roundtrip` (clone a shipped set, throw one of every die
type wearing it, turn its body colour and watch the SIX DICE ALREADY STANDING
repaint — off the chamfer band's own material, which is the one number that is
both a function of the recipe and a property of the mesh, and off the portrait
bakery, whose cache is the thing nobody would notice was stale; then the
panel's own pickers, the sparse form's `default` marks, the face table
appearing only under `glyph: faces`, a Save through the armed route into a
scratch checkout, and a FRESH tab there where the set is simply one of the
sets — in `devSets()`, in the settings chip menu under its house, and accepted
by the server on a real roll, which is the half that decides whether an
authored set works at a shared table or only alone; last, a second seat, which
holds `Use at table`, `Throw one of each` and the face table and NOTHING else,
because a recipe is playback and a felt is room state),
`dev-absent-in-prod`, `dev-presets` (the door as the gate, a preset of nothing
refused by name, a Hold and an Apply read off the lamp's own SpotLight and
cannon's own gravity rather than off the tree that was asked to move them, the
row in `tuneExport()` under `presets:` and out again, and a SECOND SEAT, where
the look row lands and the film row comes back refused — the one direction
this feature could get wrong that matters, GOALPOST 2) and `dev-cards-live`
(the ring and the rig's own baked pad both moving at the flush; a dial turned
with dice in the air changing NOTHING until they land, read in one eval under
a held clock so the claim is about the gate and not about a race; and the
geometry law refusing a typed card deep enough to reach past the rim).

**Not covered, on purpose:** device emulation (CDP pins a phone); multi-
client film proofs from one tab; interpretation systems (code, by CUJ12); a
new cloth painter or tower mesh (forge and code); full YAML (anchors, block
scalars, tags, booleans).

## 12. Open questions for Joe

1. Film dials at a table of one, locked and reset when a second viewer
   arrives: is that the right line?
2. Shut resets to shipped and Fold keeps values. Or should Shut keep them
   too, leaving Reset as the only reset?
3. Will you run 8123 with `DICE_DEV_WRITE=1` so Save writes `dice.yaml`
   directly (phase 2), or is Download + the apply tool the loop you want?
4. Which film values move in phase 1 (table scale, gravity, toss height and
   speed are the candidates)? Each ships with a re-recorded poses golden.
5. Is the top-level shape in §3 the structure you want, and is
   `light.lamp.y` the right grain, or do you want it flatter?
6. Should the shipped dice sets and felts migrate into `dice.yaml` (phase
   3), making it the whole catalogue, or stay in code with the declaration
   holding only house additions?
