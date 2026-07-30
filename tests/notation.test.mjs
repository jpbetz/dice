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

import assert from 'node:assert/strict';
import { parseNotation, canonicalNotation, specEquals } from '../js/notation.js';
import { validateMods, composeRoll } from '../js/rollspec.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};
const ok = (s) => {
  const r = parseNotation(s);
  assert.equal(r.ok, true, `expected ok for "${s}": ${r.error} `);
  return r;
};
const bad = (s, state = 'invalid') => {
  const r = parseNotation(s);
  assert.equal(r.ok, false, `expected failure for "${s}"`);
  assert.equal(r.state, state, `expected ${state} for "${s}", got ${r.state} (${r.error})`);
  return r;
};

// ---- UX.md §1.1 canonical examples: byte-identical round-trips -------------
for (const s of [
  '1d20ro<=1+3 adv dc15 # The lie leaves your lips',
  '4d6dl1',
  '3d6+1d20+5 ro<=2 ! dc15 # Firebolt',
]) {
  t(`canonical example round-trips: ${s}`, () => {
    const r = ok(s);
    assert.equal(r.canonical, s);
    const r2 = ok(r.canonical);
    assert.equal(r2.canonical, s);
    assert.ok(specEquals(r.spec, r2.spec));
  });
}

// ---- flagship semantics ----------------------------------------------------
t('flagship parses fully', () => {
  const r = ok('1d20ro<=1+3 adv dc15 # The lie leaves your lips');
  assert.deepEqual(r.spec.dice, ['d20']);
  assert.equal(r.spec.mods.modifier, 3);
  assert.deepEqual(r.spec.mods.reroll, { below: 1, once: true });
  assert.equal(r.spec.mods.adv, 'adv');
  assert.equal(r.dc, 15);
  assert.equal(r.comment, 'The lie leaves your lips');
  assert.equal(r.faceDown, false);
});

// ---- Roll20 paste corpus ---------------------------------------------------
t('2d20kh1+5 collapses to adv', () => {
  const r = ok('2d20kh1+5');
  assert.deepEqual(r.spec.dice, ['d20']);
  assert.equal(r.spec.mods.adv, 'adv');
  assert.equal(r.spec.mods.modifier, 5);
  assert.equal(r.canonical, '1d20+5 adv');
});
t('2d20kl1 collapses to dis', () => {
  const r = ok('2d20kl1');
  assert.equal(r.spec.mods.adv, 'dis');
  assert.equal(r.canonical, '1d20 dis');
});
t('2d20kh1+1d4 collapse beats mixed-pool check', () => {
  const r = ok('2d20kh1+1d4');
  assert.deepEqual([...r.spec.dice].sort(), ['d20', 'd4'].sort());
  assert.equal(r.spec.mods.adv, 'adv');
});
t('explicit adv/dis flag suppresses the 2d20 keep collapse', () => {
  // the literal pool survives: two d20s, keep 1, plus the flag
  for (const [s, adv] of [['2d20kh1 adv', 'adv'], ['2d20kh1 dis', 'dis'], ['2d20kl1 adv', 'adv']]) {
    const r = ok(s);
    assert.deepEqual(r.spec.dice, ['d20', 'd20'], s);
    assert.equal(r.spec.mods.adv, adv, s);
    assert.equal(r.spec.mods.keep.n, 1, s);
    assert.equal(validateMods(r.spec.dice, r.spec.mods), null, s);
  }
});
t('2d20 keep-1 specs render as trailing flag and round-trip', () => {
  for (const mods of [
    { keep: { mode: 'kh', n: 1 } },
    { adv: 'adv', keep: { mode: 'kh', n: 1 } },
    { adv: 'dis', keep: { mode: 'kh', n: 1 } },
    { adv: 'adv', keep: { mode: 'kl', n: 1 } },
  ]) {
    const spec = { dice: ['d20', 'd20'], mods };
    assert.equal(validateMods(spec.dice, spec.mods), null);
    const c = canonicalNotation(spec, {});
    const r = ok(c);
    assert.equal(r.canonical, c, `not a fixed point: "${c}" -> "${r.canonical}"`);
    assert.ok(specEquals(spec, r.spec), `spec drift through "${c}"`);
  }
  // the bare glued form still collapses as designed
  assert.equal(ok('2d20kh1').canonical, '1d20 adv');
  // dh/dl and n=2+ never collapsed and stay glued
  assert.equal(canonicalNotation({ dice: ['d20', 'd20'], mods: { keep: { mode: 'dh', n: 1 } } }), '2d20dh1');
  assert.equal(ok('2d20dh1').canonical, '2d20dh1');
});
t('r<2 normalizes inclusively to ro<=2', () => {
  const r = ok('3d6r<2');
  assert.deepEqual(r.spec.mods.reroll, { below: 2, once: true });
  assert.equal(r.canonical, '3d6ro<=2');
  assert.ok(r.warnings.some((w) => w.includes('once per die')));
});
// EDITED for UX.md §7.6 / roadmap step 1: face-down now round-trips through
// the canonical 'held' flag instead of being silently dropped (the audited
// notation-totality violation this slice closes).
t('/gmroll sets faceDown, normalized to the held flag in canonical', () => {
  const r = ok('/gmroll 1d20');
  assert.equal(r.faceDown, true);
  assert.equal(r.canonical, '1d20 held');
  const r2 = ok(r.canonical);
  assert.equal(r2.faceDown, true);
  assert.equal(r2.canonical, '1d20 held');
});
t('/roll is a no-op prefix', () => {
  const r = ok('/roll 2d6+1');
  assert.equal(r.faceDown, false);
  assert.equal(r.canonical, '2d6+1');
});
t('d% expands to d10x+d10 and renders d100', () => {
  const r = ok('d%');
  assert.deepEqual([...r.spec.dice].sort(), ['d10', 'd10x']);
  assert.equal(r.canonical, 'd100');
});
t('d100 same', () => {
  const r = ok('d100');
  assert.equal(r.canonical, 'd100');
});
t('2d100 expands to 2+2 and does not render d100', () => {
  const r = ok('2d100');
  assert.equal(r.spec.dice.filter((x) => x === 'd10x').length, 2);
  assert.equal(r.canonical, '2d10+2d10x');
});
t('8d6! exploding fireball', () => {
  const r = ok('8d6!');
  assert.equal(r.spec.mods.explode, true);
  assert.equal(r.canonical, '8d6!');
});
t('bare k and d aliases', () => {
  assert.deepEqual(ok('4d6k3').spec.mods.keep, { mode: 'kh', n: 3 });
  assert.deepEqual(ok('4d6d1').spec.mods.keep, { mode: 'dl', n: 1 });
});

// ---- attributed parts (§7.2) ----------------------------------------------
t('labeled parts parse and render in order', () => {
  const r = ok('1d20+2[Proficiency]+1[Guidance]');
  assert.equal(r.spec.mods.modifier, 3);
  assert.deepEqual(r.spec.mods.parts, [
    { label: 'Proficiency', value: 2 },
    { label: 'Guidance', value: 1 },
  ]);
  assert.equal(r.canonical, '1d20+2[Proficiency]+1[Guidance]');
});
t('anonymous remainder joins parts', () => {
  const r = ok('1d20+2[Proficiency]+3');
  assert.deepEqual(r.spec.mods.parts, [
    { label: 'Proficiency', value: 2 },
    { label: '', value: 3 },
  ]);
  assert.equal(r.spec.mods.modifier, 5);
});
t('negative labeled part', () => {
  const r = ok('1d20-2[Bane]');
  assert.deepEqual(r.spec.mods.parts, [{ label: 'Bane', value: -2 }]);
  assert.equal(r.canonical, '1d20-2[Bane]');
});
t('label on a dice term is dropped with warning', () => {
  const r = ok('2d6[fire]+1');
  assert.equal(r.spec.mods.parts ?? null, null);
  assert.ok(r.warnings.some((w) => w.includes('dropped')));
});
t('parts satisfy rollspec.validateMods', () => {
  const r = ok('1d20+2[Proficiency]+1[Guidance]');
  assert.equal(validateMods(r.spec.dice, r.spec.mods), null);
});

// ---- mixed-pool scoping rule ----------------------------------------------
t('glued keep in mixed pool is invalid with hint', () => {
  const r = bad('4d6dl1+1d20');
  assert.ok(r.hint.includes('trailing'));
});
t('glued reroll in mixed pool is invalid', () => bad('3d6ro<=2+1d20'));
t('glued explode in mixed pool is invalid', () => bad('8d6!+1d20'));
t('trailing flags in mixed pool are valid; canonical sorts d4→d20', () => {
  const r = ok('1d20+2d6 dl1');
  assert.deepEqual(r.spec.mods.keep, { mode: 'dl', n: 1 });
  assert.equal(r.canonical, '2d6+1d20 dl1');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});

// ---- incomplete vs invalid -------------------------------------------------
for (const s of ['4d', '1d20 k', '1d20 dc', '3d6+', '1d20 ro<=', '2', '5+5', '1d20 a', '/gm', '1d2', '+3[Gui']) {
  t(`incomplete: "${s}"`, () => bad(s, 'incomplete'));
}
for (const s of ['xyzzy', '1d7', '0d6', '41d6', 'd6 potato', '1d20 dc0', '1d20 dc1000', '5 dl1', '1d20 adv adv', '4d6dl4', '1d6 adv', '61d6-99']) {
  t(`invalid: "${s}"`, () => bad(s, 'invalid'));
}
t('empty is incomplete', () => bad('', 'incomplete'));
t('comment alone is incomplete', () => bad('# hi', 'incomplete'));

// ---- limits ----------------------------------------------------------------
t('41 dice via terms rejected', () => bad('40d6+1d4'));
t('modifier cap', () => bad('1d20+99+1'));
t('per-part cap: labeled terms and the anonymous remainder fit ±99', () => {
  bad('1d20+100[A]-1[B]');          // single labeled term over the cap
  bad('1d20+150[Buff]-60');         // sum in range, part out of range
  bad('1d20-99[A]+99+99');          // derived anonymous remainder = 198
  bad('1d20-999[A]+999+99');        // remainder would leave the grammar
  const r = ok('1d20+99[A]-99');    // both parts exactly at the cap
  assert.equal(validateMods(r.spec.dice, r.spec.mods), null);
});
t('truncation is idempotent: no trailing whitespace survives the cut', () => {
  const long = ok('1d20 # ' + 'a'.repeat(63) + ' bbbb');
  assert.equal(long.comment, 'a'.repeat(63));
  assert.equal(ok(long.canonical).canonical, long.canonical);
  const lab = ok('1d20+2[' + 'a'.repeat(19) + ' bb]');
  assert.equal(lab.spec.mods.parts[0].label, 'a'.repeat(19));
  assert.ok(specEquals(lab.spec, ok(lab.canonical).spec));
  // a control char must not shield whitespace from the trim
  const shielded = ok('1d20 #\u0000 hi');
  assert.equal(shielded.comment, 'hi');
  // zero-width and bidi controls are stripped everywhere
  assert.equal(ok('1d20 # a\u200bb\u202ec').comment, 'abc');
  assert.equal(ok('1d20+2[e\u202evil]').spec.mods.parts[0].label, 'evil');
});
t('dc range', () => {
  assert.equal(ok('1d20 dc999').dc, 999);
  bad('1d20 dc0');
});
t('dc split form', () => assert.equal(ok('1d20 dc 15').dc, 15));
t('vs alias', () => assert.equal(ok('1d20 vs15').canonical, '1d20 dc15'));
t('comment cap 64', () => {
  const r = ok('1d20 # ' + 'x'.repeat(100));
  assert.equal(r.comment.length, 64);
});
t('hostile junk never ok', () => {
  for (const s of ['🎲🎲', ']][[', '1d20]]', 'd[', '((1d20))', '1d20;drop table', ' ', 'NaNdNaN']) {
    const r = parseNotation(s);
    assert.equal(r.ok, false, `"${s}" should not parse`);
  }
});
t('10KB string rejected fast', () => bad('1d20+'.repeat(2000)));

// ---- moment kind flags: check / cinematic / cine (UX.md §7.6) --------------
t('check flag parses to exp and round-trips', () => {
  const r = ok('1d20 check');
  assert.deepEqual(r.exp, { kind: 'check' });
  assert.equal(r.canonical, '1d20 check');
  assert.equal(ok(r.canonical).canonical, '1d20 check');
});
t('cinematic flag parses to exp', () => {
  const r = ok('1d20 cinematic');
  assert.deepEqual(r.exp, { kind: 'cinematic' });
  assert.equal(r.canonical, '1d20 cinematic');
});
t('cine is an input alias, normalized to cinematic', () => {
  const r = ok('1d20 cine');
  assert.deepEqual(r.exp, { kind: 'cinematic' });
  assert.equal(r.canonical, '1d20 cinematic');
});
t('kind flags are case-insensitive', () => {
  assert.equal(ok('1d20 CHECK').exp.kind, 'check');
  assert.equal(ok('1d20 Cine').exp.kind, 'cinematic');
});
t('plain rolls have exp null', () => {
  assert.equal(ok('1d20').exp, null);
  assert.equal(ok('4d6dl1').exp, null);
});
t('NO parse-level dc→check implication', () => {
  const r = ok('1d20 dc15');
  assert.equal(r.exp, null);
  assert.equal(r.dc, 15);
  assert.equal(r.canonical, '1d20 dc15');
});
t('kind specified twice is invalid, including mixed spellings', () => {
  bad('1d20 check check');
  bad('1d20 check cinematic');
  bad('1d20 cine check');
  bad('1d20 cinematic cine');
});
t('kind renders after adv/dis and trailing mods, before dc', () => {
  assert.equal(ok('1d20 check adv').canonical, '1d20 adv check');
  assert.equal(ok('1d20 dc15 check').canonical, '1d20 check dc15');
  assert.equal(ok('1d20+2d6 dl1 check').canonical, '2d6+1d20 dl1 check');
  assert.equal(ok('1d20 check adv dc15 # Persuasion').canonical, '1d20 adv check dc15 # Persuasion');
});
t('flagship §7.6 example: adv check dc comment', () => {
  const s = '1d20ro<=1+3 adv check dc15 # The lie leaves your lips';
  const r = ok(s);
  assert.equal(r.canonical, s);
  assert.deepEqual(r.exp, { kind: 'check' });
});

// ---- held flag + /gmroll-family normalization ------------------------------
t('held flag sets faceDown and round-trips', () => {
  const r = ok('1d20 held');
  assert.equal(r.faceDown, true);
  assert.equal(r.canonical, '1d20 held');
  assert.equal(ok(r.canonical).faceDown, true);
});
t('all four face-down prefixes normalize to the held flag', () => {
  for (const p of ['/gmroll', '/gmr', '/selfroll', '/sr']) {
    const r = ok(`${p} 1d20`);
    assert.equal(r.faceDown, true, p);
    assert.equal(r.canonical, '1d20 held', p);
  }
});
t('prefix plus held flag agree, not a duplicate', () => {
  const r = ok('/gmroll 1d20 held');
  assert.equal(r.faceDown, true);
  assert.equal(r.canonical, '1d20 held');
});
t('held twice is invalid', () => bad('1d20 held held'));
t('held renders after the kind flag, before dc', () => {
  assert.equal(ok('1d20 held check').canonical, '1d20 check held');
  assert.equal(ok('1d20 held dc9').canonical, '1d20 held dc9');
});
t('canonical flag order: [adv] [keep] [reroll] [!] [kind] [held] [dc] [#]', () => {
  const r = ok('1d20+2d6 dc12 held cine ! ro<=2 dl1 adv # T | S');
  assert.equal(r.canonical, '2d6+1d20 adv dl1 ro<=2 ! cinematic held dc12 # T | S');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});
t('kind/held produce no warnings', () => {
  assert.deepEqual(ok('1d20 check held').warnings, []);
});

// ---- comment pipe: '# Title | Subtitle' ------------------------------------
t('pipe splits title and subtitle; subtitle rides exp', () => {
  const r = ok('1d20 check # Deception | CHARISMA CHECK');
  assert.equal(r.comment, 'Deception');
  assert.deepEqual(r.exp, { kind: 'check', subtitle: 'CHARISMA CHECK' });
  assert.equal(r.canonical, '1d20 check # Deception | CHARISMA CHECK');
});
t('pipe spacing normalizes to " | "', () => {
  assert.equal(ok('1d20 check # Title|Subtitle').canonical, '1d20 check # Title | Subtitle');
  assert.equal(ok('1d20 check # Title   |   Subtitle').canonical, '1d20 check # Title | Subtitle');
});
t('only the FIRST unescaped pipe splits; later pipes stay in the subtitle', () => {
  const r = ok('1d20 check # t | a|b');
  assert.equal(r.comment, 't');
  assert.equal(r.exp.subtitle, 'a|b');
  assert.equal(r.canonical, '1d20 check # t | a\\|b');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});
t('escaped \\| is a literal pipe in the title and round-trips', () => {
  const r = ok('1d20 # a \\| b');
  assert.equal(r.comment, 'a | b');
  assert.equal(r.exp, null);
  assert.equal(r.canonical, '1d20 # a \\| b');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});
t('escaped pipe in title beside a real subtitle split', () => {
  const r = ok('1d20 check # t \\| x | s');
  assert.equal(r.comment, 't | x');
  assert.equal(r.exp.subtitle, 's');
  assert.equal(r.canonical, '1d20 check # t \\| x | s');
});
t('escaped pipe in the subtitle round-trips', () => {
  const r = ok('1d20 check # t | a \\| b');
  assert.equal(r.exp.subtitle, 'a | b');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});
t('subtitle-only comment: empty title round-trips as "# | S"', () => {
  const r = ok('1d20 check # | sub');
  assert.equal(r.comment, null);
  assert.deepEqual(r.exp, { kind: 'check', subtitle: 'sub' });
  assert.equal(r.canonical, '1d20 check # | sub');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});
t('pipe-only comment title of a lone literal pipe', () => {
  const r = ok('1d20 # \\|');
  assert.equal(r.comment, '|');
  assert.equal(r.canonical, '1d20 # \\|');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});

// ---- subtitle caps and sanitation ------------------------------------------
t('subtitle cap 40, sliced and trimmed idempotently', () => {
  const r = ok('1d20 check # t | ' + 'a'.repeat(39) + ' bbbb');
  assert.equal(r.exp.subtitle, 'a'.repeat(39));
  assert.equal(ok(r.canonical).canonical, r.canonical);
  const exact = ok('1d20 check # t | ' + 'x'.repeat(40) + 'yyy');
  assert.equal(exact.exp.subtitle.length, 40);
});
t('title cap stays 64 with a pipe present', () => {
  const r = ok('1d20 check # ' + 'a'.repeat(100) + ' | sub');
  assert.equal(r.comment, 'a'.repeat(64));
  assert.equal(r.exp.subtitle, 'sub');
  assert.equal(ok(r.canonical).canonical, r.canonical);
});
t('subtitle strips control, zero-width and bidi characters', () => {
  assert.equal(ok('1d20 check # t | a​b‮c').exp.subtitle, 'abc');
  assert.equal(ok('1d20 check # t |  hi').exp.subtitle, 'hi');
});
t('cap slice cannot split an escape pair (caps measured on unescaped text)', () => {
  // 33 literal pipes = 66 escaped input chars; unescaped length 33 ≤ 40
  const pipes = '\\|'.repeat(33);
  const r = ok('1d20 check # t | ' + pipes);
  assert.equal(r.exp.subtitle, '|'.repeat(33));
  assert.equal(ok(r.canonical).canonical, r.canonical);
});

// ---- subtitle requires a kind flag -----------------------------------------
t('subtitle without check/cinematic is invalid with the pinned message', () => {
  const r = bad('1d20 # a | b');
  assert.equal(r.error, 'a subtitle needs check or cinematic');
  assert.ok(r.hint.includes('check'));
});
t('held does not rescue a kindless subtitle', () => bad('1d20 held # a | b'));
t('dc does not rescue a kindless subtitle (no dc→check implication)', () => bad('1d20 dc15 # a | b'));
t('/gmroll does not rescue a kindless subtitle', () => bad('/gmroll 1d20 # a | b'));

// ---- incomplete states for partial new tokens ------------------------------
// (note '1d20 cine' is absent: it is a COMPLETE command via the alias)
for (const s of ['1d20 c', '1d20 ch', '1d20 che', '1d20 chec', '1d20 cin', '1d20 cinem', '1d20 cinemati', '1d20 h', '1d20 he', '1d20 hel']) {
  t(`incomplete new-token prefix: "${s}"`, () => bad(s, 'incomplete'));
}
for (const s of ['1d20 # t |', '1d20 check # t |', '1d20 # |', '1d20 check # t |   ', '1d20 check # t | ']) {
  t(`incomplete empty subtitle: "${s}"`, () => bad(s, 'incomplete'));
}
t('non-final partial keyword is invalid, not incomplete', () => {
  bad('1d20 che adv');
  bad('1d20 hel dc15');
});
t('near-miss keywords are invalid', () => {
  for (const s of ['1d20 checked', '1d20 checkk', '1d20 helds', '1d20 cines', '1d20 cinematics']) bad(s);
});

// ---- canonicalNotation extras: {dc, comment, exp, faceDown} ----------------
t('canonicalNotation renders the new extras directly', () => {
  const d20 = { dice: ['d20'], mods: null };
  assert.equal(canonicalNotation(d20, { faceDown: true }), '1d20 held');
  assert.equal(canonicalNotation(d20, { exp: { kind: 'check' } }), '1d20 check');
  assert.equal(canonicalNotation(d20, { exp: { kind: 'cinematic', subtitle: 'S' } }), '1d20 cinematic # | S');
  assert.equal(
    canonicalNotation(d20, { dc: 15, comment: 'T', exp: { kind: 'check', subtitle: 'S' }, faceDown: true }),
    '1d20 check held dc15 # T | S'
  );
  // pipes in wire-supplied text are escaped so the canonical re-parses
  assert.equal(canonicalNotation(d20, { comment: 'a|b' }), '1d20 # a\\|b');
  assert.equal(ok('1d20 # a\\|b').comment, 'a|b');
  // old two-key extras callers are untouched
  assert.equal(canonicalNotation(d20, { dc: 5, comment: 'hi' }), '1d20 dc5 # hi');
  assert.equal(canonicalNotation(d20, {}), '1d20');
});

// ---- fixed point + rollspec cross-check on random specs --------------------
// EXTENDED for UX.md §7.6: extras now exercise dc, comment (incl. literal
// pipes), exp {kind, subtitle?} and faceDown alongside every random spec.
const rng = (() => { let x = 42; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x80000000; })();
const TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
const GEN_COMMENTS = ['Firebolt', 'The lie leaves your lips', 'a|b', '|', 'to hit', 'x \\ y', 'Sneak Attack!'];
const GEN_SUBTITLES = ['CHARISMA CHECK', 'DEX SAVE', 'a|b', '|x', 'S', 'WISDOM (PERCEPTION)'];
for (let i = 0; i < 500; i++) {
  const single = rng() < 0.5;
  const dice = [];
  const typeCount = single ? 1 : 2 + Math.floor(rng() * 2);
  const chosen = [...TYPES].sort(() => rng() - 0.5).slice(0, typeCount);
  for (const ty of chosen) {
    const c = 1 + Math.floor(rng() * 4);
    for (let k = 0; k < c; k++) dice.push(ty);
  }
  const mods = {};
  if (rng() < 0.5) mods.modifier = Math.floor(rng() * 21) - 10;
  if (rng() < 0.3 && dice.includes('d20')) mods.adv = rng() < 0.5 ? 'adv' : 'dis';
  if (rng() < 0.3 && dice.length > 1) mods.keep = { mode: ['kh', 'kl', 'dh', 'dl'][Math.floor(rng() * 4)], n: 1 + Math.floor(rng() * (dice.length - 1)) };
  if (rng() < 0.3) mods.reroll = { below: 1 + Math.floor(rng() * 3), once: true };
  if (rng() < 0.3) mods.explode = true;
  if (mods.modifier === 0) delete mods.modifier;
  const spec = { dice, mods: Object.keys(mods).length ? mods : null };
  const extras = {};
  if (rng() < 0.35) extras.dc = 1 + Math.floor(rng() * 999);
  if (rng() < 0.35) extras.comment = GEN_COMMENTS[Math.floor(rng() * GEN_COMMENTS.length)];
  if (rng() < 0.4) {
    extras.exp = { kind: rng() < 0.5 ? 'check' : 'cinematic' };
    if (rng() < 0.6) extras.exp.subtitle = GEN_SUBTITLES[Math.floor(rng() * GEN_SUBTITLES.length)];
  }
  if (rng() < 0.3) extras.faceDown = true;
  t(`fixed point #${i}`, () => {
    const c1 = canonicalNotation(spec, extras);
    const r = parseNotation(c1);
    assert.equal(r.ok, true, `canonical "${c1}" failed to parse: ${r.error}`);
    assert.equal(r.canonical, c1, `not a fixed point: "${c1}" -> "${r.canonical}"`);
    assert.ok(specEquals(spec, r.spec), `spec drift for "${c1}"`);
    assert.equal(r.dc, extras.dc ?? null, `dc drift through "${c1}"`);
    assert.equal(r.comment, extras.comment ?? null, `comment drift through "${c1}"`);
    assert.deepEqual(r.exp, extras.exp ?? null, `exp drift through "${c1}"`);
    assert.equal(r.faceDown, extras.faceDown ?? false, `faceDown drift through "${c1}"`);
    assert.equal(validateMods(r.spec.dice, r.spec.mods), null, `validateMods rejects "${c1}"`);
    // composition must not throw
    composeRoll(r.spec.dice, r.spec.mods, rng);
  });
}

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} notation tests pass`);
