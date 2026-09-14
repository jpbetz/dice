/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// A stale-art key, not a security digest. Sorting makes a YAML field reorder
// harmless; an actual recipe edit falls back to a newly rendered portrait.
export function portraitSignature(recipe) {
  const sorted = value => Array.isArray(value) ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
  let hash = 2166136261;
  for (const c of JSON.stringify(sorted(recipe))) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
