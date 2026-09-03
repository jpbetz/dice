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

Five separate developer doors exist today (`?demo=1`, `lab.html`,
`chrome-lab.html`, `TOWERLAB` inside main.js, and ~250 `__diceDebug`
console hooks). Developer mode becomes the one door; `?demo=1` is removed
in phase 1, and the others fold in over three phases or are retired.

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
  house.ember:
    label: Ember
    body: "#4a1d12"
    text: "#ffd9a0"
    accent: "#ff7a30"
    feel: { rough: 0.35, metal: 0.1 }
    geo:  { bevel: 0.09, profile: round }     # round | crisp
    sound: { body: chime, weight: 0.6 }

felts:
  house.moss:
    name: Moss
    cloth: felt            # felt | velvet | leather | …  (the painters in FELT_CLOTHS)
    feltBase: "#1f3a22"
    sceneBg: "#0c120d"
    breath: 0.9
```

(Names and numbers above are illustrative; the first commit writes the
real file from the shipped values. Sections are the app's nouns; a leaf's
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
the tab that opened it. Phase 3 also drops `js/devmode.js` and
`css/dev.css` from the production upload so it is *absent*, not just off.

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
│                                                     │ cast sets felts file  ││
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
  the disc is where they may roll and stay in shot), every card's
  **footprint** (js/places.js `placardFootprint`, the same OBB `placardGap`
  separates two cards with), the **lamp's cone** where it meets the felt
  (taken off `MOOD.lamp` itself — breath-narrowed, orbit-swung — so it is the
  lamp lighting the table, not the one the file asked for; nothing is drawn
  for a cone that never reaches the felt), and the **four walls** as lines,
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
- **Footer:** the judged viewport and DPR (so a screenshot says what it
  measured), then the HUD — fps and draw calls on one line, triangles, physics
  bodies and the last film's settle seconds on the next (phase 2, built) —
  then the changed and pending counts, then the verbs.
- **Sync:** the panel holds no state. It repaints from `T` after every
  `tuneSet` and once per animation tick while open, so console
  `moodTune(...)` writes and slider writes converge without wrapping hooks.
- **Phone** (phase 3): the same rows as a bottom sheet, folded by default.
  Until then the honest phone loop is *dial on the desktop → Save → reload
  on the phone*, or *Copy patch → Paste on the phone*.

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
| Sound, Post, Cards sections | `voices.js` reads `T` at event time; bloom uniform; placard geometry | 2 | M |
| HUD | fps ring, `renderAudit` calls and tris, bodies, settle time | 2 · **built** | S |
| Clock | freeze, step one frame, scrub the running film's keyframes | 2 · **built** | S |
| Seeded bench and replay | throw with a chosen seed (labelled *bench* in the log; values still through `composeRoll`); replay the last seed | 2 · **built** | S |
| A/B slots | hold two patches, flip on `x`, replay the last seed when a film key differs | 2 · **built** | S |
| Framing overlay | the fit hull, spots, placard frames, lamp cone, walls, drawn from the film's own functions | 2 · **built** | M |
| Rebuild choke points | `rebuildFloor()`, `rebuildDice()`; promote reload rows to live | 3 | M |
| Presets | named patches under `presets:` in the declaration, applied like a paste | 3 | S |
| Venue light as a layer | `venues.<id>.light` composed through `tuneSet`; until then the Save verb drops the rows `venueLightPatch()` names while a venue holds them (`devWriteSave`, js/main.js) | 3 | M |
| `felts:` editor | felt row form; live on the felt; Save appends the row | 2 | M |
| `sets:` editor | the lab's set builder moved onto the live felt; full recipe | 3 | L |
| Shipped catalogue migrates | `themes.js` sets and `FELT_THEMES` rows move into the declaration, one kind per commit | 3 | M |
| Towers and venues rows | cosmetic rows over `towerRegisterGlb` and `VENUES`; meshes stay forge bakes | 3 | L |
| Retire `lab.html`, `lab.js`, `TOWERLAB`, two shot tools | once the sets section and the overlay host them | 3 | S |
| Phone sheet | 44px rows, steppers | 3 | M |
| Absent in production | the upload drops `devmode.js` and `dev.css` | 3 | S |
| Recorder | dial ops to a `tools/steps` skeleton; download only, never the route | 3 | L |
| Pop-out window | `dev.html` + `BroadcastChannel`, for a second monitor | 3 | L |

## 9. Assets

The rule: **an asset is a row under `sets:`, `felts:`, `towers:` or
`venues:` in the declaration; the app resolves ids at use time; the editor
writes the row, calls the kind's cache-bust and re-apply, and Save appends
it.** Code-only stays code-only, and the panel says so ("a new cloth is a
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
  house prefix so a custom row never shadows a shipped one.
- **Dice set.** The recipe is already pure data (themes.js:36-135). Editor
  = the lab's set builder moved into a sets section on the live felt: every
  change, debounced, runs `registerSet` → `bustDie` → `bustArt` (new) →
  reskin standing dice. Code-only: a new pattern, particle or decal kind,
  voice body, die type.
- **Mat.** A colour row over an existing cloth: two colour pickers, breath
  and mottle sliders, a cloth select; apply = bust the felt tile +
  `applyFeltTheme` + re-render swatches. Code-only: a new cloth.
- **Tower / venue** (phase 3). `towerRegisterGlb(id, url, opts)` already
  mints a row at runtime; the row is the cosmetic half only. The mesh stays
  a forge bake; portals stay in the GLB.
- **The shipped catalogue** (phase 3): the sets in `themes.js` and the felt
  rows in main.js migrate into the declaration one kind per commit, so the
  file becomes the whole catalogue and not only the house additions.

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
bite); `dev-felt-roundtrip` (a felt authored on the felt, saved to a scratch
root, shows in a fresh tab's picker).

**Phase 3, assets in depth, and shape.** Sets editor with the full recipe;
the shipped catalogue migrating into the declaration; tower and venue rows;
retire the labs; phone sheet; absent in production; recorder; pop-out.

*Proves it:* `dev-set-roundtrip` (define a set, throw it, save, reload, it
is in the menu and rolls at a real table after restart) and
`dev-absent-in-prod`.

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
