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

// DEVELOPER MODE — the component kit (docs/DEVMODE.md §7; the build contract
// pins every signature here). DOM only: no three, no cannon, no main.js, no
// network, no `location`, no storage. `js/devmode.js` assembles these into
// the panel; nothing else imports this file.
//
// THREE RULES THE KIT KEEPS, so the panel never has to:
//   · every control works from the keyboard — a segmented control is a real
//     radiogroup with roving tabindex and arrow keys, a slider is a native
//     range, a stepper's buttons are buttons, and the typeable number beside
//     a slider commits on Enter as well as on blur;
//   · no inline styles — every look is a class in css/dev.css, on the app's
//     own tokens, so the panel measures like the settings column it sits
//     beside rather than like the unthemed register it replaces;
//   · a row is DUMB. It renders a value and reports a commit; the truth is
//     tune.T and the panel repaints rows from it, so a console write and a
//     slider write converge without either wrapping the other.
//
// The row's typeable number takes ANY finite value on purpose: ranges are
// the slider's, not the law's, and "the range was wrong" is a thing
// developer mode exists to discover (DEVMODE §5).

let idSeq = 0;
const nextId = (prefix) => `${prefix}-${++idSeq}`;

// Shortest string that round-trips a number: 0.30000000000000004 → 0.3.
export function fmtNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  return String(Number(v.toPrecision(12)));
}

const fmtValue = (v) => (typeof v === 'number' ? fmtNum(v) : v == null ? '' : String(v));

// ---------------------------------------------------------------------------
// el — the one element factory
// ---------------------------------------------------------------------------
//
// attrs: `class` (string), `dataset` (object), `text` (textContent), `on*`
// (an addEventListener per handler — `onClick`, `onKeydown`, …), the DOM
// PROPERTIES that do not round-trip as attributes (`value`, `disabled`,
// `checked`, `hidden`, `tabIndex`), and everything else as an attribute.
// Children: strings become text nodes, nulls are skipped, nodes append.
const PROP_ATTRS = new Set(['value', 'disabled', 'checked', 'hidden', 'tabIndex', 'textContent']);

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROP_ATTRS.has(k)) node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// ---------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------

export function button(label, onClick, { kind = 'plain', title } = {}) {
  return el('button', {
    type: 'button',
    class: `dev-btn dev-btn-${kind}`,
    title,
    text: label,
    onClick: (e) => { if (onClick) onClick(e); },
  });
}

// ---------------------------------------------------------------------------
// segmented — an exclusive choice; role=radiogroup, arrow keys, roving tab
// ---------------------------------------------------------------------------
//
// U22's rule from css/style.css: exclusive cells wear role="radio" +
// aria-checked, so `.seg` paints the chosen cell. One cell is tabbable at a
// time; Left/Up and Right/Down move the choice AND the focus; Home/End jump.
export function segmented(options, value, onChange, { name } = {}) {
  const opts = options.map(String);
  const root = el('div', { class: 'seg dev-seg', role: 'radiogroup', 'aria-label': name });
  let current = opts.includes(String(value)) ? String(value) : opts[0];
  const btns = opts.map((o) => el('button', {
    type: 'button', role: 'radio', 'aria-checked': o === current ? 'true' : 'false',
    tabIndex: o === current ? 0 : -1, text: o, dataset: { value: o },
  }));
  const paint = () => {
    for (const b of btns) {
      const on = b.dataset.value === current;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (v, notify) => {
    if (v === current) return;
    current = v;
    paint();
    if (notify && onChange) onChange(v);
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => { if (!b.disabled) choose(opts[i], true); });
    b.addEventListener('keydown', (e) => {
      const n = opts.length;
      let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j === null || b.disabled) return;
      e.preventDefault();
      choose(opts[j], true);
      btns[j].focus();
    });
    root.append(b);
  });
  root.getValue = () => current;
  root.setValue = (v) => { if (opts.includes(String(v))) choose(String(v), false); };
  root.setDisabled = (on) => { for (const b of btns) b.disabled = !!on; root.classList.toggle('is-disabled', !!on); };
  root.buttons = btns;
  return root;
}

// ---------------------------------------------------------------------------
// section, subhead
// ---------------------------------------------------------------------------

export function section(title, { count = 0, onReset = null, open = true } = {}) {
  const bodyId = nextId('dev-sec');
  const countEl = el('span', { class: 'dev-sec-count' });
  const toggle = el('button', {
    type: 'button', class: 'dev-sec-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': bodyId,
  }, [el('span', { class: 'dev-sec-title', text: title }), countEl]);
  const body = el('div', { class: 'dev-sec-body', id: bodyId, hidden: !open });
  const head = el('div', { class: 'dev-sec-head' }, [toggle]);
  let reset = null;
  if (onReset) {
    reset = button('↺', () => onReset(), { title: `reset ${title} to shipped` });
    reset.classList.add('dev-sec-reset');
    head.append(reset);
  }
  const root = el('section', { class: 'dev-section', dataset: { section: title } }, [head, body]);
  toggle.addEventListener('click', () => {
    const now = body.hidden;
    body.hidden = !now;
    toggle.setAttribute('aria-expanded', now ? 'true' : 'false');
    root.classList.toggle('is-open', now);
  });
  root.classList.toggle('is-open', !!open);
  const setCount = (n) => {
    countEl.textContent = n > 0 ? `· ${n} changed` : '';
    root.classList.toggle('is-changed', n > 0);
    if (reset) reset.disabled = !(n > 0);
  };
  setCount(count);
  return { root, body, setCount };
}

export function subhead(title) {
  return el('div', { class: 'dev-subhead', text: title });
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------
//
// One frame for every row: label (left, truncates) · control (middle) ·
// value (right, tabular) · a revert glyph that appears on hover while the
// row is changed. State marks live on the label so the eye reads them in
// the same column every time:
//   changed   → a dot before the name (CSS ::before on .is-changed)
//   isDefault → a faint "default" — the file omits this leaf
//   locked    → ▲ with the lock reason as tooltip; the control is disabled
//   reload    → ⟳ after the name — read once at boot; Save & reload applies
//   venue     → a `venue` badge — a venue is holding this section
function makeRow({ label, why, kind, controls, ctl, val, focusable, revertable = true }) {
  const id = nextId('dev-row');
  const name = el('span', { class: 'dev-row-name', text: label });
  const reload = el('span', { class: 'dev-mark dev-mark-reload', text: '⟳', title: 'read once at boot — Save & reload applies it', hidden: true });
  const lock = el('span', { class: 'dev-mark dev-mark-lock', text: '▲', hidden: true });
  const venue = el('span', { class: 'dev-badge dev-badge-venue', text: 'venue', hidden: true });
  const dflt = el('span', { class: 'dev-mark dev-mark-default', text: 'default', hidden: true });
  const lab = el('label', { class: 'dev-row-label', for: focusable ? id : undefined, title: why || undefined },
    [name, reload, lock, venue, dflt]);
  if (focusable) focusable.id = id;
  const revert = button('↺', null, { title: 'revert to shipped' });
  revert.classList.add('dev-revert');
  revert.hidden = true;
  const ctlBox = el('div', { class: 'dev-row-ctl' }, ctl);
  const valBox = el('div', { class: 'dev-row-val' }, val);
  const root = el('div', { class: `dev-row is-${kind}` }, [lab, ctlBox, valBox, revert]);
  let onRevert = null;
  revert.addEventListener('click', () => { if (onRevert) onRevert(); });
  const row = {
    root,
    label,
    setValue: null, // filled by the caller
    setState({ changed, isDefault, locked, reload: rl, venue: vn, onRevert: rv } = {}) {
      if (changed !== undefined) { root.classList.toggle('is-changed', !!changed); revert.hidden = !changed || !revertable; }
      if (isDefault !== undefined) { root.classList.toggle('is-default', !!isDefault); dflt.hidden = !isDefault; }
      if (locked !== undefined) {
        root.classList.toggle('is-locked', !!locked);
        lock.hidden = !locked;
        for (const c of controls) {
          if (typeof c.setDisabled === 'function') c.setDisabled(!!locked);
          else c.disabled = !!locked;
        }
      }
      if (rl !== undefined) { root.classList.toggle('is-reload', !!rl); reload.hidden = !rl; }
      if (vn !== undefined) { root.classList.toggle('is-venue', !!vn); venue.hidden = !vn; }
      if (rv !== undefined) onRevert = rv;
    },
    setLockReason(text) {
      lock.title = text || '';
      for (const c of controls) if (!(typeof c.setDisabled === 'function')) c.title = text || '';
    },
  };
  return row;
}

// The typeable number beside a control. Commits on change and on Enter; a
// non-finite entry is put back to the last good value rather than sent.
function numberInput(value, { step = 'any', onCommit, cls = 'dev-num' }) {
  const num = el('input', { type: 'number', class: cls, step, value: fmtNum(value), inputmode: 'decimal' });
  let last = value;
  const commit = () => {
    const v = Number(num.value);
    if (num.value === '' || !Number.isFinite(v)) { num.value = fmtNum(last); return; }
    last = v;
    if (onCommit) onCommit(v);
  };
  num.addEventListener('change', commit);
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  const show = deferring(num, (v) => { num.value = fmtNum(v); });
  num.set = (v) => { last = v; show(v); };
  return num;
}

// A repaint must not clobber what somebody is typing — but the value it
// carried is not dropped either: it waits, and the field shows it on blur.
// `change` fires before `blur`, so a value the person commits on the way
// out is written first and comes back through the same door; the field
// ends on the truth either way (DEVMODE §7: console and slider converge).
const activeIsNot = (node) => (typeof document === 'undefined' || document.activeElement !== node);
function deferring(input, paint) {
  let deferred;
  input.addEventListener('blur', () => {
    if (deferred === undefined) return;
    const v = deferred;
    deferred = undefined;
    paint(v);
  });
  return (v) => {
    if (activeIsNot(input)) { deferred = undefined; paint(v); } else deferred = v;
  };
}

export function rowRange({ label, value, range, onInput, onCommit, why }) {
  const [min, max, step] = Array.isArray(range) && range.length >= 2 ? range : [0, 1, 0.01];
  const slider = el('input', { type: 'range', class: 'dev-range', min, max, step: step ?? 'any', value, 'aria-label': label });
  const num = numberInput(value, {
    onCommit: (v) => { slider.value = String(v); if (onCommit) onCommit(v); },
  });
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    num.set(v);
    if (onInput) onInput(v);
  });
  slider.addEventListener('change', () => { if (onCommit) onCommit(Number(slider.value)); });
  const row = makeRow({ label, why, kind: 'range', controls: [slider, num], ctl: [slider], val: [num], focusable: slider });
  row.setValue = (v) => { slider.value = String(v); num.set(v); };
  return row;
}

export function rowStepper({ label, value, range, onCommit, why }) {
  const step = (Array.isArray(range) && Number.isFinite(range[2]) && range[2] > 0) ? range[2] : 1;
  const [min, max] = Array.isArray(range) ? [range[0], range[1]] : [-Infinity, Infinity];
  let current = value;
  const num = numberInput(value, {
    step,
    onCommit: (v) => { current = v; if (onCommit) onCommit(v); },
  });
  const nudge = (d) => {
    // Round to the step's own precision so 0.1 + 0.2 stays 0.3.
    const digits = Math.max(0, Math.min(10, -Math.floor(Math.log10(step))));
    let v = Number((current + d * step).toFixed(digits));
    if (Number.isFinite(min) && v < min) v = min;
    if (Number.isFinite(max) && v > max) v = max;
    if (v === current) return;
    current = v;
    num.set(v);
    if (onCommit) onCommit(v);
  };
  const minus = button('−', () => nudge(-1), { title: `${label} − ${fmtNum(step)}` });
  const plus = button('+', () => nudge(+1), { title: `${label} + ${fmtNum(step)}` });
  minus.classList.add('dev-step');
  plus.classList.add('dev-step');
  const box = el('div', { class: 'stepper dev-stepper' }, [minus, num, plus]);
  const row = makeRow({ label, why, kind: 'stepper', controls: [minus, num, plus], ctl: [box], val: [], focusable: num });
  row.setValue = (v) => { current = v; num.set(v); };
  return row;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function rowColor({ label, value, onCommit, why }) {
  const norm = (v) => (HEX.test(String(v)) ? String(v).toLowerCase() : '#000000');
  let last = norm(value);
  const picker = el('input', { type: 'color', class: 'dev-color', value: last, 'aria-label': label });
  const hex = el('input', { type: 'text', class: 'dev-num dev-hex', value: last, maxlength: 7, spellcheck: 'false', 'aria-label': `${label} hex` });
  const commit = (v) => {
    const s = String(v).trim().toLowerCase();
    if (!HEX.test(s)) { hex.value = last; return; }
    last = s;
    picker.value = s;
    hex.value = s;
    if (onCommit) onCommit(s);
  };
  picker.addEventListener('input', () => { hex.value = picker.value; });
  picker.addEventListener('change', () => commit(picker.value));
  hex.addEventListener('change', () => commit(hex.value));
  hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(hex.value); } });
  const row = makeRow({ label, why, kind: 'color', controls: [picker, hex], ctl: [picker], val: [hex], focusable: picker });
  const showHex = deferring(hex, (v) => { hex.value = v; });
  row.setValue = (v) => {
    last = norm(v);
    picker.value = last;
    showHex(last);
  };
  return row;
}

export function rowEnum({ label, value, options, onCommit, why }) {
  const seg = segmented(options, value, (v) => { if (onCommit) onCommit(v); }, { name: label });
  const row = makeRow({ label, why, kind: 'enum', controls: [seg], ctl: [seg], val: [], focusable: null });
  row.setValue = (v) => seg.setValue(v);
  return row;
}

export function rowText({ label, value, onCommit, why }) {
  const numeric = typeof value === 'number';
  const input = el('input', { type: 'text', class: `dev-num dev-text${numeric ? '' : ' is-string'}`, value: fmtValue(value), spellcheck: 'false' });
  let last = value;
  const commit = () => {
    let v = input.value;
    if (numeric) {
      const n = Number(v);
      if (v.trim() === '' || !Number.isFinite(n)) { input.value = fmtValue(last); return; }
      v = n;
    }
    if (v === last) return;
    last = v;
    if (onCommit) onCommit(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  const row = makeRow({ label, why, kind: 'text', controls: [input], ctl: [], val: [input], focusable: input });
  const show = deferring(input, (v) => { input.value = fmtValue(v); });
  row.setValue = (v) => { last = v; show(v); };
  return row;
}

// A value the panel shows but never writes (app.mode — DEVMODE §4: not a
// dial). No control, no revert glyph, no commit; the marks still apply.
export function rowStatic({ label, value, why }) {
  const out = el('output', { class: 'dev-static', text: fmtValue(value), title: why || undefined });
  const row = makeRow({ label, why, kind: 'static', controls: [], ctl: [], val: [out], focusable: null, revertable: false });
  row.setValue = (v) => { out.textContent = fmtValue(v); };
  return row;
}

// ---------------------------------------------------------------------------
// find, diffList, status, stopKeys
// ---------------------------------------------------------------------------

export function find(onFilter, { placeholder = 'find a dial' } = {}) {
  const input = el('input', {
    type: 'search', class: 'tin dev-find', placeholder, 'aria-label': placeholder, spellcheck: 'false', autocomplete: 'off',
  });
  input.addEventListener('input', () => { if (onFilter) onFilter(input.value); });
  return input;
}

// rows: [{ path, shipped, live, cls }] — the File section's list. Each line
// reads `path · shipped → live · class` with a revert at the end.
export function diffList(rows, { onRevert } = {}) {
  const list = el('ul', { class: 'dev-diff' });
  if (!rows || !rows.length) {
    list.append(el('li', { class: 'dev-diff-empty', text: 'nothing changed' }));
    return list;
  }
  for (const r of rows) {
    const path = typeof r.path === 'string' ? r.path : r.path.join('.');
    const rv = button('↺', () => { if (onRevert) onRevert(path); }, { title: `revert ${path}` });
    rv.classList.add('dev-revert', 'is-inline');
    list.append(el('li', { class: `dev-diff-row is-${r.cls || 'look'}`, dataset: { path } }, [
      el('span', { class: 'dev-diff-path', text: path }),
      el('span', { class: 'dev-diff-vals' }, [
        el('span', { class: 'dev-diff-shipped', text: fmtValue(r.shipped) }),
        el('span', { class: 'dev-diff-arrow', text: '→' }),
        el('span', { class: 'dev-diff-live', text: fmtValue(r.live) }),
      ]),
      el('span', { class: 'dev-diff-cls', text: r.cls || '' }),
      rv,
    ]));
  }
  return list;
}

export function status(text, { kind = 'info' } = {}) {
  return el('div', { class: `dev-status dev-status-${kind}`, role: 'status', text });
}

// The panel's keys are the panel's. Today's demo register leaks `c` from a
// focused button and clears the table (DEVMODE §7); this stops every key
// event at the panel's edge. Esc is NOT swallowed here — the caller handles
// it with its own listener on the same root; stopPropagation stops the walk
// to the document, not the other listeners on this node, so the order the
// two are registered in does not matter.
export function stopKeys(root) {
  for (const type of ['keydown', 'keyup', 'keypress']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }
}
