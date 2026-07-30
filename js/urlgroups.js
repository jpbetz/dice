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

// Stateless group sharing: encode saved groups into the URL hash so a
// bookmarked link restores them anywhere, no storage required.
//
// Codec v2 (docs/UX.md §1.5): the body before base64url is
// "name=notation;name2=notation2" where BOTH halves are
// encodeURIComponent-escaped (';'/'='/'#' are delimiters) and notation is the
// canonical string from js/notation.js. An empty name segment ("=4d6dl1") is
// legal — an unnamed group is labelled by its notation. Decoding tries the
// notation grammar first and falls back to the v1 dice-formula ("3d4+1d6")
// for old links; since v1 formulas are a strict subset of the grammar, every
// existing #g= link keeps decoding. Hostile input yields null, never a throw.
//
// Kept dependency-free beyond js/notation.js (itself import-free) so this
// module still runs under Node for tests.

import { parseNotation, canonicalNotation } from './notation.js';

const V1_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];

const MAX_GROUPS = 40;
const MAX_DICE_PER_GROUP = 40;
const MAX_NOTATION = 500;

export function encodeGroups(groups) {
  const body = groups
    .slice(0, MAX_GROUPS)
    .map((g) => `${encodeURIComponent(g.name || '')}=${encodeURIComponent(g.notation || '')}`)
    .join(';');
  return btoa(body).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// v1 body: "3d4+1d6" — count always present, types from the fixed list.
function decodeV1Dice(formula) {
  const dice = [];
  for (const term of formula.split('+')) {
    const m = /^(\d{1,2})(d\d+x?)$/.exec(term);
    if (!m || !V1_DIE_TYPES.includes(m[2])) return null;
    for (let i = 0; i < +m[1]; i++) dice.push(m[2]);
  }
  if (!dice.length || dice.length > MAX_DICE_PER_GROUP) return null;
  return dice;
}

export function decodeGroups(encoded) {
  let body;
  try {
    body = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const groups = [];
  for (const part of body.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    let name, raw;
    try {
      name = decodeURIComponent(part.slice(0, eq)).slice(0, 24).trim();
      raw = decodeURIComponent(part.slice(eq + 1)).trim();
    } catch {
      return null;
    }
    if (!raw || raw.length > MAX_NOTATION) return null;

    let notation = null;
    const parsed = parseNotation(raw);
    if (parsed.ok) {
      notation = parsed.canonical;
    } else {
      const dice = decodeV1Dice(raw); // old links only
      if (!dice) return null;
      notation = canonicalNotation({ dice, mods: null });
    }
    groups.push({ id: groups.length + 1, name, notation });
    if (groups.length >= MAX_GROUPS) break;
  }
  return groups.length ? groups : null;
}

// Read groups from the current URL hash, if present and valid.
export function groupsFromLocation() {
  const m = /[#&]g=([A-Za-z0-9_-]+)/.exec(location.hash);
  return m ? decodeGroups(m[1]) : null;
}

// Reflect the given groups into the URL hash (replaceState — no history spam),
// so the address bar is always a bookmarkable snapshot of the current groups.
export function syncGroupsToLocation(groups) {
  const base = location.pathname + location.search;
  if (!groups.length) {
    history.replaceState(null, '', base);
    return;
  }
  history.replaceState(null, '', `${base}#g=${encodeGroups(groups)}`);
}
