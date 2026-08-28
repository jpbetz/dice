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

// js/portable.js — pools & just-you settings as portable YAML (Tier 4 §5),
// grown into the whole prepared table (Tier G §G2, docs/PROFILES.md §3.1).
//
// A HAND-ROLLED emitter and a STRICT YAML-subset parser (the zero-dep rule:
// no npm YAML library). The subset is exactly the shape exportYaml emits —
// top-level maps, shelves as keys, pools as a list of one-pair maps, scalars
// single-quoted — and the parser FAILS CLOSED: anything outside the subset is
// an error naming its line, never a guess.
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
//
// THE PREPARED TABLE (2026-08-06). Two more top-level sections, both
// present-or-absent, so every file written before today still parses and
// still exports byte-identically:
//
//   table:      the room's own furniture — name/felt/system/zoom, mapping
//               1:1 onto the server's SETTING_SPECS ('name' is that side's
//               'tableName'). The enums are MIRRORED below rather than
//               imported: portable.js must keep running in a browser and
//               under plain Node, and server.js is neither. An unknown value
//               is a refusal naming its line — a felt that silently fell back
//               would be a table nobody prepared. 'experiences' is out: no
//               editor writes it, so the key would carry nothing.
//   players:    the prepared characters, each a display name, an optional
//               rolling system, an optional dice set, and a rack of its own.
//
// Since 2026-08-08 (PROFILES §11) `players:` is also how a PROFILE LIBRARY
// travels: the same block, up to 32 of them, each naming the system whose lens
// its dice were chosen under. A DM's prepared table and a player's own library
// are the same document read by two people — which is the point, and the reason
// the cap moved rather than a second section being invented.
//
// Why a player block NESTS `pools:` instead of hanging shelves off the name:
// shelf labels are user-authored, so a shelf may legally be called 'set' or
// 'pools'. Nesting puts the reserved keys at a depth where a shelf can never
// appear, and makes a player's block THE SAME GRAMMAR as the top-level
// `pools:` section — one parser (blockLine), called at two base indents.
// Verbosity bought with the total absence of ambiguity.
//
// Profile names are display names, and a display name is a WHISPER ADDRESS.
// '#' starts the comment in roll notation and the comment split runs before
// the whisper-flag scan, so a name carrying one re-parses as a whisper
// somewhere else — a silent misdelivery (GOALS notation-totality; server.js
// cleanName). The server STRIPS it as a last resort; a hand-edited file gets
// the loud version, refused at its line, because there is a human right there
// who can fix the spelling.
//
// Unknown TOP-LEVEL sections skip and warn rather than aborting the document
// (PROFILES §9 decision 4): a file from a later version must not be a hard
// version break. The skip runs to the next column-0 line and never looks
// inside. That tolerance is for sections this version does not know —
// a section it DOES know stays strict to the character.
//
// THE TOWER RIDES THE TABLE (ROADMAP 9d follow-up, 2026-08-17). `tower` is the
// fifth `table:` key and it is the ONE key in the section that is NOT an
// enum here, which is a decision, not an omission:
//
//   · The felt, the system and the zoom are CLOSED sets that have not moved
//     since they were mirrored — nine, three, three — so mirroring them buys a
//     refusal at the line for a typo and costs nothing. The TOWER CATALOGUE IS
//     DECLARED TO GROW ("'none' plus one model today, more later" — server.js
//     SETTING_SPECS; "the second model should cost a row in TOWERS and nothing
//     else" — main.js renderTowerPicker), and it grew from one to five models
//     inside two weeks. A hand-mirrored sixth-copy list would be a FOURTH home
//     for that list (client TOWERS, server SETTING_SPECS, here) with no drift
//     guard reachable from Node: server.js does not export the tower list and
//     js/main.js cannot be imported outside a browser. So the mirror would
//     silently rot on the one key that changes most often, and its rot mode is
//     "every file the new build writes is refused by the old one".
//   · Refusing the WHOLE DOCUMENT over one unknown tower id is a compatibility
//     break the version contract deliberately declines to make. C22's stamp is
//     the door for "this file holds something you cannot read"; a new tower
//     model is a CATALOGUE addition, not a schema change, and it must not have
//     to spend a major to avoid costing a player their forty pools.
//
// So the parse checks SHAPE and length and hands the id on verbatim, and the
// CATALOGUE check lives at the apply site (js/main.js portablePushToTable),
// against `TOWERS` — the registry the reader actually has, which is the only
// truthful answer to "can this build raise it". That site drops an id it cannot
// socket, NAMES it in the receipt, and never puts it on the wire — because
// server.js validateSettingsPatch refuses the ENTIRE push for one bad value,
// and net.pushTable answers null for it, so an unknown id sent hopefully would
// land as "couldn't reach the table" over a table that answered fine.
//
// Which leaves the id readable in the file it came from: Open → Download on an
// older build carries the DM's tower through instead of quietly stripping it.
//
// ABSENT STAYS SILENT. No `tower` key means the room keeps the tower it has —
// the whole `table:` section is a PATCH over the room's furniture, never a
// total statement of it (see portablePushToTable: every key is `if (t.key)`),
// and that is exactly what an absent felt has always meant. 'none' is the
// spelling for "take it down", and unlike `name: ''` it SURVIVES the parse:
// '' is the absence of a name, while 'none' is a tower id with a registry row
// of its own and the only way a prepared table can lower a raised tower.
// The EMITTER's own silence about 'none' is a separate call, at the snapshot
// site — see js/main.js portableSnapshot.

// THE FILE CARRIES ITS VERSION (ROADMAP C22). A file crosses versions by
// definition — it is the one artefact meant to outlive a browser — so it is
// the site the contract most needs, and the site where the refusal has the
// best chance of a human in front of it.
//
// IT IS A SECTION, NOT A TOP-LEVEL KEY, AND THAT IS A COMPATIBILITY DECISION.
// `version: '2.0.0'` at column 0 is not section-shaped, and every reader
// already in the field REFUSES an unknown top-level line ("unknown top-level
// line …"). A `version:` SECTION with the numbers indented under it takes the
// forward-tolerance path instead (PROFILES §9 decision 4): an older reader
// skips the block with a warning and reads the rest of the document exactly as
// it always did. So this build's exports stay importable by last month's
// build, which is the entire point of putting a version on a file.
import { parseNotation, cutText } from './notation.js';
import { STAMP as SCHEMA_STAMP, judgeStamp } from './schema.js';
import { SETS } from './themes.js'; // import-free data — still runs under Node
import { SYSTEM_IDS } from './meanings.js'; // likewise: no imports of its own

const TRIO = ['attributes', 'skills', 'motivations'];
const TRIO_LABELS = { attributes: 'Attributes', skills: 'Skills', motivations: 'Motivations' };
const PLAIN_LABEL = 'Pools';

// Caps. 40 was a DOCUMENT cap while a file held exactly one rack; a prepared
// table holds one per player, so it is now PER PLAYER — the top-level `pools:`
// (which is one player's: the exporting browser's own) and each player block
// each get the full 40, under the same name the server's own cap wears. Six
// players × 20 pools is an ordinary game night and must never be a refusal;
// MAX_POOLS_PER_FILE is the separate whole-document ceiling.
//
// MAX_PROFILES is 32 as of 2026-08-08 (PROFILES §11): the file is the durable
// copy of a PROFILE LIBRARY, and a library that cannot round-trip is not a
// backup. It deliberately no longer matches the room key's cap — the server
// still takes 12, because that is how many seats a table has, where 32 is how
// many characters a person keeps.
//
// The whole-document ceiling rises with it, to EXACTLY the structural maximum:
// 32 players × 40 pools plus the top-level rack's own 40 is 1320. Which means
// this cap can no longer refuse a legal document — at 300 it refused precisely
// the library this format now exists to write. It stays, at the arithmetic, as
// the guard that turns "someone raised one of the other two caps" into a test
// failure rather than a discovery.
const MAX_POOLS_PER_PLAYER = 40;
const MAX_PROFILES = 32;
const MAX_POOLS_PER_FILE = MAX_PROFILES * MAX_POOLS_PER_PLAYER + MAX_POOLS_PER_PLAYER; // 1320
const MAX_NAME = 24;
const MAX_TABLE_NAME = 28; // SETTING_SPECS.tableName's cap

// The `table:` values, mirrored by hand from server.js SETTING_SPECS (see the
// header: no import). Adding a felt or a system there means adding it here.
const FELT_THEMES = ['emerald', 'crimson', 'midnight', 'slate', 'walnut',
  'obsidian', 'ocean', 'plum', 'sand'];
// From the module that defines them, not a hand-kept copy — see
// js/meanings.js SYSTEM_IDS for what the copies cost.
const SYSTEMS = SYSTEM_IDS;
const ZOOMS = ['wide', 'medium', 'close'];
// A TOWER ID, SHAPE-CHECKED AND NOT ENUMERATED (see the header). Deliberately
// wider than today's ids (`heartwood`, `blackanvil`, …): dice-set ids in this
// same format already carry dots (`emberforge.blackanvil`), so a future tower
// named that way must not be refused by a build that predates it. What it does
// refuse is the junk a growing catalogue is no excuse for — whitespace, quoting
// wreckage, an empty value, and anything long enough to be a paragraph.
const TOWER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
// key → the values it accepts: an ARRAY is a closed enum (an unknown value
// refuses at its line), a REGEXP is an id whose catalogue lives elsewhere
// (shape only, checked against the real registry at the apply site), and null
// is free text (capped, never enumerated).
const TABLE_KEYS = { name: null, felt: FELT_THEMES, system: SYSTEMS, zoom: ZOOMS, tower: TOWER_ID };

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

// groups → shelves in the rack's own reading order: the trio first, customs
// alphabetically, the plain shelf last.
function shelvesOf(groups) {
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
  shelves.sort((a, b) => {
    const rank = (s) => (s.key === PLAIN_LABEL.toLowerCase() ? 2 : TRIO.includes(s.key) ? 0 : 1);
    return rank(a) - rank(b)
      || (rank(a) === 0 ? TRIO.indexOf(a.key) - TRIO.indexOf(b.key) : a.label.localeCompare(b.label));
  });
  return shelves;
}

// One rack's shelves at `base` indent (pools at base + 2) — the emit twin of
// blockLine: the top-level section and a player's own pools take it at 2 and
// at 6. Returns how many shelves it wrote.
function emitShelves(lines, groups, base) {
  const pad = ' '.repeat(base);
  const shelves = shelvesOf(groups);
  for (const s of shelves) {
    lines.push(`${pad}${shelfKey(s.label)}:`);
    for (const p of s.pools) lines.push(`${pad}  - ${quote(p.name)}: ${quote(p.notation)}${p.set ? ` @ ${quote(p.set)}` : ''}`);
  }
  return shelves.length;
}

// groups: [{name, notation, category?, set?}] · settings: {sound?, numbers?}
// table: {name?, felt?, system?, zoom?, tower?} · profiles: [{name, system?, set?, groups}]
// profile: {name?, system?, set?} — WHO the top-level `pools:` belong to
//
// `profile:` exists to keep the document free of a second home for the same
// rack. The exporter's own pools have always been the top-level `pools:`; when
// the library arrived, writing that profile into `players:` as well would have
// put one character's dice in two places, and a hand-editable format where an
// edit can land in the ignored copy is a format with a trap in it. So the rack
// stays exactly where it was, `players:` carries the OTHER profiles, and this
// three-key section says whose the rack is — which is the only thing the old
// shape could not record.
// table and profiles are present-or-absent: given neither (or nothing in
// them), the output is byte-identical to what this emitter wrote before the
// prepared table existed. Profiles keep the order they are handed in — that
// is the order the seats sit in — while shelves inside each sort as always.
export function exportYaml({ groups = [], settings = {}, table = null, profiles = null, profile = null } = {}) {
  const tableLines = [];
  for (const key of Object.keys(TABLE_KEYS)) {
    const value = table && table[key];
    if (typeof value === 'string' && value) tableLines.push(`  ${key}: ${quote(value)}`);
  }
  const seats = Array.isArray(profiles) ? profiles : [];
  const meLines = [];
  if (profile) {
    if (typeof profile.name === 'string' && profile.name) meLines.push(`  name: ${quote(profile.name)}`);
    if (typeof profile.system === 'string' && SYSTEMS.includes(profile.system)) meLines.push(`  system: ${quote(profile.system)}`);
    if (typeof profile.set === 'string' && profile.set) meLines.push(`  set: ${quote(profile.set)}`);
  }
  const prepared = tableLines.length > 0 || seats.length > 0;

  const lines = [
    prepared ? '# Dice Table — the prepared table' : '# Dice Table — pools & just-you settings',
    '# paste back via Settings → Your data (import previews; Apply is explicit)',
  ];
  // FIRST, so a human opening the file in a text editor sees what wrote it
  // before they see anything they might be tempted to hand-edit.
  lines.push('version:', `  schema: ${quote(SCHEMA_STAMP)}`);
  if (tableLines.length) lines.push('table:', ...tableLines);
  if (meLines.length) lines.push('profile:', ...meLines);
  if (seats.length) {
    lines.push('players:');
    for (const p of seats) {
      lines.push(`  ${quote(p.name || '')}:`);
      // `system` before `set`: the rolling system is what decides WHERE a
      // profile may be taken in hand (PROFILES §11 R5), so it reads first.
      // Both are present-or-absent, and a profile written before systems
      // existed still parses — it takes the table's system on the way in.
      if (p.system && SYSTEMS.includes(p.system)) lines.push(`    system: ${quote(p.system)}`);
      if (p.set) lines.push(`    set: ${quote(p.set)}`);
      lines.push('    pools:'); // an empty rack still names the key, so the seat survives
      emitShelves(lines, p.groups || [], 6);
    }
  }
  lines.push('pools:');
  if (!emitShelves(lines, groups, 2)) lines.push(`  ${PLAIN_LABEL}:`);
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

// The key half of a mapping line ("Label:" / "'Label':"), bare or quoted.
// null = not a key line at all; '' = a key line with nothing in it.
function readKey(body) {
  const key = readScalar(body, ':');
  if (!key || (key.rest !== ':' && key.rest.trim() !== ':')) return null;
  return key.value.trim();
}

// A dice-set id, fallen closed: unknown ids become no override at all, so the
// pool (or the seat) survives a file written against a later set catalogue.
const knownSet = (id) => (id === 'std' || SETS[id] ? id : null);

const fail = (line, error) => ({ ok: false, line, error });

// One shelf/pool block — the `pools:` grammar at ONE base indent. `shelves` is
// the array it fills, `doc` the shared whole-file pool counter, `what` the
// suffix an over-cap refusal wears. The top-level section takes base 2 and a
// player's own pools base 6: same function, same grammar, two depths.
function newBlock(base, shelves, doc, what = '') {
  return { base, pad: ' '.repeat(base), shelves, byKey: new Map(), count: 0, shelf: null, doc, what };
}

// → null when the line is consumed, or a fail() when it is refused.
function blockLine(block, raw, lineNo) {
  const { base, pad } = block;

  if (raw.startsWith(pad) && raw[base] !== ' ') {
    // a shelf: "<pad>Label:" (key bare or quoted)
    const body = raw.slice(base);
    const label = readKey(body);
    if (label === null) {
      return fail(lineNo, `expected a shelf like "${pad}Attributes:" (got ${JSON.stringify(body.slice(0, 30))})`);
    }
    if (!label) return fail(lineNo, 'a shelf needs a name');
    if (label.length > MAX_NAME) return fail(lineNo, `shelf name over ${MAX_NAME} characters`);
    const k = label.toLowerCase();
    if (block.byKey.has(k)) return fail(lineNo, `shelf ${JSON.stringify(label)} appears twice`);
    block.shelf = { label: TRIO_LABELS[k] || label, plain: k === PLAIN_LABEL.toLowerCase(), pools: [] };
    block.byKey.set(k, block.shelf);
    block.shelves.push(block.shelf);
    return null;
  }

  if (raw.startsWith(`${pad}  - `)) {
    if (!block.shelf) return fail(lineNo, 'a pool line stands outside any shelf');
    const body = raw.slice(base + 4);
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
      set = knownSet(sv.value.trim());
      tail = '';
    }
    if (tail !== '') return fail(lineNo, 'trailing text after the notation');
    const name = cutText(key.value, MAX_NAME + 1);
    if (name.length > MAX_NAME) return fail(lineNo, `name over ${MAX_NAME} characters`);
    const res = parseNotation(val.value);
    if (!res.ok) return fail(lineNo, `notation ${JSON.stringify(val.value.slice(0, 40))}: ${res.error}`);
    if (++block.count > MAX_POOLS_PER_PLAYER) return fail(lineNo, `more than ${MAX_POOLS_PER_PLAYER} pools${block.what}`);
    if (++block.doc.count > MAX_POOLS_PER_FILE) return fail(lineNo, `more than ${MAX_POOLS_PER_FILE} pools in the file`);
    block.shelf.pools.push({ name, notation: res.canonical, ...(set ? { set } : {}) });
    return null;
  }

  return fail(lineNo, `unrecognized indentation ${JSON.stringify(raw.slice(0, 20))} — shelves at ${base} spaces, pools at "${pad}  - "`);
}

// → { ok:true, shelves:[{label, plain, pools:[{name, notation, set?}]}],
//     settings:{sound, numbers} (each present only when the text set it),
//     profiles:[{name, system?, set?, shelves:[…]}], warnings:[…],
//     table?:{…}, profile?:{name?, system?, set?} }
// or { ok:false, line, error }. `table` is present only if the text set it;
// `profiles` and `warnings` are always arrays, empty in a today-format file.
export function parsePortable(text) {
  if (typeof text !== 'string' || !text.trim()) return fail(0, 'nothing to import');
  const doc = { count: 0 }; // pools across the whole file
  const shelves = [];
  const rack = newBlock(2, shelves, doc); // the top-level pools: section
  const settings = {};
  const profiles = [];
  const byName = new Map();
  const warnings = [];
  const tableSeen = new Set();
  const meSeen = new Set();
  let table = null;
  let me = null;      // the `profile:` section — whose the top-level pools are
  let version = null; // C22's {epoch, major, minor}; null when the file predates it
  let section = null; // 'pools' | 'settings' | 'table' | 'players' | 'profile' | 'version' | 'skip'
  let seat = null;    // the player block being read
  const rows = text.split(/\r\n?|\n/);

  for (let n = 0; n < rows.length; n++) {
    const raw = rows[n];
    const lineNo = n + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) continue; // blank / comment line
    // An unknown section's body is not examined AT ALL — that is what
    // skipping means, indentation style included. It ends at column 0.
    if (section === 'skip' && /^[ \t]/.test(raw)) continue;
    if (raw.includes('\t')) return fail(lineNo, 'tabs are not allowed — use spaces');

    if (!raw.startsWith(' ')) {
      seat = null;
      if (raw === 'pools:') { section = 'pools'; rack.shelf = null; continue; }
      if (raw === 'settings:') { section = 'settings'; continue; }
      if (raw === 'table:') { section = 'table'; continue; }
      if (raw === 'players:') { section = 'players'; continue; }
      if (raw === 'profile:') { section = 'profile'; continue; }
      if (raw === 'version:') { section = 'version'; continue; }
      // Forward tolerance (PROFILES §9 decision 4): a SECTION this version
      // does not know is skipped with a warning rather than breaking the
      // document. A top-level line that is not even section-shaped is still
      // a refusal — there is no block to skip.
      if (raw.endsWith(':')) {
        section = 'skip';
        warnings.push(`line ${lineNo}: skipped unknown section ${JSON.stringify(raw.slice(0, 30))}`);
        continue;
      }
      return fail(lineNo, `unknown top-level line ${JSON.stringify(raw.slice(0, 30))} — expected "pools:", "settings:", "table:", "profile:", "players:" or "version:"`);
    }

    if (section === 'version') {
      // C22. Exactly one key today; unknown keys inside are SKIPPED rather
      // than refused, for the same reason the section itself is skippable by
      // an older reader — the version block must never be the thing that makes
      // a document unreadable.
      const m = /^ {2}schema:(.*)$/.exec(raw);
      if (!m) { warnings.push(`line ${lineNo}: ignored unknown version key ${JSON.stringify(raw.trim().slice(0, 30))}`); continue; }
      const sv = readScalar(m[1].trim());
      if (!sv || sv.rest.trim() !== '') return fail(lineNo, 'expected one value after "schema:"');
      // THE LOUD DOOR. A file from a NEWER build is refused AT ITS LINE and
      // nothing is imported: the alternative is a preview that quietly shows
      // the subset this parser happens to understand, and an Apply that
      // overwrites a real library with it. Older (or absent — every file this
      // app has written until today) reads exactly as it always did.
      const verdict = judgeStamp(sv.value.trim(), 'this file');
      if (verdict.action === 'refuse') return fail(lineNo, verdict.message.replace(/^✗ /, ''));
      if (verdict.action === 'purge') return fail(lineNo, verdict.reason);
      version = verdict.stamp;
      continue;
    }

    if (section === 'settings') {
      const m = /^ {2}(sound|numbers): (true|false)$/.exec(raw);
      if (!m) return fail(lineNo, 'settings lines are "  sound: true|false" or "  numbers: true|false"');
      settings[m[1]] = m[2] === 'true';
      continue;
    }

    if (section === 'profile') {
      // Whose the top-level `pools:` are. Three keys, all optional, all strict:
      // an unknown system refuses here exactly as it does in a player block,
      // because it decides where the rack may be taken in hand.
      const m = /^ {2}(name|system|set):(.*)$/.exec(raw);
      if (!m) return fail(lineNo, `profile lines are "  name: 'X'", "  system: 'id'" or "  set: 'id'" (got ${JSON.stringify(raw.trim().slice(0, 30))})`);
      if (meSeen.has(m[1])) return fail(lineNo, `profile key ${JSON.stringify(m[1])} appears twice`);
      meSeen.add(m[1]);
      const sv = readScalar(m[2].trim());
      if (!sv || sv.rest.trim() !== '') return fail(lineNo, `expected one value after "${m[1]}:"`);
      const value = sv.value.trim();
      if (m[1] === 'name') {
        if (value.includes('#')) {
          return fail(lineNo, `profile name ${JSON.stringify(value.slice(0, 30))} carries '#', which starts a comment in dice notation — a name holding one would misdirect whispers`);
        }
        const nm = cutText(value, MAX_NAME + 1);
        if (nm.length > MAX_NAME) return fail(lineNo, `profile name over ${MAX_NAME} characters`);
        if (nm) { me = me || {}; me.name = nm; }
      } else if (m[1] === 'system') {
        if (!value) return fail(lineNo, 'expected one system id after "system:"');
        if (!SYSTEMS.includes(value)) {
          return fail(lineNo, `system ${JSON.stringify(value.slice(0, 30))} is not one of ${SYSTEMS.join(', ')}`);
        }
        me = me || {};
        me.system = value;
      } else {
        const id = knownSet(value); // unknown ids fall closed, like a pool's
        if (id) { me = me || {}; me.set = id; }
      }
      continue;
    }

    if (section === 'table') {
      // The room's furniture. Every key is known, every enum is closed: a
      // value that fell back silently would be a table nobody prepared.
      const m = /^ {2}([A-Za-z]+):(.*)$/.exec(raw);
      if (!m) return fail(lineNo, `table lines are "  key: 'value'" (got ${JSON.stringify(raw.trim().slice(0, 30))})`);
      const key = m[1];
      if (!Object.hasOwn(TABLE_KEYS, key)) {
        return fail(lineNo, `unknown table key ${JSON.stringify(key)} — expected ${Object.keys(TABLE_KEYS).join(', ')}`);
      }
      if (tableSeen.has(key)) return fail(lineNo, `table key ${JSON.stringify(key)} appears twice`);
      tableSeen.add(key);
      const sv = readScalar(m[2].trim());
      if (!sv || sv.rest.trim() !== '') return fail(lineNo, `expected one value after "${key}:"`);
      const allowed = TABLE_KEYS[key];
      let value = sv.value;
      if (Array.isArray(allowed)) {
        if (!allowed.includes(value)) {
          return fail(lineNo, `${key} ${JSON.stringify(value.slice(0, 30))} is not one of ${allowed.join(', ')}`);
        }
      } else if (allowed instanceof RegExp) {
        // An id, not an enum (the header). The shape is all this side can
        // honestly judge — whether THIS build can raise it is a question for the
        // registry at the apply site — so the refusal here says what it checked.
        if (!allowed.test(value)) {
          return fail(lineNo, `${key} ${JSON.stringify(value.slice(0, 30))} does not look like a ${key} id `
            + `(letters, digits, '.', '_', '-'; 32 characters; 'none' for no ${key})`);
        }
      } else {
        // free text (the table's own name), capped like every other name
        value = cutText(value, MAX_TABLE_NAME + 1);
        if (value.length > MAX_TABLE_NAME) return fail(lineNo, `table name over ${MAX_TABLE_NAME} characters`);
      }
      if (value) { // '' is 'unnamed', which is what carrying nothing already means
        if (!table) table = {};
        table[key] = value;
      }
      continue;
    }

    if (section === 'players') {
      if (/^ {2}\S/.test(raw)) {
        // a player: "  'Alice':"
        const label = readKey(raw.slice(2));
        if (label === null) {
          return fail(lineNo, `expected a player like "  'Alice':" (got ${JSON.stringify(raw.slice(2, 32))})`);
        }
        if (!label) return fail(lineNo, 'a player needs a name');
        // The whisper-address ban, refused rather than stripped: '#' opens the
        // comment in roll notation, so 'Bo#b' would re-parse as a whisper to
        // 'Bo' — a silent misdelivery. See the header.
        if (label.includes('#')) {
          return fail(lineNo, `player name ${JSON.stringify(label.slice(0, 30))} carries '#', which starts a comment in dice notation — a name holding one would misdirect whispers`);
        }
        const name = cutText(label, MAX_NAME + 1);
        if (name.length > MAX_NAME) return fail(lineNo, `player name over ${MAX_NAME} characters`);
        if (!name) return fail(lineNo, 'a player needs a name');
        const k = name.toLowerCase();
        if (byName.has(k)) return fail(lineNo, `player ${JSON.stringify(name)} appears twice`);
        if (profiles.length >= MAX_PROFILES) return fail(lineNo, `more than ${MAX_PROFILES} players`);
        const rec = { name, shelves: [] };
        byName.set(k, rec);
        profiles.push(rec);
        seat = { rec, block: newBlock(6, rec.shelves, doc, ' for one player'), inPools: false };
        continue;
      }

      if (!seat) return fail(lineNo, 'an indented line stands outside any player');

      if (/^ {4}\S/.test(raw)) {
        // the reserved keys, at the depth a shelf can never reach
        const m = /^ {4}(set|pools|system):(.*)$/.exec(raw);
        if (!m) return fail(lineNo, `a player carries only "    system: 'id'", "    set: 'id'" and "    pools:" (got ${JSON.stringify(raw.trim().slice(0, 30))})`);
        if (m[1] === 'pools') {
          if (m[2].trim() !== '') return fail(lineNo, '"pools:" takes no value — the shelves sit under it');
          seat.inPools = true;
          seat.block.shelf = null;
          continue;
        }
        if (m[1] === 'system') {
          // REFUSED, not fallen closed — the asymmetry with `set:` is
          // deliberate. An unknown dice set costs a profile its skin; an
          // unknown SYSTEM costs it the only thing that says where it may be
          // taken in hand (PROFILES §11 R5), and a character that silently
          // became a Soul Deal character is a character nobody wrote. Same
          // call `table.system` already makes, one line above in spirit.
          const sv = readScalar(m[2].trim());
          if (!sv || sv.rest.trim() !== '') return fail(lineNo, 'expected one system id after "system:"');
          const id = sv.value.trim();
          if (!id) return fail(lineNo, 'expected one system id after "system:"');
          if (!SYSTEMS.includes(id)) {
            return fail(lineNo, `system ${JSON.stringify(id.slice(0, 30))} is not one of ${SYSTEMS.join(', ')}`);
          }
          if (seat.rec.system) return fail(lineNo, `player ${JSON.stringify(seat.rec.name)} names a system twice`);
          seat.rec.system = id;
          continue;
        }
        const sv = readScalar(m[2].trim());
        if (!sv || sv.rest.trim() !== '') return fail(lineNo, 'expected one dice-set id after "set:"');
        const id = knownSet(sv.value.trim()); // unknown ids fall closed, like a pool's
        if (id) seat.rec.set = id;
        else delete seat.rec.set;
        continue;
      }

      if (!seat.inPools) return fail(lineNo, 'a shelf must sit under the player\'s "pools:"');
      const bad = blockLine(seat.block, raw, lineNo);
      if (bad) return bad;
      continue;
    }

    if (section !== 'pools') return fail(lineNo, 'indented line before any section');

    const bad = blockLine(rack, raw, lineNo);
    if (bad) return bad;
  }

  if (!shelves.length && !profiles.length && !table && !me
    && !('sound' in settings) && !('numbers' in settings)) {
    // Name the skips here or they vanish: a file of nothing but sections this
    // version does not know reads as empty, and "why?" deserves an answer.
    return fail(0, warnings.length
      ? `no pools, settings, table or players found (${warnings.length} unknown section${warnings.length > 1 ? 's' : ''} skipped)`
      : 'no pools and no settings found');
  }
  // `version` is present-or-absent (C22): absent is every file this app wrote
  // before today, and a caller that does not care about it sees the exact
  // object it always saw.
  return {
    ok: true, shelves, settings, profiles, warnings,
    ...(table ? { table } : {}),
    ...(me ? { profile: me } : {}),
    ...(version ? { version } : {}),
  };
}

// One parsed profile → exactly what planImport (and the preview status line)
// consumes, so no caller has to know that a bare {shelves} would leave
// plan.settings undefined under `'sound' in plan.settings`. A profile carries
// no just-you settings — sound and numbers are the receiving browser's, never
// the organizer's. The profile's own `set` is that PLAYER's dice identity, not
// a per-pool override, so it deliberately does not ride along: the seat picker
// applies it where identity lives.
export function profileToImport(profile) {
  return {
    ok: true,
    shelves: profile && Array.isArray(profile.shelves) ? profile.shelves : [],
    settings: {},
  };
}

// ---------------------------------------------------------------------------
// Merge plan — by NAME, never a silent overwrite (the preview is the point)
// ---------------------------------------------------------------------------

// current: [{id, name, notation, category?, set?}] · parsed: parsePortable's
// ok shape (or profileToImport's, which is the same shape for one player). A
// named pool matches the FIRST current pool with the same name (exact); a
// match with identical notation+shelf+set counts unchanged, else it becomes an
// update. Unnamed or unmatched pools are adds. Nothing is ever deleted — an
// import narrows nothing.
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
