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

// THE SMALLEST HONEST TOWER — a GLB written by hand, in Node, with no deps.
//
//   node tests/e2e/fixtures/make-min-tower.mjs         # prints the data: URL
//   node tests/e2e/fixtures/make-min-tower.mjs --json  # prints the JSON chunk
//
// WHY THIS EXISTS ALONGSIDE tower_fixture.glb, WHICH IS A REAL BAKE. The real
// fixture proves the pipeline: Blender authored it, check.py --tower fired
// rays down its declared column, and it is the file the app will meet in
// production. This one proves something the real fixture cannot, because it is
// a committed binary: that the loader reads the ENCODING rather than that one
// file. Its eight portal numbers are different from the real fixture's AND
// from the classic defaults, so a loader that quietly returned either would
// fail here — and every number is a binary fraction, so it survives the JSON
// round trip exactly and the scenario can assert equality rather than
// nearness. (tower_fixture.glb cannot: Blender wrote its portalIn.x through
// float32, so the authored 0.80 comes back as 0.800000011920929. That is
// correct behaviour for a baked asset — every client reads the same double out
// of the same file — but it is not a thing to write an `assert.equal` against.)
//
// GLB CONTAINER, in full, because it is small enough to be worth knowing:
//   12-byte header  — magic 'glTF', uint32 version 2, uint32 total length
//   chunk 0         — uint32 length, uint32 type 'JSON', padded to 4 with 0x20
//   chunk 1         — uint32 length, uint32 type 'BIN\0', padded to 4 with 0x00
// Everything else is the glTF 2.0 JSON, which is where the portals live.

import { Buffer } from 'node:buffer';

// THE DECLARED PORTALS. Off-classic in every field, inside TOWER_PORTAL_LIMITS
// in every field, and different from tower_fixture.glb's in every field:
//
//   field        this   classic   tower_fixture   limit
//   in.x        -0.75    0.00      +0.80          [-1.25, +1.25]
//   in.rimY      8.00    8.75       9.75          [ 7.25, 10.25]
//   in.z        -1.50   -2.00      -2.75          [-3.25, -1.25]
//   in.clearR    2.50    2.125      2.25          >= 2.125
//   out.x        0.25    0.00      -0.50          [-0.75, +0.75]
//   out.sillY    0.75    1.00       1.25          [0.625, 1.375]
//   out.w        5.50    5.00       5.25          >= 5.00
//   out.clearH   5.00    4.50       4.75          >= 4.50
//
// derived: despawnY = rimY - 1.4*S = 8.00 - 1.75 = 6.25, which sits above the
// door head (sillY + clearH = 5.75) — the floor the limits exist to protect.
export const MIN_TOWER_PORTALS = {
  in: { x: -0.75, rimY: 8.0, z: -1.5, clearR: 2.5 },
  out: { x: 0.25, sillY: 0.75, w: 5.5, clearH: 5.0 },
};

// A closed box shell standing where a tower stands: x [-3, 3], y [0, 8],
// z [-4, 0], with z=0 the socket plane. Vertex-coloured dark-to-light up the
// height, because COLOR_0 is a thing the loader has to notice (it drives
// material.vertexColors, and colour data with that flag off is invisible by
// construction — js/main.js towerVC exists for exactly that bug).
const BOX = { x: 3, y0: 0, y1: 8, z0: -4, z1: 0 };

function boxGeometry() {
  const { x, y0, y1, z0, z1 } = BOX;
  // 8 corners, y-major so the colour ramp is a simple test of the low four
  // against the high four.
  const pos = [
    [-x, y0, z0], [x, y0, z0], [x, y0, z1], [-x, y0, z1],
    [-x, y1, z0], [x, y1, z0], [x, y1, z1], [-x, y1, z1],
  ];
  const col = pos.map(([, py]) => {
    const t = (py - y0) / (y1 - y0);
    const v = 0.25 + 0.5 * t;      // dull stone, lighter as it rises
    return [v, v, v * 0.96];
  });
  const idx = [
    0, 1, 2, 0, 2, 3,   // floor
    4, 6, 5, 4, 7, 6,   // roof
    0, 4, 5, 0, 5, 1,   // back  (z0)
    3, 2, 6, 3, 6, 7,   // front (z1 — the socket plane)
    0, 3, 7, 0, 7, 4,   // left
    1, 5, 6, 1, 6, 2,   // right
  ];
  return { pos, col, idx };
}

export function minTowerGlb() {
  const { pos, col, idx } = boxGeometry();

  const idxBuf = Buffer.alloc(idx.length * 2);
  idx.forEach((v, i) => idxBuf.writeUInt16LE(v, i * 2));
  const posBuf = Buffer.alloc(pos.length * 12);
  pos.flat().forEach((v, i) => posBuf.writeFloatLE(v, i * 4));
  const colBuf = Buffer.alloc(col.length * 12);
  col.flat().forEach((v, i) => colBuf.writeFloatLE(v, i * 4));
  // Every offset lands on a multiple of 4 by construction (72, 96, 96), which
  // is what the accessor alignment rule wants; assert rather than trust it,
  // because a silently misaligned accessor is a mesh that loads as garbage.
  for (const [name, n] of [['indices', idxBuf.length], ['positions', posBuf.length]]) {
    if (n % 4) throw new Error(`${name} length ${n} breaks 4-byte accessor alignment`);
  }
  const bin = Buffer.concat([idxBuf, posBuf, colBuf]);

  const min = [-BOX.x, BOX.y0, BOX.z0];
  const max = [BOX.x, BOX.y1, BOX.z1];
  const P = MIN_TOWER_PORTALS;

  const json = {
    asset: { version: '2.0', generator: 'dice-table make-min-tower.mjs' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0, 1, 2] }],
    nodes: [
      // The engine's occluder convention: a NAMED `towerSkin*` node is opaque
      // geometry (js/main.js towerOcclusionCheck walks exactly these).
      { mesh: 0, name: 'towerSkinTest' },
      // ONE DATUM, ONE HOME (tools/forge/README.md): the node NAME says which
      // portal, the TRANSLATION says where, and EXTRAS carry the scalars.
      // portalOut's z is authored 0 and never read — the doorway is cut in the
      // socket plane and the engine puts it at z0 by definition.
      { name: 'portalIn', translation: [P.in.x, P.in.rimY, P.in.z], extras: { clearR: P.in.clearR } },
      { name: 'portalOut', translation: [P.out.x, P.out.sillY, 0], extras: { w: P.out.w, clearH: P.out.clearH } },
    ],
    meshes: [{
      name: 'towerSkinTest',
      primitives: [{ attributes: { POSITION: 1, COLOR_0: 2 }, indices: 0, material: 0 }],
    }],
    // No NORMAL attribute on purpose: GLTFLoader computes vertex normals when
    // a non-basic material meets a mesh without them, and a fixture that
    // exercises that path is a fixture that catches it breaking.
    materials: [{
      name: 'testStone', doubleSided: true,
      pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.6 },
    }],
    accessors: [
      { bufferView: 0, componentType: 5123, count: idx.length, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: pos.length, type: 'VEC3', min, max },
      { bufferView: 2, componentType: 5126, count: col.length, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: idxBuf.length, target: 34963 },
      { buffer: 0, byteOffset: idxBuf.length, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: idxBuf.length + posBuf.length, byteLength: colBuf.length, target: 34962 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const pad = (buf, to, fill) => {
    const over = buf.length % to;
    return over ? Buffer.concat([buf, Buffer.alloc(to - over, fill)]) : buf;
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 4, 0x20);
  const binChunk = pad(bin, 4, 0x00);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const chunk = (payload, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(payload.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, payload]);
  };
  return {
    glb: Buffer.concat([header, chunk(jsonChunk, 'JSON'), chunk(binChunk, 'BIN\0')]),
    json,
  };
}

// The form the page consumes. fetch() handles data: URLs, so a scenario can
// hand the app a whole model in one eval string with no second server, no
// temp file and nothing to clean up.
export function minTowerDataUrl() {
  return `data:model/gltf-binary;base64,${minTowerGlb().glb.toString('base64')}`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (process.argv.includes('--json')) console.log(JSON.stringify(minTowerGlb().json, null, 2));
  else console.log(minTowerDataUrl());
}
