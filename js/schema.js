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

// THE VERSIONING CONTRACT FOR CLIENT STATE (ROADMAP C22).
//
// Written after the frozen-mtime bug put months-old clients in front of a
// current server with nobody able to say what they were carrying. Three
// numbers, `epoch.major.minor`, on every stored blob and every payload that
// carries state, and ONE function that answers "can I load this".
//
//   epoch  A DIFFERENT DATA MODEL. No compatibility is offered or implied.
//          PURGE it, unless a converter is registered for that exact epoch;
//          a registered converter runs once and rewrites forward.
//   major  NEW CAPABILITIES EXIST IN THIS DATA. A reader supporting a LOWER
//          major must REFUSE and say so — never load it partially. Older data
//          with a lower major loads normally.
//   minor  A COMPATIBLE CHANGE. Tracking only. Nothing branches on it; it
//          exists so a bug report names a build.
//
// THE ASYMMETRY IS THE POINT AND IT IS EASY TO GET BACKWARDS. *Older* data is
// a migration problem — the reader knows more than the writer did and can fill
// the gap. *Newer* data is a refusal — the reader knows LESS than the writer
// did, and loading it means silently dropping whatever it did not understand.
// PROFILES §11.9 (8) already ruled this for one case ("an unknown system falls
// back in the store and refuses in the file"); this generalises it and states
// the reason: THE LOUD DOOR IS WHERE A HUMAN IS STANDING. A person who is
// looking at their own library can be told to update the page and try again. A
// silent partial load leaves them to discover the hole later, from the shape
// of what is missing.
//
// NOT FOR THIS: the live wire protocol between a client and the room it is
// sitting at. That is a different problem with a different answer — a live
// client can be told to reload, which stored data cannot.
//
// NOR FOR THIS: A STORED KEY THAT HAS NO SHAPE. `dice.who.v1` (js/net.js,
// docs/IDENTITY.md §5) is one opaque string — a bearer credential, not a data
// model — and stamping it would invent a schema for a value nothing ever parses.
// Recorded here rather than left to judgement, because "every stored blob
// carries a stamp" reads like a rule that admits no exceptions, and the next
// editor of this file should not have to re-derive why this one is out.
//
// The test of whether something belongs here is the same one PURGE_KEEPS asks
// (js/main.js), and it is worth stating because the two lists agree for a
// reason: a key with NO SHAPE cannot hold data an older reader would silently
// drop, so there is nothing for a stamp to protect and nothing for the purge to
// clean. `dice.who.v1` and `dice.stability.v1` are both on the keep list and
// neither is stamped. Anything with fields is stamped and purgeable; anything
// that is a single value is neither.
//
// No imports. This module is read by the app, by the Node unit suite, and (for
// the emitted form) by a human editing a YAML file in a text editor.

// ---------------------------------------------------------------------------
// The numbers this build writes
// ---------------------------------------------------------------------------

// WHY 2.0.0 AND NOT 2.1.0. The epoch is 2 because `dice.schema.v1 = 2` is
// already in the field — this fold does not break anything, so it does not get
// to spend an epoch. The major is ZERO because adding a stamp adds no
// CAPABILITY: a blob written today and a blob written by this build hold
// exactly the same data, and calling them different majors would make this
// build refuse its own predecessor's library for no reason at all. The
// contract protects the NEXT break, not this one.
//
// RAISING THEM:
//   epoch — only for a break that cannot be migrated. Write a converter first
//           and see whether the data is worth carrying; the purge is the
//           default, not the goal.
//   major — the moment stored data can hold something an older reader would
//           silently drop. This is the number that turns data loss into a
//           sentence on a screen, so err towards raising it.
//   minor — anything else that changes the shape at all.
export const EPOCH = 2;
export const MAJOR = 0;
export const MINOR = 0;

export const SCHEMA = Object.freeze({ epoch: EPOCH, major: MAJOR, minor: MINOR });

// The stored/emitted form: ONE string field, three numbers. One field cannot
// half-exist the way `{epoch, major}` with a missing minor can, it is capped
// and regex-checked in a line, it reads the same in a YAML file as in a crash
// report, and it greps.
export const STAMP = `${EPOCH}.${MAJOR}.${MINOR}`;

export const formatStamp = (s) => (s ? `${s.epoch}.${s.major}.${s.minor}` : '');

// 'E.M.m' → {epoch, major, minor}, or null for anything else. Strict: no
// leading zeros to argue about, no 'v' prefix, no four-part strings, and a
// hard cap so a hand-edited file cannot hand us a bignum to compare.
const STAMP_RE = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;
export function parseStamp(raw) {
  if (typeof raw !== 'string') return null;
  const m = STAMP_RE.exec(raw.trim());
  if (!m) return null;
  return { epoch: Number(m[1]), major: Number(m[2]), minor: Number(m[3]) };
}

// ---------------------------------------------------------------------------
// The converter registry
// ---------------------------------------------------------------------------

// `epoch N → N + 1`, run at boot. The purge stays the DEFAULT: a converter is
// what you write when the data is worth carrying, and writing one is a
// decision about a specific shape, so the registry is deliberately empty until
// somebody makes that decision. Keyed by the epoch being converted FROM, so a
// blob two epochs behind walks the chain N → N+1 → N+2 and nobody has to write
// the cross product.
const converters = new Map();

/** Register `epoch from → from + 1`. `fn(blob) -> blob | null` (null = purge). */
export function registerConverter(from, fn) {
  if (!Number.isInteger(from) || typeof fn !== 'function') return false;
  converters.set(from, fn);
  return true;
}

/** Test seam: forget every registered converter. */
export function clearConverters() { converters.clear(); }

/** Is there an unbroken converter chain from `epoch` up to this build's? */
export function canConvert(epoch) {
  for (let e = epoch; e < EPOCH; e++) if (!converters.has(e)) return false;
  return epoch <= EPOCH;
}

// Walk the chain. Returns the rewritten blob, or null if any step declines or
// throws — a converter that throws is a converter that does not work, and the
// answer to data we cannot rewrite is the same as the answer to data we cannot
// read.
export function convert(blob, epoch) {
  let out = blob;
  for (let e = epoch; e < EPOCH; e++) {
    const fn = converters.get(e);
    if (!fn) return null;
    try { out = fn(out); } catch { return null; }
    if (!out) return null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The one place a stamp is judged
// ---------------------------------------------------------------------------

// A verdict, never a boolean: 'load' | 'convert' | 'purge' | 'refuse'.
//
//   load     the reader may take it as it stands
//   convert  a registered chain rewrites it forward first (call `convert`)
//   purge    a different data model with no way forward — drop it
//   refuse   NEWER than this reader in a way that would lose data — stop, and
//            tell the human, with `message` as the sentence to show
//
// `raw` is the stamp field as stored (a string), or absent/undefined.
//
// AN ABSENT STAMP IS THIS EPOCH'S OLDEST DATA, AND THAT IS NOT A GUESS. Every
// browser in the field right now holds `dice.profiles.v1` written without one,
// and purging on absence would delete a returning player's whole library on
// the boot that shipped this. It is also correct rather than merely kind: the
// origin-wide purge (`dice.schema.v1`, main.js) has ALREADY dropped every
// `dice.*` key written below EPOCH, once, before anything reads a stamp — so a
// surviving unstamped blob is by construction this epoch's, from before stamps
// existed. Absent means older, older means migrate, and migrating unstamped
// data is what normalizeStore/migrateGroup have always done.
//
// `what` names the thing in the refusal sentence ('your saved pools', 'this
// file'). It is the only user-facing string here.
export function judgeStamp(raw, what = 'this data') {
  const stamp = raw === undefined || raw === null || raw === ''
    ? { epoch: EPOCH, major: 0, minor: 0, assumed: true }
    : parseStamp(raw);

  // Unreadable is not the same as absent. Absence is a known state of the
  // field; junk in the version field means somebody or something wrote a shape
  // we have no reason to trust the REST of, so it takes the epoch answer.
  if (!stamp) {
    return {
      action: canConvert(0) ? 'convert' : 'purge',
      stamp: null,
      reason: `unreadable version stamp ${JSON.stringify(String(raw).slice(0, 20))}`,
    };
  }

  if (stamp.epoch !== EPOCH) {
    if (canConvert(stamp.epoch)) return { action: 'convert', stamp };
    return {
      action: 'purge',
      stamp,
      reason: `epoch ${stamp.epoch} is a different data model (this build reads ${EPOCH})`,
    };
  }

  // The asymmetry, in two lines. Lower major: the reader knows more, so load.
  // Higher major: the reader knows less, so REFUSE — out loud, and say what to
  // do about it. `✗` is the app's refusal grammar; the sentence carries the
  // numbers because a bug report that names them is the whole point of minor.
  if (stamp.major > MAJOR) {
    return {
      action: 'refuse',
      stamp,
      // An em-dash rather than "was/were", so the one sentence reads correctly
      // for a plural subject ('your saved pools') and a singular one ('this
      // file') without the caller having to conjugate anything.
      message: `✗ ${what} — written by a newer version of this page `
        + `(${formatStamp(stamp)}; this page reads ${STAMP}). `
        + 'Reload to update, or download your data first if the reload does not help — '
        + 'loading it here would silently drop whatever this version cannot read.',
    };
  }

  return { action: 'load', stamp };
}
