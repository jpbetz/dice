/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYaml } from '../js/yaml.js';
import { seatToss, SEAT_TOSS } from '../js/places.js';
import { ROUND_SIDES, ROUND_NORMALS, roundApothem, roundSpawnLine, roundSpawnPoint,
  roundClearance, SPAWN_JITTER, SPAWN_CLEARANCE } from '../js/round-table.js';

const declaration = parseYaml(readFileSync(new URL('../dice.yaml', import.meta.url), 'utf8')).tree;
Object.assign(SEAT_TOSS, declaration.table.seats);
const hulls = [1.15, Math.sqrt(3) * .675, 1.05, 1.056, 1.056, 1.1, 1.25];
assert.equal(ROUND_NORMALS.length, ROUND_SIDES);
for (let i = 0; i < ROUND_SIDES; i++) {
  assert.ok(Math.abs(Math.hypot(ROUND_NORMALS[i].x, ROUND_NORMALS[i].z) - 1) < 1e-15);
  // Intersections of adjacent supporting lines lie ON the declared disc.
  const a = ROUND_NORMALS[i], b = ROUND_NORMALS[(i + 1) % ROUND_SIDES], h = roundApothem(27.5);
  const det = a.x * b.z - b.x * a.z;
  assert.ok(Math.abs(Math.hypot(h * (b.z - a.z) / det, h * (a.x - b.x) / det) - 13.75) < 1e-12);
}
let checked = 0;
function check(line, width, pool, count) {
  const fitted = roundSpawnLine(line, width, Math.max(...pool));
  assert.ok(fitted.spread >= 0 && fitted.spread <= line.spread);
  for (let index = 0; index < count; index++) for (const jitter of [-SPAWN_JITTER, 0, SPAWN_JITTER]) {
    const p = roundSpawnPoint(fitted, index, count, jitter), hull = pool[index % pool.length];
    assert.ok(roundClearance(width, p.x, p.z, hull) >= SPAWN_CLEARANCE - 1e-9,
      JSON.stringify({ width, line, count, index, jitter, p }));
    checked++;
  }
}
for (const scale of [1, declaration.table.scale, 4]) for (const base of [14.1, 11, 8.6]) {
  const width = base * scale;
  for (const back of [0, declaration.table.seats.back, 8, 100]) {
    SEAT_TOSS.back = back;
    for (let seats = 1; seats <= 8; seats++) for (let seat = 0; seat < seats; seat++) for (const arc of [0, 1]) {
      const toss = seatToss(seat, seats, arc, width);
      for (const count of [1, 2, 7, 40]) for (const pool of [[1.25], hulls]) {
        check({ ...toss, spread: Math.min(width - 4.4, count * SEAT_TOSS.per) }, width, pool, count);
      }
    }
  }
  for (const side of [0, 1, 2, 3]) for (const count of [1, 7, 40]) {
    // Unstamped solo/ninth-seat throws keep their selected side and draws.
    const alongZ = side >= 2, sign = side === 1 || side === 2 ? -1 : 1;
    check({ x: alongZ ? sign * (width / 2 - 2.2) : 0,
      z: alongZ ? 0 : sign * (width / 2 - 2.2), tx: alongZ ? 0 : 1, tz: alongZ ? 1 : 0,
      spread: Math.min(width - 4.4, count * 2.6) * (alongZ ? .5 : 1) }, width, hulls, count);
  }
}
// Pure arithmetic has no PRNG argument, and legal small lines keep their
// midpoint, tangent, spread and the caller's already-drawn jitter exactly.
const legal = { x: 0, z: 4, tx: 1, tz: 0, spread: 3 };
assert.deepEqual(roundSpawnLine(legal, 27.5, 1.25), legal);
assert.deepEqual(roundSpawnPoint(legal, 1, 3, .23), { x: .23, z: 4 });
for (const bad of [0, -1, NaN]) assert.throws(() => roundSpawnLine(legal, bad, 1.25), RangeError);
assert.throws(() => roundSpawnLine(legal, 2, 1.25), RangeError);
console.log(`round-table: ${checked} spawn hull/jitter clearances passed`);
