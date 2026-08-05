/*
 * Copyright 2026 The Dice Table Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// js/portable.js — pools & just-you settings as portable YAML (Tier 4 §5).
//
// A HAND-ROLLED emitter and a STRICT YAML-subset parser (the zero-dep rule:
// no npm YAML library). The subset is exactly the shape exportYaml emits —
// two top-level maps, shelves as keys, pools as a list of one-pair maps,
// scalars single-quoted — and the parser FAILS CLOSED: anything outside the
// subset is an error naming its line, never a guess.
//
// Since 2026-08-04 this is the ONLY way a rack travels between browsers: the
// address-bar codec that used to carry it (`#g=`) is retired, because a
// shared link overwrote the receiver's own rack sight-unseen. Every import
// here is previewed and merged by name, deleting nothing.
//
// Why quoting is mandatory on export: dice notation carries '#' (YAML's
// comment marker — '3d6 # Hunt' would silently lose its title) and names
// may carry ': ' (the key split), so every emitted name and notation is
// single-quoted, with '' escaping a literal quote. The parser also accepts
// bare scalars for hand-written lines, split on the FIRST ': '.
//
// The shelf labeled exactly 'Pools' is the plain (uncategorized) shelf —
// category is present-or-absent, exactly as it is in storage.
//
// A pool's dice-set override (§9) rides as a quoted suffix after the
// notation: "- 'Ember': '3d6' @ 'emberforge.blackanvil'". Present-or-
// absent like category; unknown ids fall closed to no override (the pool
// survives — main's migrateGroup is the door they die at). The '@' form
// only follows a QUOTED notation, so a bare hand-written
// '3d6 # struck @ dawn' can never be misread.

import { parseNotation, cutText } from './notation.js';
import { SETS } from './themes.js'; // import-free data — still runs under Node

const TRIO = ['attributes', 'skills', 'motivations'];
const TRIO_LABELS = { attributes: 'Attributes', skills: 'Skills', motivations: 'Motivations' };
const PLAIN_LABEL = 'Pools';
const MAX_POOLS = 40;
const MAX_NAME = 24;

const BARE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

function quote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
function shelfKey(label) {
  return BARE_KEY_RE.test(label) && !label.endsWith(' ') ? label : quote(label);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

// groups: [{name, notation, category?, set?}] · settings: {sound?, numbers?}
export function exportYaml({ groups = [], settings = {} } = {}) {
  const shelves = [];
  const byKey = new Map();
  for (const g of groups) {
    const label = (g.category || '').trim() || PLAIN_LABEL;
    const k = label.toLowerCase();
    if (!byKey.has(k)) {
      byKey.set(k, { key: k, label: TRIO_LABELS[k] || label, pools: [] });
      shelves.push(byKey.get(k));
    }
    byKey.get(k).pools.push({ name: g.name || '', notation: g.notation, set: g.set || null });
  }
  // trio order first, customs alphabetically, the plain shelf last — the
  // rack's own reading order
  shelves.sort((a, b) => {
    const rank = (s) => (s.key === PLAIN_LABEL.toLowerCase() ? 2 : TRIO.includes(s.key) ? 0 : 1);
    return rank(a) - rank(b)
      || (rank(a) === 0 ? TRIO.indexOf(a.key) - TRIO.indexOf(b.key) : a.label.localeCompare(b.label));
  });

  const lines = [
    '# Dice Table — pools & just-you settings',
    '# paste back via Settings → Your data (import previews; Apply is explicit)',
    'pools:',
  ];
  for (const s of shelves) {
    lines.push(`  ${shelfKey(s.label)}:`);
    for (const p of s.pools) lines.push(`    - ${quote(p.name)}: ${quote(p.notation)}${p.set ? ` @ ${quote(p.set)}` : ''}`);
  }
  if (!shelves.length) lines.push(`  ${PLAIN_LABEL}:`);
  lines.push('settings:');
  lines.push(`  sound: ${settings.sound === false ? 'false' : 'true'}`);
  lines.push(`  numbers: ${settings.numbers === true ? 'true' : 'false'}`);
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Parse (strict subset, fail closed)
// ---------------------------------------------------------------------------

// Read one scalar at the head of `s`: quoted ('' escapes ') or bare (runs to
// `stop` when given, else to the end). Returns {value, rest} or null.
function readScalar(s, stop) {
  if (s.startsWith("'")) {
    let out = '';
    let i = 1;
    for (;;) {
      const q = s.indexOf("'", i);
      if (q < 0) return null; // unterminated
      if (s[q + 1] === "'") { out += s.slice(i, q) + "'"; i = q + 2; continue; }
      out += s.slice(i, q);
      return { value: out, rest: s.slice(q + 1) };
    }
  }
  if (stop !== undefined) {
    const at = s.indexOf(stop);
    if (at < 0) return null;
    return { value: s.slice(0, at).trim(), rest: s.slice(at) };
  }
  return { value: s.trim(), rest: '' };
}

const fail = (line, error) => ({ ok: false, line, error });

// → { ok:true, shelves:[{label, plain, pools:[{name, notation, set?}]}],
//     settings:{sound, numbers} (each present only when the text set it) }
// or { ok:false, line, error }.
export function parsePortable(text) {
  if (typeof text !== 'string' || !text.trim()) return fail(0, 'nothing to import');
  const shelves = [];
  const byKey = new Map();
  const settings = {};
  let section = null; // 'pools' | 'settings'
  let shelf = null;
  let poolCount = 0;
  const rows = text.split(/\r\n?|\n/);

  for (let n = 0; n < rows.length; n++) {
    const raw = rows[n];
    const lineNo = n + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) continue; // blank / comment line
    if (raw.includes('\t')) return fail(lineNo, 'tabs are not allowed — use spaces');

    if (!raw.startsWith(' ')) {
      // top level: exactly the two known sections
      if (raw === 'pools:') { section = 'pools'; shelf = null; continue; }
      if (raw === 'settings:') { section = 'settings'; continue; }
      return fail(lineNo, `unknown top-level line ${JSON.stringify(raw.slice(0, 30))} — expected "pools:" or "settings:"`);
    }

    if (section === 'settings') {
      const m = /^ {2}(sound|numbers): (true|false)$/.exec(raw);
      if (!m) return fail(lineNo, 'settings lines are "  sound: true|false" or "  numbers: true|false"');
      settings[m[1]] = m[2] === 'true';
      continue;
    }

    if (section !== 'pools') return fail(lineNo, 'indented line before any section');

    if (/^ {2}\S/.test(raw)) {
      // a shelf: "  Label:" (key bare or quoted)
      const body = raw.slice(2);
      const key = readScalar(body, ':');
      if (!key || key.rest !== ':' && key.rest.trim() !== ':') {
        return fail(lineNo, `expected a shelf like "  Attributes:" (got ${JSON.stringify(body.slice(0, 30))})`);
      }
      const label = key.value.trim();
      if (!label) return fail(lineNo, 'a shelf needs a name');
      if (label.length > MAX_NAME) return fail(lineNo, `shelf name over ${MAX_NAME} characters`);
      const k = label.toLowerCase();
      if (byKey.has(k)) return fail(lineNo, `shelf ${JSON.stringify(label)} appears twice`);
      shelf = { label: TRIO_LABELS[k] || label, plain: k === PLAIN_LABEL.toLowerCase(), pools: [] };
      byKey.set(k, shelf);
      shelves.push(shelf);
      continue;
    }

    if (/^ {4}- /.test(raw)) {
      if (!shelf) return fail(lineNo, 'a pool line stands outside any shelf');
      const body = raw.slice(6);
      const key = readScalar(body, ': ');
      if (!key) return fail(lineNo, `expected "- 'Name': 'notation'" (got ${JSON.stringify(body.slice(0, 30))})`);
      let rest = key.rest;
      if (!rest.startsWith(': ')) return fail(lineNo, 'expected ": " between name and notation');
      rest = rest.slice(2);
      const val = readScalar(rest);
      if (!val) return fail(lineNo, 'expected a notation scalar');
      let set = null;
      let tail = val.rest.trim();
      if (tail.startsWith('@')) {
        // "- 'Name': 'notation' @ 'set-id'" — the §9 override suffix. Only
        // reachable after a QUOTED notation (a bare scalar consumes the line).
        const sv = readScalar(tail.slice(1).trim());
        if (!sv || sv.rest.trim() !== '') return fail(lineNo, 'trailing text after the dice-set id');
        const id = sv.value.trim();
        // unknown ids fall closed to no override — the pool survives
        set = id === 'std' || SETS[id] ? id : null;
        tail = '';
      }
      if (tail !== '') return fail(lineNo, 'trailing text after the notation');
      const name = cutText(key.value, MAX_NAME + 1);
      if (name.length > MAX_NAME) return fail(lineNo, `name over ${MAX_NAME} characters`);
      const res = parseNotation(val.value);
      if (!res.ok) return fail(lineNo, `notation ${JSON.stringify(val.value.slice(0, 40))}: ${res.error}`);
      if (++poolCount > MAX_POOLS) return fail(lineNo, `more than ${MAX_POOLS} pools`);
      shelf.pools.push({ name, notation: res.canonical, ...(set ? { set } : {}) });
      continue;
    }

    return fail(lineNo, `unrecognized indentation ${JSON.stringify(raw.slice(0, 20))} — shelves at 2 spaces, pools at "    - "`);
  }

  if (!shelves.length && !('sound' in settings) && !('numbers' in settings)) {
    return fail(0, 'no pools and no settings found');
  }
  return { ok: true, shelves, settings };
}

// ---------------------------------------------------------------------------
// Merge plan — by NAME, never a silent overwrite (the preview is the point)
// ---------------------------------------------------------------------------

// current: [{id, name, notation, category?, set?}] · parsed: parsePortable's
// ok shape. A named pool matches the FIRST current pool with the same name
// (exact); a match with identical notation+shelf+set counts unchanged, else
// it becomes an update. Unnamed or unmatched pools are adds. Nothing is ever
// deleted — an import narrows nothing.
export function planImport(current, parsed) {
  const adds = [];
  const updates = [];
  let unchanged = 0;
  const taken = new Set(); // current ids already matched (dup names pair off in order)
  for (const s of parsed.shelves) {
    const category = s.plain ? null : s.label;
    for (const p of s.pools) {
      const match = p.name
        ? current.find((g) => g.name === p.name && !taken.has(g.id))
        : null;
      const set = p.set || null;
      if (!match) {
        adds.push({ name: p.name, notation: p.notation, category, ...(set ? { set } : {}) });
      } else {
        taken.add(match.id);
        const sameCat = (match.category || null) === category;
        const sameSet = (match.set || null) === set;
        if (match.notation === p.notation && sameCat && sameSet) unchanged++;
        // present-or-absent like adds: the apply site patches `u.set || ''`,
        // so an absent set still CLEARS a stale override on the match
        else updates.push({ id: match.id, name: p.name, notation: p.notation, category, ...(set ? { set } : {}) });
      }
    }
  }
  return { adds, updates, unchanged, settings: parsed.settings };
}
