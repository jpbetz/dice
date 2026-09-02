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
const film = (label, def, range, read, why = '') => ({ label, def, range, cls: 'film', read, why });
const pick = (label, def, options, cls, read, why = '') => ({ label, def, range: null, options, cls, read, why });

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
    diff: () => leaves(SHIPPED).map((path) => ({ path: path.join('.'), shipped: getLeaf(SHIPPED, path), live: getLeaf(T, path) }))
      .filter((d) => d.shipped !== d.live)
      .map((d) => { const dl = tune.dialAt(d.path); return { ...d, cls: dl ? dl.cls : 'look', read: dl ? dl.read : 'apply', declared: hasLeaf(declared, d.path) }; }),
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
  let rows = [], seat = null;
  const log = [];
  return {
    log,
    players: () => rows.length,
    seat: () => (seat === null ? null : { place: seat, name: rows[seat] }),
    deal: (n) => { rows = ['Ada', 'Bo', 'Cy', 'Dee', 'Eve', 'Fen', 'Gus', 'Hal'].slice(0, n); seat = rows.length ? 0 : null; log.push(`deal(${n})`); },
    sit: (k) => { seat = k; log.push(`sit(${k})`); },
    reshuffle: () => log.push('reshuffle()'),
    regions: (s) => log.push(`regions(${s})`),
    roll: (k) => log.push(`roll(${k})`),
    rollAll: () => log.push('rollAll()'),
  };
}

// ---------------------------------------------------------------------------
// the runner
// ---------------------------------------------------------------------------

const ui = await import('../js/devui.js');
const { mount } = await import('../js/devmode.js');

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

t('a narrow window starts folded AND says so through onFold', () => {
  const folds = [];
  const was = window.matchMedia;
  window.matchMedia = (q) => ({ matches: q === '(max-width: 639px)' });
  try {
    const { panel } = fresh({ onFold: (on) => folds.push(on) });
    assert.equal(panel.isFolded(), true);
    assert.deepEqual(folds, [true], 'the caller and isFolded() agree from the first frame');
  } finally { window.matchMedia = was; }
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
  click(byClass(rowFor(sec, 'cast.regions'), 'dev-seg').buttons[0]);
  assert.equal(cast.log.at(-1), 'regions(on)');
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

t('the panel never reaches for location, storage or the network', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['js/devui.js', 'js/devmode.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const word of ['location', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.clipboard', 'style.cssText', '.style.']) {
      assert.ok(!src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').includes(word), `${f} mentions ${word}`);
    }
  }
});

// the async tests settle before the summary
await Promise.all(pendingTests);
if (!process.exitCode) console.log(`devui: ${n} tests passed`);
