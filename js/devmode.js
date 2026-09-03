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
  rowRange, rowStepper, rowColor, rowEnum, rowText, rowStatic,
  find, diffList, status, stopKeys, fmtNum,
} from './devui.js';
import { ASSET_SECTIONS, STATIC_PATHS } from './tune.js';

export const DEV_PANEL_ID = 'dev-panel';
// Drawn, never written (DEVMODE §4). The list is tune.js's, not a copy: the
// panel draws static exactly the leaves `tune.set` refuses as 'static', so
// the two can never disagree about which those are (2026-09-02, B3 review:
// the panel's own copy drew app.mode static while its Paste box wrote it).
export const READ_ONLY_PATHS = STATIC_PATHS;
export const DEV_GLYPH_ID = 'dev-glyph';
export const DEV_NARROW_QUERY = '(max-width: 639px)';
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
  binder: 'the re-apply hook threw — value put back (see console)',
  // …and the three an ASSET row can be refused for (js/tune.js addRow).
  shipped: 'that row lives in the code, not the file — Clone it to author one',
  id: 'not a legal id: lower-case letters, digits, "-" and "_", no dot',
  section: 'this build cannot declare rows in that section yet',
  // A row lands or leaves WHOLE (js/tune.js): one field of a row that is not
  // there cannot put it back, and one field of a row this session minted has
  // no shipped value to go back to.
  row: 'that row is not there — revert it whole, or Reset all',
};

// Is this dotted path a FIELD of an asset row (`felts.house-moss.name`)? The
// row, not the field, is the unit a reset moves.
const assetRowOf = (dotted) => {
  const p = String(dotted).split('.');
  return p.length > 2 && ASSET_SECTIONS.includes(p[0]) ? `${p[0]}.${p[1]}` : null;
};

// HOW LONG A DRAGGED FELT FIELD WAITS BEFORE IT REPAINTS THE CLOTH. A felt
// apply is not a light dial: it redraws a 1024px tile, the gloss map and the
// whole mottle attribute, so a slider dragged at 60 Hz would ask for sixty of
// them a second. 140 ms is the brief's number and it reads as live — the
// commit (mouse-up, Enter, a colour picked) never waits.
export const FELT_LIVE_MS = 140;

export function mount({
  host = document.body, tune, dials = null, mode = 'development', film = 'live',
  cast = null, bench = null, felts = null, verbs = {}, onFold = null, onShut = null, info = null,
} = {}) {
  if (mode === 'production') throw new Error('developer mode is off in production');
  if (!tune || !tune.SHIPPED || typeof tune.set !== 'function') throw new Error('mount needs a Tune');

  const dialAt = (path) => (typeof tune.dialAt === 'function' ? tune.dialAt(dotted(path)) : null)
    || (dials ? dialFromTree(dials, path) : null);
  const readLeaf = (path) => (typeof tune.get === 'function' ? tune.get(dotted(path)) : leafIn(tune.T, path).value);

  // ---- state that is not a value ------------------------------------------
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
    if (typeof value === 'number' && dial && Array.isArray(dial.range) && dial.read !== 'reload') return 'range';
    if (typeof value === 'number' && dial && dial.read === 'reload') return 'stepper';
    return 'text';
  };

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
    ...(feltsApi ? ['felts'] : []), ...(benchApi ? ['clock', 'ab'] : []), 'file'];
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
        row = rowRange({ label: dial.label, value: dial.def, range: dial.range, onInput: (v) => writeField(key, v, true), onCommit: now, why });
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
    const scrub = rowRange({
      label: 'scrub', value: 0, range: [0, 1, 1],
      onInput: (v) => benchApi.scrub(v),
      onCommit: (v) => benchApi.scrub(v),
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
    secs.set('file', fileRec);
    body.append(sec.root);
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

  const root = el('aside', { id: DEV_PANEL_ID, class: 'dev-panel', 'aria-label': 'developer mode' },
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
    const changed = [...rows.values()].filter((e) => e.row.root.classList.contains('is-changed')).length;
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
      if (castRec && castRec.sync) castRec.sync();
      if (castRec && castRec.bench) castRec.bench.sync();
      if (feltsRec) feltsRec.sync();
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
  buildBench();
  rebuildBar();
  showSections();
  host.append(root, glyph);
  panel.repaint();

  // A narrow window starts folded (css/dev.css carries the same query for
  // the panel's width); a deliberate unfold sticks. The caller hears about
  // it the way it hears about every other fold, so its own state and
  // isFolded() agree from the first frame.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(DEV_NARROW_QUERY).matches) {
    panel.fold(true);
    if (onFold) onFold(true);
  }

  return panel;
}
