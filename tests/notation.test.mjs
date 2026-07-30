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
t('/gmroll sets faceDown, dropped from canonical', () => {
  const r = ok('/gmroll 1d20');
  assert.equal(r.faceDown, true);
  assert.equal(r.canonical, '1d20');
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

// ---- fixed point + rollspec cross-check on random specs --------------------
const rng = (() => { let x = 42; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x80000000; })();
const TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
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
  t(`fixed point #${i}`, () => {
    const c1 = canonicalNotation(spec, {});
    const r = parseNotation(c1);
    assert.equal(r.ok, true, `canonical "${c1}" failed to parse: ${r.error}`);
    assert.equal(r.canonical, c1, `not a fixed point: "${c1}" -> "${r.canonical}"`);
    assert.ok(specEquals(spec, r.spec), `spec drift for "${c1}"`);
    assert.equal(validateMods(r.spec.dice, r.spec.mods), null, `validateMods rejects "${c1}"`);
    // composition must not throw
    composeRoll(r.spec.dice, r.spec.mods, rng);
  });
}

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} notation tests pass`);
