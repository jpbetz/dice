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

// DEVELOPER MODE — the panel (docs/DEVMODE.md §7). Built from js/devui.js
// over a Tune (js/tune.js's shape, pinned by the build contract). Imported
// dynamically by main.js when the door opens; never at boot, never in
// production — `mount` THROWS in production mode so a caller that forgot the
// guard fails loudly rather than drawing a register nobody should see.
//
// THE PANEL HOLDS NO STATE. Sections are `tune.sections()`, rows are the
// leaves of `tune.SHIPPED` drawn by their dial, and every value on screen is
// re-read from the tune on `repaint()` — after every write here and, once
// main.js wires it, once per animation tick — so a console `tuneSet` and a
// slider write converge without either wrapping the other. What it does
// keep: which section is showing, the find filter, the fold, the film lock,
// and the footer's last readings. None of that is a value. Even the reload
// count is DERIVED on every repaint from `tune.diff()` + `tune.binderFor`,
// so a console `tune.set({'table.ceilingY': 23})` lands a reload row and
// the Save & reload button exactly as a stepper click would.
//
// `app.mode` is not a dial (DEVMODE §4): the contract's DIALS lists it as a
// pick, but the panel draws it as a read-only row so no control here can
// write it and a Save from a running session can never flip it.
//
// NOTHING HERE TOUCHES `location`, `localStorage`, `fetch` or the network
// (GOALPOST 2, 4). The verbs that leave the tab — download, copy, paste,
// save — are handed in by the caller as `verbs`, and the panel only calls
// them. The contract's fallback for "Save & reload" without a `saveReload`
// verb was download-then-`location.reload()`; this file keeps the stronger
// rule and reports "downloaded — reload to apply" instead.
//
// `bench` (optional, phase 2): the instruments — `{ hud, clock, freeze, step,
// scrub, bench, replay, last, hold, apply, flip, ab, pool }`. Given one, the
// panel grows a `clock` section (freeze / step / scrub), a `bench` group in the
// cast section (seed / Throw / Replay) and an `ab` section (two held patches
// and the `x` flip). Given none, the panel is exactly the panel phase 1
// shipped. The panel keeps no bench state either: the seed BOX is its own (a
// place a person types, like the find filter and the paste box), and every
// other number on those three sections is asked of the bench each repaint.
//
// `felts` (optional, phase 2): the first ASSET editor — `{ fields, list, add,
// set, remove, apply }`. Given one, the panel grows a `felts` section: a
// picker over every felt this build has (the ones it ships and the ones the
// declaration adds), a form over the row's own fields, Clone / Apply to table
// / Remove. A SHIPPED row is drawn read-only, because a row that lives in
// main.js is not one this file can write; Clone is how you get an editable
// copy of it. The panel holds no felt state either — which row the form is
// editing is a choice, like the visible section, and every value in the form
// is asked of `list()` on the repaint beat.
//
// `sets` (optional, phase D2): the SECOND asset editor — `{ fields, list,
// recipe, clone, set, remove, apply, bench }`. Given one, the panel grows a
// `sets` section: a house picker, a set picker, and the whole dice RECIPE as
// knobs (ninety of them, in the file's own grouping), with Clone / Throw one
// of each / Use at table / Remove. Three differences from `felts`, each with
// a reason:
//   · every row is EDITABLE, because since phase D1 every recipe lives in
//     dice.yaml — there is no "shipped in code" row here to lock. What Clone
//     is for is keeping the shipped one intact while you try something;
//   · the form is nested and SPARSE — a field the row does not carry is drawn
//     at its dial's default wearing the `default` mark, because that is what
//     the die is already doing (js/tune.js RECIPE says where each default
//     came from);
//   · the film lock holds only TWO verbs (Throw, Use at table) and one field
//     (`faces`), not the whole section, because a recipe is per-viewer
//     playback while a felt is room state. The panel does not decide that —
//     `tune.set` refuses `faces` on its own, and the api answers null for the
//     two verbs — it only draws it.
// …and one gate that is nobody's lock: **Use at table** also waits on the
// FILE. A row's `inFile` says whether dice.yaml declares it, the server
// resolves a rolled set out of dice.yaml, so wearing a row that is only in
// this session's tree 400s every roll (the D2 review, 2026-09-03). The button
// is drawn disabled with `REASON.unsaved` on it until a Save lands.
//
// `info` (optional): `{ declared, venue, venueLight }` — `declared` is the
// tree the file names (a leaf absent from it wears the faint "default"
// mark); `venue` is the id of a venue holding the light, or null (light rows
// wear a `venue` badge while one does); `venueLight` is the light the venue
// holds as `{ 'light.lamp.y': 22, … }`, which is what a light reset lands on
// while it stands (a venue named with no `venueLight` has its light rows
// refused by every reset, with one line). All are read on every repaint or
// reset, so a live object keeps the marks honest.

import {
  el, button, segmented, section, subhead,
  rowRange, rowStepper, rowColor, rowEnum, rowSelect, rowText, rowStatic,
  find, diffList, status, stopKeys, fmtNum,
} from './devui.js';
import { assetRowPath, STATIC_PATHS } from './tune.js';

export const DEV_PANEL_ID = 'dev-panel';
// Drawn, never written (DEVMODE §4). The list is tune.js's, not a copy: the
// panel draws static exactly the leaves `tune.set` refuses as 'static', so
// the two can never disagree about which those are (2026-09-02, B3 review:
// the panel's own copy drew app.mode static while its Paste box wrote it).
export const READ_ONLY_PATHS = STATIC_PATHS;
export const DEV_GLYPH_ID = 'dev-glyph';
// THE PHONE (docs/DEVMODE.md §7, phase D5). One query, read in two places
// that have to agree: css/dev.css turns the right-edge column into a bottom
// sheet on it, and `mount` reads it for the two things a stylesheet cannot do
// — start the panel FOLDED (the first thing a phone shows is the table) and
// draw every range row as a STEPPER, because a slider thumb is not a target a
// fingertip can hit a value on. A coarse pointer counts however wide the
// window is: a touchscreen at 1200px has the same fingers.
export const DEV_PHONE_QUERY = '(max-width: 639px), (pointer: coarse)';
// The name phase 1 gave it, kept because the panel's contract published it.
export const DEV_NARROW_QUERY = DEV_PHONE_QUERY;
export const STATUS_MS = 3000;
export const CAST_MAX = 8;
export const CAST_POOL = '3d6';
// THE OVERLAY'S FOUR STATES, in the order they are offered: off, then each
// picture, then both — so the row reads left to right as "less to more" and
// the first button is always the one that puts the felt back.
export const OVERLAY_STATES = Object.freeze(['disabled', 'regions', 'framing', 'all']);

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toPath = (p) => (Array.isArray(p) ? p : String(p).split('.'));
const dotted = (p) => (Array.isArray(p) ? p.join('.') : String(p));

// Walk a dial tree by path (the fallback when a tune has no `dialAt`).
function dialFromTree(dials, path) {
  let node = dials;
  for (const k of toPath(path)) {
    if (!isMap(node) || !(k in node)) return null;
    node = node[k];
  }
  return isMap(node) && 'def' in node && 'cls' in node ? node : null;
}

function leafIn(tree, path) {
  let node = tree;
  for (const k of toPath(path)) {
    if (!isMap(node) || !(k in node)) return { has: false };
    node = node[k];
  }
  return { has: !isMap(node), value: node };
}

function stringOf(v) {
  return typeof v === 'number' ? fmtNum(v) : JSON.stringify(v);
}

// Reasons in the words a person reads on the status line.
const REASON = {
  unknown: 'no such dial',
  static: 'not a dial: set it in dice.yaml or DICE_MODE',
  film: 'film values are shared — a second viewer is here',
  type: 'wrong type',
  option: 'not one of the options',
  // A LIST DIAL'S LENGTH (js/tune.js `list`): six faces, one or two decal
  // colours. Not a slider's range — a list has no slider.
  range: 'not as many entries as that list takes',
  binder: 'the re-apply hook threw — value put back (see console)',
  // …and the three an ASSET row can be refused for (js/tune.js addRow).
  shipped: 'that row lives in the code, not the file — Clone it to author one',
  id: 'not a legal id: lower-case letters, digits, "-" and "_", no dot',
  // Re-worded in the D1 review: it used to say "this build cannot declare
  // rows in that section yet", a state that ended when the catalogue landed
  // (every named section has a row shape now). What is left is a path that
  // does not name a collection of rows at all.
  section: 'that path is not a collection of rows',
  // A row lands or leaves WHOLE (js/tune.js): one field of a row that is not
  // there cannot put it back, and one field of a row this session minted has
  // no shipped value to go back to.
  row: 'that row is not there — revert it whole, or Reset all',
  // …and the two the SETS editor adds (js/main.js devSetApply, devSetClone).
  // `unsaved` is the one that matters: a dice set rides every roll to the
  // server, which resolves it out of dice.yaml, so wearing a row the file does
  // not have yet 400s the roll button with nothing on screen to say why.
  unsaved: 'Save the row first — the server only accepts a set dice.yaml declares',
  taken: 'a row of that id is already here — Remove it, or clone under another name',
  // …and the three phase D4 added. The first two are LAWS (js/tune.js LAWS):
  // a check no slider range can make, refused at the typed number.
  'range-law': 'must be greater than zero — the code divides by it',
  geometry: 'a card must stand outboard of the rim: standoff − depth/2 may not go below 0',
  // A preset of nothing is not a preset: `changes()` speaks in leaves, so an
  // empty row is one Save could never write down.
  empty: 'nothing is changed — turn a dial first',
  // …and the one the POP-OUT refuses for itself (the D5 review, 2026-09-03).
  // Every other reason here is the table's; this one is the absence of a
  // table. dev.html's mirror stops writing the moment the link goes stale, so
  // a row cannot go on showing a value nobody is holding.
  gone: 'no table tab — open the door there with `',
};

// Is this dotted path a FIELD of an asset row (`felts.house-moss.name`, or
// `houses.gildhall.dice.oxblood.geo.bevel` since the catalogue arrived)? The
// row, not the field, is the unit a reset moves. js/tune.js owns the walk —
// two segments is no longer the answer, because a dice set is four.
const assetRowOf = (dotted) => {
  const p = assetRowPath(String(dotted).split('.'));
  return p && String(dotted).split('.').length > p.length ? p.join('.') : null;
};

// HOW LONG A DRAGGED FELT FIELD WAITS BEFORE IT REPAINTS THE CLOTH. A felt
// apply is not a light dial: it redraws a 1024px tile, the gloss map and the
// whole mottle attribute, so a slider dragged at 60 Hz would ask for sixty of
// them a second. 140 ms is the brief's number and it reads as live — the
// commit (mouse-up, Enter, a colour picked) never waits.
export const FELT_LIVE_MS = 140;

// ---------------------------------------------------------------------------
// THE RECORDER'S EMITTER (docs/DEVMODE.md §8, phase D5)
// ---------------------------------------------------------------------------
//
// WHY A STEP AND NOT A SAVE. Everything else developer mode writes down is a
// VALUE — a leaf in dice.yaml, a row under `felts:` — and the armed route
// (§6) puts values in the checkout. A recorded session is not a value; it is
// a SCRIPT, and a script is code. So this never goes near the write route:
// `emitStep` returns text, the panel hands it to the browser's own download,
// and a person reads it before it becomes a file in `tools/steps/`. The route
// writes one file and validates every byte of it against the dial tree
// (server.js DEV_WRITE_ON); nothing about it could ever be widened to "and
// also arbitrary JavaScript" without giving away exactly what makes it safe.
//
// WHAT IT EMITS IS A SKELETON, and it says so in its own head: the ops in
// order, a `stage.shot` after each, and a settle wait after every throw. What
// it CANNOT know is what the shots are for — which frames matter, what to
// assert, which origin, how many chairs — so it leaves the loop shaped and
// the judgement to the person. `tools/steps/dev-look.mjs` is the hand-written
// article this is a first draft of.
//
// The ops are js/main.js's (`devRecord`): `{op:'set', patch}` from the tune's
// own watcher, `{op:'deal', n}` and `{op:'sit', k}` from the cast, and
// `{op:'throw', seed, notation}` from the bench — the seed included, always,
// because a throw without its seed is a step that films something else every
// time it runs.
//
// AND TWO MORE SINCE THE D5 REVIEW (2026-09-03), because a sets-editing
// session emitted a step that replayed none of it:
//   · `{op:'row', verb:'add'|'remove', where, id, row}` — a CLONE, written
//     down whole. `tuneSet` refuses a field of a row that is not there ('row'
//     — js/tune.js: the row is the unit), so a reel that recorded eighty
//     recipe edits and not the clone they were edits OF was a reel with
//     nothing replayable in it. `devRowAdd` / `devRowRemove` (js/main.js) are
//     the door it replays through;
//   · `{op:'note', text}` — the one thing the reel knows that the emitted code
//     cannot say for itself: a field it could not carry, and why. It takes no
//     act number and no frame, because it is not something the step DOES, and
//     a reel of nothing but notes still emits them rather than the "nothing
//     was recorded" skeleton — the notes ARE the answer to "why is this
//     empty?".

// A file stem a shell and a filesystem both take, from whatever was typed.
export function stepName(name) {
  const s = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 48) || 'recorded-step';
}

// A JS string literal that reads: single quotes while the content allows it
// (a step is read by a person), JSON's own escaping when it does not.
const jsStr = (s) => (/^[^'\\\n\r]*$/.test(String(s)) ? `'${s}'` : JSON.stringify(String(s)));

const APACHE = `/*
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
*/`;

export function emitStep(name, ops = []) {
  const stem = stepName(name);
  const list = Array.isArray(ops) ? ops : [];
  const out = [];
  // ACTS, NOT REEL POSITIONS (the D5 review, 2026-09-03). The number in the
  // comment and the number in the frame's filename are now the SAME number, so
  // `// 3 · light.lamp.y` is the act whose shot is `03-set-3.png`. They were
  // the op's position in the reel, which counts the ops that take no frame —
  // one note in front of one dial and the file's only act was labelled 2 over
  // a shot named 01.
  let acts = 0;
  let notes = 0;
  const shot = (label) => { out.push(`  await shot(${jsStr(label)});`); };
  // An act is a thing the step DOES: it gets the next number and a frame.
  const act = (title) => { acts++; out.push('', `  // ${acts} · ${title}`); return acts; };
  for (const raw of list) {
    const op = raw || {};
    if (op.op === 'set') {
      const patch = op.patch && typeof op.patch === 'object' ? op.patch : {};
      const paths = Object.keys(patch);
      if (!paths.length) continue;
      const n = act(paths.length === 1 ? paths[0] : `${paths.length} dials`);
      out.push(`  await t.dbg(${jsStr(`tuneSet(${JSON.stringify(patch)})`)});`);
      shot(`set-${n}`);
    } else if (op.op === 'row') {
      // A ROW LANDS OR LEAVES WHOLE, and so does the line that replays it: the
      // recipe is written into the step as the tree held it at that moment,
      // rather than as `devSetClone('classics.ivory', …)`, so a step run next
      // week rebuilds the row that was dialled and not whatever the set it was
      // copied from has become since.
      const where = String(op.where || '');
      const id = String(op.id || '');
      if (!where || !id) continue;
      if (op.verb === 'remove') {
        const n = act(`${where}.${id} removed`);
        out.push(`  await t.dbg(${jsStr(`devRowRemove(${JSON.stringify(where)}, ${JSON.stringify(id)})`)});`);
        shot(`row-${n}`);
      } else {
        const row = op.row && typeof op.row === 'object' && !Array.isArray(op.row) ? op.row : {};
        const n = act(`${where}.${id}`);
        out.push(`  await t.dbg(${jsStr(`devRowAdd(${JSON.stringify(where)}, ${JSON.stringify(id)}, ${JSON.stringify(row)})`)});`);
        shot(`row-${n}`);
      }
    } else if (op.op === 'note') {
      // NO NUMBER AND NO FRAME. A note is not an act — it is what the reel
      // could not carry, said in the file rather than lost between windows.
      const text = String(op.text ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
      if (!text) continue;
      notes++;
      out.push('', `  // note · ${text}`);
    } else if (op.op === 'deal') {
      const n = act('the cast');
      out.push(`  await t.dbg('demoDeal(${Number(op.n) || 0})');`);
      out.push('  await t.waitFor(\'window.__diceDebug.places().built === window.__diceDebug.places().queued\','
        + " { desc: 'the cards stood' });");
      shot(`deal-${n}`);
    } else if (op.op === 'sit') {
      const n = act('the chair');
      out.push(`  await t.dbg('demoSit(${Number(op.k) || 0})');`);
      shot(`sit-${n}`);
    } else if (op.op === 'throw') {
      const seed = Number.isFinite(Number(op.seed)) ? Number(op.seed) >>> 0 : 0;
      const notation = typeof op.notation === 'string' && op.notation ? op.notation : '3d6';
      const n = act(`${notation} on seed ${seed}`);
      out.push(`  await t.dbg(${jsStr(`devBench(${seed}, ${JSON.stringify(notation)})`)});`);
      out.push('  await settled();');
      shot(`throw-${n}`);
    }
  }
  // A REEL OF NOTES IS NOT AN EMPTY REEL, and telling the two apart is the
  // difference between "you forgot to press Record" and "here is what this
  // session did that a step cannot replay". Both still take one frame, so the
  // emitted file is a step either way.
  if (!acts) {
    out.push('', notes
      ? '  // Nothing here could be replayed — the notes above say what was recorded and why it could not be.'
      : '  // Nothing was recorded — dial something, then Download step again.');
    shot('empty');
  }
  return `${APACHE}

// RECORDED BY DEVELOPER MODE — ${stem}. A SKELETON, not a finished step: it
// replays what was dialled, in the order it was dialled, and takes a shot
// after each act. What it cannot know is what the shots are FOR — so name the
// frames, drop the ones that say nothing, and put the claim in a comment
// before this file is worth keeping. tools/steps/dev-look.mjs is the article.
//
//   node tools/drive.mjs tools/steps/${stem}.mjs [outDir]
import { mkdirSync } from 'node:fs';

export default async function run(stage, [outDir = ${jsStr(`tools/shots/${stem}`)}]) {
  mkdirSync(\`tools/out/\${outDir}\`, { recursive: true });
  const t = await stage.ctx.devTab({ origin: '127.0.0.99', players: 0 });
  let frame = 0;
  const shot = async (label) => {
    await new Promise((r) => setTimeout(r, 400));
    frame += 1;
    const file = \`\${outDir}/\${String(frame).padStart(2, '0')}-\${label}.png\`;
    await stage.shot(t, file);
    console.log(\`shot \${file}\`);
  };
  const settled = async () => {
    await t.waitFor('!window.__diceDebug.busy', { desc: 'the film landed', timeout: 30000 });
  };
${out.join('\n')}
}
`;
}

export function mount({
  host = document.body, tune, dials = null, mode = 'development', film = 'live',
  cast = null, bench = null, felts = null, sets = null, presets = null, record = null,
  verbs = {}, onFold = null, onShut = null, info = null, phone: phoneDress = 'auto',
} = {}) {
  if (mode === 'production') throw new Error('developer mode is off in production');
  if (!tune || !tune.SHIPPED || typeof tune.set !== 'function') throw new Error('mount needs a Tune');

  const dialAt = (path) => (typeof tune.dialAt === 'function' ? tune.dialAt(dotted(path)) : null)
    || (dials ? dialFromTree(dials, path) : null);
  const readLeaf = (path) => (typeof tune.get === 'function' ? tune.get(dotted(path)) : leafIn(tune.T, path).value);

  // ---- state that is not a value ------------------------------------------
  //
  // THE PHONE IS READ ONCE, AT MOUNT (phase D5), and that is deliberate: the
  // rows are BUILT here, so a control kind is not a value the repaint beat can
  // change its mind about. The sheet's layout follows the query live (it is
  // css/dev.css's), which is the half a rotated phone or a dragged window
  // actually needs; the stepper-instead-of-slider is the half that would cost
  // a rebuild, and a panel rebuilt under a moving window would drop the find
  // filter, the section, the seed box and the paste box with it.
  //
  // `phone` the OPTION is `'auto'` (ask the query) or `'never'` (this mount is
  // not an overlay over a felt, so the sheet's whole reason is absent). The
  // pop-out passes `'never'` — the D5 review found it opening at 420px, which
  // is inside the query, so a second-monitor panel arrived in the phone dress:
  // every slider a stepper, and the `file` section — the diff, Save, the paste
  // box, the reason the window exists — scrolled off the right edge of a bar
  // with no visible affordance. dev.html says the same thing about the overlay
  // dress in its own head; this is the half of it a stylesheet cannot do.
  const phone = phoneDress !== 'never'
    && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && !!window.matchMedia(DEV_PHONE_QUERY).matches;
  let filmLocked = film === 'locked';
  let filmReason = filmLocked ? REASON.film : '';
  let folded = false;
  let frozen = false;              // the clock, as of the last repaint — the glyph says so
  let filter = '';
  let active = null;               // the visible section name
  let castApi = null;
  // THE BENCH (docs/DEVMODE.md §8, phase 2) — the clock, the seeded throw and
  // the A/B slots. One verbs object, exactly as the cast is, and the panel
  // holds none of its state either: every readout here is asked of it on the
  // repaint beat. Absent (null) is a legal panel: the devshell mounts one.
  let benchApi = bench || null;
  const feltsApi = felts || null;
  const setsApi = sets || null;
  const presetsApi = presets || null;
  // THE RECORDER (phase D5) — `{ state, start, stop, ops, save }`. Given one,
  // the file section grows a record group; given none, the section is exactly
  // the one phase 1 shipped. The panel holds no recorder state either: the
  // NAME box is its own (a place a person types, like the seed and the paste
  // boxes) and everything else is asked of the api on the repaint beat.
  const recordApi = record || null;
  // Reload-class paths a PANEL write found covered by a binder (the tune
  // reported the change without listing it pending). Only consulted when the
  // tune has no `binderFor`; with one, coverage is asked of the tune itself.
  const bound = new Set();
  let pending = [];                // derived on repaint: changed, reload-class, unbound
  // The footer's last readings. `fps`/`calls`/`tris`/`bodies`/`settle` are the
  // HUD (DEVMODE §8, phase 2), pushed in by the caller once per animate tick.
  const footer = { viewport: null, dpr: null, fps: null, calls: null, tris: null, bodies: null, settle: null };
  const FOOTER_KEYS = ['viewport', 'dpr', 'fps', 'calls', 'tris', 'bodies', 'settle'];
  let statusTimer = null;
  let diffSig = '';
  let changedCount = 0;            // the whole diff, asset rows included — see paintFooter

  // ---- rows ---------------------------------------------------------------
  // path → { row, path, dotted, section, dial, cls, read, kind, last, sub }
  const rows = new Map();
  const secs = new Map();          // name → { sec, rows: [], subs: [], kind: 'tune'|'cast'|'file' }

  const showStatus = (text, kind = 'warn') => {
    statusSlot.replaceChildren(status(text, { kind }));
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusSlot.replaceChildren(); statusTimer = null; }, STATUS_MS);
  };

  // After any panel write: forget what the touched rows last showed, so the
  // next repaint redraws them from T whatever the tune did with the value —
  // a refusal (a binder threw, the film is locked) puts T back where it was,
  // which is exactly the string the row's cache still holds, and without
  // this the row would keep the rejected value and drift from the truth.
  const settle = (r, written) => {
    for (const p of written) { const e = rows.get(p); if (e) e.last = null; }
    if (!r) return;
    for (const [p, reason] of r.refused || []) showStatus(`${p}: ${REASON[reason] || reason}`, 'warn');
    noteCoverage(r, written);
  };

  // A value T already holds is not sent: a slider's `change` on release
  // repeats its last `input`, and a re-apply hook should run once per
  // release, not twice. (A row's own dedupe cannot see T; this one can.)
  const write = (path, v) => {
    const p = dotted(path);
    let cur;
    try { cur = readLeaf(path); } catch { cur = undefined; }
    if (cur !== undefined && stringOf(cur) === stringOf(v)) { panel.repaint(); return null; }
    let r = null;
    try {
      r = tune.set({ [p]: v }, { filmLocked });
    } catch (e) {
      showStatus(`${p}: ${e.message}`, 'error');
    }
    settle(r, [p]);
    panel.repaint();
    return r;
  };

  // Every reset the panel drives comes through here, never tune.reset:
  // the patch is built from tune.diff() minus READ_ONLY_PATHS, so a console
  // that moved app.mode is not undone by a section ↺ or Reset all (DEVMODE
  // §4: no panel control writes it), and the film lock holds — a locked
  // film row is refused here like anywhere else. scope: 'all' | section | path.
  //
  // A VENUE'S LIGHT (DEVMODE §5, phase 1): while `info.venue` names one, a
  // `light.*` leaf the venue holds (`info.venueLight`, tree paths → the
  // venue's values) resets to the VENUE's value, not the file's — the glade's
  // moon is what "shipped" means under the glade's sky. A caller that names a
  // venue but hands over no `venueLight` gets the section refused with one
  // line, never the table's lamp under the venue.
  const resetScope = (scope) => {
    let diff = [];
    try { diff = tune.diff() || []; } catch { diff = []; }
    const venue = info && info.venue ? String(info.venue) : '';
    const venueLight = venue && isMap(info.venueLight) ? info.venueLight : null;
    const patch = {};
    const rowScopes = new Set();
    let held = 0;
    for (const d of diff) {
      const p = dotted(d.path);
      if (READ_ONLY_PATHS.includes(p)) continue;
      if (scope !== 'all' && p !== scope && !p.startsWith(scope + '.')) continue;
      // A ROW GOES BACK WHOLE, THROUGH `tune.reset` (the C4 review,
      // 2026-09-03). A row that was REMOVED, or one this session ADDED, is a
      // structural difference — six leaves in the diff, and a leaf patch of
      // them would either be refused ('row') or, before tune.js learned to
      // refuse it, mint half a felt. `tune.reset('felts.<id>')` is the one
      // verb that puts the file's row back or takes the session's row away,
      // so the revert glyph on any of its six fields lands there.
      if ((d.live === undefined || d.shipped === undefined) && assetRowOf(p)) {
        rowScopes.add(assetRowOf(p));
        continue;
      }
      if (venue && p.startsWith('light.')) {
        if (!venueLight) { held++; continue; }
        if (p in venueLight) {
          if (stringOf(venueLight[p]) !== stringOf(d.live)) patch[p] = venueLight[p];
          continue;
        }
      }
      patch[p] = d.shipped;
    }
    // A PAIR GOES BACK TOGETHER (the D4 review, 2026-09-03). `cards.standoff`
    // and `cards.depth` are two dials and one geometry, and `tune.set` judges
    // that law against what the PATCH proposes — so a ↺ on one card row, or a
    // section reset that caught only one of them, was refused 'geometry' by
    // the half still standing and the shipped value was unreachable from the
    // panel. The mate travels at its SHIPPED value (`tune.lawMates`); the pair
    // the file ships holds by construction. A mate already AT its shipped
    // value stays out of the patch — the law reads it from the tree and finds
    // the same number, and a no-op write would only be one more line for the
    // film lock to refuse.
    for (const p of Object.keys(patch)) {
      for (const [mate, shipped] of (tune.lawMates ? tune.lawMates(p) : [])) {
        if (mate in patch || READ_ONLY_PATHS.includes(mate)) continue;
        let live;
        try { live = tune.get(mate); } catch { continue; }
        if (stringOf(live) === stringOf(shipped)) continue;
        patch[mate] = shipped;
      }
    }
    for (const rowScope of rowScopes) {
      try { tune.reset(rowScope); } catch (e) { showStatus(e.message, 'error'); }
    }
    const written = Object.keys(patch);
    let r = null;
    if (written.length) {
      try { r = tune.set(patch, { filmLocked }); } catch (e) { showStatus(e.message, 'error'); }
    }
    if (!r && rowScopes.size) r = { diff: tune.diff(), refused: [], pending: [] };
    settle(r, written);
    if (held) showStatus(`light: ${held} held by the ${venue} venue — leave it to reset them`, 'warn');
    panel.repaint();
    return r;
  };

  // A set() result says which reload-class leaves a binder covered: a written
  // path that is neither refused nor pending. Remembered for the fallback.
  const noteCoverage = (r, written) => {
    if (!r) return;
    const refused = new Set((r.refused || []).map(([p]) => p));
    const pend = new Set(r.pending || []);
    for (const p of written) {
      if (refused.has(p)) continue;
      if (pend.has(p)) bound.delete(p); else bound.add(p);
    }
  };
  const isUnbound = (p) => (typeof tune.binderFor === 'function' ? !tune.binderFor(p) : !bound.has(p));

  const kindFor = (dial, value, path) => {
    if (READ_ONLY_PATHS.includes(dotted(path))) return 'static';
    if (dial && Array.isArray(dial.options)) return 'enum';
    if (typeof value === 'string' && value.startsWith('#')) return 'color';
    // A SLIDER IS A MOUSE CONTROL. On the sheet every range row is a stepper
    // instead: ± the dial's own step, with the typeable number between them —
    // the same commit path, a target a fingertip can hit, and no drag that the
    // page would rather read as a scroll.
    if (typeof value === 'number' && dial && Array.isArray(dial.range) && dial.read !== 'reload') {
      return phone ? 'stepper' : 'range';
    }
    if (typeof value === 'number' && dial && dial.read === 'reload') return 'stepper';
    return 'text';
  };

  // The same choice for the asset editors' forms, whose rows are built from a
  // row SHAPE rather than from the dial tree. `live` is the drag callback a
  // slider fires per frame; a stepper has no drag, so it commits once.
  const numRow = ({ label, value, range, live, commit, why }) => (phone
    ? rowStepper({ label, value, range, onCommit: commit, why })
    : rowRange({ label, value, range, onInput: live || commit, onCommit: commit, why }));

  // A dial label that repeats its parent map's key ('lamp penumbra' under the
  // `lamp` subhead) drops that word: the column is narrow, and the repeated
  // word was the part that survived the ellipsis.
  const labelFor = (dial, path) => {
    const raw = (dial && dial.label) || path[path.length - 1];
    const parent = path.length > 2 ? path[path.length - 2] : null;
    if (parent && raw.length > parent.length + 1
      && raw.toLowerCase().startsWith(parent.toLowerCase() + ' ')) return raw.slice(parent.length + 1);
    return raw;
  };

  const buildRow = (path, value, secName) => {
    const dial = dialAt(path);
    const kind = kindFor(dial, value, path);
    const label = labelFor(dial, path);
    const why = dial && dial.why ? `${dotted(path)} — ${dial.why}` : dotted(path);
    const commit = (v) => write(path, v);
    let row;
    if (kind === 'static') row = rowStatic({ label, value, why: `${why} — not a dial: set it in dice.yaml or DICE_MODE` });
    else if (kind === 'enum') row = rowEnum({ label, value, options: dial.options, onCommit: commit, why });
    else if (kind === 'color') row = rowColor({ label, value, onCommit: commit, why });
    else if (kind === 'range') row = rowRange({ label, value, range: dial.range, onInput: commit, onCommit: commit, why });
    else if (kind === 'stepper') row = rowStepper({ label, value, range: dial ? dial.range : null, onCommit: commit, why });
    else row = rowText({ label, value, onCommit: commit, why });
    row.root.dataset.path = dotted(path);
    const entry = {
      row, path, dotted: dotted(path), section: secName, dial, kind,
      cls: dial ? dial.cls : 'look', read: dial ? dial.read : 'apply', last: stringOf(value), sub: null,
    };
    row.setState({
      reload: entry.read === 'reload',
      // a static row has no revert: that would be a write
      onRevert: kind === 'static' ? null : () => resetScope(entry.dotted),
    });
    rows.set(entry.dotted, entry);
    return entry;
  };

  // Nested maps become subheads; a subhead knows its rows so the find filter
  // can hide a heading whose every row is hidden.
  const walk = (node, path, container, secName, secRec, sub) => {
    for (const [k, v] of Object.entries(node)) {
      const p = [...path, k];
      if (isMap(v)) {
        const h = subhead(p.slice(1).join(' · '));
        const rec = { el: h, rows: [] };
        secRec.subs.push(rec);
        container.append(h);
        walk(v, p, container, secName, secRec, rec);
      } else {
        const entry = buildRow(p, v, secName);
        entry.sub = sub;
        if (sub) sub.rows.push(entry);
        secRec.rows.push(entry);
        container.append(entry.row.root);
      }
    }
  };

  // ---- the frame ----------------------------------------------------------
  const filmBadge = el('span', { class: 'dev-film', text: 'film ▲ locked', hidden: !filmLocked });
  const foldBtn = button('` fold', () => { panel.fold(true); if (onFold) onFold(true); }, { title: 'fold the panel (`)' });
  foldBtn.classList.add('dev-fold');
  const head = el('header', { class: 'dev-head' }, [el('span', { class: 'dev-title', text: 'DEV' }), filmBadge, foldBtn]);

  const sectionNames = [...tune.sections()];
  const barNames = () => [...sectionNames, ...(castApi ? ['cast'] : []),
    ...(feltsApi ? ['felts'] : []), ...(setsApi ? ['sets'] : []),
    ...(presetsApi ? ['presets'] : []),
    ...(benchApi ? ['clock', 'ab'] : []), 'file'];
  let bar = null;
  const barSlot = el('div', { class: 'dev-barslot' });
  const rebuildBar = () => {
    const names = barNames();
    if (!names.includes(active)) active = names[0];
    bar = segmented(names, active, (name) => { active = name; showSections(); }, { name: 'section' });
    bar.classList.add('dev-secbar');
    barSlot.replaceChildren(bar);
  };

  const findInput = find((text) => { filter = text.trim().toLowerCase(); showSections(); });
  const statusSlot = el('div', { class: 'dev-statusslot', 'aria-live': 'polite' });
  const body = el('div', { class: 'dev-body' });

  // Tune sections, one per top-level key.
  for (const name of sectionNames) {
    const node = tune.SHIPPED[name];
    const sec = section(name, {
      count: 0,
      onReset: () => resetScope(name),
      open: true,
    });
    const rec = { sec, rows: [], subs: [], kind: 'tune', name };
    secs.set(name, rec);
    if (isMap(node)) walk(node, [name], sec.body, name, rec, null);
    else {
      const entry = buildRow([name], node, name);
      rec.rows.push(entry);
      sec.body.append(entry.row.root);
    }
    body.append(sec.root);
  }

  // ---- cast ---------------------------------------------------------------
  let castRec = null;
  const castCount = () => {
    if (!castApi) return 0;
    const p = castApi.players ? castApi.players() : 0;
    return Array.isArray(p) ? p.length : (Number(p) || 0);
  };
  const castSeat = () => {
    if (!castApi || !castApi.seat) return null;
    const s = castApi.seat();
    if (s === null || s === undefined) return null;
    return typeof s === 'object' ? { place: s.place, name: s.name } : { place: s, name: null };
  };
  // A cast that cannot say what its overlay is doing starts the row at
  // `disabled`, which is what the app's own state starts at.
  const castOverlay = () => {
    if (!castApi || typeof castApi.overlayState !== 'function') return OVERLAY_STATES[0];
    const s = String(castApi.overlayState());
    return OVERLAY_STATES.includes(s) ? s : OVERLAY_STATES[0];
  };
  const buildCast = () => {
    if (castRec) { castRec.sec.root.remove(); castRec = null; secs.delete('cast'); }
    if (!castApi) { benchHome(); return; }
    const sec = section('cast', { count: 0, onReset: null, open: true });
    const rec = { sec, rows: [], subs: [], kind: 'cast', name: 'cast', controls: [], sync: null };
    const call = (fn, ...args) => {
      if (filmLocked) { showStatus(`cast: ${filmReason || REASON.film}`); return; }
      try { fn(...args); } catch (e) { showStatus(`cast: ${e.message}`, 'error'); }
      panel.repaint();
    };
    // players 0–8
    const players = rowStepper({
      label: 'players', value: castCount(), range: [0, CAST_MAX, 1],
      onCommit: (n) => call(() => castApi.deal(Math.max(0, Math.min(CAST_MAX, Math.round(n))))),
      why: 'cast.players — fake seats dealt into this tab',
    });
    players.root.dataset.path = 'cast.players';
    const reshuffle = button('reshuffle names', () => call(() => castApi.reshuffle()));
    // sit prev / next
    const seatOut = el('output', { class: 'dev-seat', text: '—' });
    // A cast that knows its own occupied chairs (main.js's, which include
    // the viewer's real one) walks them itself through `sitStep`; a cast
    // that does not gets the modulo over its count.
    const sit = (d) => call(() => {
      if (typeof castApi.sitStep === 'function') { castApi.sitStep(d); return; }
      const n = castCount();
      if (!n) return;
      const cur = castSeat();
      const at = cur && Number.isFinite(cur.place) ? cur.place : 0;
      castApi.sit((((at + d) % n) + n) % n);
    });
    const prev = button('◀', () => sit(-1), { title: 'sit at the previous seat' });
    const next = button('▶', () => sit(+1), { title: 'sit at the next seat' });
    const seatRow = el('div', { class: 'dev-row is-cast' }, [
      el('span', { class: 'dev-row-label' }, [el('span', { class: 'dev-row-name', text: 'seat' })]),
      el('div', { class: 'dev-row-ctl dev-seatctl' }, [prev, seatOut, next]),
    ]);
    // THE OVERLAY, one enum of four (never on|off: a state is never a boolean
    // word, and two switches would have offered four states to answer two
    // questions). `regions` is the cast's landing marks; `framing` is what the
    // camera is holding and what the room is doing to it; `all` is both.
    const overlay = rowEnum({
      label: 'overlay', value: castOverlay(), options: OVERLAY_STATES,
      onCommit: (v) => call(() => castApi.overlay(v)),
      why: 'cast.overlay — disabled | regions (landing marks) | framing (fit hull, discs, cards, lamp, walls) | all',
    });
    overlay.root.dataset.path = 'cast.overlay';
    // Four words do not fit the control column at 320px (css/dev.css says
    // what was measured); this row alone stacks its control under its label.
    overlay.root.classList.add('is-stacked');
    const throwOne = button(`throw ${CAST_POOL} from seat`, () => call(() => {
      const cur = castSeat();
      castApi.roll(cur ? cur.place : 0);
    }));
    const throwAll = button('throw from every seat', () => call(() => castApi.rollAll()));
    const verbsRow = (children) => el('div', { class: 'dev-verbs' }, children);
    sec.body.append(players.root, verbsRow([reshuffle]), seatRow, overlay.root, verbsRow([throwOne, throwAll]));
    rec.controls = [reshuffle, prev, next, throwOne, throwAll];
    rec.rows = [
      { row: players, dotted: 'cast.players', section: 'cast' },
      { row: overlay, dotted: 'cast.overlay', section: 'cast' },
    ];
    rec.sync = () => {
      const n = castCount();
      players.setValue(n);
      // The overlay's state lives in the app, not in this row: a
      // `demoRegions('all')` from the console, and Shut's own reset to
      // `disabled`, must both show here.
      overlay.setValue(castOverlay());
      const cur = castSeat();
      seatOut.textContent = cur ? (cur.name ? `${cur.place} · ${cur.name}` : `seat ${cur.place}`) : '—';
      const locked = filmLocked;
      for (const c of rec.controls) c.disabled = locked;
      prev.disabled = locked || !cur;
      next.disabled = locked || !cur;
      throwOne.disabled = locked || !cur;
      throwAll.disabled = locked || !n;
      for (const r of rec.rows) { r.row.setState({ locked }); r.row.setLockReason(locked ? filmReason : ''); }
      sec.root.classList.toggle('is-locked', locked);
    };
    // THE BENCH RIDES THE CAST SECTION (the brief: "in the cast section"),
    // because a seeded throw is a throw from a chair and the chair is chosen
    // two rows above it.
    rec.bench = (benchApi && !(clockRec && clockRec.bench)) ? buildBenchRows(sec.body) : null;
    castRec = rec;
    secs.set('cast', rec);
    body.append(sec.root);
    tailOrder();
  };

  // ---- the bench: seed, Throw, Replay --------------------------------------
  //
  // The seed box is the panel's own state — like the find filter and the paste
  // box, and unlike every dial — so nothing repaints it out from under a
  // typist. What the panel DOES write into it is the seed a throw actually
  // used, so a blank box that drew a fresh number leaves that number on screen
  // and the next press is a repeat rather than a second stranger.
  const buildBenchRows = (container) => {
    const seedBox = el('input', {
      // The box is one narrow column; a longer placeholder is a truncated one
      // (measured on the shell at 320px), and the full sentence lives in the
      // label's tooltip and in the Throw button's.
      type: 'text', class: 'tin dev-seed', placeholder: 'blank = fresh',
      spellcheck: 'false', autocomplete: 'off', 'aria-label': 'bench seed',
    });
    const seedRow = el('div', { class: 'dev-row is-cast', dataset: { path: 'bench.seed' } }, [
      el('span', { class: 'dev-row-label', title: 'bench.seed — one number decides the faces AND the film. Blank draws a fresh one and shows it; a word is hashed, so `moss` is a seed you can write down' },
        [el('span', { class: 'dev-row-name', text: 'seed' })]),
      el('div', { class: 'dev-row-ctl' }, [seedBox]),
    ]);
    const report = (r, verb) => {
      if (!r) {
        showStatus(`${verb}: refused${filmLocked ? ` — ${filmReason || REASON.film}` : ''}`, 'warn');
        return;
      }
      seedBox.value = String(r.seed);
      showStatus(`${verb}: ${r.label || r.notation} · seed ${r.seed}`, 'info');
      panel.repaint();
    };
    const doThrow = () => {
      let r = null;
      try { r = benchApi.bench(seedBox.value); } catch (e) { showStatus(`bench: ${e.message}`, 'error'); return; }
      report(r, 'bench');
    };
    const doReplay = () => {
      let r = null;
      try { r = benchApi.replay(); } catch (e) { showStatus(`replay: ${e.message}`, 'error'); return; }
      if (!r && !filmLocked) { showStatus('replay: no film to replay yet', 'warn'); return; }
      report(r, 'replay');
    };
    seedBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doThrow(); } });
    const throwBtn = button(`Throw ${benchApi.pool || CAST_POOL}`, doThrow, { kind: 'primary', title: 'throw that seed down the shipped path — local, never the wire' });
    const replayBtn = button('Replay', doReplay, { title: 'rethrow the last seed with the dials as they now stand — a bench throw comes back face for face; any other roll comes back as the same film with fresh faces, because only its film seed is knowable here' });
    const lastOut = el('div', { class: 'dev-clockout' });
    container.append(subhead('bench'), seedRow, el('div', { class: 'dev-verbs' }, [throwBtn, replayBtn]), lastOut);
    return {
      sync() {
        let last = null;
        try { last = benchApi.last(); } catch { last = null; }
        throwBtn.disabled = filmLocked;
        replayBtn.disabled = filmLocked || !last;
        // WHAT THE SEED PROMISES, AND FOR WHICH FILM (the C2 review,
        // 2026-09-02). A bench throw's seed feeds mulberry32 at both ends, so
        // Replay brings the same faces back with the same poses. A roll the
        // server drew took its values from the server's rng and only its FILM
        // seed is knowable here — so `seed N` on that line would otherwise
        // promise a repeat it cannot make, and a developer flipping A/B after
        // an ordinary roll would be comparing two pictures whose dice read
        // different numbers. The second line says so rather than letting the
        // first imply otherwise.
        lastOut.textContent = last
          ? `last: seed ${last.seed} · ${last.frames} frames · settle ${last.settleS}s${last.bench ? ' · bench' : ''}`
            + (last.bench ? '' : '\nnot a bench throw: replay repeats the film, not the faces')
          : 'no film thrown yet';
      },
    };
  };

  // ---- felts: the first asset editor ---------------------------------------
  //
  // A DIAL SECTION IS DRAWN FROM THE TREE; THIS ONE IS DRAWN FROM A LIST. The
  // difference is the whole point of an asset: there is no path `felts.*.name`
  // in the dial tree to hang a row on, because the id in the middle is the
  // thing being authored. So the form is built ONCE from the row's shape
  // (`fields()` — the same dials js/tune.js type-checks a write against) and
  // re-pointed at whichever row the picker names.
  let feltsRec = null;
  const buildFelts = () => {
    if (!feltsApi) return;
    const sec = section('felts', { count: 0, onReset: null, open: true });
    const fields = (typeof feltsApi.fields === 'function' && feltsApi.fields()) || {};
    // WHICH ROW THE FORM EDITS follows the felt on the TABLE until somebody
    // makes a choice of their own, and then it is theirs. Both halves matter:
    // a `devFeltAdd` + `devFeltApply` from the console (or an Apply from this
    // section) should leave the form on the felt you are looking at — that is
    // the row you are about to reach for — and a form re-pointed out from
    // under a typist mid-edit is the worse failure of the two. `touched` is
    // the whole of that rule.
    let pickId = null;
    let touched = false;
    let pickSig = '';             // the catalogue as the <option> list last drew it
    let liveTimer = null;

    const picker = el('select', { class: 'tin dev-feltpick', 'aria-label': 'felt row' });
    const pickRow = el('div', { class: 'dev-row is-cast', dataset: { path: 'felts.row' } }, [
      el('span', {
        class: 'dev-row-label',
        title: 'felts.row — every felt this build has: the eleven main.js ships and every row `felts:` in dice.yaml declares. A shipped row is read-only; Clone gives you a copy that is not',
      }, [el('span', { class: 'dev-row-name', text: 'row' })]),
      el('div', { class: 'dev-row-ctl' }, [picker]),
    ]);
    picker.addEventListener('change', () => { pickId = picker.value || null; touched = true; panel.repaint(); });

    const report = (r, verb) => {
      if (!r) {
        showStatus(`${verb}: refused${filmLocked ? ` — ${filmReason || REASON.film}` : ''}`, 'warn');
        return false;
      }
      for (const [p, why] of r.refused || []) showStatus(`${p}: ${REASON[why] || why}`, 'warn');
      return true;
    };

    // A dragged slider writes on a trailing timer; every other commit writes
    // now. Both go through the same door, so a drag released mid-wait lands
    // once and not twice.
    const writeField = (key, v, live) => {
      if (!pickId) return;
      const id = pickId;
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
      const send = () => {
        liveTimer = null;
        report(feltsApi.set(id, { [key]: v }), 'felts');
        panel.repaint();
      };
      if (live) liveTimer = setTimeout(send, FELT_LIVE_MS); else send();
    };

    // One row per field of the row shape, chosen by the field's own dial —
    // the same rule buildRow uses for a dial leaf, over a shape instead of a
    // tree.
    const fieldRows = [];
    for (const [key, dial] of Object.entries(fields)) {
      if (!isMap(dial) || !('def' in dial)) continue;
      const why = `felts.<id>.${key}${dial.why ? ` — ${dial.why}` : ''}`;
      const now = (v) => writeField(key, v, false);
      let row;
      if (Array.isArray(dial.options)) row = rowEnum({ label: dial.label, value: dial.def, options: dial.options, onCommit: now, why });
      else if (typeof dial.def === 'string' && dial.def.startsWith('#')) row = rowColor({ label: dial.label, value: dial.def, onCommit: now, why });
      else if (typeof dial.def === 'number' && Array.isArray(dial.range)) {
        row = numRow({
          label: dial.label, value: dial.def, range: dial.range,
          live: (v) => writeField(key, v, true), commit: now, why,
        });
      } else row = rowText({ label: dial.label, value: dial.def, onCommit: now, why });
      row.root.dataset.path = `felts.${key}`;
      fieldRows.push({ key, row });
    }

    const cloneBtn = button('Clone', () => {
      const row = rowById(pickId);
      const stem = String((row && row.id) || 'felt').replace(/^house-/, '');
      const taken = new Set(listRows().map((f) => f.id));
      let id = `house-${stem}`;
      for (let n = 2; taken.has(id); n++) id = `house-${stem}-${n}`;
      const seed = row ? { name: `${row.name} (house)`, cloth: row.cloth, feltBase: row.feltBase, sceneBg: row.sceneBg, breath: row.breath, mottle: row.mottle } : {};
      if (!report(feltsApi.add(id, seed), 'clone')) return;
      pickId = id;
      touched = true;             // Clone just made this row; it is the choice
      showStatus(`cloned ${id} — edit it, Apply it, then Save writes the row into dice.yaml`, 'info');
      panel.repaint();
    }, { kind: 'primary', title: 'copy this felt into a house row you can edit' });

    const applyBtn = button('Apply to table', () => {
      const id = pickId;
      if (!report(feltsApi.apply(id), 'apply')) return;
      showStatus(`the table is wearing ${id}`, 'info');
      panel.repaint();
    }, { title: 'wear this felt on THIS tab — it is not sent to the table, because a felt only this checkout declares is one nobody else could resolve' });

    const removeBtn = button('Remove', () => {
      const id = pickId;
      if (!report(feltsApi.remove(id), 'remove')) return;
      pickId = null;
      showStatus(`removed ${id}`, 'info');
      panel.repaint();
    }, { kind: 'danger', title: 'drop this row (Download carries the removal; the Save route does not — DEVMODE §9)' });

    const note = el('div', { class: 'dev-clockout' });
    sec.body.append(pickRow, el('div', { class: 'dev-verbs' }, [cloneBtn]),
      ...fieldRows.map((f) => f.row.root),
      el('div', { class: 'dev-verbs' }, [applyBtn, removeBtn]), note);

    let cache = [];
    const listRows = () => cache;
    const rowById = (id) => cache.find((f) => f.id === id) || null;

    const rec = {
      sec, rows: fieldRows.map((f) => ({ row: f.row, dotted: `felts.${f.key}`, section: 'felts' })),
      subs: [], kind: 'felts', name: 'felts',
      sync() {
        try { cache = feltsApi.list() || []; } catch { cache = []; }
        const onTable = (cache.find((f) => f.current) || cache[0] || {}).id || null;
        // untouched: follow the table. Touched: keep the choice, unless the
        // row it named has been removed out from under it.
        if (!touched || !pickId || !rowById(pickId)) pickId = onTable;
        const sig = cache.map((f) => [f.id, f.name, f.shipped ? 's' : 'h'].join('|')).join('/');
        if (sig !== pickSig) {
          pickSig = sig;
          picker.replaceChildren(...cache.map((f) => el('option', {
            value: f.id, text: f.shipped ? f.name : `${f.name} · house`,
          })));
        }
        picker.value = pickId || '';
        const row = rowById(pickId);
        // A SHIPPED ROW IS READ-ONLY, and so is every row while the film is
        // locked — a second viewer at this table cannot resolve a felt only
        // this checkout declares, so nothing here may move the cloth.
        const editable = !!row && !row.shipped && !filmLocked;
        for (const f of fieldRows) {
          if (row && row[f.key] !== undefined) f.row.setValue(row[f.key]);
          f.row.setState({ locked: !editable, changed: !!row && !row.shipped });
          f.row.setLockReason(!row ? 'no row picked'
            : filmLocked ? (filmReason || REASON.film)
              : row.shipped ? 'a shipped felt lives in js/main.js — Clone it to edit' : '');
        }
        cloneBtn.disabled = !row || filmLocked;
        applyBtn.disabled = !row || filmLocked || row.current;
        removeBtn.disabled = !row || row.shipped || filmLocked;
        // `· n changed` MEANS CHANGED, and a house row is not by itself a
        // change (the C4 review, 2026-09-03). The section reused the dial
        // chrome's count and fed it the number of HOUSE ROWS, so a panel
        // opened against a dice.yaml declaring one unedited felt read
        // "FELTS · 1 changed" and wore the changed mark while `devInfo().changed`
        // was 0 and the file section's diff was empty. What is changed here is
        // what the FILE would gain, lose or amend: a row added this session, a
        // row removed, and a declared row whose fields have moved — which is
        // one row per distinct id in the diff, and the same arithmetic the file
        // section does. The house-row count is a fact about the catalogue and
        // it moves to the note, which has room to say what it means.
        const touchedRows = new Set();
        let dl = [];
        try { dl = tune.diff() || []; } catch { dl = []; }
        for (const d of dl) {
          const p = String(d.path).split('.');
          if (p[0] === 'felts' && p.length > 2) touchedRows.add(p[1]);
        }
        sec.setCount(touchedRows.size);
        const house = cache.filter((f) => !f.shipped).length;
        note.textContent = (!row ? 'no felts'
          : row.shipped
            ? `${row.id} · shipped in js/main.js — read only. Clone it to author a house felt.`
            : `${row.id} · ${row.inFile ? 'declared in dice.yaml' : 'added this session — Save writes the row'}`
              + `${row.current ? ' · on the table' : ''}`)
          + `\n${house} house felt${house === 1 ? '' : 's'} · ${cache.length - house} shipped`;
      },
      stop() { if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; } },
    };
    feltsRec = rec;
    secs.set('felts', rec);
    body.append(sec.root);
  };

  // ---- sets: the dice catalogue, on the live felt ---------------------------
  //
  // THE FELTS SECTION AT DEPTH. A felt row is six flat fields; a dice recipe is
  // eighty-five, in twenty-one nested groups, and SPARSE — most sets name a
  // handful and REFUSE the rest, because "restraint is also identity"
  // (js/themes.js). So the form is built once from the recipe SHAPE
  // (`fields()` — the same dials js/tune.js judges a write against), nested
  // maps become subheads in the file's own order, and a field the row does not
  // carry is drawn at its dial's default wearing the faint `default` mark:
  // what the panel shows for an empty field is what the die is already doing.
  //
  // TWO ROW KINDS THE DIAL TREE NEVER NEEDED, both of them LIST dials. One
  // with a vocabulary (`faces`) becomes one `rowSelect` per entry — twelve
  // states will not fit a segmented row — and the six are drawn ONLY while
  // `glyph` is `faces`, because that is the only state in which dice.js reads
  // the table. One with no vocabulary (a particle or decal palette) becomes a
  // single text field of comma-separated colours: there is no fixed set of
  // legal colours to offer, the length is 1..8, and eight colour wells for a
  // field most sets do not have would be the loudest thing in the section.
  let setsRec = null;
  const buildSets = () => {
    if (!setsApi) return;
    const sec = section('sets', { count: 0, onReset: null, open: true });
    const fields = (typeof setsApi.fields === 'function' && setsApi.fields()) || {};

    // WHICH SET THE FORM EDITS is a choice, not a value — see `sync` for the
    // three-clause rule and why the felts section's one clause is not enough
    // here.
    let pickId = null;
    let touched = false;
    let housePickSig = '';
    let setPickSig = '';
    let cache = [];

    const rowById = (id) => cache.find((s) => s.id === id) || null;
    const houseOf = (id) => (rowById(id) || {}).house || null;

    const housePick = el('select', { class: 'tin dev-housepick', 'aria-label': 'house' });
    const setPick = el('select', { class: 'tin dev-setpick', 'aria-label': 'dice set' });
    const pickRow = (ctl, name, title, path) => el('div', { class: 'dev-row is-cast', dataset: { path } }, [
      el('span', { class: 'dev-row-label', title }, [el('span', { class: 'dev-row-name', text: name })]),
      el('div', { class: 'dev-row-ctl' }, [ctl]),
    ]);
    const houseRow = pickRow(housePick, 'house',
      'sets.house — the browsing categories `houses:` in dice.yaml declares. Clone copies a set into `house`, which is the one this editor authors into',
      'sets.house');
    const setRow = pickRow(setPick, 'set',
      'sets.set — every set in the house, shipped and authored alike. A recipe lives in dice.yaml now, so every one of them is editable; what Clone is for is keeping the shipped one intact while you try something',
      'sets.set');
    housePick.addEventListener('change', () => {
      const first = cache.find((s) => s.house === housePick.value);
      if (first) { pickId = first.id; touched = true; }
      panel.repaint();
    });
    setPick.addEventListener('change', () => { pickId = setPick.value || null; touched = true; panel.repaint(); });

    const report = (r, verb) => {
      if (!r) {
        showStatus(`${verb}: refused${filmLocked ? ` — ${filmReason || REASON.film}` : ''}`, 'warn');
        return false;
      }
      for (const [p, why] of r.refused || []) showStatus(`${p}: ${REASON[why] || why}`, 'warn');
      return true;
    };

    // A dragged slider writes LIVE — the value lands in the tree at once, so
    // the diff and the readout are honest — and lets js/main.js's own 140 ms
    // timer decide when to rebake the die. A commit (mouse-up, Enter, a colour
    // picked, an enum) writes without the live flag, which flushes that timer
    // and repaints the felt now.
    const writeField = (sub, v, live) => {
      if (!pickId) return;
      report(setsApi.set(pickId, { [sub]: v }, !!live), 'sets');
      if (!live) panel.repaint();
    };

    // THE REVERT GLYPH ON A ROW WHOSE PATH MOVES. Every dial row's ↺ is bound
    // once to its own fixed path; a field here belongs to whichever set the
    // picker names, so the binding is to the FIELD and the row is asked for at
    // the click. `resetScope` then applies the law js/tune.js states: a leaf
    // of a declared row goes back to the file's value, and a leaf of a row
    // this session minted takes the whole row with it, because a row lands and
    // leaves whole.
    const revertField = (sub) => {
      const at = rowById(pickId);
      if (at) resetScope(`houses.${at.house}.dice.${at.set}.${sub}`);
    };

    const fieldRows = [];      // { sub, dial, row, group, last }
    const groups = [];         // { el, rows }  — a subhead and what hides with it
    const facesGroup = [];     // the six entry rows, hidden unless glyph is `faces`

    const dialAtShape = (d) => (isMap(d) && 'def' in d && 'cls' in d ? d : null);

    // `row` is null for the ONE field that has no control of its own: the
    // `faces` table is drawn as the six enums above, and this record is what
    // they read the current array out of and write the new one back into.
    const addFieldRow = (sub, dial, row, group) => {
      if (row) row.root.dataset.path = `sets.${sub}`;
      const rec = { sub, dial, row, group, last: null, lastValue: '', lastState: '' };
      fieldRows.push(rec);
      if (row && group) group.rows.push(rec);
      return rec;
    };

    const buildShape = (shape, prefix, container, group) => {
      for (const [key, d] of Object.entries(shape)) {
        const dial = dialAtShape(d);
        const sub = prefix ? `${prefix}.${key}` : key;
        if (dial) {
          const why = `houses.<house>.dice.<set>.${sub}${dial.why ? ` — ${dial.why}` : ''}`;
          const now = (v) => writeField(sub, v, false);
          if (Array.isArray(dial.def) && Array.isArray(dial.each)) {
            // `faces`: one picker per VALUE, so the row reads "the 1 face
            // paints a bolt" rather than asking somebody to type a six-entry
            // list into a text field and get the commas right.
            for (let i = 0; i < dial.def.length; i++) {
              const r = rowSelect({
                label: `${i + 1} →`, value: dial.def[i], options: dial.each,
                onCommit: (v) => {
                  const cur = fieldRows.find((f) => f.sub === sub);
                  const next = Array.isArray(cur && cur.last) ? cur.last.slice() : dial.def.slice();
                  next[i] = v;
                  writeField(sub, next, false);
                },
                why: `${why} — the face this VALUE paints`,
              });
              r.root.dataset.path = `sets.${sub}.${i}`;
              r.setState({ onRevert: () => revertField(sub) });
              facesGroup.push({ row: r, index: i, sub });
              container.append(r.root);
            }
            addFieldRow(sub, dial, null, group).faces = true;
            continue;
          }
          let row;
          if (Array.isArray(dial.def)) {
            row = rowText({
              label: dial.label, value: dial.def.join(', '),
              onCommit: (v) => now(String(v).split(',').map((s) => s.trim()).filter(Boolean)),
              why: `${why} — comma-separated`,
            });
          } else if (Array.isArray(dial.options)) {
            row = rowEnum({ label: dial.label, value: dial.def, options: dial.options, onCommit: now, why });
          } else if (typeof dial.def === 'string' && dial.def.startsWith('#')) {
            row = rowColor({ label: dial.label, value: dial.def, onCommit: now, why });
          } else if (typeof dial.def === 'number' && Array.isArray(dial.range)) {
            row = numRow({
              label: dial.label, value: dial.def, range: dial.range,
              live: (v) => writeField(sub, v, true), commit: now, why,
            });
          } else row = rowText({ label: dial.label, value: dial.def, onCommit: now, why });
          row.setState({ onRevert: () => revertField(sub) });
          addFieldRow(sub, dial, row, group);
          container.append(row.root);
        } else if (isMap(d) && !('rows' in d)) {
          const h = subhead(sub.split('.').join(' · '));
          const g = { el: h, rows: [] };
          groups.push(g);
          container.append(h);
          buildShape(d, sub, container, g);
        }
      }
    };

    const cloneBtn = button('Clone', () => {
      const r = setsApi.clone(pickId);
      if (!report(r, 'clone')) return;
      if (r.id) {
        pickId = r.id;
        touched = true;          // Clone just made this row; it is the choice
        showStatus(`cloned ${r.id} — edit it, throw it, then Save writes the row into dice.yaml`, 'info');
      }
      panel.repaint();
    }, { kind: 'primary', title: 'copy this set into the `house` house, where you can take it apart without moving the shipped one' });

    const benchBtn = button('Throw one of each', () => {
      const r = setsApi.bench(pickId);
      if (!report(r, 'throw')) return;
      showStatus(`bench ${r.notation} · seed ${r.seed} · ${pickId}`, 'info');
      panel.repaint();
    }, { title: 'a seeded bench throw of d4 d6 d8 d10 d12 d20 wearing this set — local, labelled bench, values from the seed' });

    // USE AT TABLE HAS TWO GATES, and the second one is the file's. A set
    // rides every roll to the server, which resolves it out of dice.yaml — so
    // wearing a row that is only in this session's tree turns the roll button
    // into a silent 400 (`unknown_set`, a page banner, an empty console). The
    // verb refuses it by name; this draws the button disabled with the same
    // sentence, so nobody has to click to find out. Save is what lifts it.
    const applyBtn = button('Use at table', () => {
      const id = pickId;
      const r = setsApi.apply(id);
      if (!report(r, 'use')) return;
      if (r.refused && r.refused.length) { panel.repaint(); return; }
      showStatus(`you are rolling in ${id}`, 'info');
      panel.repaint();
    }, { title: 'wear this set — it rides every roll you throw, so a set only this checkout declares is refused while anybody else is here' });

    const removeBtn = button('Remove', () => {
      const id = pickId;
      if (!report(setsApi.remove(id), 'remove')) return;
      pickId = null;
      showStatus(`removed ${id}`, 'info');
      panel.repaint();
    }, { kind: 'danger', title: 'drop a row this editor made (Download carries the removal; the Save route does not — DEVMODE §9)' });

    const note = el('div', { class: 'dev-clockout' });
    sec.body.append(houseRow, setRow, el('div', { class: 'dev-verbs' }, [cloneBtn]));
    buildShape(fields, '', sec.body, null);
    sec.body.append(el('div', { class: 'dev-verbs' }, [benchBtn, applyBtn, removeBtn]), note);

    const rec = {
      sec,
      rows: [
        ...fieldRows.filter((f) => f.row).map((f) => ({ row: f.row, dotted: `sets.${f.sub}`, section: 'sets' })),
        ...facesGroup.map((f) => ({ row: f.row, dotted: `sets.${f.sub}.${f.index}`, section: 'sets' })),
      ],
      subs: groups, kind: 'sets', name: 'sets',
      sync() {
        try { cache = setsApi.list() || []; } catch { cache = []; }
        // WHICH SET THE FORM EDITS, while nobody has used the pickers: the row
        // the editor last touched, then the row the viewer is WEARING, then
        // the first in the catalogue. The middle clause is the felts
        // section's whole rule and it is not enough here — a viewer wears
        // `std` by default and `std` is not a row under `houses:` at all — so
        // a clone from the console would have left the form on the
        // catalogue's first set while the felt showed the clone. Once picked
        // by hand it is the picker's, so a form is never re-pointed out from
        // under a typist mid-edit.
        let focus = null;
        try { focus = (typeof setsApi.focus === 'function' && setsApi.focus()) || null; } catch { focus = null; }
        const home = (rowById(focus) ? focus : null)
          || (cache.find((s) => s.current) || cache[0] || {}).id || null;
        if (!touched || !pickId || !rowById(pickId)) pickId = home;

        const hsig = [...new Set(cache.map((s) => `${s.house}|${s.houseLabel}`))].join('/');
        if (hsig !== housePickSig) {
          housePickSig = hsig;
          const seen = new Set();
          housePick.replaceChildren(...cache.filter((s) => !seen.has(s.house) && seen.add(s.house))
            .map((s) => el('option', { value: s.house, text: s.houseLabel || s.house })));
        }
        const house = houseOf(pickId);
        housePick.value = house || '';
        const mine = cache.filter((s) => s.house === house);
        const ssig = `${house}::${mine.map((s) => [s.set, s.label, s.inFile ? 'f' : 's'].join('|')).join('/')}`;
        if (ssig !== setPickSig) {
          setPickSig = ssig;
          setPick.replaceChildren(...mine.map((s) => el('option', {
            value: s.id, text: s.inFile ? s.label : `${s.label} · session`,
          })));
        }
        setPick.value = pickId || '';

        let recipe = null;
        try { recipe = setsApi.recipe(pickId); } catch { recipe = null; }
        // Which of THIS row's leaves the file and the tree disagree about, and
        // how many SET ROWS in all — the same arithmetic the felts section
        // does, over four-segment rows instead of two.
        const at = rowById(pickId);
        const prefix = at ? `houses.${at.house}.dice.${at.set}.` : null;
        const changedSubs = new Set();
        const touchedRows = new Set();
        let dl = [];
        try { dl = tune.diff() || []; } catch { dl = []; }
        for (const d of dl) {
          const p = String(d.path);
          if (!p.startsWith('houses.')) continue;
          const row = assetRowPath(p.split('.'));
          if (row) touchedRows.add(row.join('.'));
          if (prefix && p.startsWith(prefix)) changedSubs.add(p.slice(prefix.length));
        }
        sec.setCount(touchedRows.size);

        for (const f of fieldRows) {
          const leaf = leafIn(recipe || {}, f.sub.split('.'));
          const v = leaf.has ? leaf.value : f.dial.def;
          f.last = v;
          if (!f.row) continue;                 // `faces`: the six pickers above
          const s = stringOf(v);
          if (s !== f.lastValue) { f.lastValue = s; f.row.setValue(Array.isArray(v) ? v.join(', ') : v); }
          // A recipe field is look-class but for one: `faces` is a READING two
          // tabs must agree on, so it locks with the film exactly as a film
          // dial does (js/tune.js RECIPE).
          const locked = f.dial.cls === 'film' && filmLocked;
          const state = `${leaf.has ? 1 : 0}${changedSubs.has(f.sub) ? 1 : 0}${locked ? 1 : 0}`;
          if (state !== f.lastState) {
            f.lastState = state;
            f.row.setState({ isDefault: !leaf.has, changed: changedSubs.has(f.sub), locked });
            f.row.setLockReason(locked ? (filmReason || REASON.film) : '');
          }
        }
        // THE FACE TABLE IS DRAWN ONLY WHERE IT IS READ. dice.js applies a
        // `faces` table when `glyph` is `faces` and the die is a d6; six enum
        // pickers over a set that paints digits would be six controls with no
        // effect on anything. The glyph is asked of the ROW, falling back to
        // the dial's default, so a set that says nothing about glyphs shows
        // none of them. This runs after the loop above, because that loop is
        // what refreshed the array these six read their entries out of.
        const glyphRec = fieldRows.find((f) => f.sub === 'glyph');
        const glyph = recipe && recipe.glyph !== undefined ? recipe.glyph
          : (glyphRec ? glyphRec.dial.def : 'digit');
        const facesRec = fieldRows.find((f) => f.faces);
        const facesNow = (facesRec && Array.isArray(facesRec.last) ? facesRec.last : null) || [];
        for (const f of facesGroup) {
          // The glyph decides whether these exist at all; WHILE A FILTER IS
          // RUNNING, `showSections` owns the rest of the answer, so this only
          // ever force-hides.
          if (glyph !== 'faces') f.row.root.hidden = true;
          else if (!filter) f.row.root.hidden = false;
          if (facesNow[f.index] !== undefined) f.row.setValue(facesNow[f.index]);
          f.row.setState({ locked: filmLocked, changed: changedSubs.has('faces') });
          f.row.setLockReason(filmLocked ? (filmReason || REASON.film) : '');
        }

        const row = at;
        cloneBtn.disabled = !row;
        benchBtn.disabled = !row || filmLocked;
        // `inFile` is the FILE's answer and it moves the moment Save answers
        // ok (js/main.js devSetInFile), so this button un-greys without a
        // reload — which is the whole reason the gate is not `declared`.
        applyBtn.disabled = !row || filmLocked || row.current || !row.inFile;
        applyBtn.title = row && !row.inFile && !filmLocked
          ? REASON.unsaved
          : 'wear this set — it rides every roll you throw, so a set only this checkout declares is refused while anybody else is here';
        removeBtn.disabled = !row || !row.removable;
        const authored = cache.filter((s) => s.removable).length;
        note.textContent = (!row ? 'no sets'
          : `${row.id} · ${row.inFile ? 'declared in dice.yaml' : 'added this session — Save writes the row, and Use at table waits for it'}`
            + `${row.current ? ' · you are rolling in it' : ''}`
            + `${row.removable ? '' : ' · shipped: Remove is for the rows you author'}`)
          + `\n${cache.length} sets · ${authored} yours`
          + `${filmLocked ? '\nthe felt is shared: throw and use are held, and so is the face table' : ''}`;
      },
    };
    setsRec = rec;
    secs.set('sets', rec);
    body.append(sec.root);
  };

  // ---- presets: named patches ----------------------------------------------
  //
  // THE ONE SECTION WITH NO FORM (docs/DEVMODE.md §8, phase D4). A felt row
  // and a dice recipe each have a shape, so each got a form built from it. A
  // preset's fields ARE the panel's other sections — you make one by turning
  // the dials and pressing Hold — so what belongs here is a LIST and three
  // verbs, and the only thing the section has to say for itself is what each
  // row would do if it were applied.
  //
  // APPLY IS A PASTE and is drawn as one: it goes through `tune.set` with the
  // film lock, so at a shared table a preset's look rows land and its film
  // rows come back refused BY NAME on the status line. That is why the button
  // is not disabled while locked — a preset is not all-or-nothing the way a
  // felt is, and disabling it would hide the half that still works.
  let presetsRec = null;
  const buildPresets = () => {
    if (!presetsApi) return;
    const sec = section('presets', { count: 0, onReset: null, open: true });
    let pickName = null;
    let touched = false;
    let pickSig = '';

    const picker = el('select', { class: 'tin dev-feltpick', 'aria-label': 'preset' });
    const pickRow = el('div', { class: 'dev-row is-cast', dataset: { path: 'presets.row' } }, [
      el('span', {
        class: 'dev-row-label',
        title: 'presets.row — every named patch this build has: the rows `presets:` in dice.yaml declares and the ones held this session',
      }, [el('span', { class: 'dev-row-name', text: 'preset' })]),
      el('div', { class: 'dev-row-ctl' }, [picker]),
    ]);
    picker.addEventListener('change', () => { pickName = picker.value || null; touched = true; panel.repaint(); });

    const nameBox = el('input', {
      class: 'tin dev-presetname', type: 'text', placeholder: 'name', spellcheck: 'false',
      'aria-label': 'preset name',
    });
    const nameRow = el('div', { class: 'dev-row is-cast', dataset: { path: 'presets.name' } }, [
      el('span', {
        class: 'dev-row-label',
        title: 'the id the held preset takes — lower-case letters, digits, "-" and "_", no dot',
      }, [el('span', { class: 'dev-row-name', text: 'name' })]),
      el('div', { class: 'dev-row-ctl' }, [nameBox]),
    ]);

    const report = (r, verb) => {
      if (!r) { showStatus(`${verb}: refused`, 'warn'); return null; }
      for (const [p, why] of r.refused || []) showStatus(`${p}: ${REASON[why] || why}`, 'warn');
      return r;
    };

    const holdBtn = button('Hold as preset', () => {
      const name = nameBox.value.trim();
      const r = report(presetsApi.hold(name), 'hold');
      if (!r || (r.refused || []).length) { panel.repaint(); return; }
      pickName = name;
      touched = true;
      nameBox.value = '';
      showStatus(`held ${name} — Save writes the row into dice.yaml`, 'info');
      panel.repaint();
    }, { kind: 'primary', title: 'write the dials as they now stand down under this name' });

    const applyBtn = button('Apply', () => {
      const name = pickName;
      const r = report(presetsApi.apply(name), 'apply');
      if (!r) { panel.repaint(); return; }
      const held = (r.refused || []).length;
      showStatus(held
        ? `${name}: ${r.applied} row${r.applied === 1 ? '' : 's'} applied, ${held} refused`
        : `${name}: ${r.applied} row${r.applied === 1 ? '' : 's'} applied`, held ? 'warn' : 'info');
      panel.repaint();
    }, { title: 'merge this preset into the dials, exactly as a pasted patch is merged' });

    const removeBtn = button('Remove', () => {
      const name = pickName;
      if (!report(presetsApi.remove(name), 'remove')) { panel.repaint(); return; }
      pickName = null;
      showStatus(`removed ${name}`, 'info');
      panel.repaint();
    }, { kind: 'danger', title: 'drop this row (Download carries the removal; the Save route does not — DEVMODE §9)' });

    const note = el('div', { class: 'dev-clockout' });
    sec.body.append(pickRow, el('div', { class: 'dev-verbs' }, [applyBtn, removeBtn]),
      nameRow, el('div', { class: 'dev-verbs' }, [holdBtn]), note);

    let cache = [];
    const rowByName = (n) => cache.find((p) => p.name === n) || null;

    presetsRec = {
      sec, rows: [], subs: [], kind: 'presets', name: 'presets',
      sync() {
        try { cache = presetsApi.list() || []; } catch { cache = []; }
        if (!touched || !pickName || !rowByName(pickName)) pickName = (cache[0] || {}).name || null;
        const sig = cache.map((p) => `${p.name}|${p.leaves}|${p.inFile ? 'f' : 's'}`).join('/');
        if (sig !== pickSig) {
          pickSig = sig;
          picker.replaceChildren(...cache.map((p) => el('option', {
            value: p.name, text: p.inFile ? p.name : `${p.name} · held`,
          })));
        }
        picker.value = pickName || '';
        const row = rowByName(pickName);
        let waiting = 0;
        try { waiting = presetsApi.pending ? presetsApi.pending() : 0; } catch { waiting = 0; }
        applyBtn.disabled = !row;
        removeBtn.disabled = !row;
        holdBtn.disabled = waiting === 0;
        // The COUNT is the diff's, as every other section's is: a row held
        // this session and a declared row whose leaves have moved are both
        // what the FILE would gain or amend, and a declared row nobody has
        // touched is not a change (the C4 review's rule, kept).
        const touchedRows = new Set();
        let dl = [];
        try { dl = tune.diff() || []; } catch { dl = []; }
        for (const d of dl) {
          const p = String(d.path).split('.');
          if (p[0] === 'presets' && p.length > 2) touchedRows.add(p[1]);
        }
        sec.setCount(touchedRows.size);
        note.textContent = (!row
          ? 'no presets — turn some dials and Hold them under a name'
          : `${row.name} · ${row.inFile ? 'declared in dice.yaml' : 'held this session — Save writes the row'}`
            + ` · ${row.leaves} row${row.leaves === 1 ? '' : 's'}`
            + (row.film ? `, ${row.film} film` : ''))
          + `\nHold would write ${waiting} changed row${waiting === 1 ? '' : 's'} down`
          + (filmLocked ? ' · a locked table takes the look rows and names the film ones' : '');
      },
    };
    secs.set('presets', presetsRec);
    body.append(sec.root);
  };

  // ---- the clock -----------------------------------------------------------
  let clockRec = null;
  const buildClock = () => {
    const sec = section('clock', { count: 0, onReset: null, open: true });
    const freeze = rowEnum({
      label: 'freeze', value: 'running', options: ['running', 'frozen'],
      onCommit: (v) => { benchApi.freeze(v); panel.repaint(); },
      why: 'clock.freeze — hold THIS tab\'s projector. The film is baked and playback is per viewer, so nothing here reaches another table',
    });
    freeze.root.dataset.path = 'clock.freeze';
    const stepBtn = button('step one frame', () => { benchApi.step(); panel.repaint(); },
      { title: 'advance the projector exactly one baked frame' });
    // A stepper on the phone, like every other range row — and a frame scrubber
    // is the one place a stepper is arguably the BETTER control: ± walks one
    // baked frame, which is what the step button beside it does.
    const scrub = numRow({
      label: 'scrub', value: 0, range: [0, 1, 1],
      live: (v) => benchApi.scrub(v),
      commit: (v) => benchApi.scrub(v),
      why: 'clock.scrub — move the projector to a baked keyframe. Freeze first, or the running clock walks away from it; a scrubbed passage plays silent, because the impact drain is a one-way cursor',
    });
    scrub.root.dataset.path = 'clock.scrub';
    const out = el('div', { class: 'dev-clockout' });
    sec.body.append(freeze.root, el('div', { class: 'dev-verbs' }, [stepBtn]), scrub.root, out);
    const rec = {
      sec, rows: [], subs: [], kind: 'clock', name: 'clock',
      sync() {
        let c = null;
        try { c = benchApi.clock(); } catch { c = null; }
        if (!c) return;
        freeze.setValue(c.state);
        stepBtn.disabled = c.state !== 'frozen';
        scrub.root.hidden = !c.live;
        if (c.live) {
          scrub.setRange([0, Math.max(1, c.frames - 1), 1]);
          scrub.setValue(c.frame);
        }
        out.textContent = c.live
          ? `frame ${c.frame} / ${c.frames - 1} · ${c.time.toFixed(2)}s of film`
          : 'no film running';
      },
    };
    clockRec = rec;
    secs.set('clock', rec);
    body.append(sec.root);
  };

  // ---- A/B -----------------------------------------------------------------
  let abRec = null;
  const doHold = (slot) => {
    const r = benchApi.hold(slot);
    if (!r) { showStatus(`hold ${slot.toUpperCase()}: refused`, 'warn'); return; }
    showStatus(`held ${slot.toUpperCase()}: ${(r[slot] || {}).changed || 0} changed`, 'info');
    panel.repaint();
  };
  const doSlot = (slot) => {
    const r = benchApi.apply(slot);
    if (!r) { showStatus(`${slot.toUpperCase()}: nothing held there yet`, 'warn'); return; }
    // A slot put on by hand never replays — the flip is the verb that decides
    // whether the poses should move, and pressing A twice must not re-throw.
    showStatus(`${slot.toUpperCase()} is live · ${(r[slot] || {}).changed || 0} changed`, 'info');
    panel.repaint();
  };
  const doFlip = () => {
    const r = benchApi.flip();
    if (!r) { showStatus('flip: hold both A and B first', 'warn'); return; }
    showStatus(`flip → ${String(r.live || '').toUpperCase()}${r.replayed ? ' · replayed the last seed' : ' · poses kept'}`, 'info');
    panel.repaint();
  };
  const buildAb = () => {
    const sec = section('ab', { count: 0, onReset: null, open: true });
    const holdA = button('Hold A', () => doHold('a'), { title: 'capture the current changes as slot A' });
    const holdB = button('Hold B', () => doHold('b'), { title: 'capture the current changes as slot B' });
    const useA = button('A', () => doSlot('a'), { title: 'put slot A on' });
    const useB = button('B', () => doSlot('b'), { title: 'put slot B on' });
    const flipBtn = button('flip · x', () => doFlip(), { kind: 'primary', title: 'swap the live slot; replays the last seed when the two differ on a film value' });
    const out = el('div', { class: 'dev-about' });
    sec.body.append(
      el('div', { class: 'dev-verbs' }, [holdA, holdB]),
      el('div', { class: 'dev-verbs' }, [useA, useB, flipBtn]),
      out,
    );
    const rec = {
      sec, rows: [], subs: [], kind: 'ab', name: 'ab',
      sync() {
        let a = null;
        try { a = benchApi.ab(); } catch { a = null; }
        if (!a) return;
        useA.disabled = !a.a;
        useB.disabled = !a.b;
        flipBtn.disabled = !(a.a && a.b);
        const slot = (k) => (a[k] ? `${k.toUpperCase()} ${a[k].changed} changed` : `${k.toUpperCase()} —`);
        const live = a.live ? `live ${a.live.toUpperCase()}` : 'nothing live';
        const willFlip = (a.a && a.b)
          ? (a.film ? 'flip replays the last seed (they differ on a film value)' : 'flip keeps the poses (look values only)')
          : 'hold both slots to flip between them';
        out.textContent = `${slot('a')} · ${slot('b')} · ${live}\n${willFlip}${a.replayed ? ' · last flip replayed' : ''}`;
      },
    };
    abRec = rec;
    secs.set('ab', rec);
    body.append(sec.root);
  };

  // Clock and A/B sit between the cast and the file, and the file stays last
  // however often the cast is rebuilt (setCast re-appends its section).
  const tailOrder = () => {
    if (feltsRec) body.append(feltsRec.sec.root);
    if (setsRec) body.append(setsRec.sec.root);
    if (presetsRec) body.append(presetsRec.sec.root);
    if (clockRec) body.append(clockRec.sec.root);
    if (abRec) body.append(abRec.sec.root);
    if (fileRec) body.append(fileRec.sec.root);
  };

  // With no cast section to ride — the devshell mounts one such panel, and so
  // does `setCast(null)` — the bench rows ride the clock's. Once they live
  // there they stay there, so a cast dealt back in cannot mint a second set.
  const benchHome = () => {
    if (benchApi && clockRec && !clockRec.bench) clockRec.bench = buildBenchRows(clockRec.sec.body);
  };

  const buildBench = () => {
    if (!benchApi) return;
    buildClock();
    buildAb();
    if (!castApi) benchHome();
    tailOrder();
  };

  // ---- file ---------------------------------------------------------------
  //
  // THE PRIMARY VERB IS WHATEVER THE SERVER ALLOWS (docs/DEVMODE.md §6,
  // phase 2). On a local server started `DICE_DEV_WRITE=1 node server.js`
  // the panel's primary verb is **Save**, which patches the checkout's own
  // dice.yaml; on every other server — which is every deploy — there is no
  // such route and the primary verb is **Download**, exactly as phase 1 left
  // it. The panel asks once, on mount, through `verbs.status()`; it never
  // fetches anything itself (GOALPOST 2, 4: nothing here touches the
  // network, `location` or `localStorage`).
  let armed = null;                // { file } once verbs.status() says armed
  let fileRec = null;
  const buildFile = () => {
    const sec = section('file', { count: 0, onReset: null, open: true });
    const diffSlot = el('div', { class: 'dev-diffslot' });
    const paste = el('textarea', {
      class: 'tin dev-paste', rows: 4, placeholder: 'paste a patch (yaml fragment)', spellcheck: 'false', 'aria-label': 'paste a patch',
    });
    const preview = el('div', { class: 'dev-preview' });
    const previewBtn = button('Preview', () => previewPatch(), { title: 'list the paths this patch would set, and what would be refused' });
    const applyBtn = button('Apply', () => applyPatch(), { kind: 'primary', title: 'merge the patch into the live values' });
    const saveBtn = button('Save & reload', () => saveReload(), { kind: 'primary', title: 'reload-class values changed: export, then reload the tab' });
    saveBtn.classList.add('dev-save');
    saveBtn.hidden = true;
    // Save leads and Download follows it; unarmed, Save is not in the picture
    // at all and Download is the primary. Keeping Download under Save is the
    // brief's own rule — the file you can hand to another checkout stays one
    // click away even where the route works.
    const saveRouteBtn = button('Save', () => runSaveRoute(), { kind: 'primary', title: 'patch the checkout\'s own dice.yaml' });
    saveRouteBtn.classList.add('dev-saveroute');
    saveRouteBtn.hidden = true;
    const downloadBtn = button('Download', () => runVerb('download'), { kind: 'primary', title: 'download the patched dice.yaml' });
    const verbsA = el('div', { class: 'dev-verbs' }, [
      saveRouteBtn,
      downloadBtn,
      button('Copy patch', () => runVerb('copyPatch'), { title: 'copy the changed leaves as a yaml fragment' }),
      button('Reset all', () => resetScope('all'), { kind: 'danger' }),
    ]);
    const verbsB = el('div', { class: 'dev-verbs' }, [previewBtn, applyBtn, saveBtn]);
    sec.body.append(diffSlot, verbsA, subhead('paste patch'), paste, preview, verbsB);
    fileRec = { sec, rows: [], subs: [], kind: 'file', name: 'file', diffSlot, paste, preview, saveBtn, saveRouteBtn, downloadBtn };
    // ---- the recorder, and the second window --------------------------------
    //
    // BOTH LIVE IN `file` BECAUSE BOTH LEAVE THE TAB. Everything above this
    // line writes dice.yaml; these two write a step and open a window, and the
    // section is where the panel keeps the verbs whose result is outside it.
    if (recordApi) fileRec.record = buildRecord(sec.body);
    if (typeof verbs.popout === 'function') {
      // ONE BUTTON, NOT A SECOND PANEL. `dev.html` mounts THIS FILE against a
      // mirror of the tune (dev.html's `remoteTune`), so what pops out is the
      // panel, not a copy of it — and the table tab stays the only writer,
      // which is the whole rule the pop-out is built on.
      sec.body.append(el('div', { class: 'dev-verbs' }, [
        button('Pop out', () => runVerb('popout'), { title: 'open the panel in its own window (dev.html)' }),
      ]));
    }
    secs.set('file', fileRec);
    body.append(sec.root);
  };

  // ---- the recorder -------------------------------------------------------
  //
  // WHAT IT WRITES DOWN AND WHAT IT DOES NOT. Recording is arming a LISTENER,
  // not wrapping the panel: js/main.js watches the tune itself, so a dial
  // turned from the console, from a preset Apply or from an A/B flip is in the
  // step exactly as a slider drag is. What the panel owns here is the NAME and
  // the two presses, and even the state on the button is asked of the api each
  // repaint — `devRecord('stop')` from the console must stop the button too.
  //
  // Download step is a DOWNLOAD and never the write route (`emitStep` above
  // says why): the panel composes the text and hands it to `record.save`,
  // which is main.js's ordinary blob download — the same one Download uses.
  const buildRecord = (container) => {
    const nameBox = el('input', {
      type: 'text', class: 'tin dev-stepname', spellcheck: 'false',
      placeholder: 'step name', 'aria-label': 'step name',
    });
    const note = el('div', { class: 'dev-about' });
    const runBtn = button('Record', () => {
      const on = recordApi.state() === 'recording';
      const r = on ? recordApi.stop() : recordApi.start();
      if (!r) showStatus(`record: refused (${on ? 'stop' : 'start'})`, 'warn');
      panel.repaint();
    }, { title: 'write down every dial, deal and seeded throw from here' });
    const dlBtn = button('Download step', () => {
      const ops = recordApi.ops() || [];
      if (!ops.length) { showStatus('nothing recorded yet — press Record, turn a dial', 'warn'); return; }
      const stem = stepName(nameBox.value);
      const saved = recordApi.save(`${stem}.mjs`, emitStep(stem, ops));
      showStatus(saved ? `tools/steps/${stem}.mjs downloaded — read it before you commit it` : 'download: refused', saved ? 'info' : 'warn');
    }, { title: 'emit a tools/steps skeleton of what was recorded — a download, never the write route' });
    container.append(subhead('record'), nameBox, el('div', { class: 'dev-verbs' }, [runBtn, dlBtn]), note);
    const sync = () => {
      let state = 'idle', ops = [];
      try { state = recordApi.state(); ops = recordApi.ops() || []; } catch { /* a shut door answers nothing */ }
      const on = state === 'recording';
      runBtn.textContent = on ? 'Stop' : 'Record';
      runBtn.classList.toggle('dev-btn-danger', on);
      dlBtn.disabled = !ops.length;
      note.textContent = ops.length
        ? `${ops.length} op${ops.length === 1 ? '' : 's'} recorded${on ? ' · recording' : ''}`
        : (on ? 'recording — nothing yet' : 'not recording');
    };
    sync();
    return { sync, nameBox, runBtn, dlBtn };
  };

  // A patch text is parsed (a `parsePatch` verb, else js/yaml.js loaded on
  // demand) to a flat { dotted: value } and each path is checked the way
  // tune.set would check it, so the preview lists exactly what Apply will do.
  const parsePatch = async (text) => {
    if (typeof verbs.parsePatch === 'function') return verbs.parsePatch(text);
    const { parseYaml } = await import('./yaml.js');
    const { tree } = parseYaml(text);
    const flat = {};
    const flatten = (node, path) => {
      for (const [k, v] of Object.entries(node || {})) {
        if (isMap(v)) flatten(v, [...path, k]);
        else flat[[...path, k].join('.')] = v;
      }
    };
    flatten(tree, []);
    return flat;
  };
  // THE PREVIEW READS BOTH TREES, because Apply does (the C4 review,
  // 2026-09-03). `tune.set` was widened to take a write into a row minted THIS
  // session — that is how the felt editor moves a slider — so a preview that
  // asked only SHIPPED said "no such dial" about a field Apply then wrote.
  // An instrument that warns about a write it goes on to perform is worse than
  // one that says nothing, and the contract three lines above ("so the preview
  // lists exactly what Apply will do") is the promise it broke.
  const judge = (path, v) => {
    let have = leafIn(tune.SHIPPED, path);
    if (!have.has) have = leafIn(tune.T, path);
    if (!have.has) return 'unknown';
    // …and a field of a row that is not in T either — a removed row's — is
    // refused by `apply` with its own reason, which the preview must say too.
    const row = assetRowOf(dotted(path));
    if (row && !isMap(leafIn(tune.T, row).value)) return 'row';
    const dial = dialAt(path);
    if (dial && dial.cls === 'film' && filmLocked) return 'film';
    if (typeof v !== typeof have.value) return 'type';
    if (dial && Array.isArray(dial.options) && !dial.options.includes(v)) return 'option';
    return null;
  };
  const previewPatch = async () => {
    const text = fileRec.paste.value;
    fileRec.preview.replaceChildren();
    if (!text.trim()) { fileRec.preview.append(status('nothing to preview', { kind: 'info' })); return; }
    let flat;
    try { flat = await parsePatch(text); } catch (e) {
      fileRec.preview.append(status(`cannot read the patch: ${e.message}`, { kind: 'error' }));
      return;
    }
    const list = el('ul', { class: 'dev-preview-list' });
    let ok = 0, bad = 0;
    for (const [p, v] of Object.entries(flat)) {
      const reason = judge(p, v);
      if (reason) bad++; else ok++;
      list.append(el('li', { class: `dev-preview-row ${reason ? 'is-refused' : 'is-ok'}` }, [
        el('span', { class: 'dev-diff-path', text: p }),
        el('span', { class: 'dev-diff-live', text: stringOf(v) }),
        reason ? el('span', { class: 'dev-preview-reason', text: REASON[reason] || reason }) : null,
      ]));
    }
    fileRec.preview.append(status(`${ok} would apply · ${bad} refused`, { kind: bad ? 'warn' : 'info' }), list);
  };
  const applyPatch = () => {
    const text = fileRec.paste.value;
    if (!text.trim()) { showStatus('nothing to apply', 'info'); return; }
    let r;
    try {
      r = typeof verbs.pastePatch === 'function' ? verbs.pastePatch(text) : tune.applyPatchText(text, { filmLocked });
    } catch (e) { showStatus(`patch refused: ${e.message}`, 'error'); return; }
    if (r && Array.isArray(r.refused) && r.refused.length) {
      showStatus(`${r.refused.length} refused: ${r.refused.map(([p, why]) => `${p} (${REASON[why] || why})`).join(', ')}`, 'warn');
    } else showStatus('patch applied', 'info');
    // set()'s diff is the whole diff, not the patch, so only what it names
    // pending is certain here: those leaves are known unbound.
    if (r && Array.isArray(r.pending)) for (const p of r.pending) bound.delete(p);
    fileRec.preview.replaceChildren();
    panel.repaint();
  };
  const runVerb = (name) => {
    const fn = verbs[name];
    if (typeof fn !== 'function') { showStatus(`${name}: not wired`, 'warn'); return; }
    try {
      const r = fn();
      if (r && typeof r.then === 'function') r.then(() => showStatus(`${name}: done`, 'info'), (e) => showStatus(`${name}: ${e.message}`, 'error'));
      else showStatus(`${name}: done`, 'info');
    } catch (e) { showStatus(`${name}: ${e.message}`, 'error'); }
  };
  // SAVE — the armed write route (DEVMODE §6). The panel hands the caller the
  // CHANGES, never text: `verbs.save(tune.changes())` does the one fetch this
  // feature makes, and what comes back is reported here as it arrived. A
  // refusal's reason is printed VERBATIM and untranslated — the whole value of
  // a one-word refusal (`loopback`, `origin`, `site`, `type`, `large`) is that
  // it is the server's own word and not this file's guess at what it meant.
  const reportSave = (s) => {
    if (!s) { showStatus('save: refused', 'error'); return; }
    if (s.ok === false || s.error) {
      const detail = [s.reason, s.detail, ...(Array.isArray(s.problems) ? s.problems : [])]
        .filter((x) => x !== undefined && x !== null && x !== '').join(' · ');
      showStatus(`save refused: ${detail || 'refused'}`, 'error');
      return;
    }
    const n = Array.isArray(s.changes) ? s.changes.length : 0;
    const held = Array.isArray(s.held) ? s.held.length : 0;
    // WHAT THE ROUTE COULD NOT CARRY (the C4 review, 2026-09-03). A removed
    // asset row leaves `changes()` as `undefined`s, JSON drops them, and the
    // route honestly reports that it wrote nothing — so a Save taken right
    // after a Remove printed success over a refusal nobody had been told
    // about. Refuse-or-warn is a choice; saying nothing is not (DEVMODE §10).
    const dropped = Array.isArray(s.dropped) ? s.dropped : [];
    const file = s.file || (armed && armed.file) || 'dice.yaml';
    showStatus(`saved ${n} change${n === 1 ? '' : 's'} to ${file}`
      + (held ? ` · ${held} light row${held === 1 ? '' : 's'} held by the venue` : '')
      + ' — reload the tab to boot on them'
      + (dropped.length
        ? `\n· ${dropped.length} row${dropped.length === 1 ? '' : 's'} removed (${dropped.join(', ')})`
          + ' — the route cannot carry a removal; use Download + tools/dice-apply.mjs'
        : ''), (held || dropped.length) ? 'warn' : 'info');
  };
  const runSaveRoute = () => {
    if (!armed) { showStatus('save: no armed write route — Download instead', 'warn'); return; }
    if (typeof verbs.save !== 'function') { showStatus('save: not wired', 'warn'); return; }
    let r;
    try { r = verbs.save(tune.changes()); } catch (e) { showStatus(`save: ${e.message}`, 'error'); return; }
    Promise.resolve(r).then(reportSave, (e) => showStatus(`save: ${e.message}`, 'error'));
  };
  // Asked once, on mount. A server with no route answers "not armed" (a 404
  // is not an error here, it is the answer), and the panel stays exactly the
  // panel phase 1 shipped.
  const askArmed = () => {
    if (typeof verbs.status !== 'function') return;
    let r;
    try { r = verbs.status(); } catch { return; }
    Promise.resolve(r).then((s) => {
      if (!s || !s.armed || !fileRec) return;
      armed = { file: s.file || 'dice.yaml' };
      fileRec.saveRouteBtn.hidden = false;
      fileRec.saveRouteBtn.title = `patch ${armed.file} in the checkout`;
      fileRec.downloadBtn.classList.remove('dev-btn-primary');
      fileRec.downloadBtn.classList.add('dev-btn-plain');
      // ONE PRIMARY VERB (the C1 review, 2026-09-02). Armed, `Save & reload`
      // is amber beside `Save`, and two amber buttons whose labels differ by
      // two words read as two primaries. Save leads; the reload verb is the
      // same act with a reload after it, so it follows in plain dress — and
      // its title stops promising an export, because armed it takes the route.
      fileRec.saveBtn.classList.remove('dev-btn-primary');
      fileRec.saveBtn.classList.add('dev-btn-plain');
      fileRec.saveBtn.title = `reload-class values changed: save ${armed.file}, then reload the tab`;
    }, () => { /* not armed, and that is an answer */ });
  };

  const saveReload = () => {
    if (typeof verbs.saveReload === 'function') { runVerb('saveReload'); return; }
    // With no download verb either, runVerb's "not wired" warning stands;
    // the panel never claims a download that did not happen.
    if (typeof verbs.download !== 'function') { runVerb('download'); return; }
    runVerb('download');
    showStatus('downloaded — reload the tab to apply the reload-class values', 'info');
  };

  buildFile();
  askArmed();

  // ---- footer -------------------------------------------------------------
  const footViewport = el('span', { class: 'dev-foot-viewport' });
  const footPerf = el('span', { class: 'dev-foot-perf' });
  const footHud = el('span', { class: 'dev-foot-hud' });
  const footCounts = el('span', { class: 'dev-foot-counts' });
  const foot = el('footer', { class: 'dev-foot' }, [
    el('div', { class: 'dev-foot-line' }, [footViewport, footPerf]),
    el('div', { class: 'dev-foot-line' }, [footHud]),
    el('div', { class: 'dev-foot-line' }, [footCounts]),
    el('div', { class: 'dev-verbs' }, [
      button('Copy', () => runVerb('copyPatch'), { title: 'copy the patch' }),
      button('Download', () => runVerb('download'), { title: 'download dice.yaml' }),
      button('Reset', () => resetScope('all'), { title: 'reset every dial to shipped' }),
      button('Shut', () => { if (onShut) onShut(); }, { kind: 'danger', title: 'shut developer mode: reset, clear the cast, remove the stylesheet' }),
    ]),
  ]);

  // `dev-phone` is the JS's own reading of the query, published as a class so
  // a scenario (and a screenshot) can tell a sheet from a column without
  // measuring pixels. The dress is css/dev.css's media rule, not this class:
  // the stylesheet must be right on a build where this file never ran.
  const root = el('aside', { id: DEV_PANEL_ID, class: `dev-panel${phone ? ' dev-phone' : ''}`, 'aria-label': 'developer mode' },
    [head, barSlot, findInput, statusSlot, body, foot]);
  const glyph = button('DEV', () => { panel.fold(false); if (onFold) onFold(false); }, { title: 'unfold developer mode (`)' });
  glyph.id = DEV_GLYPH_ID;
  glyph.className = 'dev-glyph';
  glyph.hidden = true;

  // Esc folds; every other key stays inside. stopPropagation does not stop
  // the other listeners on this same node, so the order is immaterial.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); panel.fold(true); if (onFold) onFold(true); }
    // THE FLIP KEY (the brief: `x`, only while the panel is open and focused
    // inside it). It is a PANEL key and never an app key — stopKeys below
    // stops the walk to the document, so `x` here can never reach the felt's
    // handlers and `x` on the felt can never reach this. Not while a field has
    // focus: the seed box and the paste box are places `x` is a letter.
    if (!benchApi || e.key !== 'x' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    doFlip();
  });
  stopKeys(root);

  // ---- visibility ---------------------------------------------------------
  const matches = (entry) => {
    if (!filter) return true;
    return entry.row.label.toLowerCase().includes(filter) || entry.dotted.toLowerCase().includes(filter);
  };
  const showSections = () => {
    for (const [name, rec] of secs) {
      if (!filter) {
        rec.sec.root.hidden = name !== active;
        for (const e of rec.rows) e.row.root.hidden = false;
        for (const s of rec.subs) s.el.hidden = false;
        continue;
      }
      const whole = name.toLowerCase().includes(filter);
      let visible = 0;
      for (const e of rec.rows) {
        const on = whole || matches(e);
        e.row.root.hidden = !on;
        if (on) visible++;
      }
      for (const s of rec.subs) s.el.hidden = !(whole || s.rows.some((e) => !e.row.root.hidden));
      rec.sec.root.hidden = !(whole || visible > 0);
      if (rec.kind !== 'tune') rec.sec.root.hidden = !whole;
    }
  };

  // Big counts read better abbreviated: 42100 triangles is a shape, 42.1k is a
  // number you can hold beside another one.
  const brief = (n) => (n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const paintFooter = () => {
    // THE SAME NUMBER THE FILE SECTION SHOWS, AND `devInfo().changed` (fixed
    // in phase D2). It used to be a count of DIAL ROWS wearing the changed
    // mark, which was the whole diff back when a dial was the only thing that
    // could differ from the file. Since the asset editors it is not: a cloned
    // felt, and now a cloned dice set with ninety fields, moved the file
    // section's count and the corner glyph read `0 changed` beside it —
    // measured in the first look at the sets section, 2026-09-03, with a set
    // authored and thrown. §10's rule is that the line has to say what
    // happened, and there is only one right answer to "how much would Save
    // write".
    const changed = changedCount;
    const vp = footer.viewport || null;
    footViewport.textContent = vp ? `${vp.w ?? vp.width}×${vp.h ?? vp.height} @${footer.dpr ?? 1}` : '';
    const perf = [];
    if (footer.fps !== null && footer.fps !== undefined) perf.push(`${Math.round(footer.fps)} fps`);
    if (footer.calls !== null && footer.calls !== undefined) perf.push(`${footer.calls} calls`);
    footPerf.textContent = perf.join(' · ');
    // THE HUD LINE (DEVMODE §8): what the frame costs and what the last film
    // took. Each part appears only once the caller has pushed it, so a panel
    // mounted without a bench keeps the footer phase 1 shipped.
    const hud = [];
    if (footer.tris !== null && footer.tris !== undefined) hud.push(`${brief(footer.tris)} tris`);
    if (footer.bodies !== null && footer.bodies !== undefined) hud.push(`${footer.bodies} bodies`);
    if (footer.settle !== null && footer.settle !== undefined) hud.push(`settle ${footer.settle}s`);
    footHud.textContent = hud.join(' · ');
    footCounts.textContent = `${changed} changed · ${pending.length} reload`;
    // THE FOLDED GLYPH CARRIES THE FREEZE (the brief: fold keeps the frozen
    // clock, Shut clears it). A table folded away and not moving must never be
    // mistaken for a table that broke, so the one word the corner has room for
    // is the one that explains it.
    const marks = [];
    if (changed) marks.push(`${changed} changed`);
    if (frozen) marks.push('frozen');
    glyph.textContent = marks.length ? `DEV · ${marks.join(' · ')}` : 'DEV';
    fileRec.saveBtn.hidden = pending.length === 0;
  };

  // ---- the panel object ---------------------------------------------------
  const panel = {
    root,
    glyph,
    repaint() {
      let diff = [];
      try { diff = tune.diff() || []; } catch { diff = []; }
      const changed = new Map();
      for (const d of diff) {
        const p = dotted(d.path);
        if (stringOf(d.shipped) !== stringOf(d.live)) changed.set(p, d);
      }
      changedCount = changed.size;
      // The reload set is a reading, not a memory: every changed leaf whose
      // dial reads once at boot and that no binder covers, wherever the
      // write came from.
      pending = [...changed.values()].filter((d) => {
        const p = dotted(d.path);
        const entry = rows.get(p);
        const read = d.read || (entry ? entry.read : null) || (dialAt(p) || {}).read;
        return read === 'reload' && isUnbound(p);
      }).map((d) => dotted(d.path));
      for (const p of [...bound]) if (!changed.has(p)) bound.delete(p);
      const declared = info && isMap(info.declared) ? info.declared : null;
      const venue = info && info.venue ? String(info.venue) : '';
      // THE BADGE IS PER ROW, NOT PER SECTION (the C1 review, 2026-09-02).
      // A glade holds the lamp, the room levels and the fog; it holds nothing
      // in `light.motes.*`, `light.tower.*`, `light.life.*` or
      // `light.breath.*` — those reset to the file and Save writes them like
      // any other row, so a `venue` badge on them told a developer their
      // change was somebody else's. `venueLight` is the one list of what is
      // held; a caller that names a venue without one is the defensive case
      // resetScope already holds the whole section for, and it is badged the
      // same way.
      const venueHeld = venue && isMap(info.venueLight) ? info.venueLight : null;
      const counts = new Map();
      for (const entry of rows.values()) {
        let v;
        try { v = readLeaf(entry.path); } catch { v = undefined; }
        const s = stringOf(v);
        if (s !== entry.last) { entry.last = s; entry.row.setValue(v); }
        const d = changed.get(entry.dotted);
        const isChanged = !!d;
        if (isChanged) counts.set(entry.section, (counts.get(entry.section) || 0) + 1);
        const isDefault = d && typeof d.declared === 'boolean' ? !d.declared
          : (declared ? !leafIn(declared, entry.path).has : false);
        const locked = entry.cls === 'film' && filmLocked;
        entry.row.setState({
          changed: isChanged,
          isDefault,
          locked,
          venue: !!venue && entry.section === 'light' && (!venueHeld || entry.dotted in venueHeld),
        });
        entry.row.setLockReason(locked ? filmReason : '');
      }
      for (const [name, rec] of secs) if (rec.kind === 'tune') rec.sec.setCount(counts.get(name) || 0);
      const sig = [...changed.keys()].sort().map((p) => `${p}=${stringOf(changed.get(p).live)}`).join('|');
      if (sig !== diffSig) {
        diffSig = sig;
        const list = diffList([...changed.values()].map((d) => ({ path: dotted(d.path), shipped: d.shipped, live: d.live, cls: d.cls })), {
          onRevert: (p) => resetScope(p),
        });
        fileRec.diffSlot.replaceChildren(list);
        fileRec.sec.setCount(changed.size);
      }
      if (fileRec && fileRec.record) fileRec.record.sync();
      if (castRec && castRec.sync) castRec.sync();
      if (castRec && castRec.bench) castRec.bench.sync();
      if (feltsRec) feltsRec.sync();
      if (setsRec) setsRec.sync();
      if (presetsRec) presetsRec.sync();
      if (clockRec) {
        clockRec.sync();
        if (clockRec.bench) clockRec.bench.sync();
      }
      if (abRec) abRec.sync();
      // Asked of the bench rather than remembered: `holdClock(true)` from the
      // console freezes the same clock this section drives, and the glyph must
      // say `frozen` for that too.
      if (benchApi) {
        try { frozen = benchApi.clock().state === 'frozen'; } catch { frozen = false; }
      }
      filmBadge.hidden = !filmLocked;
      filmBadge.title = filmReason;
      paintFooter();
    },
    fold(on) {
      folded = !!on;
      root.hidden = folded;
      glyph.hidden = !folded;
      if (!folded) paintFooter();
    },
    isFolded() { return folded; },
    setFilm(state, reason) {
      filmLocked = state === 'locked';
      filmReason = filmLocked ? (reason || REASON.film) : '';
      panel.repaint();
    },
    setCast(next) {
      castApi = next || null;
      buildCast();
      rebuildBar();
      showSections();
      panel.repaint();
    },
    setFooter(patch = {}) {
      for (const k of FOOTER_KEYS) if (k in patch) footer[k] = patch[k];
      paintFooter();
    },
    unmount() {
      if (statusTimer) clearTimeout(statusTimer);
      if (feltsRec && feltsRec.stop) feltsRec.stop();
      if (onResize && typeof window !== 'undefined') window.removeEventListener('resize', onResize);
      root.remove();
      glyph.remove();
    },
  };

  // Footer defaults from the window the panel was mounted in (a screenshot
  // must say what it measured); the caller's setFooter overrides them.
  const readViewport = () => {
    if (typeof window === 'undefined') return;
    footer.viewport = { w: window.innerWidth, h: window.innerHeight };
    footer.dpr = window.devicePixelRatio || 1;
  };
  const onResize = typeof window !== 'undefined' ? () => { readViewport(); paintFooter(); } : null;
  readViewport();
  if (onResize) window.addEventListener('resize', onResize);

  castApi = cast || null;
  buildCast();
  buildFelts();
  buildSets();
  buildPresets();
  buildBench();
  rebuildBar();
  showSections();
  host.append(root, glyph);
  panel.repaint();

  // A PHONE STARTS FOLDED (css/dev.css carries the same query for the sheet's
  // dress); a deliberate unfold sticks. The caller hears about it the way it
  // hears about every other fold, so its own state and isFolded() agree from
  // the first frame.
  if (phone) {
    panel.fold(true);
    if (onFold) onFold(true);
  }

  return panel;
}
