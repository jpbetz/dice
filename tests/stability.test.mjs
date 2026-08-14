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

// tests/stability.test.mjs — the closed-beta channel's PRECEDENCE (js/
// stability.js). The resolver is pure so this half can be proven without a
// browser; the half that touches localStorage, history.replaceState and the
// settings panel is the `stability-gate` e2e scenario.
//
// The load-bearing claims: the default is STABLE (a fresh browser is a
// production browser — the failure mode worth refusing is a new player who
// gets beta by accident); a valid param BEATS the store in both directions,
// so the revoke link works and is not a one-way door; a param nobody can read
// changes nothing but is STILL STRIPPED, because a param left in the address
// bar is a param that gets shared; and a stored value of the wrong shape is
// not a value.

import assert from 'node:assert/strict';
import { resolveChannel, isChannel, CHANNELS, DEFAULT_CHANNEL, PARAM } from '../js/stability.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

t('the param is the name Joe asked for, and the default is production', () => {
  assert.equal(PARAM, 'stability');
  assert.equal(DEFAULT_CHANNEL, 'stable');
  assert.deepEqual([...CHANNELS], ['stable', 'beta']);
});

t('a fresh browser with no param is STABLE, and writes nothing', () => {
  const d = resolveChannel({ stored: null, param: null });
  assert.equal(d.channel, 'stable');
  assert.equal(d.write, null);
  // No param, no rewrite: replaceState on every boot would be a history
  // entry's worth of churn for nothing, and would fight ?room=.
  assert.equal(d.strip, false);
});

t('?stability=beta redeems, persists, and leaves the URL', () => {
  const d = resolveChannel({ stored: null, param: 'beta' });
  assert.equal(d.channel, 'beta');
  assert.equal(d.write, 'beta');
  assert.equal(d.strip, true);
});

t('a redeemed browser stays beta on later boots with no param', () => {
  const d = resolveChannel({ stored: 'beta', param: null });
  assert.equal(d.channel, 'beta');
  assert.equal(d.write, null, 'the store already agrees — do not rewrite it');
  assert.equal(d.strip, false);
});

t('?stability=stable revokes — the door opens both ways', () => {
  const d = resolveChannel({ stored: 'beta', param: 'stable' });
  assert.equal(d.channel, 'stable');
  assert.equal(d.write, 'stable');
  assert.equal(d.strip, true);
});

t('the param beats the store, so a link can show you the other channel', () => {
  assert.equal(resolveChannel({ stored: 'stable', param: 'beta' }).channel, 'beta');
  assert.equal(resolveChannel({ stored: 'beta', param: 'stable' }).channel, 'stable');
});

t('re-redeeming a channel you already hold is a no-op write', () => {
  const d = resolveChannel({ stored: 'beta', param: 'beta' });
  assert.equal(d.channel, 'beta');
  assert.equal(d.write, null);
  assert.equal(d.strip, true, 'but it still comes out of the URL');
});

t('capitalisation and stray whitespace survive a chat client', () => {
  // Links get mangled: capitalised by phone keyboards, padded by copy-paste
  // out of a message. A beta invite that fails on '?stability=Beta' costs a
  // support conversation and teaches nothing.
  for (const p of ['BETA', ' beta', 'Beta ', '\tbeta\n']) {
    assert.equal(resolveChannel({ stored: null, param: p }).channel, 'beta', p);
  }
});

t('an unreadable param changes nothing — but is still stripped', () => {
  for (const p of ['', 'yes', 'true', 'alpha', 'beta2', '../beta']) {
    const d = resolveChannel({ stored: 'beta', param: p });
    assert.equal(d.channel, 'beta', `${p}: the held channel survives`);
    assert.equal(d.write, null, `${p}: nothing to persist`);
    assert.equal(d.strip, true, `${p}: a param left in the bar is a param shared`);
  }
  // …and it cannot promote a stable browser by being noisy.
  assert.equal(resolveChannel({ stored: null, param: 'beta!' }).channel, 'stable');
});

t('a stored value of the wrong shape is not a value', () => {
  // The storage-poisoning population main.js's load() was hardened for
  // (2026-08-09): valid JSON of the wrong type used to sail through.
  for (const s of ['', 'BETA', 'alpha', 0, 1, true, {}, [], null, undefined, 'null']) {
    assert.equal(resolveChannel({ stored: s, param: null }).channel, 'stable',
      `stored ${JSON.stringify(s)} must fall back to production`);
  }
});

// ── The mirror lane (the 2026-08-14 field loss: enrolment gone, every other
// key intact, nothing on screen to say why) ────────────────────────────────

t('a lost store is healed from the mirror — the loss that was silent', () => {
  const d = resolveChannel({ stored: null, mirror: 'beta', param: null });
  assert.equal(d.channel, 'beta', 'the enrolment survives losing the store');
  assert.equal(d.write, 'beta', 'and the store is put back');
  assert.equal(d.mirror, 'beta', 'and the mirror is re-laid, not merely read');
  assert.equal(d.strip, false);
});

t('a beta boot re-lays the mirror even when nothing was lost', () => {
  // Existing beta testers get the second lane on their next boot with no
  // param — and Safari, which ages script cookies out in days, gets it back.
  const d = resolveChannel({ stored: 'beta', mirror: null, param: null });
  assert.equal(d.channel, 'beta');
  assert.equal(d.write, null);
  assert.equal(d.mirror, 'beta');
});

t('the store outranks the mirror — revocation is not undone by a stale cookie', () => {
  const d = resolveChannel({ stored: 'stable', mirror: 'beta', param: null });
  assert.equal(d.channel, 'stable');
  assert.equal(d.write, null);
  assert.equal(d.mirror, '', 'and the stale mirror is taken out, so a later '
    + 'store loss cannot resurrect the beta');
});

t('revoking by param clears both lanes', () => {
  const d = resolveChannel({ stored: 'beta', mirror: 'beta', param: 'stable' });
  assert.equal(d.channel, 'stable');
  assert.equal(d.write, 'stable');
  assert.equal(d.mirror, '');
  assert.equal(d.strip, true);
});

t('a virgin browser is stamped by neither lane', () => {
  // Keyless IS production: absence must keep meaning "never asked".
  const d = resolveChannel({ stored: null, mirror: null, param: null });
  assert.equal(d.write, null);
  assert.equal(d.mirror, null);
});

t('an unreadable mirror is not a value — and is cleared, not left to rot', () => {
  for (const m of ['', 'Beta', 'beta!', 'alpha', '1']) {
    const d = resolveChannel({ stored: null, mirror: m, param: null });
    assert.equal(d.channel, 'stable', `mirror ${JSON.stringify(m)} cannot promote`);
    assert.equal(d.write, null, `mirror ${JSON.stringify(m)} writes nothing`);
    assert.equal(d.mirror, '', `mirror ${JSON.stringify(m)} is swept out`);
  }
  // …and a mirror that validly says 'stable' says nothing a keyless browser
  // does not already say: cleared, never copied into the store.
  const d = resolveChannel({ stored: null, mirror: 'stable', param: null });
  assert.equal(d.channel, 'stable');
  assert.equal(d.write, null);
  assert.equal(d.mirror, '');
});

t('resolveChannel survives being called with nothing at all', () => {
  // main.js reads localStorage inside a try; a browser that refuses storage
  // hands this function undefined for both fields and must still boot.
  const d = resolveChannel();
  assert.equal(d.channel, 'stable');
  assert.equal(d.write, null);
  assert.equal(d.strip, false);
});

t('isChannel is the shape gate the app shares with this test', () => {
  assert.equal(isChannel('beta'), true);
  assert.equal(isChannel('stable'), true);
  assert.equal(isChannel('Beta'), false, 'the resolver normalises; the gate does not');
  assert.equal(isChannel(undefined), false);
  assert.equal(isChannel(['beta']), false);
});

console.log(`stability: ${n} assertions run`);
