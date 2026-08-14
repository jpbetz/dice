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

// SHIP A BAKED MODEL — the three edits as ONE reviewed diff (ROADMAP T7).
//
//   node tools/forge/promote.mjs <slug> [<slug>…]
//   node tools/forge/promote.mjs --check          # verify, change nothing
//
// A bake is not a ship. Moving a GLB from `tools/forge/out/` to where the
// server hands it out takes three separate edits in three files, and an agent
// may do NONE of them: promotion is a main-session act, deliberately, because
// the frozen-mtime production bug lives in exactly this class. But "the human
// act is remembering three files" is how the fourth one gets forgotten, and
// it was: 2026-08-13 the shipped hollowbole models were two commits behind
// their recipe for a morning, found by accident. So the human act becomes
// APPROVING A DIFF instead.
//
// The three edits:
//   1. the bytes            tools/forge/out/<slug>.glb -> its shipped path
//   2. the served-file test tests/static-cache.test.mjs's PROMOTED list
//   3. the digest baseline  tools/forge/digests.json, including `sha`
//
// WHY THE SHA IS THE POINT, and not bookkeeping. `set`/`order` hash the
// GEOMETRY, so they are blind to the exact drift that happened: that round
// added a `doorPad` MARKER — real shipping data, zero triangles moved — and
// every geometry hash matched while the served file went stale. The file hash
// sees it, and `static-cache` compares the SHIPPED file against the baseline,
// so a re-bake nobody promoted now fails the suite rather than the season.
//
// This step is deliberately dumb about WHICH bake is good: it ships whatever
// is in out/, which is why it prints what it is about to do and why the diff
// is the gate. Run the bake's own refusals first (`bake.sh --tower …`).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'tools/forge/out');
const DIGESTS = join(ROOT, 'tools/forge/digests.json');
const CACHE_TEST = join(ROOT, 'tests/static-cache.test.mjs');

// WHERE EACH SLUG SHIPS TO. Two homes, and they are not interchangeable:
// `models/towers/` is served to players, `tests/e2e/fixtures/` is served only
// to the suite. A fixture promoted into models/ would be offerable as a
// tower; a tower promoted into fixtures/ would 404 for every player. Naming
// them here rather than inferring from the slug keeps that a decision.
const HOMES = {
  tower_fixture: 'tests/e2e/fixtures',
  _default: 'models/towers',
};
const homeOf = (slug) => HOMES[slug] || HOMES._default;

const sha16 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);

const args = process.argv.slice(2);
const check = args.includes('--check');
const slugs = args.filter((a) => !a.startsWith('--'));

const digests = JSON.parse(readFileSync(DIGESTS, 'utf8'));

// ---- --check: every SHIPPED file is the file its baseline recorded --------
// The standing claim, and the one a promote step cannot make on its own: a
// promote you forget to run is the bug it was written to prevent.
if (check) {
  let bad = 0;
  for (const [slug, row] of Object.entries(digests)) {
    const shipped = join(ROOT, homeOf(slug), `${slug}.glb`);
    if (!existsSync(shipped)) continue;      // baked, never shipped — fine
    if (!row.sha) {
      console.log(`  ?  ${slug}: shipped, but the baseline has no sha `
        + '(pre-2026-08-14 row — re-bake to stamp one)');
      continue;
    }
    const got = sha16(shipped);
    if (got === row.sha) {
      console.log(`  ok ${slug}: ${homeOf(slug)}/${slug}.glb matches the baseline`);
    } else {
      console.log(`  BAD ${slug}: ${homeOf(slug)}/${slug}.glb is ${got}, `
        + `baseline says ${row.sha} — the served file is not the file the `
        + 'recipe writes. Re-bake and promote, or the baseline is stale.');
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log('\nevery shipped model is the file its recipe wrote.');
  process.exit(0);
}

if (!slugs.length) {
  console.error('usage: node tools/forge/promote.mjs <slug> [<slug>…]\n'
    + '       node tools/forge/promote.mjs --check\n'
    + `  slugs are bake names; ${Object.keys(HOMES).filter((k) => k !== '_default')
      .join(', ')} ship to their own home, everything else to ${HOMES._default}`);
  process.exit(2);
}

const run = existsSync(join(OUT, 'digest.json'))
  ? JSON.parse(readFileSync(join(OUT, 'digest.json'), 'utf8')) : {};

let changed = 0;
for (const slug of slugs) {
  const src = join(OUT, `${slug}.glb`);
  if (!existsSync(src)) {
    console.error(`BAD: ${src} does not exist — bake it first`);
    process.exit(1);
  }
  const home = homeOf(slug);
  const dst = join(ROOT, home, `${slug}.glb`);
  const sha = sha16(src);

  // THE BAKE'S OWN RECORD IS THE AUTHORITY on what this file should be. If
  // the run wrote a digest for this slug and it disagrees with the bytes on
  // disk, something rebuilt out/ behind us and shipping it would ship a file
  // no gate has seen.
  if (run[slug] && run[slug].sha && run[slug].sha !== sha) {
    console.error(`BAD: ${slug}: out/ holds ${sha} but this run's digest.json `
      + `says ${run[slug].sha} — re-bake, do not promote a file no gate saw`);
    process.exit(1);
  }

  mkdirSync(dirname(dst), { recursive: true });
  const before = existsSync(dst) ? sha16(dst) : null;
  copyFileSync(src, dst);
  console.log(before === sha
    ? `  =  ${home}/${slug}.glb already current (${sha})`
    : `  ->  ${home}/${slug}.glb  ${before || '(new)'} -> ${sha}`);
  if (before !== sha) changed++;

  const row = digests[slug] || (digests[slug] = {});
  if (row.sha !== sha) {
    console.log(`  ->  digests.json ${slug}.sha  ${row.sha || '(none)'} -> ${sha}`);
    row.sha = sha;
    changed++;
  }
  for (const k of ['set', 'order', 'tris']) {
    if (run[slug] && run[slug][k] !== undefined && row[k] !== run[slug][k]) {
      console.log(`  ->  digests.json ${slug}.${k}  ${row[k]} -> ${run[slug][k]}`);
      row[k] = run[slug][k];
      changed++;
    }
  }
}

// digests.json is written with ONE space of indent and keys sorted at BOTH
// levels — matching forge.py's `json.dump(..., indent=1, sort_keys=True)` so
// a promote that changes two values shows a two-line diff instead of
// reformatting forty. Rebuilt into sorted plain objects rather than handed to
// JSON.stringify's second parameter: that parameter is a REPLACER, and an
// array there is an ALLOWLIST OF KEYS, not a sort order. Passing the top-level
// slugs stripped every row down to `{}` — measured, by reading the diff this
// very comment is about.
const sortDeep = (o) => Object.fromEntries(Object.keys(o).sort()
  .map((k) => [k, (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]))
    ? sortDeep(o[k]) : o[k]]));
writeFileSync(DIGESTS, `${JSON.stringify(sortDeep(digests), null, 1)}\n`);

// ---- the served-file test's list -----------------------------------------
// tests/static-cache.test.mjs asserts each shipped model is fetchable, and it
// is the ONLY thing that would notice a file that never got committed
// (server.js has no manifest — safeResolve serves anything under ROOT). A new
// tower therefore has to appear in that list, and forgetting is silent.
const cache = readFileSync(CACHE_TEST, 'utf8');
const listRe = /const PROMOTED = \[([^\]]*)\]/;
const m = cache.match(listRe);
if (!m) {
  console.error('BAD: could not find `const PROMOTED = [...]` in '
    + 'tests/static-cache.test.mjs — the list moved; promote.mjs needs updating');
  process.exit(1);
}
const have = m[1].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) || [];
const want = [...new Set([...have, ...slugs.filter((s) => homeOf(s) === HOMES._default)])];
if (want.length !== have.length) {
  const added = want.filter((s) => !have.includes(s));
  const body = want.map((s) => `'${s}'`).join(', ');
  writeFileSync(CACHE_TEST, cache.replace(listRe, `const PROMOTED = [${body}]`));
  console.log(`  ->  static-cache PROMOTED += ${added.join(', ')}`);
  changed++;
}

console.log(changed
  ? `\n${changed} edit(s). READ THE DIFF — that is the review this step exists to make possible.`
  : '\nnothing to do: everything already current.');
