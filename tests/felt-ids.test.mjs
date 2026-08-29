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

// tests/felt-ids.test.mjs — the felt id list exists THREE TIMES and nothing
// checked that the copies agreed.
//
//   js/main.js      FELT_THEMES — the client's rows: what the picker OFFERS
//   server.js       FELT_THEMES — what a room's settings patch is ALLOWED
//   js/portable.js  FELT_THEMES — what a portable rack may CARRY
//
// The copies are deliberate (portable.js's own header says so: "mirrored by
// hand from server.js SETTING_SPECS... Adding a felt or a system there means
// adding it here"), and hand-mirrored lists drift. The failure is quiet and
// asymmetric, which is what makes it worth a test rather than care:
//
//   * in main but not server  — the swatch is in the picker, the click sends
//     a patch, the server 400s it, and the felt silently will not stick for
//     anyone at a shared table. Solo, it works. That is the worst shape.
//   * in main but not portable — the felt exports and comes back as the
//     default, so a saved table quietly loses its surface.
//   * in server/portable but not main — a value the client cannot render can
//     arrive over the wire from a client that can.
//
// Read from SOURCE rather than imported, deliberately: js/main.js is a browser
// module that builds a scene on evaluation and server.js starts listening, so
// neither can be imported into a unit test. static-cache.test.mjs already
// establishes source-reading as the idiom here.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    process.exitCode = 1;
    console.error(`FAIL ${name}\n  ${e.message}`);
  }
};

// `const FELT_THEMES = ['a', 'b', ...];` — the array literal both mirrors use.
function arrayList(src, file) {
  const m = src.match(/const FELT_THEMES = \[([\s\S]*?)\];/);
  assert.ok(m, `${file}: no FELT_THEMES array literal found — did it move or change shape?`);
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

// `const FELT_THEMES = { id: { ... }, ... };` — the client's object of rows.
function objectKeys(src, file) {
  const at = src.indexOf('const FELT_THEMES = {');
  assert.ok(at >= 0, `${file}: no FELT_THEMES object found`);
  // Walk to the matching brace so a nested row cannot end the scan early.
  let i = src.indexOf('{', at);
  let depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > 0, `${file}: FELT_THEMES object is unterminated`);
  const body = src.slice(src.indexOf('{', at) + 1, end);
  // Top-level keys only: skip anything nested inside a row.
  const ids = [];
  let d = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (d === 0) {
      const km = trimmed.match(/^([a-z][a-zA-Z0-9_]*)\s*:/);
      if (km) ids.push(km[1]);
    }
    d += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  }
  return ids;
}

const client = objectKeys(read('js/main.js'), 'js/main.js');
const server = arrayList(read('server.js'), 'server.js');
const portable = arrayList(read('js/portable.js'), 'js/portable.js');

t('the parser actually found the lists', () => {
  // Guard the guard: three empty lists agree perfectly and prove nothing, and
  // a regex that stops matching after a refactor fails exactly that way.
  assert.ok(client.length >= 9, `client list looks wrong: ${client.join(', ')}`);
  assert.ok(server.length >= 9, `server list looks wrong: ${server.join(', ')}`);
  assert.ok(portable.length >= 9, `portable list looks wrong: ${portable.join(', ')}`);
  for (const id of [...client, ...server, ...portable]) {
    assert.match(id, /^[a-z][a-z0-9]*$/, `"${id}" does not look like a felt id`);
  }
});

t('every felt the picker offers, the server accepts', () => {
  const missing = client.filter((id) => !server.includes(id));
  assert.deepEqual(missing, [],
    `these felts are in the picker but would be 400'd by the server, so they `
    + `work solo and silently fail at a shared table: ${missing.join(', ')}`);
});

t('every felt the picker offers survives a portable rack', () => {
  const missing = client.filter((id) => !portable.includes(id));
  assert.deepEqual(missing, [],
    `these felts would be dropped to the default on export/import: ${missing.join(', ')}`);
});

t('neither mirror carries a felt the client cannot render', () => {
  const extraS = server.filter((id) => !client.includes(id));
  const extraP = portable.filter((id) => !client.includes(id));
  assert.deepEqual(extraS, [], `server accepts felts the client has no row for: ${extraS.join(', ')}`);
  assert.deepEqual(extraP, [], `portable carries felts the client has no row for: ${extraP.join(', ')}`);
});

t("the server's default felt is one it accepts and the client can render", () => {
  const m = read('server.js').match(/default:\s*'([a-z]+)',/);
  assert.ok(m, 'no default felt found in server.js');
  assert.ok(server.includes(m[1]), `server default "${m[1]}" is not in its own allowlist`);
  assert.ok(client.includes(m[1]), `server default "${m[1]}" has no client row`);
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} felt-id tests pass (${client.length} felts: ${client.join(', ')})`);
