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
// `info` (optional): `{ declared, venue }` — `declared` is the tree the file
// names (a leaf absent from it wears the faint "default" mark); `venue` is
// the id of a venue holding the light, or null (light rows wear a `venue`
// badge while one does). Both are read on every repaint, so a live object
// keeps the marks honest.

import {
  el, button, segmented, section, subhead,
  rowRange, rowStepper, rowColor, rowEnum, rowText, rowStatic,
  find, diffList, status, stopKeys, fmtNum,
} from './devui.js';

export const DEV_PANEL_ID = 'dev-panel';
export const READ_ONLY_PATHS = ['app.mode'];   // drawn, never written (DEVMODE §4)
export const DEV_GLYPH_ID = 'dev-glyph';
export const DEV_NARROW_QUERY = '(max-width: 639px)';
export const STATUS_MS = 3000;
export const CAST_MAX = 8;
export const CAST_POOL = '3d6';

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
  film: 'film values are shared — a second viewer is here',
  type: 'wrong type',
  option: 'not one of the options',
  binder: 'the re-apply hook threw — value put back (see console)',
};

export function mount({
  host = document.body, tune, dials = null, mode = 'development', film = 'live',
  cast = null, verbs = {}, onFold = null, onShut = null, info = null,
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
  let filter = '';
  let active = null;               // the visible section name
  let castApi = null;
  // Reload-class paths a PANEL write found covered by a binder (the tune
  // reported the change without listing it pending). Only consulted when the
  // tune has no `binderFor`; with one, coverage is asked of the tune itself.
  const bound = new Set();
  let pending = [];                // derived on repaint: changed, reload-class, unbound
  const footer = { viewport: null, dpr: null, fps: null, calls: null };
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
  const resetScope = (scope) => {
    let diff = [];
    try { diff = tune.diff() || []; } catch { diff = []; }
    const patch = {};
    for (const d of diff) {
      const p = dotted(d.path);
      if (READ_ONLY_PATHS.includes(p)) continue;
      if (scope !== 'all' && p !== scope && !p.startsWith(scope + '.')) continue;
      patch[p] = d.shipped;
    }
    const written = Object.keys(patch);
    let r = null;
    if (written.length) {
      try { r = tune.set(patch, { filmLocked }); } catch (e) { showStatus(e.message, 'error'); }
    }
    settle(r, written);
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
  const barNames = () => [...sectionNames, ...(castApi ? ['cast'] : []), 'file'];
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
  const buildCast = () => {
    if (castRec) { castRec.sec.root.remove(); castRec = null; secs.delete('cast'); }
    if (!castApi) return;
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
    const sit = (d) => call(() => {
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
    // regions on|off
    const regions = rowEnum({
      label: 'regions', value: 'off', options: ['on', 'off'],
      onCommit: (v) => call(() => castApi.regions(v)), why: 'cast.regions — draw the landing regions and aim boxes',
    });
    regions.root.dataset.path = 'cast.regions';
    const throwOne = button(`throw ${CAST_POOL} from seat`, () => call(() => {
      const cur = castSeat();
      castApi.roll(cur ? cur.place : 0);
    }));
    const throwAll = button('throw from every seat', () => call(() => castApi.rollAll()));
    const verbsRow = (children) => el('div', { class: 'dev-verbs' }, children);
    sec.body.append(players.root, verbsRow([reshuffle]), seatRow, regions.root, verbsRow([throwOne, throwAll]));
    rec.controls = [reshuffle, prev, next, throwOne, throwAll];
    rec.rows = [
      { row: players, dotted: 'cast.players', section: 'cast' },
      { row: regions, dotted: 'cast.regions', section: 'cast' },
    ];
    rec.sync = () => {
      const n = castCount();
      players.setValue(n);
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
    castRec = rec;
    secs.set('cast', rec);
    body.append(sec.root);
    // keep file last
    if (fileRec) body.append(fileRec.sec.root);
  };

  // ---- file ---------------------------------------------------------------
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
    const verbsA = el('div', { class: 'dev-verbs' }, [
      button('Download', () => runVerb('download'), { title: 'download the patched dice.yaml' }),
      button('Copy patch', () => runVerb('copyPatch'), { title: 'copy the changed leaves as a yaml fragment' }),
      button('Reset all', () => resetScope('all'), { kind: 'danger' }),
    ]);
    const verbsB = el('div', { class: 'dev-verbs' }, [previewBtn, applyBtn, saveBtn]);
    sec.body.append(diffSlot, verbsA, subhead('paste patch'), paste, preview, verbsB);
    fileRec = { sec, rows: [], subs: [], kind: 'file', name: 'file', diffSlot, paste, preview, saveBtn };
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
  const judge = (path, v) => {
    const have = leafIn(tune.SHIPPED, path);
    if (!have.has) return 'unknown';
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
  const saveReload = () => {
    if (typeof verbs.saveReload === 'function') { runVerb('saveReload'); return; }
    // With no download verb either, runVerb's "not wired" warning stands;
    // the panel never claims a download that did not happen.
    if (typeof verbs.download !== 'function') { runVerb('download'); return; }
    runVerb('download');
    showStatus('downloaded — reload the tab to apply the reload-class values', 'info');
  };

  buildFile();

  // ---- footer -------------------------------------------------------------
  const footViewport = el('span', { class: 'dev-foot-viewport' });
  const footPerf = el('span', { class: 'dev-foot-perf' });
  const footCounts = el('span', { class: 'dev-foot-counts' });
  const foot = el('footer', { class: 'dev-foot' }, [
    el('div', { class: 'dev-foot-line' }, [footViewport, footPerf]),
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

  const paintFooter = () => {
    const changed = [...rows.values()].filter((e) => e.row.root.classList.contains('is-changed')).length;
    const vp = footer.viewport || null;
    footViewport.textContent = vp ? `${vp.w ?? vp.width}×${vp.h ?? vp.height} @${footer.dpr ?? 1}` : '';
    const perf = [];
    if (footer.fps !== null && footer.fps !== undefined) perf.push(`${Math.round(footer.fps)} fps`);
    if (footer.calls !== null && footer.calls !== undefined) perf.push(`${footer.calls} calls`);
    footPerf.textContent = perf.join(' · ');
    footCounts.textContent = `${changed} changed · ${pending.length} reload`;
    glyph.textContent = changed ? `DEV · ${changed} changed` : 'DEV';
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
          changed: isChanged, isDefault, locked, venue: !!venue && entry.section === 'light',
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
      for (const k of ['viewport', 'dpr', 'fps', 'calls']) if (k in patch) footer[k] = patch[k];
      paintFooter();
    },
    unmount() {
      if (statusTimer) clearTimeout(statusTimer);
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
