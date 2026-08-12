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

// THE BYTE-IDENTITY WITNESS for a kit refactor (.claude/skills/new-tower
// SKILL.md §2.1): when a bake MOVES or is re-plumbed, the owning skin's output
// must be unchanged, and the honest witness is the BAKE FUNCTIONS run side by
// side on the owner's parameter sets with differing pixels counted — NOT a
// before/after PNG compare, which is nondeterministic in this harness and
// whose red therefore means nothing.
//
// It compares the SHIPPED CANVASES — albedo, normal, roughness, and (ember)
// emissive — so a change in the height field is caught through the two maps
// derived from it, not merely asserted to be absent.
//
//   # snapshot the pre-change kit, run, delete
//   git show <ref>:js/towerskin.js > js/_ab_ref_skin.js
//   git show <ref>:js/toweranvil.js > js/_ab_ref_anvil.js
//   #   …then export the two private bakes in the snapshots:
//   sed -i 's/^function bakeWood/export function bakeWood/'  js/_ab_ref_skin.js
//   sed -i 's/^function bakeEmber/export function bakeEmber/' js/_ab_ref_anvil.js
//   node tools/drive.mjs tools/steps/dress-bake-ab.mjs [--redcheck]
//   rm js/_ab_ref_skin.js js/_ab_ref_anvil.js
//
// --redcheck moves ONE channel of the NEW bake by one unit before comparing.
// The instrument has to be able to go red, or its green is furniture: a run
// that reads 0/0/0 both ways is a broken counter, not a proven refactor.

const PARAMS = `{
  wood: [
    ['heartwood walnut',     { size: 512, stops: WALNUT, planks: 6, seed: 0x7047e1, cathedral: false }],
    ['heartwood cherry',     { size: 512, stops: CHERRY, planks: 6, seed: 0x3c9a11, cathedral: false }],
    ['heartwood walnutFlat', { size: 256, stops: WALNUT, planks: 1, seed: 0x51d302, cathedral: true }],
    ['heartwood cherryFlat', { size: 256, stops: CHERRY, planks: 1, seed: 0x1a8b74, cathedral: true }],
  ],
  stone: [
    ['bastion granite',   { size: 512, stops: GRANITE, blocks: 8, courses: 16, seed: 0xba5701 }],
    ['bastion rustic',    { size: 512, stops: GRANITE, blocks: 4, courses: 8, seed: 0x2f19c4,
      joint: 0.010, relief: 1.8, chip: 0.8, wash: 0.26 }],
    ['bastion sand',      { size: 256, stops: SANDSTONE, blocks: 6, courses: 12, seed: 0x71c308,
      joint: 0.0048, relief: 0.6, chip: 0.28, speckle: 0.03 }],
    ['bastion sandFlat',  { size: 256, stops: SANDSTONE, blocks: 1, courses: 1, seed: 0x5a2b90,
      joint: 0.0026, relief: 0.35, chip: 0.25, speckle: 0.03, wash: 0.24 }],
    ['blackanvil soot',   { size: 512, stops: SOOT, blocks: 5, courses: 9, seed: 0xa17f01,
      joint: 0.0092, relief: 1.7, chip: 0.75, wash: 0.10, mortar: SOOT_JOINT }],
    ['blackanvil brick',  { size: 512, stops: BRICK, blocks: 12, courses: 24, seed: 0x3bc502,
      joint: 0.0042, relief: 0.8, chip: 0.35, speckle: 0.035, wash: 0.13, mortar: BRICK_JOINT }],
    ['blackanvil sand',   { size: 256, stops: SAND, blocks: 1, courses: 1, seed: 0x9f2071,
      joint: 0.0022, relief: 0.3, chip: 0.2, speckle: 0.10, wash: 0.22 }],
  ],
  ember: [
    ['blackanvil ember', { size: 256, seed: 0xe3b011, heat: 1.0 }],
  ],
}`;

// The owners' palettes, copied here because they are module-private in the
// skins. They are DATA — if one of them ever changes, this tool's numbers stop
// being about the same bake and the comparison is meaningless, so they are
// spelled out rather than imported through some new export.
const PALETTES = `
  const WALNUT = [[0x3a, 0x24, 0x18], [0x5a, 0x3b, 0x26], [0x7d, 0x5a, 0x3c]];
  const CHERRY = [[0x7a, 0x47, 0x2b], [0xa9, 0x70, 0x4c], [0xc8, 0x96, 0x78]];
  const GRANITE = [[0x3e, 0x41, 0x46], [0x64, 0x68, 0x6d], [0x8a, 0x8e, 0x93]];
  const SANDSTONE = [[0x57, 0x4e, 0x42], [0x7b, 0x70, 0x5f], [0x9e, 0x92, 0x7d]];
  const SOOT = [[0x28, 0x24, 0x21], [0x3e, 0x39, 0x33], [0x59, 0x52, 0x49]];
  const BRICK = [[0x2a, 0x20, 0x1b], [0x3e, 0x30, 0x28], [0x5c, 0x48, 0x3b]];
  const SAND = [[0x45, 0x41, 0x3a], [0x62, 0x5d, 0x54], [0x80, 0x7a, 0x6f]];
  const SOOT_JOINT = [0x22, 0x1e, 0x1a];
  const BRICK_JOINT = [0x4a, 0x44, 0x3c];
`;

export default async function run(stage, args) {
  const redcheck = args.includes('--redcheck');
  const t = await stage.tab('localhost', 'BakeAB');

  const script = `(async () => {
    const nu = await import('/js/towerskin.js');
    const ref = await import('/js/_ab_ref_skin.js');
    const refAnvil = await import('/js/_ab_ref_anvil.js');
    ${PALETTES}
    const P = ${PARAMS};
    const RED = ${redcheck};
    const px = (tex) => {
      const c = tex.image;
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    };
    // Count differing BYTES between two canvases of the same size. Size
    // mismatch is itself a failure and says so rather than throwing.
    const diff = (a, b) => {
      if (a.length !== b.length) return -1;
      let n = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      return n;
    };
    const CHANNELS = ['map', 'normalMap', 'roughnessMap', 'emissiveMap'];
    const out = [];
    const compare = (label, A, B) => {
      const row = { label, counts: {} };
      for (const k of CHANNELS) {
        if (!A[k] && !B[k]) continue;
        if (!A[k] || !B[k]) { row.counts[k] = 'MISSING'; continue; }
        const an = px(A[k]);
        // The red check moves one byte of the NEW bake by one unit. If the
        // count does not move, the counter is broken and every green above
        // it is furniture.
        if (RED) an[4 * 137 + 2] = (an[4 * 137 + 2] + 1) % 256;
        row.counts[k] = diff(an, px(B[k]));
      }
      out.push(row);
    };
    for (const [label, p] of P.wood) compare(label, nu.bakeWood(p), ref.bakeWood(p));
    for (const [label, p] of P.stone) compare(label, nu.bakeStone(p), ref.bakeStone(p));
    for (const [label, p] of P.ember) compare(label, nu.bakeEmber(p), refAnvil.bakeEmber(p));
    return JSON.stringify(out);
  })()`;

  const rows = JSON.parse(await t.eval(script));
  console.log(redcheck
    ? 'RED CHECK — one byte of every NEW colour canvas moved by one unit\n'
    : 'A/B — new kit vs the pre-refactor snapshot, differing bytes per canvas\n');
  let bad = 0, moved = 0, canvases = 0;
  for (const r of rows) {
    const cells = Object.entries(r.counts).map(([k, n]) => `${k}=${n}`).join('  ');
    console.log(`  ${r.label.padEnd(22)} ${cells}`);
    for (const n of Object.values(r.counts)) {
      canvases++;
      if (n === 'MISSING' || n === -1) bad++;
      else if (n > 0) moved++;
    }
  }
  if (redcheck) {
    // EVERY canvas should move, by EXACTLY one byte: the perturbation is
    // applied per channel, and a count of 1 rather than "nonzero" is what
    // proves the instrument is byte-exact instead of merely twitchy.
    const exact = rows.every((r) => Object.values(r.counts).every((n) => n === 1));
    console.log(exact && moved === canvases
      ? `\nRED CHECK PASSES: all ${moved} canvases moved by exactly one byte`
      : `\nRED CHECK FAILED: ${moved}/${canvases} canvases moved (exact-by-one: ${exact})`);
    if (!exact || moved !== canvases) process.exitCode = 1;
  } else {
    console.log(bad === 0 && moved === 0
      ? '\nIDENTICAL: every owner bake comes out byte-for-byte what it was'
      : `\nBAD: ${moved} canvas(es) differ, ${bad} unusable`);
    if (bad || moved) process.exitCode = 1;
  }
}
