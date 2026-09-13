/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// One physical envelope for every portalless table. The model is scenery;
// neither its selected identity nor the arrival of its bytes chooses a film.
export const ROUND_SIDES = 16;
export const ROUND_NORMALS = Object.freeze(Array.from({ length: ROUND_SIDES }, (_, i) => {
  const angle = i * (2 * Math.PI / ROUND_SIDES);
  // Exact cardinal components avoid different tiny residuals at the seam.
  const x = i % 4 === 0 ? [0, 1, 0, -1][i / 4] : Math.sin(angle);
  const z = i % 4 === 0 ? [1, 0, -1, 0][i / 4] : Math.cos(angle);
  return Object.freeze({ x, z });
}));
export const SPAWN_JITTER = 0.6;
export const SPAWN_CLEARANCE = 0.05;

export function roundApothem(width) {
  return width / 2 * Math.cos(Math.PI / ROUND_SIDES);
}

// The inner circle is contained in every side of the enclosure. Fit the
// entire line, with its worst hull and jitter, before placing individual dice:
// clipping each endpoint separately would pile many dice at the same point.
// No randomness is consumed. The caller keeps its existing draw order.
export function roundSpawnLine({ x, z, tx, tz, spread }, width, hull, jitter = SPAWN_JITTER) {
  if (![x, z, tx, tz, spread, width, hull, jitter].every(Number.isFinite)
      || width <= 0 || hull < 0 || spread < 0 || jitter < 0) throw new RangeError('Invalid spawn line');
  const inner = roundApothem(width) - hull - SPAWN_CLEARANCE;
  const a = tx * tx + tz * tz;
  if (a <= 0 || inner <= jitter) throw new RangeError('Spawn hull does not fit');
  const length = Math.hypot(x, z), maxMid = inner - jitter;
  if (length > maxMid) { const scale = maxMid / length; x *= scale; z *= scale; }
  const dot = x * tx + z * tz;
  const halfChord = Math.sqrt(Math.max(0, dot * dot + a * (inner * inner - x * x - z * z)));
  const lo = (-dot - halfChord) / a + jitter;
  const hi = (-dot + halfChord) / a - jitter;
  return { x, z, tx, tz, spread: Math.min(spread, Math.max(0, 2 * Math.min(-lo, hi))) };
}

export function roundSpawnPoint(line, index, count, jitter) {
  const offset = (count === 1 ? 0 : -line.spread / 2 + line.spread * index / (count - 1)) + jitter;
  return { x: line.x + line.tx * offset, z: line.z + line.tz * offset };
}

export function roundClearance(width, x, z, hull = 0) {
  const apothem = roundApothem(width);
  return Math.min(...ROUND_NORMALS.map(n => apothem - n.x * x - n.z * z - hull));
}
