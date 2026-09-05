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

// Canvas tooling for names supplied at runtime. Relief is baked only on a
// rename or dress change; the table still draws one transparent atlas quad.
// All colour arithmetic here is sRGB canvas paint, not THREE's linear colour.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const noise = (x, y) => {
  let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

// A chamfer distance field: the bevel follows EVERY glyph contour, including
// counters and serifs, rather than offsetting a second flat copy of the word.
function distance(alpha, field, w, h, inside) {
  const n = w * h;
  for (let i = 0; i < n; i++) field[i] = (alpha[i * 4 + 3] >= 128) === inside ? 1e4 : 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    field[i] = Math.min(field[i], field[i - 1] + 1, field[i - w] + 1,
      field[i - w - 1] + 1.4142, field[i - w + 1] + 1.4142);
  }
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
    const i = y * w + x;
    field[i] = Math.min(field[i], field[i + 1] + 1, field[i + w] + 1,
      field[i + w + 1] + 1.4142, field[i + w - 1] + 1.4142);
  }
}

function cartouche(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w - r, y + r, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w - r, y + h - r, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x + r, y + h - r, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x + r, y + r, x + r, y);
  ctx.closePath();
}

function diamond(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
}

// A paired acanthus sprig. Open curls survive minification; almond leaves
// give the silhouette a recognisable bookbinder's-tool shape at table size.
function sprig(ctx, length, height) {
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(length * .28, -height * .12, length * .52, -height, length * .82, -height * .55);
  ctx.bezierCurveTo(length * 1.02, -height * .18, length * .65, height * .12, length * .63, -height * .22);
  ctx.stroke();
  for (const [t, lift] of [[.22, .5], [.43, .72]]) {
    const x = length * t, y = -height * t;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - length * .12, y - height * .08, x - length * .09, y - height * lift, x + length * .03, y - height * lift);
    ctx.bezierCurveTo(x + length * .13, y - height * .35, x + length * .05, y - height * .1, x, y);
    ctx.fill();
  }
}

export class ToolingPainter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.mask = document.createElement('canvas');
    this.mask.width = w; this.mask.height = h;
    this.ctx = this.mask.getContext('2d', { willReadFrequently: true });
    this.finish = document.createElement('canvas');
    this.finish.width = w; this.finish.height = h;
    this.fx = this.finish.getContext('2d');
    this.inner = new Float32Array(w * h);
    this.outer = new Float32Array(w * h);
    this.surface = new Float32Array(w * h);
    this.pixels = this.fx.createImageData(w, h);
  }

  mark(draw) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.save(); c.fillStyle = c.strokeStyle = '#000';
    c.lineJoin = c.lineCap = 'round'; draw(c); c.restore();
  }

  relief(target, x0, y0, { raised, chalk, bevel }) {
    const { w, h, inner, outer, surface } = this;
    const src = this.ctx.getImageData(0, 0, w, h).data;
    distance(src, inner, w, h, true);
    if (!raised) distance(src, outer, w, h, false);
    for (let i = 0; i < surface.length; i++) {
      const d = raised ? inner[i] : inner[i] - outer[i];
      surface[i] = raised ? clamp(d / bevel) : -clamp((d + 1.5) / (bevel + 1.5));
    }
    const out = this.pixels.data;
    out.fill(0);
    const low = raised ? (chalk ? [65, 78, 94] : [96, 48, 13]) : (chalk ? [106, 99, 84] : [42, 21, 13]);
    const face = raised ? (chalk ? [192, 204, 220] : [210, 150, 53]) : (chalk ? [188, 173, 143] : [64, 35, 22]);
    const light = raised ? (chalk ? [255, 255, 255] : [255, 238, 169]) : (chalk ? [222, 207, 172] : [151, 105, 64]);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, o = i * 4;
      let a = src[o + 3] / 255;
      if (!raised) a = Math.max(a, clamp(1.7 - outer[i]) * .8);
      if (a <= 0) continue;
      const nx = (surface[i - 1] - surface[i + 1]) * 1.8;
      const ny = (surface[i - w] - surface[i + w]) * 1.8;
      const rake = (-nx * .48 - ny * .78) / Math.hypot(nx, ny, 1);
      const grain = noise(x, y) - .5;
      // Gold has a broad polished face, a dark reflected band, fine leaf
      // wrinkles, and bright bevels. Leather has a compressed, porous floor.
      const sweep = raised ? .15 * Math.sin(y / h * 26 + x / w * 2)
        + .07 * Math.sin(y * .19 + Math.sin(x * .07)) : .035 * Math.sin(x * .22 + y * .41);
      const v = clamp(.50 + rake * .95 + sweep + grain * (raised ? .07 : .15));
      const from = v < .5 ? low : face, to = v < .5 ? face : light;
      const blend = v < .5 ? v * 2 : (v - .5) * 2;
      for (let k = 0; k < 3; k++) out[o + k] = from[k] + (to[k] - from[k]) * blend;
      out[o + 3] = a * 255;
    }
    this.fx.putImageData(this.pixels, 0, 0);
    target.save();
    // A short sidewall and soft contact shadow support the bevel; they never
    // replace it. The stamp's raised rim is generated by its signed field.
    if (raised) {
      const c = this.ctx;
      c.save(); c.globalCompositeOperation = 'source-in'; c.fillStyle = chalk ? '#47505c' : '#53300d';
      c.fillRect(0, 0, w, h); c.restore();
      target.save(); target.globalAlpha = .65; target.filter = 'blur(2px)';
      target.drawImage(this.mask, x0 + 1, y0 + 5); target.restore();
      for (let z = 3; z > 0; z--) target.drawImage(this.mask, x0, y0 + z);
    }
    target.drawImage(this.finish, x0, y0);
    target.restore();
  }

  stamp(target, x0, y0, text, fontPx, { crop, gutter, chalk }) {
    const { w, h } = this;
    const top = h * (1 - crop) / 2 + 12, left = gutter + 16;
    const fw = w - left * 2, fh = h - top * 2;
    target.save(); target.translate(x0, y0);
    cartouche(target, left, top, fw, fh, 25);
    target.save(); target.clip();
    const ground = target.createLinearGradient(0, top, 0, h - top);
    ground.addColorStop(0, 'rgba(72,36,18,.60)');
    ground.addColorStop(.48, 'rgba(148,91,45,.65)');
    ground.addColorStop(1, 'rgba(85,45,23,.58)');
    target.fillStyle = ground; target.fillRect(left, top, fw, fh);
    // Tiny paired pores, stable across names, rather than random grain that
    // crawls whenever a player joins. The felt remains visible through them.
    for (let y = top; y < h - top; y += 3) for (let x = left; x < w - left; x += 3) {
      const n = noise(x | 0, y | 0);
      if (n < .55) continue;
      target.fillStyle = `rgba(24,12,7,${.04 + n * .09})`;
      target.fillRect(x, y, 1.5, .8);
      target.fillStyle = 'rgba(210,150,83,.07)'; target.fillRect(x, y + 1, 1.5, .7);
    }
    target.restore(); target.restore();
    this.mark((c) => {
      c.lineWidth = 4.5;
      cartouche(c, left, top, fw, fh, 25); c.stroke();
      c.lineWidth = 2.6;
      cartouche(c, left + 10, top + 10, fw - 20, fh - 20, 23); c.stroke();
      // Repeating angled tool impressions between two scored border lines.
      c.lineWidth = 2;
      for (let x = left + 44; x < w / 2 - 28; x += 12) for (const side of [-1, 1]) {
        const px = side < 0 ? x : w - x;
        for (const y of [top + 5, h - top - 5]) {
          c.beginPath(); c.moveTo(px - 2, y - 2); c.lineTo(px + 2, y + 2); c.stroke();
        }
      }
      // Four carved corner sprigs, contained in the border's shoulders.
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        c.save(); c.translate(w / 2 + sx * (fw / 2 - 17), h / 2 + sy * (fh / 2 - 27));
        c.scale(-sx, -sy); c.lineWidth = 2.6; sprig(c, 56, 20); c.restore();
      }
      for (const y of [top + 5, h - top - 5]) {
        diamond(c, w / 2, y, 7);
        for (const side of [-1, 1]) { c.beginPath(); c.arc(w / 2 + side * 16, y, 2.6, 0, Math.PI * 2); c.fill(); }
      }
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
        c.save(); c.translate(w / 2 + sx * 22, h / 2 + sy * (fh / 2 - 21));
        c.scale(sx, -sy); c.lineWidth = 2.8; sprig(c, 110, 12); c.restore();
      }
      c.font = `700 ${fontPx}px Georgia, serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + h * .016);
    });
    this.relief(target, x0, y0, { raised: false, chalk, bevel: Math.max(2.5, fontPx * .028) });
  }

  emboss(target, x0, y0, glyphs, lay, chalk) {
    const { w, h } = this;
    const mid = h / 2 + h * .016;
    this.mark((c) => {
      glyphs(c);
      if (lay.flourish === 'none') return;
      c.lineWidth = 3;
      // Name-sized ornaments above and below leave long names their width.
      // Side diamonds retain the ROLL cue's visual family; curls give full
      // its own craft, and rule remains the simpler scored-line option.
      const span = Math.min(135, lay.total * .32);
      const clearance = Math.max(60, lay.fontPx * .55);
      for (const sy of [-1, 1]) {
        const y = mid + sy * clearance;
        diamond(c, w / 2, y, lay.flourish === 'full' ? 6 : 3);
        for (const sx of [-1, 1]) {
          c.save(); c.translate(w / 2 + sx * 12, y); c.scale(sx, -sy);
          if (lay.flourish === 'full') sprig(c, span, 18);
          else { c.beginPath(); c.moveTo(0, 0); c.lineTo(span, 0); c.stroke(); }
          c.restore();
        }
      }
      for (const side of [-1, 1]) {
        const inner = w / 2 + side * (lay.total / 2 + lay.gap);
        if (lay.loz) diamond(c, inner + side * lay.loz / 2, mid, lay.loz / 2);
        if (lay.len > 0) {
          c.lineWidth = Math.min(4, lay.hair);
          c.beginPath(); c.moveTo(inner + side * lay.loz, mid);
          c.lineTo(inner + side * (lay.loz + lay.len * .85), mid); c.stroke();
        }
      }
    });
    this.relief(target, x0, y0, { raised: true, chalk, bevel: Math.max(2.5, lay.fontPx * .035) });
  }
}
