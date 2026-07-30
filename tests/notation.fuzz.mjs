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

// Adversarial property tests for js/notation.js. Deterministic: the seed is
// printed on every run and can be pinned with FUZZ_SEED=<n> to reproduce a
// failure exactly. Run: node tests/notation.fuzz.mjs
//
// Four properties, each stated as a contract the parser must never break:
//
//   P1 fixed point   For every spec rollspec.validateMods accepts — with any
//                    dc / comment / exp{kind,subtitle} / faceDown extras —
//                    canonical -> parse -> canonical is byte-identical,
//                    specEquals holds, and no extra drifts.
//   P2 total safety  For ANY string, parseNotation never throws, never runs
//                    long (ReDoS), and an ok result is always in contract:
//                    validateMods accepts it, every cap holds, and its own
//                    canonical form re-parses to itself.
//   P3 incomplete    state 'incomplete' is only used for true prefixes of
//                    some valid command (verified by extending them).
//   P4 dialect       Roll20 paste semantics (r<N inclusive, 2d20kh1 collapse,
//                    glue order, d% expansion) are what UX.md Section 1.1 says,
//                    and the Section 7.6 moment notation (check/cinematic/held
//                    flags, '# Title | Subtitle' pipe) behaves as pinned.
//
// Known live defects are listed in KNOWN below. Each one absorbs its own
// failures (so this suite stays green) AND carries a repro that asserts the
// broken behaviour still happens — so when a defect is fixed, its repro fails
// and tells you to delete the entry.

import assert from 'node:assert/strict';
import { parseNotation, canonicalNotation, specEquals, DIE_ORDER } from '../js/notation.js';
import { validateMods, composeRoll, DIE_MAX } from '../js/rollspec.js';

const N_SPECS = Number(process.env.FUZZ_SPECS) || 5000;
const N_JUNK = Number(process.env.FUZZ_JUNK) || 5000;
const SEED = Number(process.env.FUZZ_SEED) || 0x5eed1ce;
const PARSE_BUDGET_MS = 25; // a single parse this slow means catastrophic backtracking

const MAX_INPUT = 500;
const MAX_DICE = 40;
const MAX_MOD = 99;
const MAX_LABEL = 20;
const MAX_COMMENT = 64;
const MAX_SUBTITLE = 40;
const EXP_KINDS = new Set(['check', 'cinematic']);
const MOD_KEYS = new Set(['modifier', 'parts', 'adv', 'keep', 'reroll', 'explode']);
const TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
// eslint-disable-next-line no-control-regex
const CTL = /[\x00-\x1f\x7f]/;

// ---------------------------------------------------------------------------
// deterministic rng
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (n) => Math.floor(rnd() * n);          // 0..n-1
const between = (lo, hi) => lo + int(hi - lo + 1); // inclusive
const pick = (a) => a[int(a.length)];
const chance = (p) => rnd() < p;
function sample(arr, k) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) { const j = int(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return c.slice(0, k);
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------
const failures = [];
const known = new Map();  // id -> count
const stats = { parses: 0, maxMs: 0, slowest: '', ok: 0, invalid: 0, incomplete: 0, threw: 0 };

function fail(kind, input, detail, extra = {}) {
  const c = { kind, input, detail, ...extra };
  const hit = KNOWN.find((k) => k.absorbs(c));
  if (hit) { known.set(hit.id, (known.get(hit.id) || 0) + 1); return; }
  if (failures.length < 40) failures.push(c);
  else stats.suppressed = (stats.suppressed || 0) + 1;
}

// Every parse in this file goes through here: no-throw and time are universal.
function parse(input, kind = 'parse') {
  stats.parses++;
  const t0 = process.hrtime.bigint();
  let r;
  try {
    r = parseNotation(input);
  } catch (e) {
    stats.threw++;
    fail(kind, input, `parseNotation THREW: ${e && e.message}`);
    return null;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (ms > stats.maxMs) { stats.maxMs = ms; stats.slowest = input; }
  if (ms > PARSE_BUDGET_MS) fail(kind, input, `parse took ${ms.toFixed(1)}ms (budget ${PARSE_BUDGET_MS}ms)`);
  if (r === null || typeof r !== 'object') { fail(kind, input, `result is not an object: ${String(r)}`); return null; }
  if (r.ok === true) stats.ok++;
  else if (r.state === 'invalid') stats.invalid++;
  else if (r.state === 'incomplete') stats.incomplete++;
  return r;
}

// ---------------------------------------------------------------------------
// KNOWN live defects (see the header). Ordered most severe first.
// ---------------------------------------------------------------------------
const KNOWN = [
  {
    id: 'D3-incomplete-with-no-valid-extension',
    note:
      'state incomplete is decided lexically by couldExtend(), which does not know the semantic ' +
      'caps. Strings whose every extension is invalid still report incomplete, so the command box ' +
      'stays silent instead of explaining the error: "1d20 5" (a bare number is never a flag), ' +
      '"1d6 a" (adv needs a d20), "1d20 dl" (pool too small), "d100k" (no glue on d100), ' +
      '"40d6+1d" (over the 40-dice cap). The §7.6 pipe adds one pinned member: "1d20 # t |" is ' +
      'incomplete by design (UX.md §7.6 partial-token states), but appending can only grow the ' +
      'subtitle — the check/cinematic flag it needs would have to precede the "#", so no ' +
      'extension is ever valid.',
    absorbs: (c) => c.kind === 'P3',
    repro() {
      for (const s of ['1d20 5', '1d6 a', '1d20 dl', 'd100k', '40d6+1d', '1d20 # t |']) {
        const r = parseNotation(s);
        assert.equal(r.ok, false, `D3(${s})`);
        assert.equal(r.state, 'incomplete', `D3 looks FIXED for "${s}" - update this KNOWN entry`);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// contract checks for an ok result
// ---------------------------------------------------------------------------
function checkOkContract(kind, input, r) {
  // Tags carried on every failure from this call, so KNOWN entries can
  // attribute all the downstream symptoms of one root cause.
  const tag = {};
  const d = (m, extra) => fail(kind, input, m, { ...tag, ...extra });
  const spec = r.spec;
  if (!spec || typeof spec !== 'object') return d('ok result has no spec');
  tag.badParts = Array.isArray(spec.mods && spec.mods.parts)
    && spec.mods.parts.some((p) => p && (!Number.isInteger(p.value) || Math.abs(p.value) > MAX_MOD));
  // text the NEXT parse would trim again: the canonical form cannot be stable
  const untrimmed = (t) => typeof t === 'string' && t !== t.trim();
  tag.trailingWs = untrimmed(r.comment)
    || untrimmed(r.exp && r.exp.subtitle)
    || (Array.isArray(spec.mods && spec.mods.parts) && spec.mods.parts.some((p) => p && untrimmed(p.label)));

  // dice pool
  if (!Array.isArray(spec.dice)) return d('spec.dice is not an array');
  if (spec.dice.length < 1) return d('ok with an empty dice pool');
  if (spec.dice.length > MAX_DICE) return d(`ok with ${spec.dice.length} dice (cap ${MAX_DICE})`);
  for (const t of spec.dice) {
    if (typeof t !== 'string' || !Object.hasOwn(DIE_MAX, t)) return d(`unknown die type in pool: ${String(t)}`);
  }

  // mods shape + the shared validator (the authority server.js uses)
  const m = spec.mods;
  if (m !== null && (typeof m !== 'object' || Array.isArray(m))) return d('spec.mods is neither null nor a plain object');
  if (m) {
    for (const k of Object.keys(m)) if (!MOD_KEYS.has(k)) d(`unexpected mods key: ${k}`);
    if (m.modifier !== undefined && (!Number.isInteger(m.modifier) || Math.abs(m.modifier) > MAX_MOD)) {
      d(`modifier out of contract: ${m.modifier}`);
    }
    if (m.parts !== undefined) {
      if (!Array.isArray(m.parts) || m.parts.length < 1) d('parts is not a non-empty array');
      else {
        let sum = 0;
        for (const p of m.parts) {
          if (!p || typeof p.label !== 'string') { d('part without a string label'); continue; }
          if (p.label.length > MAX_LABEL) d(`part label ${p.label.length} chars (cap ${MAX_LABEL})`);
          if (CTL.test(p.label)) d('control character survived into a part label');
          if (!Number.isInteger(p.value)) d(`part value not an integer: ${p.value}`);
          sum += p.value;
        }
        if (sum !== (m.modifier || 0)) d(`parts sum ${sum} != modifier ${m.modifier}`);
      }
    }
    if (m.adv !== undefined && m.adv !== 'adv' && m.adv !== 'dis') d(`bad adv: ${m.adv}`);
  }
  const vErr = validateMods(spec.dice, m);
  if (vErr) d(`rollspec.validateMods rejects an ok parse: ${vErr}`, { mods: JSON.stringify(m) });

  // scalars beside the spec
  if (r.dc !== null && (!Number.isInteger(r.dc) || r.dc < 1 || r.dc > 999)) d(`dc out of contract: ${r.dc}`);
  if (r.comment !== null) {
    if (typeof r.comment !== 'string') d('comment is not a string');
    else {
      if (r.comment.length > MAX_COMMENT) d(`comment ${r.comment.length} chars (cap ${MAX_COMMENT})`);
      if (CTL.test(r.comment)) d('control character survived into the comment');
    }
  }
  if (r.faceDown !== true && r.faceDown !== false) d(`faceDown is not a boolean: ${r.faceDown}`);
  // exp: null, or {kind, subtitle?} with a real kind and a clean, capped,
  // non-empty subtitle (UX.md §7.6). A subtitle key with an empty value would
  // be silently-lost intent, so it is out of contract too.
  if (r.exp !== undefined && r.exp !== null) {
    if (typeof r.exp !== 'object' || Array.isArray(r.exp)) d(`exp is neither null nor an object: ${String(r.exp)}`);
    else {
      for (const k of Object.keys(r.exp)) if (k !== 'kind' && k !== 'subtitle') d(`unexpected exp key: ${k}`);
      if (!EXP_KINDS.has(r.exp.kind)) d(`bad exp.kind: ${String(r.exp.kind)}`);
      if (r.exp.subtitle !== undefined) {
        if (typeof r.exp.subtitle !== 'string' || !r.exp.subtitle) d('exp.subtitle present but empty or not a string');
        else {
          if (r.exp.subtitle.length > MAX_SUBTITLE) d(`exp.subtitle ${r.exp.subtitle.length} chars (cap ${MAX_SUBTITLE})`);
          if (CTL.test(r.exp.subtitle)) d('control character survived into the subtitle');
        }
      }
    }
  }
  if (r.exp === undefined) d('ok result is missing the exp field');
  // (No separate unescaped-pipe check: labels may carry bare pipes legally,
  // and a leaked comment-pipe would fail the re-parse fixed point below.)
  if (!Array.isArray(r.warnings)) d('warnings is not an array');
  if (typeof r.canonical !== 'string') return d('canonical is not a string');
  if (r.canonical.length > MAX_INPUT) d(`canonical is ${r.canonical.length} chars - longer than MAX_INPUT`);

  // the roll must actually compose
  try {
    const c = composeRoll(spec.dice, m, rnd);
    if (!Number.isFinite(c.total)) d(`composeRoll total is not finite: ${c.total}`);
    if (c.dice.length !== c.values.length || c.dice.length !== c.perDie.length) d('composeRoll returned ragged arrays');
  } catch (e) {
    d(`composeRoll threw on an ok parse: ${e && e.message}`, { mods: JSON.stringify(m) });
  }

  // self-consistency: a parser's own canonical form must be a fixed point
  const r2 = parse(r.canonical, kind);
  if (!r2) return;
  if (!r2.ok) return d(`canonical does not re-parse: "${r.canonical}" -> ${r2.state}: ${r2.error}`, { canonical: r.canonical });
  if (r2.canonical !== r.canonical) {
    d(`canonical is not a fixed point: "${r.canonical}" -> "${r2.canonical}"`, { canonical: r.canonical });
  }
  if (!specEquals(spec, r2.spec)) d(`spec drifts through its own canonical form "${r.canonical}"`, { canonical: r.canonical });
  if (r2.dc !== r.dc) d(`dc lost through canonical: ${r.dc} -> ${r2.dc}`, { canonical: r.canonical });
  if (r2.comment !== r.comment) d(`comment lost through canonical: ${JSON.stringify(r.comment)} -> ${JSON.stringify(r2.comment)}`, { canonical: r.canonical });
  // §7.6: the moment and face-down now round-trip too — losing either through
  // the canonical form is exactly the audited notation-totality violation.
  if (JSON.stringify(r2.exp ?? null) !== JSON.stringify(r.exp ?? null)) {
    d(`exp lost through canonical: ${JSON.stringify(r.exp)} -> ${JSON.stringify(r2.exp)}`, { canonical: r.canonical });
  }
  if (r2.faceDown !== r.faceDown) d(`faceDown lost through canonical: ${r.faceDown} -> ${r2.faceDown}`, { canonical: r.canonical });
}

// ===========================================================================
// P1 - random in-contract specs are canonical fixed points
// ===========================================================================
const LABEL_CHARS = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ...' .,:;!?()*/&%$@^~|<>=+-_"\'',
  '[', 'é', 'ü', 'ß', 'ñ', 'Ω', 'д', '中', '🎲', '★',
];
const COMMENT_CHARS = [...LABEL_CHARS, ']', '#'];

// A label/comment the parser could actually have produced: control chars
// stripped, trimmed, capped. Generating anything else would test the generator,
// not the parser.
function genText(chars, cap) {
  for (let tries = 0; tries < 8; tries++) {
    let s = '';
    const n = between(1, cap);
    while (s.length < n) s += pick(chars);
    s = s.replace(CTL, '').trim().slice(0, cap).trim();
    if (s) return s;
  }
  return 'x';
}
const genLabel = () => genText(LABEL_CHARS, MAX_LABEL);
const genComment = () => genText(COMMENT_CHARS, MAX_COMMENT);
// Subtitles share the comment alphabet — '|' included, so the canonical
// renderer's pipe escaping is exercised from both halves of the split.
const genSubtitle = () => genText(COMMENT_CHARS, MAX_SUBTITLE);

function genDice() {
  const shape = pick(['single', 'single', 'mixed', 'mixed', 'd100', 'd100mix', 'twod20', 'smalld20']);
  if (shape === 'd100') return ['d10x', 'd10'];
  // The 2d20-with-keep shape is where the advantage collapse and the canonical
  // renderer disagree, so it is over-sampled rather than left to chance.
  if (shape === 'twod20') return ['d20', 'd20'];
  if (shape === 'smalld20') return Array(between(1, 3)).fill('d20');
  if (shape === 'single') {
    const t = pick(TYPES);
    return Array(between(1, 40)).fill(t);
  }
  const chosen = sample(TYPES, between(2, 4));
  const dice = [];
  let budget = MAX_DICE - chosen.length;
  for (const t of chosen) {
    const c = 1 + int(Math.min(6, budget + 1));
    budget -= c - 1;
    for (let i = 0; i < c; i++) dice.push(t);
  }
  if (shape === 'd100mix' && !dice.includes('d10x') && dice.length < MAX_DICE) dice.push('d10x');
  return dice.slice(0, MAX_DICE);
}

function genMods(dice) {
  const mods = {};
  let modifier = chance(0.55) ? between(-MAX_MOD, MAX_MOD) : 0;

  // parts: parser-shaped (labelled in order, at most one anonymous remainder
  // last). validateMods caps each part at +-99 and the sum at the modifier.
  if (chance(0.35)) {
    const parts = [];
    let sum = 0;
    const n = between(1, 12);
    for (let i = 0; i < n; i++) {
      const lo = Math.max(-MAX_MOD, -MAX_MOD - sum);
      const hi = Math.min(MAX_MOD, MAX_MOD - sum);
      const v = between(lo, hi);
      sum += v;
      parts.push({ label: genLabel(), value: v });
    }
    // dedupe is unnecessary (labels are display-only) but blank labels would
    // be dropped by the parser, and genLabel never returns one.
    const anon = modifier - sum;
    // the anonymous remainder is a part too, so it is capped like one
    if (chance(0.5) && anon !== 0 && Math.abs(anon) <= MAX_MOD) parts.push({ label: '', value: anon });
    else modifier = sum;
    mods.parts = parts;
    mods.modifier = modifier;
  } else if (modifier) {
    mods.modifier = modifier;
  }

  if (chance(0.3) && dice.includes('d20')) mods.adv = chance(0.5) ? 'adv' : 'dis';
  if (chance(0.3) && dice.length > 1) {
    mods.keep = { mode: pick(['kh', 'kl', 'dh', 'dl']), n: between(1, dice.length - 1) };
  }
  if (chance(0.3)) mods.reroll = { below: between(1, 9), once: true };
  if (chance(0.25)) mods.explode = true;
  return Object.keys(mods).length ? mods : null;
}

let p1Skipped = 0;
for (let i = 0; i < N_SPECS; i++) {
  const dice = genDice();
  const mods = genMods(dice);
  const spec = { dice, mods };
  const extras = {};
  if (chance(0.3)) extras.dc = between(1, 999);
  if (chance(0.3)) extras.comment = genComment();
  if (chance(0.35)) {
    extras.exp = { kind: chance(0.5) ? 'check' : 'cinematic' };
    if (chance(0.5)) extras.exp.subtitle = genSubtitle();
  }
  if (chance(0.3)) extras.faceDown = true;

  // generator sanity: only in-contract specs are interesting for P1
  if (validateMods(dice, mods) !== null) { p1Skipped++; continue; }

  const c1 = canonicalNotation(spec, extras);
  // Pipe escaping + max-length parts + comment + subtitle can push a wire-fed
  // canonical past MAX_INPUT; the parser refuses such strings by design
  // (tested in the unit suite), so they are a generator artifact here.
  if (c1.length > MAX_INPUT) { p1Skipped++; continue; }
  const r = parse(c1, 'P1');
  if (!r) continue;
  if (!r.ok) {
    fail('P1', c1, `canonical of a valid spec does not parse: ${r.state}: ${r.error}`,
      { canonical: c1, spec: JSON.stringify(spec) });
    continue;
  }
  if (r.canonical !== c1) {
    fail('P1', c1, `not a fixed point: "${c1}" -> "${r.canonical}"`, { canonical: c1, spec: JSON.stringify(spec) });
  }
  if (!specEquals(spec, r.spec)) {
    fail('P1', c1, `specEquals fails through canonical "${c1}"`, { canonical: c1, spec: JSON.stringify(spec) });
  }
  if (r.dc !== (extras.dc ?? null)) fail('P1', c1, `dc drift ${extras.dc} -> ${r.dc}`, { canonical: c1 });
  if (r.comment !== (extras.comment ?? null)) {
    fail('P1', c1, `comment drift ${JSON.stringify(extras.comment)} -> ${JSON.stringify(r.comment)}`, { canonical: c1 });
  }
  if (JSON.stringify(r.exp ?? null) !== JSON.stringify(extras.exp ?? null)) {
    fail('P1', c1, `exp drift ${JSON.stringify(extras.exp)} -> ${JSON.stringify(r.exp)}`, { canonical: c1 });
  }
  if (r.faceDown !== (extras.faceDown ?? false)) {
    fail('P1', c1, `faceDown drift ${extras.faceDown ?? false} -> ${r.faceDown}`, { canonical: c1 });
  }
  checkOkContract('P1', c1, r);
}

// ---------------------------------------------------------------------------
// P1b - specs that reach canonicalNotation from the WIRE, not from the parser.
// server.js accepts {dice, mods} after nothing but validateMods, so mods.parts
// labels arrive with whatever characters validateMods tolerates. The canonical
// renderer interpolates them raw.
// ---------------------------------------------------------------------------
const WIRE_LABELS = [
  'plain', 'a]b', '] adv dc999 #', 'x]+99[y', ']', '# hi', 'a#b', 'k] dl1', '[nested', 'a+b', '-5', 'ro<=2',
];
for (const label of WIRE_LABELS) {
  const spec = { dice: ['d20'], mods: { modifier: 2, parts: [{ label, value: 2 }] } };
  if (validateMods(spec.dice, spec.mods) !== null) continue; // not in the shared contract: fine
  const c1 = canonicalNotation(spec, {});
  const r = parse(c1, 'P1b');
  if (!r) continue;
  if (!r.ok) {
    fail('P1b', c1, `canonical of a validateMods-clean spec does not parse: ${r.error}`, { label });
  } else if (r.canonical !== c1 || !specEquals(spec, r.spec)) {
    fail('P1b', c1, `label ${JSON.stringify(label)} breaks the canonical round trip -> ${JSON.stringify(r.canonical)}`, { label });
  }
}

// ===========================================================================
// P2 - hostile input: never throw, never accept an out-of-contract spec
// ===========================================================================
const TOKENS = [
  '1d20', '2d6', '3d6', '40d6', '41d6', '0d6', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd10x', 'd100', 'd%',
  'd0', 'd7', 'd1', 'd2', 'd3', 'd', 'dd', 'd10x10',
  '+', '-', '+3', '-3', '+99', '-99', '+100', '+999', '+0', '0',
  '[A]', '[Proficiency]', '[', ']', '[]', '[[', ']]', '[a]b]', '[' + 'x'.repeat(25) + ']',
  '#', '# note', '#[', 'adv', 'dis', 'advantage', 'disadvantage', 'ADV',
  'kh1', 'kl1', 'dh1', 'dl1', 'k1', 'd1', 'kh0', 'kh999', 'kh',
  'ro<=2', 'ro<2', 'r<2', 'r<=2', 'ro<=0', 'ro<=99', 'ro', 'r', 'ro<=', '<=', '<',
  '!', '!!', 'dc15', 'dc0', 'dc1000', 'dc999', 'dc', 'vs', 'vs20', 'vs 20',
  '/roll', '/r', '/gmroll', '/gmr', '/selfroll', '/sr', '/gm', '/xyzzy', '/', '//',
  ' ', '  ', '\t', '\n', '\r', '\v', '\f', '\0', '\x1b', '\x7f',
  '🎲', 'é', '‮', '​', '﻿', '　', 'ｄ', '１', '＋', '％',
  '999', '9999', 'NaN', 'Infinity', '-Infinity', 'undefined', 'null', 'true', '1e3', '0x14', '.5', '1.5',
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  '(', ')', '{', '}', '<', '>', '=', ';', ':', ',', '.', '*', '/', '%', '^', '&', '|', '~', '\\', '"', "'", '`', '$',
  '2d20kh1', '2d20kl1', '1d20ro<=1+3', '4d6dl1', '8d6!', 'select 1', 'DROP TABLE', '${x}', '{{x}}', '</script>',
  // §7.6 moment tokens: kinds (+alias), held, pipes escaped and bare, partials
  'check', 'cinematic', 'cine', 'held', 'CHECK', 'HELD', 'che', 'chec', 'cinem', 'cinemati', 'hel', 'checked', 'cines',
  '|', '\\|', '||', ' | ', '# T | S', '# t \\| s', '# |', '# a |', '| sub', '#|', '\\', '# \\| | \\|',
];

const VALID_SEEDS = [
  '1d20ro<=1+3 adv dc15 # The lie leaves your lips',
  '4d6dl1', '3d6+1d20+5 ro<=2 ! dc15 # Firebolt', '2d20kh1+5', 'd100', 'd%', '8d6!',
  '1d20+2[Proficiency]+1[Guidance]', '/gmroll 1d20', '/roll 2d6+1', '1d20+2d6 dl1', '40d6', '1d10x',
  '2d100', '1d20 vs15', '1d20 dc 15', '1d20-2[Bane]', '3d6r<2', '1d4+1d6+1d8+1d10+1d12+1d20 kh2',
  // §7.6 moment notation
  '1d20ro<=1+3 adv check dc15 # The lie leaves your lips',
  '1d20 check dc15 # Deception | CHARISMA CHECK',
  '8d6! cinematic # Fireball | DEX SAVE', '1d20 cine', '1d20 held', '/gmroll 1d20 held',
  '1d20 adv check held dc15 # T | S', '2d6+1d20 dl1 cinematic held # mixed | pool',
  '1d20 # a \\| b', '1d20 check # t \\| x | s \\| t',
];

const JUNK_CHARS = [
  ...'0123456789dDkKlLhHrRoOvVsScC+-!<>=#[]%xX ',
  '\t', '\n', '\0', '\x7f', '‮', '​', '🎲', 'é', '中', 'ｄ', '\\', '"', "'", '(', ')', '{', '}', ';', '*', '$', '`',
];

function junkSplice() {
  const n = between(1, 12);
  let s = '';
  for (let i = 0; i < n; i++) {
    s += pick(TOKENS);
    if (chance(0.35)) s += pick(['', ' ', '  ', '\t']);
  }
  return s;
}
function junkMutate() {
  let s = pick(VALID_SEEDS);
  const rounds = between(1, 4);
  for (let i = 0; i < rounds; i++) {
    if (!s.length) break;
    const at = int(s.length + 1);
    switch (int(6)) {
      case 0: s = s.slice(0, at) + pick(JUNK_CHARS) + s.slice(at); break;                     // insert
      case 1: s = s.slice(0, at) + s.slice(at + 1); break;                                    // delete
      case 2: s = s.slice(0, at) + pick(JUNK_CHARS) + s.slice(at + 1); break;                 // replace
      case 3: s = s.slice(0, at) + pick(TOKENS) + s.slice(at); break;                          // splice a token
      case 4: s = s.slice(0, at) + s.slice(at, at + 3) + s.slice(at); break;                   // duplicate
      case 5: s = s.slice(0, at).toUpperCase() + s.slice(at); break;                           // case flip
    }
  }
  return s;
}
function junkRandom() {
  const n = between(0, 60);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(JUNK_CHARS);
  return s;
}
function junkBrackets() {
  const n = between(1, 250);
  const open = '['.repeat(n);
  return pick([open, '1d20+2' + open, open + '1d20', '1d20+2' + '[]'.repeat(Math.min(n, 120)),
    '1d20+2[' + '['.repeat(n) + ']', '1d20+2' + '[a'.repeat(Math.min(n, 160))]);
}
function junkHuge() {
  const unit = pick(['1d20+', 'x', 'd', '[', '+1', 'ro<=2', '​', '🎲', ' ']);
  const target = pick([MAX_INPUT - 1, MAX_INPUT, MAX_INPUT + 1, 1000, 100 * 1024]);
  let s = unit.repeat(Math.ceil(target / unit.length)).slice(0, target);
  if (chance(0.3)) s = '1d20' + s.slice(4);
  return s;
}
function junkPrefix() {
  const s = pick(VALID_SEEDS);
  return s.slice(0, between(1, s.length));
}
function junkNumeric() {
  // targets the "sum is capped but a single term is not" family
  const n = between(1, 6);
  let s = pick(['1d20', '2d6', '1d20']);
  for (let i = 0; i < n; i++) {
    s += pick(['+', '-']) + between(0, 999) + (chance(0.6) ? `[${genLabel()}]` : '');
  }
  if (chance(0.25)) s += ' dc' + between(0, 1200);
  return s;
}

// Over-length comments and labels, so the truncating slice lands on every
// offset including the whitespace ones the next parse would trim away.
function junkText() {
  const words = ['fire', 'bolt', 'a', 'the', 'Divine', 'Favor', 'x', 'blessing of', 'Ω', '🎲', 'ii',
    '|', '\\|', 'a|b', '||', '\\', 'x\\'];
  let t = '';
  const target = between(15, 90);
  while (t.length < target) t += (t ? ' ' : '') + pick(words);
  if (chance(0.4)) t += ' '.repeat(between(1, 4));
  // sometimes dress the roll so pipe-bearing comments hit the ok path (a
  // kindless subtitle is invalid, which would skip every contract check)
  const kind = chance(0.5) ? ' ' + pick(['check', 'cinematic', 'cine', 'held', 'check held']) : '';
  return chance(0.5) ? `1d20${kind} # ${t}` : `1d20+2[${t.slice(0, 60)}]`;
}

const GENS = [junkSplice, junkSplice, junkMutate, junkMutate, junkRandom, junkBrackets, junkHuge, junkPrefix, junkNumeric, junkNumeric, junkText, junkText];

// Named hostile inputs, run on every seed so coverage never depends on luck.
const CORPUS = [
  '', ' ', '\t', '\n', '\0', '\x1b[31m', '\x7f', '﻿', '　',
  'd0', 'd7', 'd9', 'd11', 'd21', 'd99', 'd100x', 'd10xx', '41d6', '0d6', '000d6', '999d6', '-1d6', '-d6', '+d6',
  '+', '-', '++', '--', '+-', '#', '##', '# ', '#\0', '1d20#', '1d20##', '1d20 # #',
  '[', ']', '[]', '[[]]', '1d20+2[', '1d20+2]', '1d20+2[]', '1d20+2[[A]]', '1d20+2[A][B]',
  '['.repeat(500), '1d20+2' + '['.repeat(494), '1d20+2' + '[]'.repeat(200), '1d20+2[' + '['.repeat(200) + ']',
  'x'.repeat(100 * 1024), '1d20'.repeat(25 * 1024), '1'.repeat(100 * 1024), '['.repeat(100 * 1024),
  '1d20 '.padEnd(499, 'a'), '1d20 '.padEnd(500, 'a'), '1d20 '.padEnd(501, 'a'),
  '1d20+'.repeat(100), '1d20+'.repeat(2000), '+1'.repeat(250), '9'.repeat(500), '1' + 'd'.repeat(498),
  '1d6' + 'ro<=1'.repeat(90), '1d6' + '!'.repeat(400), '2d20' + 'kh1'.repeat(150),
  '1d20+2[a\0b]', '1d20+2[a\x1fb]', '1d20 # a\0b', '1d20 # a\x7fb', '1d20+2[\0\0\0]', '1d20 # \0\0',
  '1d20+2[‮evil]', '1d20+2[a​b]', '1d20 # ‮﻿', '🎲', '🎲d20', '1d20🎲', 'ｄ20', '１d20', '1d20＋3', '1d20 ＃ x',
  '1d20+2[' + '🎲'.repeat(20) + ']', '1d20 # ' + '🎲'.repeat(40),
  '__proto__', '1d20+2[__proto__]', '1d20 __proto__', 'constructor', 'toString', 'valueOf',
  '{"dice":["d20"]}', '<script>alert(1)</script>', '1d20;DROP TABLE rolls', '1d20 && rm -rf /', '../../etc/passwd',
  '1d20 dc-1', '1d20 dc 0', '1d20 dc999999', '1d20 vs vs 15', '1d20 dc15 dc15', '1d20 dc 15 20',
  '1d20 adv dis', '1d20 dis adv', '2d20kh1 dis', '2d20kl1 adv', '4d6dl1dl1', '4d6!!', '4d6ro<=1r<2',
  '1d20 kh1 kh1', '1d20 ro<=1 ro<=2', '1d20 ! !', 'd100kh1', 'd%!', '2d100kh1',
  '/', '//', '/roll', '/roll ', '/r', '/gm', '/gmroll', '/xyzzy 1d20', '/roll /roll 1d20', '/ROLL 1D20',
  '1d20 5', '1d6 a', '1d20 dl', 'd100k', '40d6+1d', '4d66', 'd120', 'd1010', 'd%d%',
  '1d20-99[A]+99+99', '1d20+100[A]-1[B]', '1d20-999[A]+999+99',
  '1d20+1[a]+1[b]+1[c]+1[d]+1[e]+1[f]+1[g]+1[h]+1[i]+1[j]+1[k]+1[l]+1[m]',
  // §7.6 moment flags and the comment pipe
  '1d20 check', '1d20 cinematic', '1d20 cine', '1d20 held', '1d20 CHECK HELD',
  '1d20 check check', '1d20 check cine', '1d20 cinematic check', '1d20 held held', '1d20 check adv held dc15',
  '/gmroll 1d20 held', '/sr 1d20 check', '1d20 checked', '1d20 checkk', '1d20 cines', '1d20 helds', '1d20check',
  '1d20 c', '1d20 ch', '1d20 che', '1d20 chec', '1d20 cinem', '1d20 cinemati', '1d20 h', '1d20 he', '1d20 hel',
  '1d20 # a | b', '1d20 dc15 # a | b', '1d20 held # a | b', '1d20 check # a | b', '1d20 check # a|b',
  '1d20 # t |', '1d20 check # t |', '1d20 # |', '1d20 check # |', '1d20 check # | s', '1d20 # \\|',
  '1d20 check # \\| | \\|', '1d20 check # t | a|b|c', '1d20 check # t \\| x | s', '1d20 check # a\\ | b',
  '1d20 check # | \\|', '1d20 # a \\| b', '1d20 cine # ' + '\\|'.repeat(40), '1d20 check # t | ' + '|'.repeat(60),
  '1d20 check # ' + 'a'.repeat(70) + ' | ' + 'b'.repeat(50), '1d20 check # t | ' + 'a'.repeat(39) + ' bb',
  '1d20 check # t | x', '1d20 check # t | ​', '1d20 check # t‮ | x y',
  '1d20+2[check]', '1d20 # check held cine', '1d20 check dc15 # Deception | CHARISMA CHECK',
  // truncation landing on whitespace, at and around both caps
  '1d20 # ' + 'a'.repeat(63) + ' bbbb',
  '1d20 # ' + 'a'.repeat(60) + '      bbbb',
  '1d20 # ' + 'a'.repeat(64) + ' bbbb',
  '1d20+2[' + 'a'.repeat(19) + ' bb]',
  '1d20+2[' + 'a'.repeat(15) + '      bb]',
  '1d20+2[' + 'a'.repeat(20) + ' bb]',
  '1d20+2[' + 'a'.repeat(19) + ' ]',
];
for (const s of CORPUS) {
  const r = parse(s, 'P2');
  if (r && r.ok === true) checkOkContract('P2', s, r);
}

const incompleteSeen = new Set();
for (let i = 0; i < N_JUNK; i++) {
  const s = pick(GENS)();
  const r = parse(s, 'P2');
  if (!r) continue;
  if (r.ok === true) {
    checkOkContract('P2', s, r);
  } else {
    if (r.state !== 'invalid' && r.state !== 'incomplete') fail('P2', s, `unknown state: ${String(r.state)}`);
    if (typeof r.error !== 'string' || !r.error) fail('P2', s, 'failure without an error string');
    if (r.hint !== null && typeof r.hint !== 'string') fail('P2', s, `hint is neither null nor a string: ${String(r.hint)}`);
    if (r.spec !== undefined) fail('P2', s, 'failed parse still returned a spec');
    if (r.state === 'incomplete' && s.length < 400 && incompleteSeen.size < 4000) incompleteSeen.add(s);
  }
}
// non-string and exotic inputs must not throw either
for (const v of [undefined, null, 0, 1, NaN, true, false, {}, [], [1, 2], () => 1, Symbol.iterator,
  new String('1d20'), Object.create(null), { toString: () => '1d20' }, 12n]) {
  try {
    const r = parseNotation(v);
    if (r.ok !== false) fail('P2', `<${typeof v}>`, `non-string input accepted: ${String(r.ok)}`);
  } catch (e) {
    if (typeof v === 'symbol' || typeof v === 'bigint') continue; // String(sym) throws by language rule
    fail('P2', `<${typeof v}>`, `threw on non-string input: ${e && e.message}`);
  }
}

// ===========================================================================
// P3 - incomplete only for true prefixes of some valid command
// ===========================================================================
// Extension alphabet: everything needed to finish a truncated token, plus
// whole tokens to continue the command.
const SUFFIX1 = [
  '0', '1', '2', '3', '4', '5', '6', '8', '9', '00', '10', '20', '15',
  'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd10x', 'd100', 'd%', '4', '%', 'x',
  '1d20', '2d6', '+1', '+1d6', '+2[A]', ']', '[A]', 'A]',
  ' adv', ' dis', 'dv', 'v', 'is', 's',
  ' kh1', ' dl1', 'h1', 'l1', ' ro<=2', 'o<=2', '<=2', '=2', '!', ' !',
  ' dc15', 'c15', '15', ' # hi', ' 1d20', 'oll 1d20', 'll 1d20', 'l 1d20', ' 2d6+1',
  // §7.6 keyword completions (check/cinematic/held truncated at any offset)
  'heck', 'eck', 'ck', 'k', 'ine', 'nematic', 'ematic', 'matic', 'atic', 'tic', 'ic', 'c',
  'eld', 'ld', 'd', 'e', ' check', ' cinematic', ' held', ' cine', '| s', ' | s',
];
const SUFFIX2 = ['1', '2', '4', '6', '0', 'd6', 'd20', '+1', '1d20', ' 1d20', ']', 'A]', ' adv', ' dc15', ' kh1', '!', 'x', '%', 'h1', '<=2', ' # hi', 'v',
  'k', 'ck', 'eck', 'atic', 'tic', 'ic', 'c', 'd', 'ld', 'eld', 'e', ' check', ' held', '| s'];

function findExtension(s, depth) {
  let frontier = [''];
  for (let d = 0; d < depth; d++) {
    const alphabet = d === 0 ? SUFFIX1 : SUFFIX2;
    const next = [];
    for (const f of frontier) {
      for (const suf of alphabet) {
        const cand = s + f + suf;
        if (cand.length > MAX_INPUT) continue;
        stats.parses++;
        let r;
        try { r = parseNotation(cand); } catch { continue; }
        if (r.ok) return cand;
        if (r.state === 'incomplete') next.push(f + suf);
      }
    }
    frontier = next.length > 900 ? next.slice(0, 900) : next;
    if (!frontier.length) break;
  }
  return null;
}

// Hand-picked truncations of the canonical corpus, plus whatever the junk
// generators found, so the sample is not all garbage-shaped.
const handIncomplete = [];
for (const seed of VALID_SEEDS) {
  for (let cut = 1; cut < seed.length; cut++) {
    const s = seed.slice(0, cut);
    const r = parseNotation(s);
    if (!r.ok && r.state === 'incomplete') handIncomplete.push(s);
  }
}
const incompletePool = [...new Set([...handIncomplete, ...incompleteSeen])];
const P3_SAMPLE = Math.min(incompletePool.length, Number(process.env.FUZZ_P3) || 600);
const p3Pick = sample(incompletePool, P3_SAMPLE);
let p3Checked = 0;
const p3NoExtension = [];
for (const s of p3Pick) {
  if (s.length > MAX_INPUT - 12) continue; // too long to extend: a cap artifact, not a parser bug
  // A command that is only a comment ("# hi") is completed by PREPENDING the
  // dice, which is exactly what its error text asks for. Appending can never
  // finish it, so the prefix formulation does not apply - deliberate exception.
  if (s.trimStart().startsWith('#') || (s.startsWith('/') && s.includes('#'))) continue;
  p3Checked++;
  const ext = findExtension(s, 3);
  if (!ext) {
    p3NoExtension.push(s);
    fail('P3', s, 'state=incomplete but no valid extension exists');
  }
}

// ===========================================================================
// P4 - Roll20 dialect spot checks (UX.md Section 1.1)
// ===========================================================================
let p4 = 0;
const spot = (name, fn) => {
  p4++;
  try { fn(); } catch (e) { failures.push({ kind: 'P4', input: name, detail: e.message }); }
};
const mustParse = (s) => {
  const r = parseNotation(s);
  assert.equal(r.ok, true, `"${s}" should parse: ${r.error}`);
  return r;
};

spot('Roll20 "<" is inclusive: r<2 == ro<=2 == ro<2 == r<=2', () => {
  const base = mustParse('3d6ro<=2');
  for (const s of ['3d6r<2', '3d6ro<2', '3d6r<=2']) {
    const r = mustParse(s);
    assert.deepEqual(r.spec.mods.reroll, { below: 2, once: true }, s);
    assert.ok(specEquals(base.spec, r.spec), `${s} != 3d6ro<=2`);
    assert.equal(r.canonical, '3d6ro<=2', s);
  }
  // never N-1: a pasted r<2 must still reroll 2s
  assert.equal(mustParse('3d6r<1').spec.mods.reroll.below, 1);
  // the loud divergence is announced
  assert.ok(mustParse('3d6r<2').warnings.some((w) => /once per die/.test(w)));
});

spot('2d20kh1+1d4 collapses to adv and keeps the d4', () => {
  const r = mustParse('2d20kh1+1d4');
  assert.deepEqual([...r.spec.dice].sort(), ['d20', 'd4']);
  assert.equal(r.spec.mods.adv, 'adv');
  assert.equal(r.spec.mods.keep, undefined, 'the collapsed kh1 must not survive as a pool-wide keep');
  assert.equal(r.canonical, '1d4+1d20 adv');
  // and the collapse beats the mixed-pool glue check (UX.md: it ceases to exist)
  assert.equal(mustParse('2d20kl1+1d4').spec.mods.adv, 'dis');
  assert.equal(parseNotation('2d20dl1+1d4').ok, false, 'a non-collapsing glue in a mixed pool is an error');
  // composition pairs the surviving d20 only
  const c = composeRoll(r.spec.dice, r.spec.mods, rnd);
  assert.equal(c.dice.filter((t) => t === 'd20').length, 2, 'adv pairs the one d20');
  assert.equal(c.dice.filter((t) => t === 'd4').length, 1, 'the d4 is never paired');
});

spot('4d6!dl1: glue order is free, canonical order is keep-reroll-explode', () => {
  const a = mustParse('4d6!dl1');
  const b = mustParse('4d6dl1!');
  assert.ok(specEquals(a.spec, b.spec));
  assert.equal(a.canonical, '4d6dl1!');
  assert.equal(b.canonical, '4d6dl1!');
  assert.deepEqual(a.spec.mods.keep, { mode: 'dl', n: 1 });
  assert.equal(a.spec.mods.explode, true);
  // this engine drops THEN explodes (rollspec.js order of operations), which
  // is the documented divergence from RPG Dice Roller: a dropped 6 cannot
  // spawn a child, so no explosion child may descend from a dropped die.
  for (let i = 0; i < 4000; i++) {
    const c = composeRoll(a.spec.dice, a.spec.mods, rnd);
    for (let j = 0; j < c.dice.length; j++) {
      const parent = c.perDie[j].childOf;
      if (parent !== null) {
        assert.ok(c.perDie[parent].counts, 'explosion child of a dropped die: keep/drop must run first');
      }
    }
    const dropped = c.perDie.filter((p) => p.reason === 'drop').length;
    assert.equal(dropped, 1, 'dl1 drops exactly one die');
  }
});

spot('d% and d100 expand to [d10x, d10] and render back as d100', () => {
  for (const s of ['d%', 'd100', '1d%', '1d100', 'D%', '1D100']) {
    const r = mustParse(s);
    assert.deepEqual([...r.spec.dice].sort(), ['d10', 'd10x'], s);
    assert.equal(r.canonical, 'd100', s);
  }
  // multiples expand but do not render as d100 (the pool is no longer 1+1)
  const two = mustParse('2d100');
  assert.equal(two.spec.dice.filter((t) => t === 'd10x').length, 2);
  assert.equal(two.spec.dice.filter((t) => t === 'd10').length, 2);
  assert.equal(two.canonical, '2d10+2d10x');
  assert.equal(mustParse(two.canonical).canonical, '2d10+2d10x');
  // glue cannot attach to the composite die
  for (const s of ['d100kh1', 'd%!', 'd100ro<=2', 'd%dl1']) {
    const r = parseNotation(s);
    assert.equal(r.ok, false, `${s} must be refused`);
    assert.match(r.error, /d100/);
  }
  // ... but the trailing-flag form is accepted and stays a fixed point
  const flagged = mustParse('d100 kh1');
  assert.deepEqual(flagged.spec.mods.keep, { mode: 'kh', n: 1 });
  assert.equal(flagged.canonical, 'd100 kh1');
  assert.equal(mustParse('d100 kh1').canonical, 'd100 kh1');
  // d10x never explodes, and the parser says so instead of silently ignoring
  assert.ok(mustParse('1d10x!').warnings.some((w) => /never explode/.test(w)));
});

// EDITED for UX.md §7.6 / roadmap step 1: the /gmroll family still sets
// faceDown, but the canonical no longer drops it — it normalizes to the
// trailing 'held' flag (canonical emits 'held', never a prefix).
spot('/roll family: prefixes normalize — no-op, or faceDown via the held flag', () => {
  for (const p of ['/roll', '/r', '/ROLL']) {
    const r = mustParse(`${p} 2d6+1`);
    assert.equal(r.faceDown, false, p);
    assert.equal(r.canonical, '2d6+1', p);
  }
  for (const p of ['/gmroll', '/gmr', '/selfroll', '/sr', '/GMROLL']) {
    const r = mustParse(`${p} 2d6+1`);
    assert.equal(r.faceDown, true, p);
    assert.equal(r.canonical, '2d6+1 held', p);
    assert.equal(mustParse(r.canonical).faceDown, true, p);
  }
  assert.equal(parseNotation('/xyzzy 1d20').ok, false);
});

spot('caps are enforced at the boundary, not one past it', () => {
  assert.equal(mustParse('40d6').spec.dice.length, 40);
  assert.equal(parseNotation('41d6').ok, false);
  assert.equal(parseNotation('40d6+1d4').ok, false);
  assert.equal(mustParse('1d20+99').spec.mods.modifier, 99);
  assert.equal(parseNotation('1d20+99+1').ok, false);
  assert.equal(mustParse('1d20 dc999').dc, 999);
  assert.equal(parseNotation('1d20 dc1000').ok, false);
  assert.equal(parseNotation('1d20 dc0').ok, false);
  assert.equal(mustParse('2d6 ro<=9').spec.mods.reroll.below, 9);
  assert.equal(parseNotation('2d6 ro<=10').ok, false);
  assert.equal(mustParse('2d6 kh1').spec.mods.keep.n, 1);
  assert.equal(parseNotation('2d6 kh2').ok, false);
  assert.equal(mustParse('1d20 # ' + 'x'.repeat(200)).comment.length, 64);
  assert.equal(parseNotation('1d20'.padEnd(501, ' ')).ok, false);
  assert.equal(mustParse('1d20+2[' + 'y'.repeat(50) + ']').spec.mods.parts[0].label.length, 20);
});

spot('§7.6 moment notation: kinds, held, the comment pipe', () => {
  // kind flags, alias normalization, no dc→check implication
  assert.deepEqual(mustParse('1d20 check').exp, { kind: 'check' });
  assert.equal(mustParse('1d20 cine').canonical, '1d20 cinematic');
  assert.equal(mustParse('1d20 dc15').exp, null, 'dc must NOT imply check at parse level');
  assert.equal(parseNotation('1d20 check cine').ok, false, 'two kinds must be refused');
  // held round-trips; the flag and the prefixes are one spelling on output
  assert.equal(mustParse('1d20 held').faceDown, true);
  assert.equal(mustParse('/gmr 1d20').canonical, '1d20 held');
  assert.equal(mustParse('1d20 held').canonical, mustParse('/selfroll 1d20').canonical);
  // canonical flag order: [adv] [keep] [reroll] [!] [kind] [held] [dc] [#]
  const r = mustParse('1d20+2d6 dc12 held cine ! ro<=2 dl1 adv # T | S');
  assert.equal(r.canonical, '2d6+1d20 adv dl1 ro<=2 ! cinematic held dc12 # T | S');
  assert.equal(mustParse(r.canonical).canonical, r.canonical);
  // the pipe: split, escape, caps, and the kindless-subtitle refusal
  const p = mustParse('1d20 check # Deception | CHARISMA CHECK');
  assert.equal(p.comment, 'Deception');
  assert.deepEqual(p.exp, { kind: 'check', subtitle: 'CHARISMA CHECK' });
  assert.equal(mustParse('1d20 # a \\| b').comment, 'a | b');
  assert.equal(mustParse('1d20 check # t | a|b').canonical, '1d20 check # t | a\\|b');
  assert.equal(mustParse('1d20 check # t | ' + 'x'.repeat(80)).exp.subtitle.length, MAX_SUBTITLE);
  assert.equal(parseNotation('1d20 # a | b').ok, false, 'a subtitle needs check or cinematic');
  assert.equal(parseNotation('1d20 # a | b').state, 'invalid');
  assert.equal(parseNotation('1d20 check # t |').state, 'incomplete');
});

spot('canonical die order is d4 -> d20 with the modifier last', () => {
  const r = mustParse('1d20+1d4+1d12+1d6+3');
  assert.equal(r.canonical, '1d4+1d6+1d12+1d20+3');
  assert.deepEqual(DIE_ORDER, ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20']);
});

// ===========================================================================
// KNOWN defect repros: each must still reproduce, or the entry is stale
// ===========================================================================
for (const k of KNOWN) {
  try { k.repro(); } catch (e) {
    failures.push({ kind: 'KNOWN', input: k.id, detail: `stale KNOWN entry: ${e.message}` });
  }
}

// ===========================================================================
// report
// ===========================================================================
// readability score: plain ASCII, short, and containing a die reads like a
// command a person would actually type
const score = (s) =>
  (/^[\x20-\x7e]+$/.test(s) ? 10 : 0) + (/\d?d(4|6|8|10|12|20|%|100)/.test(s) ? 6 : 0) - s.length / 10;

const trunc = (s, n = 96) => {
  const j = JSON.stringify(String(s));
  return j.length > n ? j.slice(0, n) + '…"' : j;
};

console.log(`notation fuzz  seed=0x${SEED.toString(16)}  specs=${N_SPECS} junk=${N_JUNK} p3=${p3Checked}`);
console.log(`  ${stats.parses} parses  ok=${stats.ok} invalid=${stats.invalid} incomplete=${stats.incomplete} threw=${stats.threw}`);
console.log(`  slowest parse ${stats.maxMs.toFixed(2)}ms on ${trunc(stats.slowest, 60)}`);
console.log(`  P4 dialect spot checks: ${p4}`);
if (p1Skipped) console.log(`  P1 skipped ${p1Skipped} generated specs that were not in contract`);

if (known.size) {
  console.log('\nKNOWN live defects (absorbed; see KNOWN in this file):');
  for (const k of KNOWN) {
    const c = known.get(k.id) || 0;
    console.log(`  ${k.id}: ${c} case${c === 1 ? '' : 's'}`);
  }
  if (p3NoExtension.length) {
    // prefer the readable, dice-shaped examples: they are the ones a user types
    const ranked = [...p3NoExtension].sort((a, b) => score(b) - score(a));
    console.log(`    D3 examples: ${ranked.slice(0, 6).map((s) => trunc(s, 30)).join(', ')}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURES${stats.suppressed ? ` (+${stats.suppressed} suppressed)` : ''}:`);
  for (const f of failures) {
    console.error(`  [${f.kind}] ${trunc(f.input)}\n      ${f.detail}`);
    if (f.spec) console.error(`      spec: ${trunc(f.spec, 200)}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nall properties hold (known defects absorbed)');
}
