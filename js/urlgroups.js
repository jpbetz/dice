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
// Format before base64: "name=3d4+1d6;name2=1d20" with names
// encodeURIComponent-escaped, then base64url. Lives in the hash as #g=...
// so it never reaches the server and works on static hosting.

// Kept dependency-free (no three.js import chain) so it also runs under Node.
const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];

const MAX_GROUPS = 40;
const MAX_DICE_PER_GROUP = 40;

export function encodeGroups(groups) {
  const body = groups
    .slice(0, MAX_GROUPS)
    .map((g) => {
      const counts = new Map();
      for (const t of g.dice) counts.set(t, (counts.get(t) || 0) + 1);
      const formula = DIE_TYPES.filter((t) => counts.has(t))
        .map((t) => `${counts.get(t)}${t}`)
        .join('+');
      return `${encodeURIComponent(g.name)}=${formula}`;
    })
    .join(';');
  return btoa(body).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    if (eq < 1) return null;
    let name;
    try {
      name = decodeURIComponent(part.slice(0, eq)).slice(0, 24).trim();
    } catch {
      return null;
    }
    if (!name) return null;
    const dice = [];
    for (const term of part.slice(eq + 1).split('+')) {
      const m = /^(\d{1,2})(d\d+x?)$/.exec(term);
      if (!m || !DIE_TYPES.includes(m[2])) return null;
      for (let i = 0; i < +m[1]; i++) dice.push(m[2]);
    }
    if (!dice.length || dice.length > MAX_DICE_PER_GROUP) return null;
    groups.push({ id: groups.length + 1, name, dice });
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
