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

// tests/devui.test.mjs — DEVELOPER MODE's panel and its kit (js/devui.js,
// js/devmode.js), under a DOM shim small enough to read. The shim is not a
// browser: it holds a tree, attributes, properties, classes and bubbling
// events, which is exactly the surface the kit is written against (no
// querySelector, no layout). What the shim cannot see — the dress, the
// scroll, a real range input — tools/devshell.html shows through the e2e
// Browser in phase B.
//
// The Tune here is a FAKE built to the contract's shape, not js/tune.js:
// the panel must stand on the contract alone, and this test must not fall
// over while the real tune is being written beside it.

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// the shim
// ---------------------------------------------------------------------------

class Ev {
  constructor(type, init = {}) {
    Object.assign(this, { type, bubbles: true, key: '', code: '' }, init);
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this.stopped = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
}

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...cs) { for (const c of cs) this.set.add(c); }
  remove(...cs) { for (const c of cs) this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
  toString() { return [...this.set].join(' '); }
}

class Node {
  constructor(tag, text = null) {
    this.tagName = tag ? tag.toUpperCase() : '#text';
    this.nodeText = text;
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.classList = new ClassList(this);
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.title = '';
    this.id = '';
    this.tabIndex = -1;
  }
  get className() { return this.classList.toString(); }
  set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get children() { return this.childNodes.filter((n) => n.tagName !== '#text'); }
  get textContent() {
    if (this.tagName === '#text') return this.nodeText;
    return this.childNodes.map((n) => n.textContent).join('');
  }
  set textContent(v) { this.childNodes = v === '' ? [] : [Object.assign(new Node(null, String(v)), { parentNode: this })]; }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new Node(null, n) : n;
      if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter((c) => c !== node);
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  replaceChildren(...nodes) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parentNode) { this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this); this.parentNode = null; } }
  contains(n) { for (let p = n; p; p = p.parentNode) if (p === this) return true; return false; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { const l = this.listeners.get(type) || []; this.listeners.set(type, l.filter((f) => f !== fn)); }
  dispatchEvent(ev) {
    ev.target = this;
    for (let n = this; n; n = n.parentNode) {
      ev.currentTarget = n;
      for (const fn of [...(n.listeners.get(ev.type) || [])]) fn(ev);
      if (ev.stopped || !ev.bubbles) break;
    }
    return !ev.defaultPrevented;
  }
  focus() { document.activeElement = this; }
  // like the browser: blur does not bubble, and fires after focus has moved
  blur() { if (document.activeElement === this) { document.activeElement = null; this.dispatchEvent(new Ev('blur', { bubbles: false })); } }
  // test helpers
  *walk() { yield this; for (const c of this.childNodes) yield* c.walk(); }
  find(pred) { for (const n of this.walk()) if (n !== this && pred(n)) return n; return null; }
  all(pred) { const out = []; for (const n of this.walk()) if (n !== this && pred(n)) out.push(n); return out; }
  isShown() { for (let n = this; n; n = n.parentNode) if (n.hidden) return false; return true; }
}

const document = {
  body: new Node('body'),
  activeElement: null,
  createElement: (tag) => new Node(tag),
  createTextNode: (s) => new Node(null, String(s)),
};
const window = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = document;
globalThis.window = window;

const key = (node, k, extra = {}) => { const ev = new Ev('keydown', { key: k, ...extra }); node.dispatchEvent(ev); return ev; };
const fire = (node, type) => node.dispatchEvent(new Ev(type));
const click = (node) => { if (node.disabled) return; fire(node, 'click'); };
const byClass = (root, c) => root.find((n) => n.classList.contains(c));
const allClass = (root, c) => root.all((n) => n.classList.contains(c));
const byText = (root, t) => root.find((n) => n.tagName === 'BUTTON' && n.textContent === t);
const rowFor = (root, path) => root.find((n) => n.classList.contains('dev-row') && n.dataset.path === path);

// ---------------------------------------------------------------------------
// a Tune to the contract's shape
// ---------------------------------------------------------------------------

const look = (label, def, range, read, why = '') => ({ label, def, range, cls: 'look', read, why });
const film = (label, def, range, read, why = '', law = null) => ({ label, def, range, cls: 'film', read, why, ...(law ? { law } : {}) });
const pick = (label, def, options, cls, read, why = '') => ({ label, def, range: null, options, cls, read, why });

// THE ONE PAIR LAW, to the contract's shape (js/tune.js LAWS.cardClear, phase
// D4): two dials and ONE claim, judged against what the whole patch proposes.
// The fake owes it because the panel's ↺ has to widen a revert to the whole
// group — half a revert is refused by the half still standing (the D4 review,
// 2026-09-03) — and that widening is panel code, testable only against a Tune
// that refuses the way the real one does.
const PAIRS = {
  cardClear: {
    reason: 'geometry',
    paths: ['cards.standoff', 'cards.depth'],
    holds: (read) => Number(read('cards.standoff')) - Number(read('cards.depth')) / 2 >= -1e-9,
  },
};

const DIALS = {
  app: {
    title: look('title', 'Dice Table', null, 'reload'),
    mode: pick('mode', 'development', ['development', 'production'], 'look', 'reload'),
    version: look('version', 1, null, 'reload'),
  },
  light: {
    lamp: {
      y: look('lamp height', 24, [5, 80, 0.5], 'apply'),
      penumbra: look('lamp penumbra', 0.3, [0, 1, 0.01], 'apply'),
      color: look('lamp colour', '#ffe8c4', null, 'apply'),
    },
    room: { hemi: look('room light', 0.1, [0, 1, 0.01], 'apply') },
  },
  throw: { physics: { gravity: film('gravity', -110, [-300, -20, 1], 'apply') } },
  pace: { ceremony: { declareS: look('declare dwell', 1.35, [0, 4, 0.05], 'reload', 'read once at boot') } },
  table: { ceilingY: film('ceiling', 22, [10, 60, 1], 'reload') },
  camera: { framing: { prefer: pick('prefer', 'dice', ['dice', 'table'], 'look', 'frame') } },
};
const DECLARED = {
  app: { title: 'Dice Table', mode: 'development' },   // version omitted → default
  light: { lamp: { y: 24, penumbra: 0.3, color: '#ffe8c4' }, room: { hemi: 0.1 } },
  throw: { physics: { gravity: -110 } },
  pace: { ceremony: { declareS: 1.35 } },
  table: { ceilingY: 22 },
  camera: { framing: { prefer: 'dice' } },
  sound: { master: 0.8 },                               // no dial → typed value
};

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toPath = (p) => (Array.isArray(p) ? p : String(p).split('.'));
const isDial = (x) => isMap(x) && 'def' in x && 'cls' in x;
const defaultsOf = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, isDial(v) ? v.def : defaultsOf(v)]));
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isMap(v) && isMap(out[k]) ? merge(out[k], v) : v;
  return out;
};
const leaves = (t, prefix = []) => Object.entries(t).flatMap(([k, v]) => (isMap(v) ? leaves(v, [...prefix, k]) : [[...prefix, k]]));
const getLeaf = (t, p) => toPath(p).reduce((n, k) => (isMap(n) ? n[k] : undefined), t);
const hasLeaf = (t, p) => { const v = getLeaf(t, p); return v !== undefined && !isMap(v); };
const setLeaf = (t, p, v) => { const path = toPath(p); let n = t; for (const k of path.slice(0, -1)) n = n[k]; n[path.at(-1)] = v; };

function fakeTune({ dials = DIALS, declared = DECLARED } = {}) {
  const SHIPPED = merge(defaultsOf(dials), declared);
  const T = structuredClone(SHIPPED);
  const binders = new Map();
  const calls = [];
  const binderFor = (p) => binders.get(p) || binders.get(toPath(p).slice(0, -1).join('.') + '.*') || binders.get('*') || null;
  const tune = {
    SHIPPED, T, calls,
    dialAt: (p) => { const d = getLeaf(dials, p); return isDial(d) ? d : null; },
    get: (p) => getLeaf(T, p),
    // The other leaves that are one claim with this one, each at its shipped
    // value (js/tune.js `lawMates`).
    lawMates: (p) => {
      const d = tune.dialAt(p);
      const g = d && d.law ? PAIRS[d.law] : null;
      if (!g) return [];
      return g.paths.filter((q) => q !== String(p) && hasLeaf(SHIPPED, q)).map((q) => [q, getLeaf(SHIPPED, q)]);
    },
    sections: () => Object.keys(SHIPPED),
    bind: (pattern, fn) => binders.set(pattern, fn),
    binderFor,
    set(patch, { filmLocked = false } = {}) {
      const refused = [], pending = [], ran = new Set();
      for (const [p, v] of Object.entries(patch)) {
        const d = tune.dialAt(p);
        if (!hasLeaf(SHIPPED, p)) { refused.push([p, 'unknown']); continue; }
        if (d && d.cls === 'film' && filmLocked) { refused.push([p, 'film']); continue; }
        if (typeof v !== typeof getLeaf(SHIPPED, p)) { refused.push([p, 'type']); continue; }
        if (d && d.options && !d.options.includes(v)) { refused.push([p, 'option']); continue; }
        if (d && d.law && PAIRS[d.law]) {
          const read = (dp) => (dp in patch ? patch[dp] : getLeaf(T, dp));
          if (!PAIRS[d.law].holds(read)) { refused.push([p, PAIRS[d.law].reason]); continue; }
        }
        const before = getLeaf(T, p);
        setLeaf(T, p, v);
        calls.push([p, v]);
        const fn = binderFor(p);
        if (fn) {
          // the contract's 'binder' refusal: a throwing hook puts the leaf back
          if (!ran.has(fn)) { ran.add(fn); try { fn(p, v); } catch { setLeaf(T, p, before); refused.push([p, 'binder']); } }
        } else if (d && d.read === 'reload') pending.push(p);
      }
      return { diff: tune.diff(), refused, pending };
    },
    // `extraDiff` is the one thing this fake has that the contract does not: a
    // way for a test to stand a diff entry the leaf walk cannot produce — an
    // ASSET ROW added or removed, which is a leaf of one tree and not the
    // other (js/tune.js `diff` walks both).
    extraDiff: [],
    diff: () => leaves(SHIPPED).map((path) => ({ path: path.join('.'), shipped: getLeaf(SHIPPED, path), live: getLeaf(T, path) }))
      .filter((d) => d.shipped !== d.live)
      .map((d) => { const dl = tune.dialAt(d.path); return { ...d, cls: dl ? dl.cls : 'look', read: dl ? dl.read : 'apply', declared: hasLeaf(declared, d.path) }; })
      .concat(tune.extraDiff),
    reset(scope = 'all') {
      const patch = {};
      for (const path of leaves(SHIPPED)) {
        const p = path.join('.');
        if (scope === 'all' || p === scope || p.startsWith(scope + '.')) if (getLeaf(T, p) !== getLeaf(SHIPPED, p)) patch[p] = getLeaf(SHIPPED, p);
      }
      return tune.set(patch);
    },
    changes: () => Object.fromEntries(tune.diff().map((d) => [d.path, d.live])),
    applyPatchText(text, { filmLocked } = {}) {
      const patch = {};
      for (const line of text.split('\n')) {
        const m = /^\s*([^:#]+):\s*(.+?)\s*$/.exec(line);
        if (!m) continue;
        const raw = m[2];
        patch[m[1].trim()] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw.replace(/^["']|["']$/g, '');
      }
      return tune.set(patch, { filmLocked });
    },
    patchText: () => Object.entries(tune.changes()).map(([p, v]) => `${p}: ${v}`).join('\n') + '\n',
    exportYaml: () => { throw new Error('no source'); },
  };
  return tune;
}

function fakeCast() {
  let rows = [], seat = null, overlay = 'disabled';
  const log = [];
  return {
    log,
    players: () => rows.length,
    seat: () => (seat === null ? null : { place: seat, name: rows[seat] }),
    deal: (n) => { rows = ['Ada', 'Bo', 'Cy', 'Dee', 'Eve', 'Fen', 'Gus', 'Hal'].slice(0, n); seat = rows.length ? 0 : null; log.push(`deal(${n})`); },
    sit: (k) => { seat = k; log.push(`sit(${k})`); },
    reshuffle: () => log.push('reshuffle()'),
    // The overlay's state lives in the app (js/main.js demoOverlayState), and
    // the row reads it back — so this fake holds it the way main.js does.
    overlay: (s) => { overlay = s; log.push(`overlay(${s})`); },
    overlayState: () => overlay,
    roll: (k) => log.push(`roll(${k})`),
    rollAll: () => log.push('rollAll()'),
  };
}

// A bench to the phase-2 shape (js/main.js devBenchApi): the panel must stand
// on the verbs alone, so this one only records what it was asked and answers
// what it was told to answer.
function fakeBench({ film = false } = {}) {
  const log = [];
  const state = {
    clock: { state: 'running', live: false, frame: 0, frames: 0, time: 0 },
    ab: { a: null, b: null, live: null, film, replayed: false },
    last: null,
    locked: false,
    seed: 4242,
  };
  return {
    log, state,
    pool: '3d6',
    hud: () => ({ fps: 60, calls: 12, tris: 3400, bodies: 7, settle: 2.5 }),
    clock: () => state.clock,
    freeze: (s) => { log.push(`freeze(${s})`); state.clock.state = s; return state.clock; },
    step: () => { log.push('step()'); state.clock.frame++; return state.clock; },
    scrub: (f) => { log.push(`scrub(${f})`); return { ...state.clock, scrub: f }; },
    bench: (seed) => {
      log.push(`bench(${JSON.stringify(seed)})`);
      if (state.locked) return null;
      const s = seed === '' ? state.seed : Number(seed);
      state.last = { seed: s, frames: 180, settleS: 3, bench: true, dice: ['d6'] };
      return { seed: s, notation: '3d6 # bench', label: 'bench', place: 0, via: 'local' };
    },
    replay: () => {
      log.push('replay()');
      if (state.locked || !state.last) return null;
      return { seed: state.last.seed, notation: '3d6 # bench', label: 'bench', place: 0, via: 'local' };
    },
    last: () => state.last,
    hold: (k) => { log.push(`hold(${k})`); state.ab[k] = { changed: 2 }; state.ab.live = k; return state.ab; },
    apply: (k) => { log.push(`apply(${k})`); if (!state.ab[k]) return null; state.ab.live = k; return state.ab; },
    flip: () => {
      log.push('flip()');
      if (!state.ab.a || !state.ab.b) return null;
      state.ab.live = state.ab.live === 'a' ? 'b' : 'a';
      state.ab.replayed = state.ab.film;
      return state.ab;
    },
    ab: () => state.ab,
  };
}

// ---------------------------------------------------------------------------
// the runner
// ---------------------------------------------------------------------------

const ui = await import('../js/devui.js');
const { mount, emitStep, stepName, DEV_PHONE_QUERY } = await import('../js/devmode.js');

let n = 0;
const pendingTests = [];
const fail = (name, e) => {
  console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
  process.exitCode = 1;
};
const t = (name, fn) => {
  n++;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pendingTests.push(r.catch((e) => fail(name, e)));
  } catch (e) { fail(name, e); }
};
const fresh = (opts = {}) => {
  const host = new Node('div');
  const tune = fakeTune();
  const panel = mount({ host, tune, info: { declared: DECLARED, venue: null }, ...opts });
  return { host, tune, panel, root: panel.root };
};

// ---------------------------------------------------------------------------
// the kit
// ---------------------------------------------------------------------------

t('el: classes, dataset, handlers, text, properties and attributes', () => {
  let hit = 0;
  const node = ui.el('div', { class: 'a b', dataset: { path: 'x.y' }, onClick: () => hit++, text: 'hi', hidden: true, 'aria-label': 'l' }, ['tail']);
  assert.equal(node.className, 'a b');
  assert.equal(node.dataset.path, 'x.y');
  assert.equal(node.hidden, true);
  assert.equal(node.getAttribute('aria-label'), 'l');
  assert.equal(node.textContent, 'hitail');
  click(node);
  assert.equal(hit, 1);
});

t('segmented is a radiogroup with roving tabindex and arrow keys', () => {
  const seen = [];
  const seg = ui.segmented(['dice', 'table'], 'dice', (v) => seen.push(v), { name: 'prefer' });
  assert.equal(seg.getAttribute('role'), 'radiogroup');
  const [a, b] = seg.buttons;
  assert.equal(a.getAttribute('aria-checked'), 'true');
  assert.equal(a.tabIndex, 0);
  assert.equal(b.tabIndex, -1);
  a.focus();
  const ev = key(a, 'ArrowRight');
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(seen, ['table']);
  assert.equal(b.getAttribute('aria-checked'), 'true');
  assert.equal(document.activeElement, b, 'focus moved with the choice');
  key(b, 'ArrowRight');
  assert.deepEqual(seen, ['table', 'dice'], 'wraps');
  key(a, 'End');
  assert.equal(seg.getValue(), 'table');
  seg.setValue('dice');
  assert.equal(seg.getValue(), 'dice');
  assert.equal(seen.length, 3, 'setValue does not notify');
  seg.setDisabled(true);
  click(b);
  assert.equal(seg.getValue(), 'dice', 'disabled cells do not choose');
});

t('rowRange: slider input reports live, number commits any finite value', () => {
  const live = [], done = [];
  const r = ui.rowRange({ label: 'lamp height', value: 24, range: [5, 80, 0.5], onInput: (v) => live.push(v), onCommit: (v) => done.push(v), why: 'w' });
  const slider = r.root.find((x) => x.classList.contains('dev-range'));
  const num = r.root.find((x) => x.classList.contains('dev-num'));
  assert.equal(num.value, '24');
  slider.value = '30';
  fire(slider, 'input');
  assert.deepEqual(live, [30]);
  assert.equal(num.value, '30');
  num.value = '500';
  key(num, 'Enter');
  assert.deepEqual(done, [500], 'beyond the slider is still a value');
  num.value = 'abc';
  fire(num, 'change');
  assert.deepEqual(done, [500], 'a non-number is not sent');
  assert.equal(num.value, '500', 'and the field is put back');
  r.setValue(0.30000000000000004);
  assert.equal(num.value, '0.3', 'shortest round trip');
  r.setState({ locked: true });
  assert.equal(slider.disabled, true);
  assert.equal(num.disabled, true);
  r.setLockReason('shared');
  assert.equal(num.title, 'shared');
});

t('rowStepper nudges by the step, clamps to the range, commits on change', () => {
  const done = [];
  const r = ui.rowStepper({ label: 'declare', value: 1.35, range: [0, 4, 0.05], onCommit: (v) => done.push(v) });
  const [minus, plus] = allClass(r.root, 'dev-step');
  click(plus);
  assert.deepEqual(done, [1.4]);
  click(minus); click(minus);
  assert.deepEqual(done, [1.4, 1.35, 1.3]);
  r.setValue(0);
  click(minus);
  assert.equal(done.length, 3, 'clamped at the floor: no commit');
  const num = byClass(r.root, 'dev-num');
  num.value = '2';
  fire(num, 'change');
  assert.equal(done.at(-1), 2);
});

t('rowColor commits a lowercase #rrggbb from either input and refuses junk', () => {
  const done = [];
  const r = ui.rowColor({ label: 'colour', value: '#FFE8C4', onCommit: (v) => done.push(v) });
  const hex = byClass(r.root, 'dev-hex');
  const picker = byClass(r.root, 'dev-color');
  assert.equal(hex.value, '#ffe8c4');
  hex.value = '#123ABC';
  key(hex, 'Enter');
  assert.deepEqual(done, ['#123abc']);
  assert.equal(picker.value, '#123abc');
  hex.value = 'red';
  fire(hex, 'change');
  assert.deepEqual(done, ['#123abc']);
  assert.equal(hex.value, '#123abc');
  picker.value = '#000000';
  fire(picker, 'change');
  assert.equal(done.at(-1), '#000000');
});

// A TWELVE-STATE ENUM IS A SELECT, NOT A SEGMENTED ROW (phase D2): the sets
// editor's face table offers six digits and six drawn symbols, and the panel's
// control column is ~145px. Same marks and same lock as `rowEnum`; what
// differs is the control and the fact that it does not fight the pointer —
// a repaint while the menu is open leaves the value alone.
t('rowSelect commits the chosen option and defers a repaint while it is focused', () => {
  const done = [];
  const opts = ['1', '2', '3', '4', '5', '6', 'bolt', 'claw', 'heart', 'plus', 'minus', 'blank'];
  const r = ui.rowSelect({ label: '1 →', value: '1', options: opts, onCommit: (v) => done.push(v) });
  const sel = byClass(r.root, 'dev-select');
  assert.equal(sel.tagName, 'SELECT');
  assert.equal(sel.childNodes.length, 12, 'one option per entry');
  assert.equal(sel.value, '1');
  sel.value = 'bolt';
  fire(sel, 'change');
  assert.deepEqual(done, ['bolt']);
  r.setValue('claw');
  assert.equal(sel.value, 'claw', 'a repaint moves it while nothing is focused here');
  document.activeElement = sel;
  r.setValue('heart');
  assert.equal(sel.value, 'claw', '…and leaves it alone while somebody is choosing');
  document.activeElement = null;
  // …and it wears the row marks the rest of the kit does.
  r.setState({ locked: true });
  assert.equal(sel.disabled, true);
  assert.equal(r.root.classList.contains('is-locked'), true);
});

t('rowText keeps the type of the value it was born with', () => {
  const nums = [], strs = [];
  const rn = ui.rowText({ label: 'master', value: 0.8, onCommit: (v) => nums.push(v) });
  const rs = ui.rowText({ label: 'title', value: 'Dice Table', onCommit: (v) => strs.push(v) });
  const ni = byClass(rn.root, 'dev-text');
  const si = byClass(rs.root, 'dev-text');
  ni.value = '0.5'; fire(ni, 'change');
  ni.value = 'x'; fire(ni, 'change');
  si.value = 'Table'; fire(si, 'change');
  assert.deepEqual(nums, [0.5]);
  assert.equal(ni.value, '0.5', 'the junk was put back');
  assert.deepEqual(strs, ['Table']);
});

t('section counts and reset; diffList and status', () => {
  let resets = 0;
  const s = ui.section('light', { count: 0, onReset: () => resets++ });
  const reset = byClass(s.root, 'dev-sec-reset');
  assert.equal(reset.disabled, true, 'nothing to reset');
  s.setCount(3);
  assert.equal(byClass(s.root, 'dev-sec-count').textContent, '· 3 changed');
  click(reset);
  assert.equal(resets, 1);
  const toggle = byClass(s.root, 'dev-sec-toggle');
  click(toggle);
  assert.equal(s.body.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  const reverted = [];
  const list = ui.diffList([{ path: 'light.lamp.y', shipped: 24, live: 30, cls: 'look' }], { onRevert: (p) => reverted.push(p) });
  assert.equal(allClass(list, 'dev-diff-row').length, 1);
  click(byClass(list, 'dev-revert'));
  assert.deepEqual(reverted, ['light.lamp.y']);
  assert.equal(byClass(ui.diffList([], {}), 'dev-diff-empty').textContent, 'nothing changed');
  const st = ui.status('x', { kind: 'warn' });
  assert.equal(st.getAttribute('role'), 'status');
  assert.ok(st.classList.contains('dev-status-warn'));
});

t('stopKeys stops every key event at the root', () => {
  const outer = new Node('div');
  const root = new Node('div');
  const inner = new Node('button');
  outer.append(root); root.append(inner);
  let leaked = 0;
  for (const type of ['keydown', 'keyup', 'keypress']) outer.addEventListener(type, () => leaked++);
  ui.stopKeys(root);
  inner.dispatchEvent(new Ev('keydown', { key: 'c' }));
  inner.dispatchEvent(new Ev('keyup', { key: 'c' }));
  inner.dispatchEvent(new Ev('keypress', { key: 'c' }));
  assert.equal(leaked, 0);
});

// ---------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------

t('mount THROWS in production mode', () => {
  assert.throws(() => mount({ host: new Node('div'), tune: fakeTune(), mode: 'production' }), /production/);
});

t('sections come from tune.sections(); every leaf is a row chosen by its dial', () => {
  const { root, tune, host } = fresh();
  assert.equal(root.id, 'dev-panel');
  assert.ok(host.childNodes.includes(root), 'mounted on the host');
  const bar = byClass(root, 'dev-secbar');
  assert.deepEqual(bar.buttons.map((b) => b.textContent), [...tune.sections(), 'file']);
  const kinds = Object.fromEntries(allClass(root, 'dev-row').filter((r) => r.dataset.path && !r.dataset.path.startsWith('cast.'))
    .map((r) => [r.dataset.path, [...r.classList.set].find((c) => c.startsWith('is-')).slice(3)]));
  assert.deepEqual(kinds, {
    'app.title': 'text',            // string, no options
    'app.mode': 'static',           // options, but NOT a dial (DEVMODE §4): shown, never written
    'app.version': 'stepper',       // number, read reload, no range
    'light.lamp.y': 'range',        // number + range + apply
    'light.lamp.penumbra': 'range',
    'light.lamp.color': 'color',    // '#…'
    'light.room.hemi': 'range',
    'throw.physics.gravity': 'range',
    'pace.ceremony.declareS': 'stepper', // number + read reload
    'table.ceilingY': 'stepper',    // film + reload
    'camera.framing.prefer': 'enum', // options
    'sound.master': 'text',         // no dial
  });
  const subs = allClass(root, 'dev-subhead').map((s) => s.textContent);
  assert.ok(subs.includes('lamp') && subs.includes('room') && subs.includes('physics'), `nested maps are subheads: ${subs}`);
  // a label that repeats its subhead's word drops it; one that does not is whole
  assert.equal(byClass(rowFor(root, 'light.lamp.penumbra'), 'dev-row-name').textContent, 'penumbra');
  assert.equal(byClass(rowFor(root, 'light.lamp.y'), 'dev-row-name').textContent, 'height');
  assert.equal(byClass(rowFor(root, 'throw.physics.gravity'), 'dev-row-name').textContent, 'gravity');
  assert.equal(byClass(rowFor(root, 'app.title'), 'dev-row-name').textContent, 'title', 'a section key is not a subhead');
  assert.equal(rowFor(root, 'app.version').find((x) => x.classList.contains('dev-mark-default')).hidden, false,
    'a leaf the file omits wears the default mark');
  assert.equal(rowFor(root, 'app.title').find((x) => x.classList.contains('dev-mark-default')).hidden, true);
  assert.equal(rowFor(root, 'app.version').find((x) => x.classList.contains('dev-mark-reload')).hidden, false, 'reload rows wear ⟳');
  assert.equal(rowFor(root, 'light.lamp.y').find((x) => x.classList.contains('dev-mark-reload')).hidden, true);
  // one section visible at a time
  const shown = allClass(root, 'dev-section').filter((s) => !s.hidden).map((s) => s.dataset.section);
  assert.deepEqual(shown, ['app']);
  click(bar.buttons[1]);
  assert.deepEqual(allClass(root, 'dev-section').filter((s) => !s.hidden).map((s) => s.dataset.section), ['light']);
});

t('a row write goes through tune.set, repaints, counts and lists the change', () => {
  const { root, tune } = fresh();
  const row = rowFor(root, 'light.lamp.y');
  const slider = byClass(row, 'dev-range');
  slider.value = '30';
  fire(slider, 'input');
  assert.equal(tune.T.light.lamp.y, 30);
  assert.deepEqual(tune.calls, [['light.lamp.y', 30]]);
  assert.ok(row.classList.contains('is-changed'));
  assert.equal(byClass(row, 'dev-revert').hidden, false);
  const light = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'light');
  assert.equal(byClass(light, 'dev-sec-count').textContent, '· 1 changed');
  assert.equal(byClass(root, 'dev-foot-counts').textContent, '1 changed · 0 reload');
  assert.match(byClass(root, 'dev-foot-viewport').textContent, /^1600×900 @1$/);
  const diffRows = allClass(byClass(root, 'dev-diff'), 'dev-diff-row');
  assert.equal(diffRows.length, 1);
  assert.equal(byClass(diffRows[0], 'dev-diff-path').textContent, 'light.lamp.y');
  assert.equal(byClass(diffRows[0], 'dev-diff-live').textContent, '30');
  // revert from the row
  click(byClass(row, 'dev-revert'));
  assert.equal(tune.T.light.lamp.y, 24);
  assert.ok(!row.classList.contains('is-changed'));
  assert.equal(byClass(root, 'dev-foot-counts').textContent, '0 changed · 0 reload');
});

t('a refused write shows a status line with the reason', () => {
  const { root, tune } = fresh();
  const seg = byClass(rowFor(root, 'camera.framing.prefer'), 'dev-seg');
  click(seg.buttons[1]);
  assert.equal(tune.T.camera.framing.prefer, 'table', 'an option in the list is taken');
  // force a refusal: the fake refuses a type mismatch
  tune.set = () => ({ diff: [], refused: [['camera.framing.prefer', 'option']], pending: [] });
  click(seg.buttons[0]);
  const st = byClass(root, 'dev-statusslot').find((x) => x.classList.contains('dev-status'));
  assert.ok(st, 'a status line');
  assert.match(st.textContent, /camera\.framing\.prefer: not one of the options/);
});

t('app.mode is drawn but no panel control writes it (DEVMODE §4)', () => {
  const { root, tune, panel } = fresh();
  const row = rowFor(root, 'app.mode');
  assert.ok(row.classList.contains('is-static'));
  assert.equal(byClass(row, 'dev-seg'), null, 'no segmented control');
  assert.equal(row.find((x) => x.tagName === 'INPUT'), null, 'no input either');
  assert.equal(byClass(row, 'dev-static').textContent, 'development');
  // every button in the row is inert: nothing reaches tune.set
  for (const b of row.all((x) => x.tagName === 'BUTTON')) click(b);
  assert.deepEqual(tune.calls, []);
  assert.equal(tune.T.app.mode, 'development');
  // a value the server or a console set is still shown honestly, with no revert glyph
  tune.T.app.mode = 'production';
  panel.repaint();
  assert.equal(byClass(row, 'dev-static').textContent, 'production');
  assert.ok(row.classList.contains('is-changed'));
  assert.equal(byClass(row, 'dev-revert').hidden, true, 'the revert glyph would be a write');
  click(byClass(row, 'dev-revert'));
  assert.equal(tune.T.app.mode, 'production');
  assert.deepEqual(tune.calls, []);
});

t('repaint reads the tune, so a console write shows up without a row event', () => {
  const { root, tune, panel } = fresh();
  tune.set({ 'light.room.hemi': 0.5 });
  panel.repaint();
  const row = rowFor(root, 'light.room.hemi');
  assert.equal(byClass(row, 'dev-num').value, '0.5');
  assert.ok(row.classList.contains('is-changed'));
  // and a typed field is not clobbered while it has focus
  const num = byClass(row, 'dev-num');
  num.focus();
  num.value = '0.7';
  tune.set({ 'light.room.hemi': 0.6 });
  panel.repaint();
  assert.equal(num.value, '0.7');
  num.blur();
  assert.equal(num.value, '0.6', 'the value that waited lands on blur');
});

t('a value a repaint deferred behind a focused field is not lost: it lands on blur (DEVMODE §7 sync)', () => {
  const { root, tune, panel } = fresh();
  const row = rowFor(root, 'light.lamp.y');
  const num = byClass(row, 'dev-num');
  num.focus();
  tune.set({ 'light.lamp.y': 40 });
  panel.repaint();
  assert.equal(num.value, '24', 'guarded while focused');
  num.blur();
  panel.repaint(); panel.repaint();
  assert.equal(tune.T.light.lamp.y, 40);
  assert.equal(num.value, '40', 'and shown once the field is free — not stale for good');
  // a binder that rewrites T after a typed Enter: the field ends on the truth
  tune.bind('light.lamp.y', (p, v) => { if (v === 500) setLeaf(tune.T, p, 50); });
  num.focus();
  num.value = '500';
  key(num, 'Enter');
  assert.equal(tune.T.light.lamp.y, 50);
  num.blur();
  assert.equal(num.value, '50');
  // a change committed on the way out is written first and the field keeps it
  num.focus();
  num.value = '33';
  fire(num, 'change');   // the browser fires change, then blur
  num.blur();
  assert.equal(tune.T.light.lamp.y, 33);
  assert.equal(num.value, '33');
  // the same door for a colour's hex and a text row
  const color = rowFor(root, 'light.lamp.color');
  const hex = byClass(color, 'dev-hex');
  hex.focus();
  tune.set({ 'light.lamp.color': '#123456' });
  panel.repaint();
  assert.equal(hex.value, '#ffe8c4');
  hex.blur();
  assert.equal(hex.value, '#123456');
  const title = byClass(rowFor(root, 'app.title'), 'dev-text');
  title.focus();
  tune.set({ 'app.title': 'Felt' });
  panel.repaint();
  assert.equal(title.value, 'Dice Table');
  title.blur();
  assert.equal(title.value, 'Felt');
});

t('a refused write puts the row back to T — no drift, no skipped step, and the binder reason reads as a sentence', () => {
  const { root, tune } = fresh();
  const statusText = () => byClass(root, 'dev-statusslot').textContent;
  let fail = true;
  tune.bind('table.ceilingY', () => { if (fail) throw new Error('boom'); });
  const ceil = rowFor(root, 'table.ceilingY');
  const plus = allClass(ceil, 'dev-step')[1];
  click(plus);
  assert.equal(tune.T.table.ceilingY, 22, 'the tune put it back');
  assert.equal(byClass(ceil, 'dev-num').value, '22', 'and so did the row');
  assert.ok(!ceil.classList.contains('is-changed'));
  assert.match(statusText(), /table\.ceilingY: the re-apply hook threw — value put back/);
  fail = false;
  click(plus);
  assert.equal(tune.T.table.ceilingY, 23, 'the next healthy step is 23, not 24');
  // colour: hex and picker both come back
  tune.bind('light.lamp.color', () => { throw new Error('boom'); });
  const color = rowFor(root, 'light.lamp.color');
  const hex = byClass(color, 'dev-hex');
  hex.value = '#112233';
  fire(hex, 'change');
  assert.equal(tune.T.light.lamp.color, '#ffe8c4');
  assert.equal(hex.value, '#ffe8c4');
  assert.equal(byClass(color, 'dev-color').value, '#ffe8c4');
  // range: slider and number both come back
  tune.bind('light.lamp.y', () => { throw new Error('boom'); });
  const lamp = rowFor(root, 'light.lamp.y');
  const slider = byClass(lamp, 'dev-range');
  slider.value = '30';
  fire(slider, 'input');
  assert.equal(tune.T.light.lamp.y, 24);
  assert.equal(slider.value, '24');
  assert.equal(byClass(lamp, 'dev-num').value, '24');
  // a refused film write while locked comes back the same way
  const { root: r2, tune: t2, panel: p2 } = fresh();
  p2.setFilm('locked');
  const g = byClass(rowFor(r2, 'throw.physics.gravity'), 'dev-range');
  g.value = '-50';
  fire(g, 'input');
  assert.equal(t2.T.throw.physics.gravity, -110);
  assert.equal(g.value, '-110');
  assert.equal(byClass(rowFor(r2, 'throw.physics.gravity'), 'dev-num').value, '-110');
});

t('a slider release writes once: the change after the last input carries no new value', () => {
  const { root, tune } = fresh();
  let ran = 0;
  tune.bind('light.lamp.y', () => ran++);
  const row = rowFor(root, 'light.lamp.y');
  const slider = byClass(row, 'dev-range');
  slider.value = '30';
  fire(slider, 'input');
  fire(slider, 'change');
  assert.deepEqual(tune.calls, [['light.lamp.y', 30]], 'one write for input + change');
  assert.equal(ran, 1, 'the re-apply hook ran once per release');
  // a release at a fresh value (keyboard: change without input) still lands
  slider.value = '31';
  fire(slider, 'change');
  assert.equal(tune.T.light.lamp.y, 31);
  assert.equal(ran, 2);
  // the typed number beside it is not swallowed either
  const num = byClass(row, 'dev-num');
  num.value = '32';
  fire(num, 'change');
  assert.equal(tune.T.light.lamp.y, 32);
});

// THE PHONE SHEET (docs/DEVMODE.md §7, phase D5). One query, read in two
// places that have to agree — css/dev.css for the sheet's dress, this file for
// the two things a stylesheet cannot do. Both halves are held here, and the
// query is asked of the module rather than spelled twice, so a change to it
// cannot leave the test measuring the old string.
t('a phone starts folded AND says so through onFold', () => {
  const folds = [];
  const was = window.matchMedia;
  window.matchMedia = (q) => ({ matches: q === DEV_PHONE_QUERY });
  try {
    const { panel, root } = fresh({ onFold: (on) => folds.push(on) });
    assert.equal(panel.isFolded(), true);
    assert.deepEqual(folds, [true], 'the caller and isFolded() agree from the first frame');
    assert.equal(root.classList.contains('dev-phone'), true,
      'and the panel publishes its own reading of the query as a class');
  } finally { window.matchMedia = was; }
});

t('a coarse pointer is a phone however wide the window is', () => {
  const was = window.matchMedia;
  // The query is one string with two clauses; a browser answers the STRING.
  // This stub is the coarse half: the window is 1600px and the answer is yes.
  window.matchMedia = (q) => ({ matches: q === DEV_PHONE_QUERY });
  try {
    assert.equal(window.innerWidth, 1600, 'a wide window…');
    const { panel } = fresh();
    assert.equal(panel.isFolded(), true, '…and a touchscreen is still a phone');
  } finally { window.matchMedia = was; }
});

t('on the phone every range row is a stepper — a fingertip cannot hit a value on a slider', () => {
  const was = window.matchMedia;
  window.matchMedia = (q) => ({ matches: q === DEV_PHONE_QUERY });
  let root; let panel; let tune;
  try { ({ root, panel, tune } = fresh()); } finally { window.matchMedia = was; }
  panel.fold(false);
  const lamp = rowFor(root, 'light.lamp.y');
  assert.ok(lamp, 'the lamp row is drawn');
  assert.equal(lamp.classList.contains('is-stepper'), true, 'a range dial wears the stepper dress');
  assert.equal(lamp.classList.contains('is-range'), false, 'and not the slider dress');
  assert.equal(root.all((n) => n.attrs.get('type') === 'range').length, 0,
    'no slider anywhere in the panel');
  // A stepper is not a lesser control: it commits the same way, through the
  // same `tune.set`, and it can still be typed into.
  const minus = root.find((n) => n.tagName === 'BUTTON' && n.classList.contains('dev-step'));
  assert.ok(minus, 'the stepper has its buttons');
  const num = byClass(lamp, 'dev-num');
  num.value = '41';
  fire(num, 'change');
  assert.equal(tune.T.light.lamp.y, 41, 'and the typed value lands');
  // …and the ENUM, COLOUR and RELOAD rows are untouched: the phone changes one
  // control kind, not the panel.
  assert.equal(rowFor(root, 'camera.framing.prefer').classList.contains('is-enum'), true);
  assert.equal(rowFor(root, 'light.lamp.color').classList.contains('is-color'), true);
  assert.equal(rowFor(root, 'table.ceilingY').classList.contains('is-stepper'), true);
});

t("mount({ phone: 'never' }) keeps the desktop dress however the query answers", () => {
  // THE POP-OUT (the D5 review, 2026-09-03). dev.html mounts this same panel
  // in a window with no felt behind it, and Pop out used to open that window at
  // a width INSIDE the phone query — so a second-monitor panel arrived with
  // every slider replaced by a stepper and its `file` section scrolled off a
  // `nowrap` bar. The sheet's reason is the felt; where there is none, the
  // option says so. The stub below is a phone by every measure the panel has.
  const was = window.matchMedia;
  window.matchMedia = (q) => ({ matches: q === DEV_PHONE_QUERY });
  let root; let panel;
  try { ({ root, panel } = fresh({ phone: 'never' })); } finally { window.matchMedia = was; }
  assert.equal(panel.isFolded(), false, 'it does not start folded: there is nothing behind it to show');
  assert.equal(root.classList.contains('dev-phone'), false, 'and it does not claim to be a sheet');
  assert.equal(rowFor(root, 'light.lamp.y').classList.contains('is-range'), true, 'a range row is a slider');
  assert.ok(root.all((n) => n.attrs.get('type') === 'range').length > 0, 'sliders are drawn');
  // …and 'auto' (the default, and what the table tab passes) still asks.
  window.matchMedia = (q) => ({ matches: q === DEV_PHONE_QUERY });
  let auto;
  try { auto = fresh({ phone: 'auto' }); } finally { window.matchMedia = was; }
  assert.equal(auto.panel.isFolded(), true, "'auto' is the query's answer, which here is yes");
  assert.equal(auto.root.classList.contains('dev-phone'), true);
});

t('a desktop keeps its sliders', () => {
  const { root } = fresh();
  assert.equal(rowFor(root, 'light.lamp.y').classList.contains('is-range'), true);
  assert.ok(root.all((n) => n.attrs.get('type') === 'range').length > 0, 'sliders are drawn');
});

t('no panel reset writes app.mode: section ↺, Reset all, the footer Reset and the diff revert all skip it (DEVMODE §4)', () => {
  const { root, tune, panel } = fresh();
  tune.T.app.mode = 'production';
  tune.set({ 'app.title': 'Felt', 'light.lamp.y': 30 });
  panel.repaint();
  const app = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'app');
  assert.equal(byClass(app, 'dev-sec-count').textContent, '· 2 changed');
  click(byClass(app, 'dev-sec-reset'));
  assert.equal(tune.T.app.title, 'Dice Table', 'the section reset took the dial');
  assert.equal(tune.T.app.mode, 'production', 'and left the switch alone');
  const file = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'file');
  const modeRow = byClass(root, 'dev-diff').find((r) => r.classList.contains('dev-diff-row') && r.dataset.path === 'app.mode');
  assert.ok(modeRow, 'the diff list still shows it honestly');
  click(byClass(modeRow, 'dev-revert'));
  assert.equal(tune.T.app.mode, 'production');
  click(byText(file, 'Reset all'));
  assert.equal(tune.T.light.lamp.y, 24);
  assert.equal(tune.T.app.mode, 'production');
  click(byText(byClass(root, 'dev-foot'), 'Reset'));
  assert.equal(tune.T.app.mode, 'production');
  assert.ok(!tune.calls.some(([p]) => p === 'app.mode'), 'nothing named it to tune.set');
  // a reset while the film is locked refuses the film row like any other write
  const two = fresh();
  two.tune.set({ 'throw.physics.gravity': -80, 'light.lamp.y': 30 });
  two.panel.setFilm('locked');
  click(byText(byClass(two.root, 'dev-foot'), 'Reset'));
  assert.equal(two.tune.T.light.lamp.y, 24);
  assert.equal(two.tune.T.throw.physics.gravity, -80, 'film held');
  assert.match(byClass(two.root, 'dev-statusslot').textContent, /gravity: film values are shared/);
});

// The D4 review, 2026-09-03: "`reset` of one half of a law pair can be
// refused, so a value has no way back to the shipped one." The panel's ↺ goes
// through `tune.set` with the shipped value, so it hit the same wall the
// hook did — and the sliders cannot reach the state, but the typed field can,
// which is the state a person gets stuck in.
t('a ↺ on half a pair takes the whole pair back (the pair law, phase D4)', () => {
  const dials = {
    cards: {
      standoff: film('card standoff', 0.86, [0.8, 4, 0.01], 'apply', '', 'cardClear'),
      depth: film('card depth', 1.52, [0.4, 1.6, 0.01], 'apply', '', 'cardClear'),
    },
  };
  const declared = { cards: { standoff: 0.86, depth: 1.52 } };
  const host = new Node('div');
  const tune = fakeTune({ dials, declared });
  const panel = mount({ host, tune, info: { declared, venue: null } });
  const root = panel.root;
  // A pair the typed field can reach and the sliders cannot: 0.2 − 0.4/2 = 0.
  assert.deepEqual(tune.set({ 'cards.depth': 0.4 }).refused, []);
  assert.deepEqual(tune.set({ 'cards.standoff': 0.2 }).refused, []);
  panel.repaint();
  // Half the pair on its own IS refused — that is the wall being fixed, and
  // the widening is the fix, not a weaker law.
  assert.deepEqual(tune.set({ 'cards.depth': 1.52 }).refused, [['cards.depth', 'geometry']],
    'the shipped depth against the typed standoff is not a legal pair');
  const row = rowFor(root, 'cards.depth');
  click(byClass(row, 'dev-revert'));
  assert.deepEqual([tune.T.cards.standoff, tune.T.cards.depth], [0.86, 1.52],
    'the ↺ put BOTH halves back, because the pair the file ships holds by construction');
  assert.equal(byClass(root, 'dev-statusslot').textContent, '', 'and nothing was refused');
  panel.unmount();
});

t('reload-class writes count as pending and show Save & reload', () => {
  const verbs = { download: () => verbs.n++ };
  verbs.n = 0;
  const { root, tune } = fresh({ verbs });
  const row = rowFor(root, 'pace.ceremony.declareS');
  click(allClass(row, 'dev-step')[1]);
  assert.equal(tune.T.pace.ceremony.declareS, 1.4);
  assert.equal(byClass(root, 'dev-foot-counts').textContent, '1 changed · 1 reload');
  const save = byClass(root, 'dev-save');
  assert.equal(save.hidden, false);
  click(save);
  assert.equal(verbs.n, 1, 'no saveReload verb: download, and never location');
  click(allClass(row, 'dev-step')[0]);
  assert.equal(byClass(root, 'dev-foot-counts').textContent, '0 changed · 0 reload');
  assert.equal(save.hidden, true);
});

t('the reload set is derived from the tune: a console write to a reload leaf lands a reload row', () => {
  const { root, tune, panel } = fresh();
  const counts = () => byClass(root, 'dev-foot-counts').textContent;
  const save = byClass(root, 'dev-save');
  // a console write (never through the panel), then the tick's repaint
  tune.set({ 'table.ceilingY': 23 });
  panel.repaint();
  assert.equal(counts(), '1 changed · 1 reload');
  assert.equal(save.hidden, false);
  // a bound reload leaf is applied live: changed, not pending
  tune.bind('pace.ceremony.declareS', () => {});
  tune.set({ 'pace.ceremony.declareS': 2 });
  panel.repaint();
  assert.equal(counts(), '2 changed · 1 reload');
  // an apply-class console write is changed, not reload
  tune.set({ 'light.lamp.y': 30 });
  panel.repaint();
  assert.equal(counts(), '3 changed · 1 reload');
  // a console reset clears it without any panel event
  tune.reset('table.ceilingY');
  panel.repaint();
  assert.equal(counts(), '2 changed · 0 reload');
  assert.equal(save.hidden, true);
  // and the two paths converge: a stepper click on the same leaf reads the same
  click(allClass(rowFor(root, 'table.ceilingY'), 'dev-step')[1]);
  assert.equal(tune.T.table.ceilingY, 23);
  assert.equal(counts(), '3 changed · 1 reload');
  assert.equal(save.hidden, false);
});

t('without binderFor, the panel falls back to what its own writes learned', () => {
  const { root, tune, panel } = fresh();
  delete tune.binderFor;
  const counts = () => byClass(root, 'dev-foot-counts').textContent;
  // a console write to a reload leaf: nothing says a binder covers it, so it is pending
  tune.set({ 'table.ceilingY': 23 });
  panel.repaint();
  assert.equal(counts(), '1 changed · 1 reload');
  // a panel write the tune reports covered (no pending) is remembered as bound
  tune.bind('pace.ceremony.declareS', () => {});
  click(allClass(rowFor(root, 'pace.ceremony.declareS'), 'dev-step')[1]);
  assert.equal(counts(), '2 changed · 1 reload');
  // reverting the bound leaf forgets it; a later unbound write is pending again
  tune.reset('pace.ceremony.declareS');
  tune.bind('pace.ceremony.declareS', undefined);
  click(allClass(rowFor(root, 'pace.ceremony.declareS'), 'dev-step')[1]);
  assert.equal(counts(), '2 changed · 2 reload');
});

t('Save & reload with nothing wired says so, and never claims a download', () => {
  const { root, tune, panel } = fresh({ verbs: {} });
  tune.set({ 'table.ceilingY': 23 });
  panel.repaint();
  const save = byClass(root, 'dev-save');
  assert.equal(save.hidden, false);
  click(save);
  const st = byClass(root, 'dev-statusslot').textContent;
  assert.match(st, /download: not wired/);
  assert.doesNotMatch(st, /downloaded/);
  // with a download verb the line is honest
  const verbs = { download: () => { verbs.n++; } };
  verbs.n = 0;
  const two = fresh({ verbs });
  two.tune.set({ 'table.ceilingY': 23 });
  two.panel.repaint();
  click(byClass(two.root, 'dev-save'));
  assert.equal(verbs.n, 1);
  assert.match(byClass(two.root, 'dev-statusslot').textContent, /downloaded — reload the tab/);
  // and a saveReload verb is preferred outright
  const three = fresh({ verbs: { saveReload: () => { verbs.n += 10; }, download: () => { verbs.n += 100; } } });
  three.tune.set({ 'table.ceilingY': 23 });
  three.panel.repaint();
  click(byClass(three.root, 'dev-save'));
  assert.equal(verbs.n, 11);
});

t('the film lock disables film rows and the cast, and unlocks', () => {
  const cast = fakeCast();
  const { root, tune, panel } = fresh({ cast });
  panel.setFilm('locked', 'a second viewer is here; film values are shared.');
  const g = rowFor(root, 'throw.physics.gravity');
  assert.ok(g.classList.contains('is-locked'));
  assert.equal(byClass(g, 'dev-range').disabled, true);
  assert.equal(byClass(g, 'dev-mark-lock').hidden, false);
  assert.equal(byClass(g, 'dev-mark-lock').title, 'a second viewer is here; film values are shared.');
  assert.ok(!rowFor(root, 'light.lamp.y').classList.contains('is-locked'), 'look rows never lock');
  assert.equal(byClass(root, 'dev-film').hidden, false);
  const castSec = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'cast');
  assert.equal(byText(castSec, 'reshuffle names').disabled, true);
  click(byText(castSec, 'reshuffle names'));
  assert.deepEqual(cast.log, []);
  // a slider write while locked is refused with the film reason
  const slider = byClass(g, 'dev-range');
  slider.value = '-50';
  fire(slider, 'input');
  assert.equal(tune.T.throw.physics.gravity, -110);
  assert.match(byClass(root, 'dev-statusslot').textContent, /film values are shared/);
  panel.setFilm('live');
  assert.ok(!g.classList.contains('is-locked'));
  assert.equal(byClass(g, 'dev-range').disabled, false);
  assert.equal(byText(castSec, 'reshuffle names').disabled, false);
});

t('the cast section drives the cast object and reads it back', () => {
  const cast = fakeCast();
  const { root, panel } = fresh({ cast });
  const bar = byClass(root, 'dev-secbar');
  assert.ok(bar.buttons.map((b) => b.textContent).includes('cast'));
  const sec = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'cast');
  const players = rowFor(sec, 'cast.players');
  const [, plus] = allClass(players, 'dev-step');
  click(plus); click(plus); click(plus);
  assert.deepEqual(cast.log, ['deal(1)', 'deal(2)', 'deal(3)']);
  assert.equal(byClass(sec, 'dev-seat').textContent, '0 · Ada');
  click(byText(sec, '▶'));
  assert.equal(cast.log.at(-1), 'sit(1)');
  assert.equal(byClass(sec, 'dev-seat').textContent, '1 · Bo');
  click(byText(sec, '◀')); click(byText(sec, '◀'));
  assert.equal(cast.log.at(-1), 'sit(2)', 'wraps below zero');
  // The overlay row is one enum of four, in the order the panel offers them:
  // disabled | regions | framing | all. It drives the cast AND reads it back,
  // so a state set anywhere else shows here.
  const ovSeg = byClass(rowFor(sec, 'cast.overlay'), 'dev-seg');
  assert.deepEqual(ovSeg.buttons.map((b) => b.textContent), ['disabled', 'regions', 'framing', 'all']);
  click(ovSeg.buttons[2]);
  assert.equal(cast.log.at(-1), 'overlay(framing)');
  cast.overlay('all');
  panel.repaint();
  assert.equal(ovSeg.getValue(), 'all', 'the row follows the app, not the last click');
  click(byText(sec, 'throw 3d6 from seat'));
  assert.equal(cast.log.at(-1), 'roll(2)');
  click(byText(sec, 'throw from every seat'));
  assert.equal(cast.log.at(-1), 'rollAll()');
  click(byText(sec, 'reshuffle names'));
  assert.equal(cast.log.at(-1), 'reshuffle()');
  const num = byClass(players, 'dev-num');
  num.value = '12'; fire(num, 'change');
  assert.equal(cast.log.at(-1), 'deal(8)', 'clamped to eight chairs');
  panel.setCast(null);
  assert.equal(root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'cast'), null);
  assert.ok(!byClass(root, 'dev-secbar').buttons.map((b) => b.textContent).includes('cast'));
});

t('find filters rows by label or path across every section', () => {
  const { root } = fresh();
  const findInput = byClass(root, 'dev-find');
  findInput.value = 'lamp';
  fire(findInput, 'input');
  const visible = allClass(root, 'dev-row').filter((r) => r.dataset.path && r.isShown()).map((r) => r.dataset.path);
  assert.deepEqual(visible, ['light.lamp.y', 'light.lamp.penumbra', 'light.lamp.color'], 'by path: the stripped label alone would miss these');
  const subs = allClass(root, 'dev-subhead').filter((s) => s.isShown()).map((s) => s.textContent);
  assert.deepEqual(subs, ['lamp'], 'a heading with no visible row is hidden');
  findInput.value = 'gravity';
  fire(findInput, 'input');
  assert.deepEqual(allClass(root, 'dev-row').filter((r) => r.dataset.path && r.isShown()).map((r) => r.dataset.path), ['throw.physics.gravity'], 'by label, in another section');
  findInput.value = '';
  fire(findInput, 'input');
  assert.deepEqual(allClass(root, 'dev-section').filter((s) => !s.hidden).map((s) => s.dataset.section), ['app'], 'back to one section');
});

t('fold hides everything but the glyph; Esc and the header fold; the glyph unfolds', () => {
  const folds = [];
  const { root, panel, host, tune } = fresh({ onFold: (on) => folds.push(on) });
  const glyph = host.childNodes.find((n) => n.id === 'dev-glyph');
  assert.ok(glyph && glyph.hidden, 'the glyph waits');
  tune.set({ 'light.lamp.y': 31 }); panel.repaint();
  key(byClass(root, 'dev-find'), 'Escape');
  assert.equal(panel.isFolded(), true);
  assert.equal(root.hidden, true);
  assert.equal(glyph.hidden, false);
  assert.equal(glyph.textContent, 'DEV · 1 changed');
  assert.deepEqual(folds, [true]);
  click(glyph);
  assert.equal(panel.isFolded(), false);
  assert.equal(root.hidden, false);
  assert.deepEqual(folds, [true, false]);
  click(byClass(root, 'dev-fold'));
  assert.deepEqual(folds, [true, false, true]);
  assert.equal(tune.T.light.lamp.y, 31, 'fold holds values');
});

t('file: Reset all, paste preview lists refusals, Apply merges, Shut calls back', () => {
  let shut = 0;
  const parsed = { 'light.lamp.y': 40, 'nope.x': 1, 'app.mode': 'nope', 'throw.physics.gravity': -80 };
  const verbs = { parsePatch: () => parsed };
  const { root, tune, panel } = fresh({ verbs, onShut: () => shut++, film: 'locked' });
  const file = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'file');
  const paste = byClass(file, 'dev-paste');
  paste.value = 'anything';
  click(byText(file, 'Preview'));
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    const rowsP = allClass(file, 'dev-preview-row');
    assert.equal(rowsP.length, 4);
    assert.deepEqual(rowsP.map((r) => r.classList.contains('is-refused')), [false, true, true, true]);
    assert.deepEqual(rowsP.slice(1).map((r) => byClass(r, 'dev-preview-reason').textContent),
      ['no such dial', 'not one of the options', 'film values are shared — a second viewer is here']);
    assert.match(byClass(file, 'dev-preview').textContent, /1 would apply · 3 refused/);
    // Apply goes through tune.applyPatchText with the lock
    paste.value = 'light.lamp.y: 40\nthrow.physics.gravity: -80\n';
    click(byText(file, 'Apply'));
    assert.equal(tune.T.light.lamp.y, 40);
    assert.equal(tune.T.throw.physics.gravity, -110, 'film refused while locked');
    assert.match(byClass(root, 'dev-statusslot').textContent, /1 refused: throw\.physics\.gravity/);
    click(byText(file, 'Reset all'));
    assert.equal(tune.T.light.lamp.y, 24);
    click(byText(byClass(root, 'dev-foot'), 'Shut'));
    assert.equal(shut, 1);
    panel.setFooter({ fps: 41.4, calls: 120, viewport: { w: 390, h: 844 }, dpr: 3 });
    assert.equal(byClass(root, 'dev-foot-viewport').textContent, '390×844 @3');
    assert.equal(byClass(root, 'dev-foot-perf').textContent, '41 fps · 120 calls');
    panel.unmount();
    assert.equal(root.parentNode, null);
  });
});

// ---------------------------------------------------------------------------
// the felts section (phase C4) — the first ASSET editor, and the two things
// the C4 review found it saying that were not true.
// ---------------------------------------------------------------------------

// The row shape, to the contract's shape and not imported — same discipline as
// the fake Tune above (js/tune.js ASSET_ROWS.felts is the real one).
const FELT_FIELDS = {
  name: look('name', 'House felt', null, 'apply'),
  cloth: pick('cloth', 'felt', ['felt', 'silt', 'oak'], 'look', 'apply'),
  feltBase: look('felt base', '#1c1c24', null, 'apply'),
  breath: look('breath depth', 1, [0, 2, 0.05], 'apply'),
};
const FELT_ROW_DEF = { name: 'House felt', cloth: 'felt', feltBase: '#1c1c24', breath: 1 };

// `removable` is the phase-E1 shape (js/main.js devFeltsValue): the mats moved
// into dice.yaml, so there is no `shipped` row that lives in code any more —
// what a row is or is not is IN THE FILE, and what may be removed is what this
// session authored.
function fakeFelts(rows) {
  const cat = rows.map((r) => ({ ...FELT_ROW_DEF, inFile: false, removable: true, current: false, ...r }));
  const log = [];
  const at = (id) => cat.find((f) => f.id === id) || null;
  return {
    log,
    cat,
    fields: () => FELT_FIELDS,
    list: () => cat.map((f) => ({ ...f })),
    add: (id, row) => {
      cat.push({ ...FELT_ROW_DEF, inFile: false, removable: true, current: false, id, ...row });
      log.push(`add(${id})`);
      return { id, refused: [], felts: cat };
    },
    set: (id, patch) => { Object.assign(at(id), patch); log.push(`set(${id})`); return { id, refused: [], felts: cat }; },
    remove: (id) => { cat.splice(cat.indexOf(at(id)), 1); log.push(`remove(${id})`); return { id, refused: [], felts: cat }; },
    apply: (id) => { for (const f of cat) f.current = f.id === id; log.push(`apply(${id})`); return { felt: id, felts: cat }; },
  };
}

// `· N changed` MEANS CHANGED. The section reused the dial chrome's count and
// fed it the number of HOUSE ROWS, so a panel opened against a dice.yaml that
// declares one unedited felt read "FELTS · 1 changed" and wore the changed
// mark while devInfo().changed was 0 and the file section's diff was empty
// (the C4 review, 2026-09-03).
t('felts: the count is what the FILE would gain, lose or amend — not the house-row tally', () => {
  const felts = fakeFelts([
    { id: 'obsidian', name: 'Obsidian', inFile: true, removable: false },
    { id: 'house-moss', name: 'Moss', inFile: true, removable: false, current: true },
  ]);
  const { root, tune, panel } = fresh({ felts });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'felts');
  assert.ok(sec, 'the section is there when a felts api is given');
  const count = byClass(sec, 'dev-sec-count');
  assert.equal(count.textContent, '', 'a declared row nobody has touched is not a change');
  assert.equal(sec.classList.contains('is-changed'), false);
  const note = byClass(sec, 'dev-clockout').textContent;
  assert.match(note, /house-moss · declared in dice\.yaml — Remove is for the rows you author/);
  // ONE CLAUSE PER ROW KIND (the E1 review, 2026-09-03): `removable` is
  // exactly `!inFile`, so a second clause hung off it read "obsidian ·
  // declared in dice.yaml · declared: Remove is for the rows you author" —
  // redundant by construction, not just in this case.
  assert.ok(!/· declared:/.test(note), 'and it does not say "declared" twice');
  assert.match(note, /\n0 session felts · 2 declared/, 'the catalogue tally moved to the note, which has words for it');

  // One row edited and one row minted this session: two rows in the diff, two
  // in the count — the same arithmetic the file section does.
  tune.extraDiff = [
    { path: 'felts.house-moss.name', shipped: 'Moss', live: 'Bog', cls: 'look', read: 'apply', declared: true },
    { path: 'felts.house-ash.name', shipped: undefined, live: 'Ash', cls: 'look', read: 'apply', declared: false },
    { path: 'felts.house-ash.cloth', shipped: undefined, live: 'oak', cls: 'look', read: 'apply', declared: false },
  ];
  panel.repaint();
  assert.equal(count.textContent, '· 2 changed', 'two rows, not three leaves and not two house rows');
  assert.equal(sec.classList.contains('is-changed'), true);
  panel.unmount();
});

// …AND THE SECTION HAS TO NAME WHAT IT COUNTED (the E1 review, 2026-09-03).
// The count above is per ROW; the dot is per FIELD, as it is on every dial row
// in the panel. While the eleven lived in js/main.js the section could get
// away with a whole-row flag — a declared row was read-only, so the only rows
// with fields that could move were the ones this session minted, and every
// field of those moves at once. E1 made the eleven editable, and then the
// header read "· 1 changed" over six rows all saying nothing had, with no ↺ to
// put the moved one back (the glyph is gated on the dot). The sets editor next
// door has named the exact field since D2; this is the felts side of it.
t('felts: the dot and the ↺ are the FIELD\'s — a declared row marks the one that moved', () => {
  const felts = fakeFelts([
    { id: 'obsidian', name: 'Obsidian', feltBase: '#1c1c24', breath: 1.5, inFile: true, removable: false, current: true },
    { id: 'house-ash', name: 'Ash', inFile: false, removable: true },
  ]);
  const { root, tune, panel } = fresh({ felts });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'felts');
  const count = byClass(sec, 'dev-sec-count');
  const marked = (key) => rowFor(root, `felts.${key}`).classList.contains('is-changed');
  const glyph = (key) => byClass(rowFor(root, `felts.${key}`), 'dev-revert');
  const KEYS = ['name', 'cloth', 'feltBase', 'breath'];

  // The form followed the felt on the table, and nothing has moved.
  assert.equal(byClass(sec, 'dev-feltpick').value, 'obsidian');
  assert.deepEqual(KEYS.map(marked), [false, false, false, false]);

  // One field of the DECLARED row moves.
  tune.extraDiff = [
    { path: 'felts.obsidian.breath', shipped: 1.5, live: 1.2, cls: 'look', read: 'apply', declared: true },
  ];
  panel.repaint();
  assert.equal(count.textContent, '· 1 changed', 'one row in this section moved');
  assert.deepEqual(KEYS.map(marked), [false, false, false, true],
    '…and the section says WHICH of its fields did');
  assert.equal(glyph('breath').hidden, false, 'the moved field offers its own ↺');
  assert.equal(glyph('name').hidden, true, 'a field nobody touched has nothing to put back');

  // THE ↺ NAMES THE PICKED ROW, not a fixed path: a field row here is
  // re-pointed at whichever mat the picker holds, so the binding is to the
  // field and the row is asked for at the click (js/devmode.js revertField).
  const wrote = [];
  const realSet = tune.set;
  tune.set = (patch, opts) => { wrote.push(patch); return realSet.call(tune, patch, opts); };
  click(glyph('breath'));
  assert.deepEqual(wrote, [{ 'felts.obsidian.breath': 1.5 }],
    'the file\'s own value, at the path the picker names');
  tune.set = realSet;

  // A row the file does not have yet is changed WHOLE — every field of it is
  // something Save would write down, diff leaf or no diff leaf.
  tune.extraDiff = [
    { path: 'felts.house-ash.name', shipped: undefined, live: 'Ash', cls: 'look', read: 'apply', declared: false },
  ];
  const picker = byClass(sec, 'dev-feltpick');
  picker.value = 'house-ash';
  fire(picker, 'change');
  assert.equal(picker.value, 'house-ash', 'the picker holds the session row');
  assert.deepEqual(KEYS.map(marked), [true, true, true, true],
    'a session row: Save adds all of them, so all of them are changed');
  panel.unmount();
});

// ---------------------------------------------------------------------------
// the sets section (phase D2) — and the gate the D2 review found missing.
// ---------------------------------------------------------------------------

// A recipe SLICE, to the contract's shape and not imported (js/tune.js
// ASSET_ROWS.houses.dice.rows is the real one, ninety fields deep). Three
// fields is enough: the section's form is proved in `dev-set-roundtrip`, and
// what is proved here is the verb row underneath it.
const SET_FIELDS = {
  label: look('label', 'Set', null, 'apply'),
  body: look('body', '#f2efe6', null, 'apply'),
  geo: { bevel: look('bevel', 0.09, [0, 0.3, 0.005], 'apply') },
};

function fakeSets(rows) {
  const cat = rows.map((r) => ({
    house: 'std', set: 'classic', label: 'Classic', houseLabel: 'Standard',
    inFile: true, removable: false, current: false, ...r,
  })).map((r) => ({ ...r, id: r.id || `${r.house}.${r.set}` }));
  const log = [];
  const at = (id) => cat.find((s) => s.id === id) || null;
  return {
    log,
    cat,
    fields: () => SET_FIELDS,
    list: () => cat.map((s) => ({ ...s })),
    recipe: (id) => (at(id) ? { label: at(id).label, body: '#f2efe6' } : null),
    clone: (id) => { log.push(`clone(${id})`); return { id: `${id}-2`, refused: [], sets: cat }; },
    set: (id, patch) => { log.push(`set(${id})`); return { id, refused: [], sets: cat }; },
    remove: (id) => { log.push(`remove(${id})`); return { id, refused: [], sets: cat }; },
    bench: (id) => { log.push(`bench(${id})`); return { notation: 'x', seed: 'ivy', refused: [] }; },
    // js/main.js devSetApply, to the letter: a row dice.yaml does not declare
    // is refused BY NAME and the viewer keeps the set they had, because the
    // server resolves a rolled set out of the file.
    apply: (id) => {
      const row = at(id);
      if (!row.inFile) {
        log.push(`apply-refused(${id})`);
        return { set: (cat.find((s) => s.current) || {}).id || 'std', refused: [[`houses.${row.house}.dice.${row.set}`, 'unsaved']], sets: cat };
      }
      for (const s of cat) s.current = s.id === id;
      log.push(`apply(${id})`);
      return { set: id, refused: [], sets: cat };
    },
  };
}

// THE ONE THING THAT CAN BREAK THE ROLL BUTTON (the D2 review, 2026-09-03).
// A cloned set draws perfectly on the felt and is unknown to the SERVER, which
// resolves a rolled set out of dice.yaml — so wearing one 400s every roll
// (`unknown_set`) with a page banner and an empty console as the only
// evidence. The verb refuses it; this is the half that keeps a click from
// being how you find out, and the half that un-greys when a Save lands.
t('sets: Use at table is held until the FILE declares the row, and says so', () => {
  const sets = fakeSets([
    { house: 'classics', set: 'ivory', label: 'Ivory', houseLabel: 'Classics', current: true },
    { house: 'house', set: 'ivory-2', label: 'Ivory (house)', houseLabel: 'House', inFile: false, removable: true },
  ]);
  const { root, panel } = fresh({ sets });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'sets');
  assert.ok(sec, 'the section is there when a sets api is given');
  const use = byText(sec, 'Use at table');
  const pick = byClass(sec, 'dev-setpick');

  // The form opens on the row the viewer WEARS, which the file declares.
  assert.equal(pick.value, 'classics.ivory');
  assert.equal(use.disabled, true, 'and it is already the current set, so there is nothing to use');

  // …now the row this session cloned.
  pick.value = 'house.ivory-2';
  fire(pick, 'change');
  assert.equal(use.disabled, true, 'a row the file does not declare cannot be worn');
  assert.equal(use.title, 'Save the row first — the server only accepts a set dice.yaml declares',
    'and the button carries the reason rather than making somebody click for it');
  assert.match(byClass(sec, 'dev-clockout').textContent, /Save writes the row, and Use at table waits for it/);
  click(use);
  assert.deepEqual(sets.log, [], 'a disabled button asks the api nothing');

  // SAVE LANDED. js/main.js's `inFile` moves the moment the armed route
  // answers ok — the server re-read the file it just wrote — so the button
  // un-greys on the next repaint, with no reload.
  sets.cat.find((s) => s.id === 'house.ivory-2').inFile = true;
  panel.repaint();
  assert.equal(use.disabled, false, 'the file declares it now');
  assert.match(byClass(sec, 'dev-clockout').textContent, /house\.ivory-2 · declared in dice\.yaml/);
  click(use);
  assert.deepEqual(sets.log, ['apply(house.ivory-2)']);
  assert.match(byClass(root, 'dev-statusslot').textContent, /you are rolling in house\.ivory-2/);
  panel.unmount();
});

// A REFUSAL MAY NOT BE FOLLOWED BY A CLAIM OF SUCCESS. `report` answers true
// for any object — that is how a partly-refused write still repaints — so the
// verb has to look at `refused` before it says "you are rolling in it".
t('sets: a refused Use at table prints the reason and no claim', () => {
  const sets = fakeSets([
    { house: 'house', set: 'ivory-2', label: 'Ivory (house)', houseLabel: 'House', inFile: false, removable: true },
  ]);
  const { root, panel } = fresh({ sets });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'sets');
  // Reach past the disabled button the way the console does — the verb is the
  // authority, and the panel is not what makes the refusal true.
  const r = sets.apply('house.ivory-2');
  assert.deepEqual(r.refused, [['houses.house.dice.ivory-2', 'unsaved']]);
  byText(sec, 'Use at table').disabled = false;
  click(byText(sec, 'Use at table'));
  const status = byClass(root, 'dev-statusslot').textContent;
  assert.match(status, /houses\.house\.dice\.ivory-2: Save the row first/);
  assert.doesNotMatch(status, /you are rolling in/);
  panel.unmount();
});

// THE PREVIEW READS BOTH TREES, because Apply does. `tune.set` was widened to
// take a write into a row minted THIS session — that is how the felt editor
// moves a slider — and the preview still asked only SHIPPED, so it said "no
// such dial" about a field it then wrote (the C4 review, 2026-09-03).
t('file: the paste preview judges a session row\'s field the way Apply will', () => {
  const parsed = {
    'felts.house-ash.name': 'Ashen',      // a row this session minted: T has it
    'felts.house-moss.name': 'Bog',       // a row that was REMOVED: SHIPPED has it, T does not
    'felts.house-never.name': 'X',        // no such row anywhere
    'light.lamp.y': 40,
  };
  const { root, tune, panel } = fresh({ verbs: { parsePatch: () => parsed } });
  tune.SHIPPED.felts = { 'house-moss': { ...FELT_ROW_DEF, name: 'Moss' } };
  tune.T.felts = { 'house-ash': { ...FELT_ROW_DEF, name: 'Ash' } };
  const file = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'file');
  byClass(file, 'dev-paste').value = 'anything';
  click(byText(file, 'Preview'));
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    const rowsP = allClass(file, 'dev-preview-row');
    assert.deepEqual(rowsP.map((r) => r.classList.contains('is-refused')), [false, true, true, false]);
    assert.deepEqual(rowsP.slice(1, 3).map((r) => byClass(r, 'dev-preview-reason').textContent),
      ['that row is not there — revert it whole, or Reset all', 'no such dial'],
      'a removed row and a row that never existed are different refusals');
    assert.match(byClass(file, 'dev-preview').textContent, /2 would apply · 2 refused/);
    panel.unmount();
  });
});

// Found by the B2 review (2026-09-02): Shut at moonrise put the table's lamp
// under the venue's sky. The panel's own resets take the same care.
t('a light reset under a venue lands on the venue\'s light, and is refused with one line when that light is unknown', () => {
  const venueLight = { 'light.lamp.y': 22, 'light.lamp.color': '#bcd2ff', 'light.room.hemi': 0.12 };
  const info = { declared: DECLARED, venue: 'moonrise', venueLight };
  const { root, tune, panel } = fresh({ info });
  tune.set(venueLight);                                             // the venue Object.assigns at moonrise
  tune.set({ 'light.lamp.y': 40, 'light.lamp.penumbra': 0.9, 'throw.physics.gravity': -80 });   // then the dials move
  panel.repaint();
  // THE BADGE SAYS WHAT IS HELD, ROW BY ROW (the C1 review, 2026-09-02): a
  // glade holds the lamp, the room and the fog — never the motes — and a row
  // that saves and resets like any other must not wear a badge saying it is
  // somebody else's.
  const badged = (p) => byClass(rowFor(root, p), 'dev-badge-venue').hidden === false;
  assert.equal(badged('light.lamp.y'), true, 'a row the venue holds wears the badge');
  assert.equal(badged('light.room.hemi'), true);
  assert.equal(badged('light.lamp.penumbra'), false,
    'a light row no venue holds does not — not even in the lamp\'s own map (in the real tree: light.motes.*)');
  const light = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'light');
  click(byClass(light, 'dev-sec-reset'));
  assert.equal(tune.T.light.lamp.y, 22, 'the lamp went back to the VENUE\'s height, not the file\'s');
  assert.equal(tune.T.light.lamp.color, '#bcd2ff', 'a held leaf the dials never touched stays');
  assert.equal(tune.T.light.room.hemi, 0.12);
  assert.equal(tune.T.light.lamp.penumbra, 0.3, 'a light leaf the venue does not hold resets to the file');
  assert.equal(tune.T.throw.physics.gravity, -80, 'another section is not a light reset');
  const file = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'file');
  click(byText(file, 'Reset all'));
  assert.equal(tune.T.throw.physics.gravity, -110, 'Reset all takes the rest');
  assert.equal(tune.T.light.lamp.y, 22, 'and still leaves the venue its lamp');
  assert.ok(!tune.calls.some(([p, v]) => p === 'light.lamp.y' && v === 24), 'the file\'s lamp height was never written');
  // the venue leaves: the same rows reset to the file
  info.venue = null; info.venueLight = null;
  click(byText(file, 'Reset all'));
  assert.equal(tune.T.light.lamp.y, 24);
  assert.equal(tune.T.light.lamp.color, '#ffe8c4');
  // a venue with no known light: refused, one line, nothing written
  const two = fresh({ info: { declared: DECLARED, venue: 'foxfire' } });
  two.tune.set({ 'light.lamp.y': 40, 'light.room.hemi': 0.5 });
  two.panel.repaint();
  click(byText(byClass(two.root, 'dev-foot'), 'Reset'));
  assert.equal(two.tune.T.light.lamp.y, 40, 'held');
  assert.equal(two.tune.T.light.room.hemi, 0.5, 'held');
  assert.match(byClass(two.root, 'dev-statusslot').textContent, /light: 2 held by the foxfire venue/);
});

// ---------------------------------------------------------------------------
// the bench (phase 2): clock, seeded throw, A/B
// ---------------------------------------------------------------------------

t('no bench: the panel is exactly the panel phase 1 shipped', () => {
  const { root } = fresh({ cast: fakeCast() });
  const names = byClass(root, 'dev-secbar').buttons.map((b) => b.textContent);
  assert.ok(!names.includes('clock') && !names.includes('ab'), `no clock/ab section: ${names}`);
  assert.equal(byClass(root, 'dev-seed'), null, 'and no seed box');
});

t('the clock section drives freeze, step and scrub, and hides scrub with no film', () => {
  const bench = fakeBench();
  const { root, panel } = fresh({ cast: fakeCast(), bench });
  const names = byClass(root, 'dev-secbar').buttons.map((b) => b.textContent);
  assert.deepEqual(names.slice(-3), ['clock', 'ab', 'file'], `clock and ab land before file: ${names}`);
  const sec = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'clock');
  const step = byText(sec, 'step one frame');
  assert.equal(step.disabled, true, 'a running clock has nothing to step');
  assert.equal(rowFor(sec, 'clock.scrub').hidden, true, 'no film: no scrub');
  click(byClass(rowFor(sec, 'clock.freeze'), 'dev-seg').buttons[1]);
  assert.equal(bench.log.at(-1), 'freeze(frozen)');
  assert.equal(step.disabled, false, 'frozen: the step button wakes');
  click(step);
  assert.equal(bench.log.at(-1), 'step()');

  // a film arrives: the scrub row appears and is re-ranged to ITS keyframes
  Object.assign(bench.state.clock, { live: true, frame: 30, frames: 181, time: 0.5 });
  panel.repaint();
  const scrubRow = rowFor(sec, 'clock.scrub');
  assert.equal(scrubRow.hidden, false, 'a film on the felt: the scrub row shows');
  const slider = byClass(scrubRow, 'dev-range');
  assert.equal(slider.max, '180', 're-ranged to this film\'s last keyframe');
  assert.equal(slider.value, '30', 'and parked at the frame the film is on');
  slider.value = '90';
  fire(slider, 'input');
  assert.equal(bench.log.at(-1), 'scrub(90)');
  assert.match(byClass(sec, 'dev-clockout').textContent, /frame 30 \/ 180/);
});

t('the folded glyph says frozen, and the footer carries the HUD', () => {
  const bench = fakeBench();
  const { panel, tune } = fresh({ cast: fakeCast(), bench });
  panel.setFooter(bench.hud());
  const foot = byClass(panel.root, 'dev-foot');
  assert.match(byClass(foot, 'dev-foot-perf').textContent, /60 fps · 12 calls/);
  assert.match(byClass(foot, 'dev-foot-hud').textContent, /3400 tris · 7 bodies · settle 2.5s/);
  assert.equal(panel.glyph.textContent, 'DEV', 'nothing changed, nothing frozen');
  tune.set({ 'light.lamp.y': 40 });
  panel.repaint();
  assert.equal(panel.glyph.textContent, 'DEV · 1 changed');
  bench.state.clock.state = 'frozen';
  panel.repaint();
  assert.equal(panel.glyph.textContent, 'DEV · 1 changed · frozen', 'a folded frozen table says so');
});

t('the bench rows throw a seed, report it back into the box, and lock with the film', () => {
  const bench = fakeBench();
  const { root, panel } = fresh({ cast: fakeCast(), bench });
  const castSec = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'cast');
  const seed = byClass(castSec, 'dev-seed');
  assert.ok(seed, 'the seed box rides the cast section');
  const throwBtn = byText(castSec, 'Throw 3d6');
  const replayBtn = byText(castSec, 'Replay');
  assert.equal(replayBtn.disabled, true, 'nothing thrown yet: nothing to replay');
  click(throwBtn);
  assert.equal(bench.log.at(-1), 'bench("")', 'a blank box asks for a fresh seed');
  assert.equal(seed.value, '4242', 'and the seed it drew comes back into the box');
  panel.repaint();
  assert.equal(replayBtn.disabled, false);
  assert.match(byClass(castSec, 'dev-clockout').textContent, /last: seed 4242 · 180 frames · settle 3s · bench/);
  seed.value = 'moss';
  key(seed, 'Enter');
  assert.equal(bench.log.at(-1), 'bench("moss")', 'Enter in the box throws');
  click(replayBtn);
  assert.equal(bench.log.at(-1), 'replay()');
  // the film lock is the bench's lock too
  panel.setFilm('locked', 'a second viewer is here');
  assert.equal(throwBtn.disabled, true, 'a seeded throw is refused while the film is shared');
  assert.equal(replayBtn.disabled, true);
  panel.setFilm('live');
  assert.equal(throwBtn.disabled, false);
});

t('A/B holds two patches, says which is live, and flips on x', () => {
  const bench = fakeBench({ film: true });
  const { root, panel } = fresh({ cast: fakeCast(), bench });
  const sec = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'ab');
  const out = byClass(sec, 'dev-about');
  assert.equal(byText(sec, 'A').disabled, true, 'nothing held: nothing to put on');
  assert.equal(byText(sec, 'flip · x').disabled, true);
  assert.match(out.textContent, /hold both slots to flip/);
  click(byText(sec, 'Hold A'));
  assert.equal(bench.log.at(-1), 'hold(a)');
  click(byText(sec, 'Hold B'));
  panel.repaint();
  assert.match(out.textContent, /A 2 changed · B 2 changed · live B/);
  assert.match(out.textContent, /flip replays the last seed/, 'they differ on a film value');
  assert.equal(byText(sec, 'flip · x').disabled, false);

  // the key, from inside the panel
  const ev = key(root, 'x');
  assert.equal(ev.defaultPrevented, true, 'the panel took the key');
  assert.equal(bench.log.at(-1), 'flip()');
  panel.repaint();
  assert.match(out.textContent, /live A/);
  assert.match(out.textContent, /last flip replayed/);

  // …but never out of a field where x is a letter
  const seed = byClass(root, 'dev-seed');
  const n = bench.log.length;
  key(seed, 'x');
  assert.equal(bench.log.length, n, 'typing x in the seed box is typing');

  // look-only slots keep the poses, and the line says so before the flip
  bench.state.ab.film = false;
  bench.state.ab.replayed = false;
  panel.repaint();
  assert.match(out.textContent, /flip keeps the poses \(look values only\)/);
  click(byText(sec, 'A'));
  assert.equal(bench.log.at(-1), 'apply(a)');
});

t('with no cast the bench rows ride the clock section, and a cast does not mint a second set', () => {
  const bench = fakeBench();
  const { root, panel } = fresh({ bench });
  const clockSec = root.find((s) => s.classList.contains('dev-section') && s.dataset.section === 'clock');
  assert.ok(byClass(clockSec, 'dev-seed'), 'the seed box found a home');
  assert.equal(allClass(root, 'dev-seed').length, 1);
  panel.setCast(fakeCast());
  assert.equal(allClass(root, 'dev-seed').length, 1, 'still exactly one seed box');
  panel.setCast(null);
  assert.equal(allClass(root, 'dev-seed').length, 1);
});

t('the panel never reaches for location, storage or the network', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['js/devui.js', 'js/devmode.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const word of ['location', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.clipboard', 'style.cssText', '.style.']) {
      assert.ok(!src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').includes(word), `${f} mentions ${word}`);
    }
  }
});

// ---------------------------------------------------------------------------
// the presets section (phase D4) — the one asset section with no form.
// ---------------------------------------------------------------------------

function fakePresets(rows, waiting = 0) {
  const cat = rows.map((r) => ({ inFile: false, leaves: 1, film: 0, paths: [], ...r }));
  const log = [];
  const at = (name) => cat.find((p) => p.name === name) || null;
  return {
    log,
    cat,
    list: () => cat.map((p) => ({ ...p })),
    pending: () => waiting,
    hold: (name) => {
      if (!name) { log.push('hold(refused)'); return { name, refused: [[`presets.${name}`, 'id']] }; }
      cat.push({ name, inFile: false, leaves: waiting, film: 0, paths: [] });
      log.push(`hold(${name})`);
      return { name, refused: [] };
    },
    apply: (name) => { log.push(`apply(${name})`); return { name, applied: at(name).leaves - 1, refused: [['throw.physics.gravity', 'film']] }; },
    remove: (name) => { cat.splice(cat.indexOf(at(name)), 1); log.push(`remove(${name})`); return { name, refused: [] }; },
  };
}

t('presets: the list, the three verbs, and a Hold with nothing to hold', () => {
  const presets = fakePresets([{ name: 'dusk', inFile: true, leaves: 3, film: 1 }], 2);
  const { root, panel } = fresh({ presets });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'presets');
  assert.ok(sec, 'the section is there when a presets api is given');
  const note = () => byClass(sec, 'dev-clockout').textContent;
  assert.match(note(), /dusk · declared in dice\.yaml · 3 rows, 1 film/);
  assert.match(note(), /Hold would write 2 changed rows down/,
    'the button says what it would capture before you press it');

  // APPLY IS A PASTE: the refused film row is reported by name and the rest
  // still lands, so the button is live at a locked table too.
  click(byText(sec, 'Apply'));
  assert.deepEqual(presets.log, ['apply(dusk)']);
  assert.match(byClass(root, 'dev-status').textContent, /2 rows applied, 1 refused/);

  const name = byClass(sec, 'dev-presetname');
  name.value = 'noon';
  click(byText(sec, 'Hold as preset'));
  assert.deepEqual(presets.log, ['apply(dusk)', 'hold(noon)']);
  assert.equal(name.value, '', 'the field empties, so a second Hold is a deliberate act');
  assert.equal(presets.cat.length, 2);

  click(byText(sec, 'Remove'));
  assert.deepEqual(presets.log.at(-1), 'remove(noon)', 'Remove takes the row the picker names');
  panel.unmount();
});

t('presets: nothing changed means nothing to hold, and no rows means no verbs', () => {
  const presets = fakePresets([], 0);
  const { root, panel } = fresh({ presets });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'presets');
  assert.match(byClass(sec, 'dev-clockout').textContent, /no presets — turn some dials/);
  assert.equal(byText(sec, 'Hold as preset').disabled, true, 'a preset of nothing is not a preset');
  assert.equal(byText(sec, 'Apply').disabled, true);
  assert.equal(byText(sec, 'Remove').disabled, true);
  click(byText(sec, 'Hold as preset'));
  assert.deepEqual(presets.log, [], 'and the disabled button does not reach the verb');
  panel.unmount();
});

// ---------------------------------------------------------------------------
// the recorder and the pop-out (phase D5)
// ---------------------------------------------------------------------------

// The kit's shape is `{ state, start, stop, ops, save }` and the panel asks
// every one of them on the repaint beat — so the fake is a small state machine
// rather than a log, and what is asserted is what the BUTTONS then say.
function recorder() {
  const state = { on: false, ops: [], saved: [] };
  return {
    state,
    api: {
      state: () => (state.on ? 'recording' : 'idle'),
      start: () => { state.on = true; state.ops = []; return { state: 'recording' }; },
      stop: () => { state.on = false; return { state: 'idle' }; },
      ops: () => state.ops,
      save: (filename, text) => { state.saved.push([filename, text]); return filename; },
    },
  };
}

t('the record group: Record arms it, the note counts the ops, Download step emits a step', () => {
  const r = recorder();
  const { root, panel } = fresh({ record: r.api });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'file');
  const btn = byText(sec, 'Record');
  assert.ok(btn, 'the file section carries the recorder');
  const note = byClass(sec, 'dev-about');
  assert.equal(note.textContent, 'not recording');
  const dl = byText(sec, 'Download step');
  assert.equal(dl.disabled, true, 'nothing recorded: nothing to download');

  click(btn);
  assert.equal(r.state.on, true, 'Record armed it');
  assert.equal(byText(sec, 'Stop') !== null, true, 'and the button is now the other verb');
  assert.equal(note.textContent, 'recording — nothing yet');

  r.state.ops = [{ op: 'set', patch: { 'light.lamp.y': 40 } }, { op: 'deal', n: 3 }];
  panel.repaint();
  assert.equal(note.textContent, '2 ops recorded · recording');

  const name = byClass(sec, 'dev-stepname');
  name.value = 'Dusk Look';
  click(byText(sec, 'Download step'));
  assert.equal(r.state.saved.length, 1);
  assert.equal(r.state.saved[0][0], 'dusk-look.mjs', 'the typed name becomes a file stem');
  assert.match(r.state.saved[0][1], /tuneSet\(\{"light\.lamp\.y":40\}\)/);
  assert.match(byClass(root, 'dev-status').textContent, /tools\/steps\/dusk-look\.mjs downloaded/);

  click(byText(sec, 'Stop'));
  assert.equal(r.state.on, false);
  assert.equal(byText(sec, 'Record') !== null, true);
  panel.unmount();
});

t('the recorder is asked, never remembered: devRecord from the console moves the button', () => {
  const r = recorder();
  const { root, panel } = fresh({ record: r.api });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'file');
  r.state.on = true;                       // as `devRecord('start')` from the console would
  panel.repaint();
  assert.ok(byText(sec, 'Stop'), 'the panel reads the state it did not set');
  panel.unmount();
});

t('no record api, no record group — the file section is the one phase 1 shipped', () => {
  const { root, panel } = fresh();
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'file');
  assert.equal(byText(sec, 'Record'), null);
  assert.equal(byClass(sec, 'dev-stepname'), null);
  panel.unmount();
});

t('Pop out is drawn only when a caller hands over the verb', () => {
  const plain = fresh();
  const secA = plain.root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'file');
  assert.equal(byText(secA, 'Pop out'), null, 'js/devmode.js opens no window of its own');
  plain.panel.unmount();

  const opened = [];
  const { root, panel } = fresh({ verbs: { popout: () => { opened.push(1); return { url: '/dev.html' }; } } });
  const sec = root.find((n) => n.classList.contains('dev-section') && n.dataset.section === 'file');
  click(byText(sec, 'Pop out'));
  assert.deepEqual(opened, [1]);
  panel.unmount();
});

// ---- the emitter --------------------------------------------------------
//
// A fixture op list, the four ops the recorder writes down, and the three
// claims that make the output worth downloading: it is VALID JavaScript, it
// carries every op IN ORDER, and every seed it saw is in it.

t('stepName: whatever was typed becomes a file stem', () => {
  assert.equal(stepName('Dusk Look'), 'dusk-look');
  assert.equal(stepName('  ../../etc/passwd  '), 'etc-passwd', 'no separator survives');
  assert.equal(stepName(''), 'recorded-step');
  assert.equal(stepName(null), 'recorded-step');
  assert.equal(stepName('a'.repeat(80)).length, 48, 'and a stem is a name, not an essay');
});

t('emitStep: the ops in order, the seeds kept, and it parses as JavaScript', async () => {
  const ops = [
    { op: 'set', patch: { 'light.lamp.y': 40, 'light.fog.far': 70 } },
    { op: 'deal', n: 3 },
    { op: 'throw', seed: 1089386929, notation: '3d6 # bench' },
    { op: 'sit', k: 2 },
    { op: 'set', patch: { 'throw.physics.gravity': -60 } },
  ];
  const text = emitStep('dusk look', ops);

  assert.ok(text.startsWith('/*\nCopyright 2026 The Dice Table Authors'), 'the Apache header, as every first-party file carries');
  assert.match(text, /import \{ mkdirSync \} from 'node:fs';/);
  assert.match(text, /export default async function run\(stage, \[outDir = 'tools\/shots\/dusk-look'\]\)/);
  assert.match(text, /stage\.ctx\.devTab\(/, 'a step opens a dev tab');

  // IN ORDER — the whole value of a recording. Read as positions in the text,
  // because "contains" says nothing about sequence.
  const at = (re) => text.search(re);
  const marks = [
    /tuneSet\(\{"light\.lamp\.y":40,"light\.fog\.far":70\}\)/,
    /demoDeal\(3\)/,
    /devBench\(1089386929, "3d6 # bench"\)/,
    /demoSit\(2\)/,
    /tuneSet\(\{"throw\.physics\.gravity":-60\}\)/,
  ].map(at);
  assert.ok(marks.every((i) => i > 0), `every op is in the step (${JSON.stringify(marks)})`);
  assert.deepEqual(marks, [...marks].sort((a, b) => a - b), 'and in the order they were recorded');

  // A shot after each act, and a settle wait after the throw — the two things
  // that make the emitted file a step rather than a transcript.
  assert.equal((text.match(/await shot\(/g) || []).length, 5);
  assert.match(text, /await settled\(\);\n  await shot\('throw-3'\);/);

  // AND IT PARSES. A skeleton nobody can run is not a skeleton.
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'devstep-'));
  try {
    const file = join(dir, 'emitted.mjs');
    writeFileSync(file, text);
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--check', file]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t('emitStep: a quote in a value cannot break the step it is written into', async () => {
  const text = emitStep('quoted', [
    { op: 'set', patch: { 'app.title': "it's a table" } },
    { op: 'throw', seed: 7, notation: "2d20kh1 # it's advantage" },
  ]);
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'devstep-'));
  try {
    const file = join(dir, 'quoted.mjs');
    writeFileSync(file, text);
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--check', file]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.match(text, /it's a table/, 'and the value survives whole');
});

t('emitStep: nothing recorded emits a step that says so rather than an empty function', async () => {
  const text = emitStep('empty', []);
  assert.match(text, /Nothing was recorded/);
  assert.match(text, /await shot\('empty'\)/);
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'devstep-'));
  try {
    const file = join(dir, 'empty.mjs');
    writeFileSync(file, text);
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--check', file]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the two ops the D5 review added ------------------------------------
//
// A REEL THAT RECORDED A CLONE MUST EMIT ONE. `tuneSet` refuses a field of a
// row that is not there, so before this the whole of a sets-editing session
// came out as one note and nothing else: the step reproduced none of it and,
// because the note had no branch here, did not say so either.

t('emitStep: a row op replays the clone the recipe edits were edits of', async () => {
  const text = emitStep('sets', [
    { op: 'row', verb: 'add', where: 'houses.house.dice', id: 'ivory-probe', row: { label: 'Ivory (house)', body: '#f2efe6', geo: { bevel: 0.09 } } },
    { op: 'set', patch: { 'houses.house.dice.ivory-probe.body': '#ff0000' } },
    { op: 'set', patch: { 'light.lamp.y': 44 } },
    { op: 'row', verb: 'remove', where: 'felts', id: 'house-moss' },
  ]);
  const at = (re) => text.search(re);
  const marks = [
    /devRowAdd\("houses\.house\.dice", "ivory-probe", \{"label":"Ivory \(house\)","body":"#f2efe6","geo":\{"bevel":0\.09\}\}\)/,
    /tuneSet\(\{"houses\.house\.dice\.ivory-probe\.body":"#ff0000"\}\)/,
    /tuneSet\(\{"light\.lamp\.y":44\}\)/,
    /devRowRemove\("felts", "house-moss"\)/,
  ].map(at);
  assert.ok(marks.every((i) => i > 0), `every op reached the step (${JSON.stringify(marks)})`);
  assert.deepEqual(marks, [...marks].sort((a, b) => a - b), 'in the order they were recorded');
  assert.equal((text.match(/await shot\(/g) || []).length, 4, 'a frame after each act');

  // AND IT PARSES: a recipe goes into the step as JSON inside a JS string, and
  // the quoting has to survive both.
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'devstep-'));
  try {
    const file = join(dir, 'sets.mjs');
    writeFileSync(file, text);
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--check', file]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t('emitStep: the act number and the frame number are the same number', () => {
  const text = emitStep('numbered', [
    { op: 'note', text: 'one field of a row this reel does not build' },
    { op: 'set', patch: { 'light.lamp.y': 44 } },
    { op: 'note', text: 'and another' },
    { op: 'deal', n: 2 },
  ]);
  // The reel positions were 2 and 4; the acts are 1 and 2, and the shots the
  // step takes are 01- and 02-, so a comment names the frame beside it.
  assert.match(text, /\n  \/\/ 1 · light\.lamp\.y\n/);
  assert.match(text, /await shot\('set-1'\);/);
  assert.match(text, /\n  \/\/ 2 · the cast\n/);
  assert.match(text, /await shot\('deal-2'\);/);
  assert.ok(!/set-2|deal-4/.test(text), 'and no act is numbered by its place in the reel');
});

t('emitStep: a note reaches the file, and takes no frame', () => {
  const text = emitStep('noted', [
    { op: 'note', text: '3 fields of a row this reel does not build — Clone it while recording' },
    { op: 'set', patch: { 'light.lamp.y': 44 } },
  ]);
  assert.match(text, /\/\/ note · 3 fields of a row this reel does not build — Clone it while recording/);
  assert.equal((text.match(/await shot\(/g) || []).length, 1, 'one act, one frame: a note is not an act');
});

t('emitStep: a reel of nothing but notes emits them, not the empty skeleton', async () => {
  const text = emitStep('all-notes', [
    { op: 'note', text: '2 fields of a row this reel does not build: felts.house-moss.name, felts.house-moss.breath' },
  ]);
  assert.match(text, /felts\.house-moss\.name/, 'the note is in the file');
  assert.ok(!/Nothing was recorded/.test(text),
    'and it does not claim nothing was recorded — something was, and it says what');
  assert.match(text, /Nothing here could be replayed/);
  assert.match(text, /await shot\('empty'\)/, 'still a step: one frame');
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'devstep-'));
  try {
    const file = join(dir, 'all-notes.mjs');
    writeFileSync(file, text);
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--check', file]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// the async tests settle before the summary
await Promise.all(pendingTests);
if (!process.exitCode) console.log(`devui: ${n} tests passed`);
