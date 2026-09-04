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

// THE IMAGE CLOTH (developer mode phase E2, 2026-09-03) — the shipped picture,
// and the seam that stops a cloth from being three registries again.
//
// WHY A TEST FOR A PNG. `models/mats/linen.png` is the first ASSET a felt row
// points at, and it is the kind of file that fails silently: a truncated
// upload, a text-mode checkout, a lost binary in a rebase, and the mat boots
// flat on its `feltBase` with one console line nobody is watching. The app
// itself cannot check it — the decode happens in a browser, asynchronously,
// and its only report is a warning — so the bytes are checked here, in Node, in
// milliseconds. The encoder that WROTE this file was a scratch script and is
// not in the tree (it ran once); what has to keep being true is the output.
//
// AND WHY A SOURCE SCRAPE. Before E2 a cloth was a key into three registries —
// a painter, a gloss row, a voice — read at three call sites with three
// `|| …[DEFAULT_CLOTH]` fallbacks, and tests/felt-ids.test.mjs grew a mirror
// per registry to keep them from drifting apart. A row may now OVERRIDE any of
// it, which only works if every consumer goes through the one resolver
// (`feltSurfaceOf`). A fourth reader added later would read the painter's
// numbers and quietly ignore the row: it would look right, which is this
// project's signature failure. The last test is the thing that says so.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url));
const src = read('js/main.js').toString('utf8');

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
    process.exitCode = 1;
  }
};

// ---------------------------------------------------------------------------
// A minimal PNG reader — chunk walk, CRC32, and the one inflate
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tbl[i] = c >>> 0;
  }
  return tbl;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// `[{ type, data, crcOk }]`, in file order. Throws on a length that runs off
// the end, which is exactly what a truncated file looks like.
function chunks(png) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'not a PNG: the eight-byte signature is wrong');
  const out = [];
  let i = 8;
  while (i < png.length) {
    assert.ok(i + 12 <= png.length, `chunk header runs past the end of the file at byte ${i}`);
    const len = png.readUInt32BE(i);
    assert.ok(i + 12 + len <= png.length, `chunk at byte ${i} claims ${len} bytes and the file is shorter`);
    const type = png.subarray(i + 4, i + 8).toString('latin1');
    const data = png.subarray(i + 8, i + 8 + len);
    const want = png.readUInt32BE(i + 8 + len);
    out.push({ type, data, crcOk: crc32(png.subarray(i + 4, i + 8 + len)) === want });
    i += 12 + len;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The shipped picture
// ---------------------------------------------------------------------------

const LINEN = 'models/mats/linen.png';
const png = read(LINEN);
const cs = chunks(png);
const ihdr = cs[0].data;
const W = ihdr.readUInt32BE(0), H = ihdr.readUInt32BE(4);
const DEPTH = ihdr[8], COLOUR = ihdr[9];

t(`${LINEN} is a PNG whose every chunk checks`, () => {
  assert.equal(cs[0].type, 'IHDR', 'IHDR is first, by the spec');
  assert.equal(cs[cs.length - 1].type, 'IEND', '…and IEND is last');
  for (const c of cs) assert.ok(c.crcOk, `${c.type}: CRC32 mismatch — the file is corrupt, not merely odd`);
  assert.ok(cs.some((c) => c.type === 'IDAT'), 'no image data at all');
  assert.equal(ihdr[10], 0, 'deflate is the only compression method there is');
  assert.equal(ihdr[12], 0, 'not interlaced: the browser decodes this once at boot');
});

t('it is a 256px greyscale tile, which is what an image cloth wants', () => {
  // GREYSCALE, because js/main.js `paintImageCloth` MULTIPLIES the row's
  // `feltBase` over it: a picture carrying its own colour would be a second
  // opinion about the mat's hue, and it would cost three times the bytes.
  assert.equal(COLOUR, 0, 'colour type 0 — greyscale');
  assert.equal(DEPTH, 8);
  assert.equal(W, 256); assert.equal(H, 256);
  // 256 SQUARE IS NOT ARBITRARY. The felt tile is 1024px over FELT_TILE_U (5)
  // world units, so a `tile: 1.25` row draws four repeats across it at one
  // image pixel per texel. A picture whose size did not divide that would be
  // resampled at every draw.
  assert.equal(1024 % W, 0, 'the felt tile is 1024px, and a repeat has to divide it');
  // …AND THE BYTES REALLY DECODE. A CRC-clean header over a truncated IDAT is
  // the failure a chunk walk alone would pass.
  const idat = Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);
  assert.equal(raw.length, H * (W + 1), 'one filter byte and one row of samples per scanline');
  // WHAT THIS FILE IS INTENDED TO COST, measured rather than hoped for (the E2
  // review, 2026-09-03). The brief said "a few KB" and the first encode was
  // 23,196 with filter 1 (Sub) on all 256 scanlines. Adaptive per-row
  // filtering — Paeth on 224 rows, Sub on the other 32 — recovered 222 bytes,
  // which is the answer to where the bytes are: not in the container but in
  // the picture, 96 distinct levels of per-thread noise over 65,536 pixels,
  // about 2.8 bits each. The cheap way to halve it is a 128px tile, and that
  // costs the property this mat exists to demonstrate: 256 is what draws at
  // one image pixel per texel across a 1024px felt tile. So ~23 KB is the
  // intended size, and the ceiling below is that with room for a re-authored
  // weave — not a budget anybody should spend.
  assert.ok(png.length < 32 * 1024, `${LINEN} is ${png.length} bytes against an intended ~23 KB; a mat is chrome, not a download`);
});

// The decoded samples, for the two claims that are about the PICTURE rather
// than about the container. All five PNG filters, because the shipped file
// picks one per scanline (the E2 review: it used to be Sub on every row, which
// is what made this reader's three enough) — an unfiltered read of a Paeth row
// is noise that would fail the weave claims for the wrong reason.
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
};
const pixels = (() => {
  const raw = inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const out = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (W + 1)];
    assert.ok(f <= 4, `scanline ${y} uses filter ${f}, which is not a PNG filter at all`);
    for (let x = 0; x < W; x++) {
      const v = raw[y * (W + 1) + 1 + x];
      const a = x ? out[y * W + x - 1] : 0;                    // left
      const b = y ? out[(y - 1) * W + x] : 0;                  // up
      const c = (x && y) ? out[(y - 1) * W + x - 1] : 0;       // up-left
      const base = f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : f === 4 ? paeth(a, b, c) : 0;
      out[y * W + x] = (v + base) & 0xff;
    }
  }
  return out;
})();

t('the weave is near-white, because the row\'s feltBase multiplies it', () => {
  let sum = 0, lo = 255, hi = 0;
  for (const v of pixels) { sum += v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const mean = sum / pixels.length;
  // `multiply` can only ever DARKEN, so the picture's job is to say where the
  // cloth loses light and never to say the colour. A mean much under this and
  // the mat reads as a different, darker hex than the row declares.
  assert.ok(mean > 200, `mean level ${mean.toFixed(1)} — the tint would come out far darker than feltBase`);
  assert.ok(hi <= 255 && lo > 120, `levels run ${lo}..${hi}; the gaps must read as shading, not as holes`);
  assert.ok(hi - lo > 30, `levels run ${lo}..${hi} — a picture with no structure is a flat colour with a download`);
});

t('and it TILES: the wrap is not the sharpest edge in the picture', () => {
  // The mat is this picture repeated four times across a tile that is itself
  // repeated 32 times across the plane, so a discontinuity at the wrap is a
  // hard line every 1.25 world units, in a grid, on the one surface the camera
  // sees edge-on.
  //
  // THE BASELINE IS THE PICTURE'S OWN EDGES, not its average. A woven cloth is
  // full of real steps — every thread crossing is one — so comparing the seam
  // to a mid-thread step would fail a perfect tile (measured: the seam steps
  // 44 levels and mid-thread steps 15, and both are correct). What a seam
  // means is an edge the picture does not otherwise make: so the claim is
  // that the wrap is no sharper than the sharpest edge already inside it.
  const at = (x, y) => pixels[y * W + x];
  const rows = [], cols = [];
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) s += Math.abs(at(x, y) - at(x, (y + 1) % H));
    rows.push(s / W);
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = 0; y < H; y++) s += Math.abs(at(x, y) - at((x + 1) % W, y));
    cols.push(s / H);
  }
  const worstInside = (a) => Math.max(...a.slice(0, a.length - 1));
  assert.ok(rows[H - 1] <= worstInside(rows),
    `the top/bottom wrap steps ${rows[H - 1].toFixed(2)}, against ${worstInside(rows).toFixed(2)} at the worst edge inside`);
  assert.ok(cols[W - 1] <= worstInside(cols),
    `the left/right wrap steps ${cols[W - 1].toFixed(2)}, against ${worstInside(cols).toFixed(2)} at the worst edge inside`);
});

// ---------------------------------------------------------------------------
// 2. One resolver, and everything reads it
// ---------------------------------------------------------------------------

// The body of `function NAME(`, by brace matching. The same idea
// tests/felt-ids.test.mjs uses on an object literal, over a function.
function bodyOf(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `js/main.js: no function ${name} — did it move or get renamed?`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error(`js/main.js: ${name} is unterminated`);
}

t('feltSurfaceOf is the one place the cloth registries and the row meet', () => {
  const resolver = bodyOf('feltSurfaceOf');
  assert.match(resolver, /FELT_GLOSS\[/, 'it reads the painter\'s gloss row…');
  assert.match(resolver, /clothVoiceFor\(/, '…and the painter\'s voice, through the one reader');
  assert.match(resolver, /row\.gloss/, '…and lets the ROW override the first');
  assert.match(resolver, /row\.sound/, '…and the second');
});

t('every consumer goes through it: no second reading of a cloth registry', () => {
  // WHAT THIS CATCHES. `paintGloss(base, cloth)` read `FELT_GLOSS[cloth]`
  // directly until E2, and a felt row's own `gloss:` would have been written
  // into dice.yaml, shown in the panel, carried by Save — and had no effect
  // whatever on the floor. The same shape of miss on the audio side would give
  // a mat a voice nobody could hear.
  for (const fn of ['paintGloss', 'clothVoice']) {
    const body = bodyOf(fn);
    assert.doesNotMatch(body, /FELT_GLOSS\[/, `${fn} reads FELT_GLOSS directly — a row's gloss would not reach it`);
    assert.doesNotMatch(body, /CLOTH_VOICES\[/, `${fn} reads CLOTH_VOICES directly — a row's sound would not reach it`);
  }
  assert.match(bodyOf('paintGloss'), /feltSurfaceOf\(/, 'paintGloss asks the resolver');
  // `clothVoice` asks `clothVoiceFor` WITH the row, which is the same merge at
  // the one call site that also knows the venue (js/voices.js owns the rule
  // that a venue's floor covers the mat, and covers a row's overrides with it).
  assert.match(bodyOf('clothVoice'), /clothVoiceFor\(venueAudioId\(\)[\s\S]*sound/,
    'clothVoice hands the row\'s sound to the one reader');
  // The tile cache key is the other thing a row can move now: two mats at one
  // hex on two pictures are two canvases.
  assert.match(bodyOf('feltTileKey'), /row\.texture/, 'the cache key carries the picture');
  assert.match(bodyOf('paintImageCloth'), /globalCompositeOperation = 'multiply'/,
    'the tint is a multiply, which is what the greyscale picture above is for');
  // …AND THE REPEAT COUNT IS BOUNDED AT BOTH ENDS (the E2 review). The draw is
  // a `reps x reps` grid of `drawImage`, and `reps` is `round(5 / tile)` off a
  // number in a file a person edits: `tile: 0.001` is 5,000 repeats and 25
  // million calls inside one repaint. The panel's dial stops at 0.25; this is
  // the half that holds for a hand-edited row.
  assert.match(bodyOf('feltTileReps'), /Math\.min\(FELT_MAX_REPS/,
    'feltTileReps is unbounded above — one typo in dice.yaml is a tab that stops answering');
  assert.match(src, /const FELT_MAX_REPS = \d+;/, 'and the bound is a named constant, not a literal in a line');
});

console.log(process.exitCode ? 'felt-image: FAILED' : `felt-image: ${n} tests passed`);
