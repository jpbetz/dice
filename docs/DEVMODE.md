# Developer mode

*Status: PROPOSAL, 2026-09-02, for Joe's review before the build. Nothing
here is built. Binding authority is [GOALPOST.md](GOALPOST.md); every other
rule this design touches is guidance, and §2 says which ones it sets aside.*

*Brief (Joe, 2026-09-02): "dramatically build out the demo section of the
app … think of the app as having a developer mode … a UX for building out
improvements … anyone doing some keyboard shortcut can go into developer
mode (an upgrade from `?demo=1`) … its own UI elements and capabilities … a
lot of the system constants modifiable … all developer mode settings
exportable to a config file … possible for me to actually overwrite a file
in the repo with that file … one option to turn off demo mode in production
… the ability to define dice sets or mats or other assets."*

## 1. The pitch

Press `` ` `` on any table and a panel folds out of the right edge with the
system's constants as dials: light, table, camera, throw, pace, sound. Drag
one and the scene moves. The values live in one checked-in data file,
`js/tunables.js`, which the app reads at boot; the panel diffs your dials
against that file and **Save** writes the file back byte for byte, so
`git diff js/tunables.js` is the review and `git commit` is the ship. The
same panel is where the demo cast (fake players, region overlay, throw from
any seat) now lives, and where dice sets and mats get defined as data rows
in a second checked-in file. A two-line module, `js/devflag.js`, is the
production off switch, left on for now.

Five separate developer doors exist today (`?demo=1`, `lab.html`,
`chrome-lab.html`, `TOWERLAB` inside main.js, and ~250 `__diceDebug`
console hooks). Developer mode becomes the one door; the others fold into
it over three phases or are retired.

## 2. Assumptions challenged

| Inherited assumption | Decision |
|---|---|
| **Demo is solo-only** (demo.js header, TESTING.md, argued as a GOALPOST 2 law). | **Replaced by a rule per dial, not per door.** GOALPOST 2 forbids forking the shared film; GOALPOST 7 says framing and pacing may differ per viewer. So each dial is classed **look** (per-viewer: light, fog, camera, pacing, chrome) or **film** (feeds the shared bake: physics, toss, spawn, table geometry). Look dials work at any table. Film dials work while you are the only seat, and lock when a second viewer arrives. |
| **Every plain visit mints a room**, so a solo-only shortcut would refuse on the very tab Joe has open (main.js:159-182; three critics found this). | Handled by the rule above: a room of one is a table of one. `?demo=1` remains the room-less bench for the harness. |
| **Constants are `const`s beside their consumer** (~120 frozen primitives across 9 files). | The *value* moves to `js/tunables.js`; the *reason* moves to the dial's `why` column. Selectively: week one moves the fifteen tune objects that already have re-apply functions (zero consumer edits) plus a few named consts. The rest move one per commit when wanted, not by inventory. |
| **The URL carries no user state** (GOALS §7, GOALPOST 4). | Kept. The key sets a tab-local boolean; nothing is stored, mirrored or stripped; no new param. |
| **Zero-dep, no build step.** | Kept, and it decides the file format: a JS module with a JSON body is the only pre-evaluation load a 33k-line synchronous module graph can take, and Node imports the same file for the drift test. |
| **The demo panel is inline styles, no stylesheet** (main.js:25836). | Set aside. `css/dev.css` is injected when the door opens and removed when it shuts; the unpressed tab still loads nothing. |
| **The felt owns zero standing chrome on the right** (style.css:285). | Set aside while open, as an **overlay, not a column**. A rail that resizes the felt makes you judge a frame no player has (GOALPOST 8). Fold hides the panel entirely with values held, so the picture you judge is the player's. |
| **Repo writes are a main-session act** (forge/promote.mjs). | Set aside narrowly: Download + a one-line Node tool in phase 1; an env-armed loopback route on the local server in phase 2. |
| **`DEMO_LIGHT_DIALS`, `DEMO_LIGHT_BASE`, `demoLight`, the inline panel.** | Hard drop. They were the prototype of this. |

## 3. Structure

### Files

| Path | Role |
|---|---|
| `js/tunables.js` | **new, checked in, emitter-owned.** `export const TUNABLES = {…}` with a pure JSON body. The file Save overwrites. |
| `js/devflag.js` | **new, two lines.** `export const DEV_ENABLED = true;` The production off switch. No emitter ever touches it. |
| `js/tune.js` | **new, Node-pure** (no DOM, no three, no cannon, no `location`). `SHIPPED`, `T`, `DIALS`, `bindDial`, `tuneSet / tuneDiff / tuneReset`, `emitTunables / parseTunables`. |
| `js/devmode.js` | **new.** The panel. Loaded by dynamic `import()` only when the door opens. |
| `css/dev.css` | **new.** Panel styles on the existing tokens. Injected on open, removed on shut. |
| `js/assets.js` | **new, phase 2, emitter-owned.** `export const ASSETS = { version, sets: {}, felts: {} }`, merged into the shipped catalogues at boot. |
| `tools/tunables-apply.mjs` | **new.** `node tools/tunables-apply.mjs ~/Downloads/tunables.js` validates, re-emits and writes atomically. Shared validator with the phase-2 route. |
| `js/main.js` | Tune objects aliased into `T`; `bindDial` beside each re-apply; `const DEMO` becomes `devState`; backtick in the global key switch; `tune*` / `dev*` hooks. |
| `js/demo.js` | `resolveDemo` returns a mode; the cast/sweep logic is unchanged. |
| `server.js` | Phase 2 only: `POST /api/dev/write`, mounted only under `DICE_DEV_WRITE=1`. |

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
- **`?demo=1`** still works: it boots developer mode with the panel folded
  and the harness cast dealt, room-less, exactly as today's demo tab. The
  e2e harness and the tools/steps scripts keep riding it unchanged.
- **Cheat sheet:** the `?` overlay gains one row, `` ` `` developer mode,
  hidden when the flag is off.

### The film lock

`devState = { mode: 'off' | 'on', filmLocked: bool }`. Film dials and the
cast are live when `placeRows().length <= 1` or the tab is room-less. When
a second seat appears in the roster, film values reset to shipped, the cast
is cleared, and the rows show ▲ with one line: *a second viewer is here;
film values are shared.* When the seat leaves, the rows unlock. Look dials
never lock.

### The production off switch

```js
// js/devflag.js
// THE PRODUCTION SWITCH. false bricks both doors (the key and ?demo=) and
// hides the cheat-sheet row. Kept out of js/tunables.js on purpose: Save
// must never be able to flip it back on.
export const DEV_ENABLED = true;
```

`false` means `resolveDemo` and the key both return off, `devmode.js` is
never imported, and every mutating `dev*` / `tune*` hook returns null. It is
a lock, not a boundary: `__diceDebug.moodTune` stays on the console as it
does today, and that is enough because developer mode can only affect the
tab that opened it. Phase 3 also drops `js/devmode.js` and `css/dev.css`
from `.gcloudignore`'s upload so production is *absent*, not just off. Why
not a field in the tunables file: the first Save after production flipped
it would write `true` back.

## 4. The tunables registry

Values and rows are kept apart. **Values** are the tree in `js/tunables.js`
(leaves are number, string or boolean; path is the dotted key). **Rows** are
`DIALS` in `js/tune.js`, one per leaf that gets a control. A leaf without a
row is still exported, diffed and reset; a row without a leaf fails the
drift test.

```js
// js/tune.js
export const DIALS = [
  // path                  label          group    min   max   step  cls     read     why
  ['table.scale',         'table scale', 'Table',  1,    4,    0.05, 'film', 'apply', 'the one dial for table size (Joe 2026-09-01)'],
  ['mood.lampY',          'lamp height', 'Light',  5,    80,   0.5,  'look', 'apply', 'pool ~27 at the felt over a 13.75 table'],
  ['mood.lampColor',      'lamp colour', 'Light',  null, null, null, 'look', 'apply', ''],      // '#rrggbb' → colour input
  ['framing.preferDice',  'prefer dice', 'Camera', null, null, null, 'look', 'frame', ''],      // boolean → switch
  ['physics.gravity',     'gravity',     'Throw', -300,  -20,  1,    'film', 'apply', ''],
  ['tempo.k',             'tempo',       'Pace',   0.25, 4,    0.05, 'look', 'frame', 'playback speed, never the bake'],
  ['ceremony.declareS',   'declare dwell','Pace',  0,    4,    0.05, 'look', 'reload','const today; read once at boot'],
];
```

- `cls` is **look** or **film** (§3). `tuneSet` refuses a film write while
  the film is locked.
- `read` says when a value lands: `frame` (read every tick, live for
  free), `roll` (next roll), `apply` (a binder calls an existing re-apply
  function), `reload` (read once at module evaluation; the row shows ⟳ and
  *Save & reload* is the verb).
- Ranges are the slider's, not the law's: the number field beside every
  slider takes any finite value, because "the range was wrong" is a thing
  developer mode exists to discover. Type is the law.

```js
// js/tune.js
import { TUNABLES } from './tunables.js';
export const SHIPPED = deepFreeze(structuredClone(TUNABLES));
export const T = structuredClone(TUNABLES);       // the live tree every consumer reads
const binders = new Map();                         // 'mood.*' | 'table.scale' → fn
export function bindDial(pattern, apply) { binders.set(pattern, apply); }

export function tuneSet(patch) {                   // THE writer: panel, hooks and paste all come through here
  const ran = new Set(), refused = [], pending = [];
  for (const [path, v] of Object.entries(patch)) {
    const spec = specFor(path);
    if (!spec)                                 { refused.push([path, 'unknown']); continue; }
    if (spec.cls === 'film' && filmLocked())   { refused.push([path, 'film']);    continue; }
    if (typeof v !== typeof leaf(SHIPPED, path)) { refused.push([path, 'type']); continue; }
    setLeaf(T, path, v);
    const fn = binderFor(path);                // exact, then a.b.* then a.* then *
    if (fn && !ran.has(fn)) { ran.add(fn); fn(path, v); }
    else if (spec.read === 'reload') pending.push(path);
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
is preserved.

```js
const MOOD = { on: true, lamp: null, base: {…}, tune: T.mood };   // was a literal
bindDial('mood.*', () => applyMoodLights());
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
const CEREMONY_DECLARE_S = T.ceremony.declareS;   // four read sites untouched
```

The change lands in the export and *Save & reload* applies it, because `T`
is built from the file before any module reads it. When a `rebuildFloor()`
or `rebuildDice()` exists later, one `bindDial` promotes the row to live.

**Not in the tree, on purpose:** `FIXED_DT`, the RNG, `AIM_ZERO`, anything
shared with the server (`PLACE_MAX`, `MAX_PHYSICAL_DICE`), copy strings,
enumerations, `DEV_ENABLED`. `places.js` is imported by `server.js`, so it
never imports `tune.js`; its toss constants get a client-side override
object in phase 2.

**Venues:** the fae venue `Object.assign`s `MOOD.tune` wholesale at
moonrise and restores it on exit. Phase 1: while a venue is active, `mood`
rows carry a **venue** badge and Save refuses the group with one line.
Phase 2: the venue's light becomes a layer in the same file
(`venues.<id>.mood`) composed through `tuneSet`.

## 5. The config file

```js
// (Apache 2.0 header)
//
// THE TUNABLES. Every system constant developer mode can move, at its
// shipped value. Written by developer mode (File → Save) or by
// tools/tunables-apply.mjs; hand edits are fine but the next Save
// re-formats them. The body is a JSON object literal so the export
// reproduces this file byte for byte. Labels, ranges, classes and reasons
// live in js/tune.js DIALS.
export const TUNABLES = {
  "version": 1,
  "table": { "scale": 2.5, "ceilingY": 22 },
  "mood": {
    "hemi": 0.1, "key": 1.7, "rim": 0.4,
    "lampIntensity": 2.8, "lampColor": "#ffe8c4",
    "lampY": 24, "lampZ": 1.5, "lampAngle": 0.85, "lampPenumbra": 0.75,
    "fogNear": 15, "fogFar": 46
  },
  "physics": { "gravity": -110, "solverIterations": 14, "floor": { "friction": 0.6, "restitution": 0.15 } },
  "tempo":   { "k": 1, "flight": 0.8, "settle": 25 },
  "ceremony":{ "declareS": 1.35, "hitstopS": 0.11, "dismissMs": 7000 }
};
```

(The real file is `JSON.stringify(tree, null, 2)`, one key per line. The
first commit writes it *with* the emitter so the byte-identity test is
green on day one.)

- **Why a JS module:** it loads before the ~85 module-evaluation consumers
  with no await and no race; `js/` is already served `no-cache` with a
  content-hash ETag, so a rewritten file is live on reload with no restart;
  it needs no parser; Node imports it for tests. JSON-with-import-attributes
  lost on browser support and a MIME row; YAML lost because `portable.js` is
  a domain grammar, not a YAML reader.
- **Byte identity:** `emitTunables(SHIPPED) === readFileSync('js/tunables.js')`
  is a unit test. Keys stay in file order (the tree never gains a key at
  runtime; unknown paths are refused), so after a dial moves, the diff is
  exactly the lines that moved.
- **Three ways out of the browser:**
  1. **Download** (phase 1): the emitted file, then
     `node tools/tunables-apply.mjs ~/Downloads/tunables.js` validates
     against the current key set, re-emits, writes atomically and prints the
     diff summary.
  2. **Save** (phase 2): `POST /api/dev/write { file, value }`. The client
     posts the *object*; the server runs the same emitter and writes.
     Nothing posted is ever written verbatim. Mounted only under
     `DICE_DEV_WRITE=1` (which `make deploy` never sets), loopback only,
     same-origin only, `file` in a fixed allowlist of two paths, atomic
     rename. Unarmed, the button relabels itself *Download*.
  3. **Copy patch** (phase 1): clipboard, changes only, as
     `{ "version": 1, "patch": { "mood.lampY": 30 } }`, for a phone, another
     tab, or a commit message. **Paste patch** previews then merges, never
     replaces.
- **Diff vs shipped:** the File section lists every changed path as
  `path · shipped → live · class` with per-row revert, per-group reset and
  reset-all, plus the line diff of the emitted file.
- **Versioning:** an integer in the file and in every patch. Bumping it is
  a deliberate act in the commit that renames or removes a key; a patch of
  another version is offered as a download before it is dropped.
- **No localStorage draft in phase 1.** Three critics found it the most
  complex piece and the least needed: it leaks across e2e scenarios on one
  origin and would be the only path by which a stored blob feeds film values
  into a tab at boot. The file is the transport.

## 6. UI

Desktop: a fixed overlay at the right edge, 320px wide, z-index below the
modal layer so Settings still disables it honestly. The panel stops key
propagation (today's demo panel leaks `c` from a focused button and clears
the table), handles its own Esc, and is not in the app's Esc chain, so `r`,
`c` and digits stay live while dialing.

```
┌──────────────────────── felt (the player's frame, untouched) ────────────────┐
│                                                     ┌─ DEV ──────── ` fold ─┐│
│                                                     │ Table Light Camera    ││
│                                                     │ Throw Pace Sound      ││
│                                                     │ Cast Assets File      ││
│                                                     │ find a dial ________  ││
│                                                     │───────────────────────││
│                                                     │ LIGHT · 3 changed  ↺  ││
│                                                     │ lamp height ━━━●━━ 30 ││
│                                                     │ lamp cone   ━━●━━ .85 ││
│                                                     │ lamp colour [■ #ffe8c4││
│                                                     │ room (hemi) ━●━━━ .10 ││
│                                                     │ fog far     ━━━●━━ 46 ││
│                                                     │ ▸ breath  ▸ motes     ││
│                                                     │───────────────────────││
│                                                     │ THROW · film ▲ locked ││
│                                                     │ gravity  ━━━●━━━ -110 ││
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

- **Sections** are the file's top-level groups, one to one: Table, Light
  (mood, breath, motes, towerlight, life), Camera (framing, camera), Throw
  (physics, spawn, nudge, place aim, toss), Pace (tempo, ceremony, clear),
  Sound (phase 2), Cast, Assets (phase 2), File. **Find** filters by label
  or path; a hundred dials need it more than tabs do.
- **Rows** are generated from `DIALS`: number → range + typeable value;
  `#rrggbb` → colour input; boolean → switch; options → segmented control.
  A changed row gets a dot and a hover revert; film rows ▲ when locked;
  reload rows ⟳ with a stepper.
- **Cast** is today's demo rows verbatim: players 0–8, reshuffle, sit
  prev/next, show regions, throw from seat, throw from every seat.
- **Footer:** the judged viewport and DPR (so a screenshot says what it
  measured), fps and draw calls (phase 2), changed and pending counts, the
  verbs.
- **Sync:** the panel holds no state. It repaints from `T` after every
  `tuneSet` and once per animation tick while open, so console
  `moodTune(...)` writes and slider writes converge without wrapping hooks.
- **Phone** (phase 3): the same rows as a bottom sheet, folded by default.
  Until then the honest phone loop is *dial on the desktop → Save → reload
  on the phone*, or *Copy patch → Paste on the phone*.

## 7. Capabilities

| Capability | What it does | Phase | Size |
|---|---|---|---|
| Key door, fold, Shut | backtick on any tab; fold holds values; Shut resets and removes | 1 | S |
| Film lock | film dials and cast live at a table of one; reset and lock when a second seat appears | 1 | S |
| `?demo=1` alias | boots dev mode folded, room-less, harness cast dealt | 1 | S |
| `js/devflag.js` | production off switch; hides the cheat-sheet row; never emitted | 1 | S |
| `js/tunables.js` + `js/tune.js` | values file, `SHIPPED`/`T`, `DIALS`, `bindDial`, `tuneSet/Diff/Reset`, emitter and parser | 1 | M |
| Fifteen tune objects bound | Light, Camera, Throw, Pace groups; ~90 leaves; zero consumer edits | 1 | M |
| `table.scale` + a few named consts | preset rewrite through `applyZoom`; reload-class rows | 1 | S |
| Panel + stylesheet | overlay, sections, find, generated rows, Cast, File, footer | 1 | M |
| Diff, revert, reset, Download, Copy, Paste | the loop without a server route | 1 | S |
| `tools/tunables-apply.mjs` | validate, emit, atomic write, diff summary | 1 | S |
| Hooks | `tuneGet()`, `tuneDiff()`, `devInfo()` zero-arg; `tuneSet(p)`, `tuneExport()`, `devOpen()`, `devClose()`, `devFold(b)` | 1 | S |
| Save route | `POST /api/dev/write`; env-armed, loopback, same-origin, allowlisted, atomic | 2 | M |
| Sound, Post, Cards groups | `voices.js` reads `T` at event time; bloom uniform; placard geometry | 2 | M |
| HUD | fps ring, `renderAudit` calls and tris, bodies, settle time | 2 | S |
| Clock | freeze, step N frames, scrub the last roll's keyframes | 2 | S |
| Seeded bench and replay | throw with a chosen seed (labelled *bench* in the log; values still through `composeRoll`); replay the last seed | 2 | S |
| A/B slots | hold two patches, flip on a key, replay the last seed when a film key differs | 2 | S |
| Framing overlay | the fit hull, spots, placard frames, lamp cone, walls, drawn from the film's own functions | 2 | M |
| Rebuild choke points | `rebuildFloor()`, `rebuildDice()`; promote reload rows to live | 2 | M |
| Presets | named patches in `js/tunables-presets.js`, applied like a paste | 2 | S |
| Venue light as a layer | `venues.<id>.mood` composed through `tuneSet` | 2 | M |
| `js/assets.js` + Mats editor | felt row form; live on the felt; Save to the second file | 2 | M |
| Sets editor | the lab's set builder moved onto the live felt; full recipe | 3 | L |
| Towers and venues forms | cosmetic rows over `towerRegisterGlb` and `VENUES`; meshes stay forge bakes | 3 | L |
| Retire `lab.html`, `lab.js`, `TOWERLAB`, two shot tools | once the Sets tab and the overlay host them | 3 | S |
| Phone sheet | 44px rows, steppers | 3 | M |
| Absent in production | `.gcloudignore` drops `devmode.js` and `dev.css` | 3 | S |
| Recorder | dial ops to a `tools/steps` skeleton; download only, never the route | 3 | L |
| Pop-out window | `dev.html` + `BroadcastChannel`, for a second monitor | 3 | L |

## 8. Assets

The rule: **an asset is a row in a data module; the app resolves ids at
use time; the editor writes the row, calls the kind's cache-bust and
re-apply, and exports the module.** Code-only stays code-only, and the
panel says so ("a new cloth is a painter function; see FELT_CLOTHS").

```js
// js/assets.js (phase 2)
export const ASSETS = {
  "version": 1,
  "sets": {
    "house.ember": {
      "label": "Ember", "body": "#4a1d12", "text": "#ffd9a0", "accent": "#ff7a30",
      "feel": { "rough": 0.35, "metal": 0.1 }, "geo": { "bevel": 0.09, "profile": "round" },
      "sound": { "body": "chime", "weight": 0.6 }
    }
  },
  "felts": {
    "house.moss": { "name": "Moss", "cloth": "felt", "feltBase": "#1f3a22", "sceneBg": "#0c120d", "breath": 0.9 }
  }
};
```

- **Merge before the id lists are computed.** `themes.js` merges
  `ASSETS.sets` into `SETS` before `SET_IDS` is built (today `registerSet`
  runs after, and a critic found a registered set invisible in the picker
  and rejected on the wire). `main.js` merges felts before the swatches
  render; `server.js` and `portable.js` append the ids. Ids carry a house
  prefix so a custom row never shadows a shipped one. Honest cost: the
  server reads id lists at process start, so a *new* id is accepted on the
  wire after the local server restarts.
- **Dice set.** The recipe is already pure JSON (themes.js:36-135). Editor
  = the lab's set builder moved into a Sets section on the live felt: every
  change, debounced, runs `registerSet` → `bustDie` → `bustArt` (new) →
  reskin standing dice. Code-only: a new pattern, particle or decal kind,
  voice body, die type.
- **Mat.** A colour row over an existing cloth: two colour pickers, breath
  and mottle sliders, a cloth select; apply = bust the felt tile +
  `applyFeltTheme` + re-render swatches. Code-only: a new cloth.
- **Tower / venue** (phase 3). `towerRegisterGlb(id, url, opts)` already
  mints a row at runtime; the form is the cosmetic half only. The mesh stays
  a forge bake; portals stay in the GLB.

## 9. Honesty and safety

- **Nothing on the wire** (GOALPOST 2). `tuneSet` never calls `net`; no
  dial, cast row, bench roll or A/B slot leaves the tab. Film writes are
  refused while a second seat is present, and reset when one arrives. Proof:
  `dev-room-look`: a two-browser room, the second browser opens the panel,
  a gravity write is refused, a lamp write takes, and after a roll both
  keyframe hashes are equal.
- **No rigged values** (GOALPOST 2). No dial reaches face correction, the
  RNG, the server parse or reveal framing. The seeded bench draws values
  through `composeRoll` from a chosen seed, never chosen faces, and is
  stamped *bench* in the log. Proof: a unit test walks every `DIALS` path
  against a denylist (`rng`, `values`, `face`, `seed`, `fixedDt`).
- **Nothing durable in the URL** (GOALPOST 4). Proof: `dev-key-door`
  asserts `location.search` and localStorage unchanged after open, fold,
  shut.
- **Nothing modal** (GOALPOST 5). The panel never enters the modal stack.
- **The write route cannot be used against Joe.** Object in, emitter out;
  env-armed; loopback; same-origin; allowlist of two paths; atomic. Proof:
  a spawned-server test under a scratch `DICE_DEV_ROOT`: unarmed → 404;
  armed → the re-imported file deep-equals; refuses `../`, a foreign
  origin, a non-allowlisted file, a non-loopback address. No test ever
  writes into the checkout.
- **The unpressed tab is the tab it was.** No stylesheet, module, scene
  object or draw call until the door opens. Proof: `dev-door-shut` (today's
  `demo-door-shut`, extended with an open-dial-shut leg) deep-equals
  framing, places, placard budget, bodies, extents and draw count, and
  `feltPoses` after one seeded throw.
- **The off switch is real, and its proof fires.** A second server from a
  temp copy of the tree with `DEV_ENABLED = false` boots `?demo=1` and
  asserts no panel, `devOpen() === null`, cheat-sheet row hidden.
- **Goldens move only when a film value ships.** The byte-identity test
  pins the file; a film-class change is visible in `git diff`, and the
  commit that ships it re-records the one-seed-one-film golden and says why.

## 10. Phases

**Phase 1, the loop exists.** Four commits, each green alone:

1. `js/tunables.js` (written by the emitter), `js/tune.js`, `js/devflag.js`,
   the fifteen tune objects aliased and bound, `table.scale` and a few
   reload-class consts, `tests/tunables.test.mjs`.
2. The door: `resolveDemo` modes, `devState`, backtick, fold, Shut, film
   lock, `?demo=1` folded, hooks, cheat-sheet row.
3. `js/devmode.js` + `css/dev.css`: sections, find, generated rows, Cast
   moved in, the inline panel deleted, File with diff, Download, Copy,
   Paste.
4. `tools/tunables-apply.mjs` and the scenarios `dev-door-shut`,
   `dev-key-door`, `dev-room-look`, `dev-off-switch`, `dev-export-roundtrip`.

*Proves it:* `dev-export-roundtrip` boots `?demo=1`, sets lamp height and
table scale, asserts the lamp moved and the extents widened at the roll
boundary, and asserts the exported text equals the Node emitter's output
for the same patch. And Joe's own moment: on the 8123 preview, press `` ` ``,
widen the lamp, fold, look at exactly the player's frame, unfold, Download,
run the apply tool, and `git diff` is three lines.

**Phase 2, the loop closes into the repo and into tests.** The Save route;
Sound, Post and Cards groups; clock, bench, replay, A/B, HUD; framing
overlay; rebuild choke points; presets; venue light as a layer;
`js/assets.js` with the Mats editor.

*Proves it:* `dev-write-route`; `dev-ab-same-seed` (A and B differing on
lamp height give identical `feltPoses`; differing on floor friction give
different poses on the same seed); `dev-mat-roundtrip` (a felt authored on
the felt, saved to a scratch root, shows in a fresh tab's picker).

**Phase 3, assets in depth, and shape.** Sets editor with the full recipe;
tower and venue forms; retire the labs; phone sheet; absent in production;
recorder; pop-out.

*Proves it:* `dev-set-roundtrip` (define a set, throw it, save, reload, it
is in the menu and rolls at a real table after restart) and
`dev-absent-in-prod`.

**Not covered, on purpose:** device emulation (CDP pins a phone); multi-
client film proofs from one tab; interpretation systems (code, by CUJ12); a
new cloth painter or tower mesh (forge and code).

## 11. Open questions for Joe

1. Film dials at a table of one, locked and reset when a second viewer
   arrives: is that the right line, or should film dials be room-less
   (`?demo=1`) only?
2. Shut resets to shipped and Fold keeps values. Or should Shut keep them
   too, leaving Reset as the only reset?
3. Will you run 8123 with `DICE_DEV_WRITE=1` so Save writes the checkout
   directly (phase 2), or is Download + the apply tool the loop you want?
4. Which film values do you want moved in phase 1 (table scale, gravity,
   toss height and speed are the candidates)? Each ships with a re-recorded
   feltPoses golden.
5. A second data file `js/assets.js` merged at boot (local server restart
   to accept a new id on the wire), versus splicing rows into `themes.js`?
6. Retire `lab.html` and `js/lab.js` once the Sets section hosts the
   builder?
