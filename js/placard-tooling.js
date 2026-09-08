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

import { hexRGB, mixColor } from './placard-design.js';

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

// A closed Celtic plait: two winding strands return into one another at
// the ends. Alternate crossings have real gaps in the underpassing strand,
// rather than a dark stroke that would paint a false background on the mat.
// The knot is built on the reusable scratch canvas, then laid over the halo.
function knotBand(ctx, x0, x1, y, height, crossings, color) {
  const pitch = (x1 - x0) / crossings;
  const stroke = 3.6;
  const strand = (sign, from, to) => {
    ctx.beginPath();
    for (let x = from; x < to; x += 1) {
      const py = y + sign * height * Math.cos((x - x0) / pitch * Math.PI);
      if (x === from) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.lineTo(to, y + sign * height * Math.cos((to - x0) / pitch * Math.PI));
    ctx.stroke();
  };
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.lineWidth = stroke;
  strand(1, x0, x1); strand(-1, x0, x1);
  // An even number of crossings puts both returning ends on the same side.
  ctx.beginPath(); ctx.arc(x0, y, height, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(x1, y, height, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  for (let i = 0; i < crossings; i++) {
    const x = x0 + (i + .5) * pitch, over = i % 2 ? -1 : 1;
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = stroke + 3.5;
    strand(over, x - 10, x + 10);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = stroke;
    strand(over, x - 13, x + 13);
  }
  ctx.restore();
}

// Four returning loops with alternating crossings: a compact central knot
// gives the long plaits a recognisable interlaced figure at table distance.
function knotSeal(ctx, x, y, color) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.roundRect(-24, -8, 48, 16, 8); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-8, -24, 16, 48, 8); ctx.stroke();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const horizontal = sx === sy;
    const cross = (half) => {
      ctx.beginPath();
      ctx.moveTo(sx * 8 - (horizontal ? half : 0), sy * 8 - (horizontal ? 0 : half));
      ctx.lineTo(sx * 8 + (horizontal ? half : 0), sy * 8 + (horizontal ? 0 : half));
      ctx.stroke();
    };
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 7.1; cross(4);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 3.6; cross(6);
  }
  ctx.restore();
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

  relief(target, x0, y0, { raised, chalk, bevel, color }) {
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
    const base = color || (raised ? (chalk ? '#c0ccdc' : '#c89741') : '#38281f');
    const low = raised && base === '#c89741' ? [112, 73, 29]
      : raised && base === '#c0ccdc' ? [65, 78, 94]
        : hexRGB(mixColor(base, '#100d0c', raised ? .6 : .22));
    const face = hexRGB(base);
    // Hide has diffuse compressed fibres, without a bright burnished rim.
    const light = raised && base === '#c89741' ? [234, 205, 139]
      : raised && base === '#c0ccdc' ? [255, 255, 255]
        : hexRGB(mixColor(base, raised ? '#fff4d7' : '#ad9680', raised ? .5 : .20));
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, o = i * 4;
      let a = src[o + 3] / 255;
      if (!raised) a = Math.max(a, clamp(1.7 - outer[i]) * .8);
      if (a <= 0) continue;
      const nx = (surface[i - 1] - surface[i + 1]) * 1.8;
      const ny = (surface[i - w] - surface[i + w]) * 1.8;
      const rake = (-nx * .48 - ny * .78) / Math.hypot(nx, ny, 1);
      const grain = noise(x, y) - .5;
      // Satin gold keeps the broad reflection but softens the bright edge
      // and fine wrinkles. Leather's shallow tooling lets the mat show through.
      const sweep = raised ? .10 * Math.sin(y / h * 26 + x / w * 2)
        + .035 * Math.sin(y * .19 + Math.sin(x * .07)) : .025 * Math.sin(x * .22 + y * .41);
      const v = clamp(.50 + rake * (raised ? .75 : .36) + sweep + grain * (raised ? .04 : .10));
      const from = v < .5 ? low : face, to = v < .5 ? face : light;
      const blend = v < .5 ? v * 2 : (v - .5) * 2;
      for (let k = 0; k < 3; k++) out[o + k] = from[k] + (to[k] - from[k]) * blend;
      out[o + 3] = a * 255 * (raised ? 1 : .85);
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
    if (!raised) target.filter = 'blur(.45px)';
    target.drawImage(this.finish, x0, y0);
    target.restore();
  }

  stamp(target, x0, y0, glyphs, fontPx, { crop, gutter, palette, flourish }) {
    const { w, h } = this;
    const top = h * (1 - crop) / 2 + 12, left = gutter + 16;
    const fw = w - left * 2, fh = h - top * 2;
    target.save(); target.translate(x0, y0);
    // A soft-edged patch of matte hide. No metal sweep, bevelled perimeter,
    // or scalloped plate silhouette: the tool compresses the hide itself.
    target.beginPath(); target.roundRect(left, top, fw, fh, 24);
    target.save(); target.clip();
    target.globalAlpha = .64; target.fillStyle = palette.surface;
    target.fillRect(left, top, fw, fh);
    target.globalAlpha = 1;
    // Jittered pores and fine creases have no regular weave or square cells.
    // Keep their contrast below the impression; hide is not hammered metal.
    for (let y = top; y < h - top; y += 3) for (let x = left; x < w - left; x += 3) {
      const n = noise(x | 0, y | 0), m = noise(y | 0, x | 0);
      const px = x + n * 3, py = y + m * 3;
      target.fillStyle = '#241b15'; target.globalAlpha = .04 + n * .07;
      target.beginPath(); target.ellipse(px, py, .5 + n, .4, m * 3, 0, Math.PI * 2); target.fill();
      target.fillStyle = '#b9a28b'; target.globalAlpha = .025 + m * .035;
      target.fillRect(px, py + 1, 1.5, .6);
      if (n > .88) {
        target.strokeStyle = '#37261c'; target.globalAlpha = .05;
        target.lineWidth = .6; target.beginPath(); target.moveTo(px, py);
        target.quadraticCurveTo(px + 3, py - 1, px + 5, py + m * 3); target.stroke();
      }
    }
    target.restore();
    // The edge fades into the mat, instead of catching light as a metal rim.
    target.globalAlpha = .10; target.strokeStyle = palette.surface;
    target.lineWidth = 7; target.filter = 'blur(3px)';
    target.beginPath(); target.roundRect(left, top, fw, fh, 24); target.stroke();
    target.restore();
    if (flourish !== 'none') {
      this.mark((c) => {
        c.lineWidth = 2.8;
        c.beginPath(); c.roundRect(left + 12, top + 12, fw - 24, fh - 24, 17); c.stroke();
        if (flourish === 'rule') return;
        c.lineWidth = 1.7;
        c.beginPath(); c.roundRect(left + 20, top + 20, fw - 40, fh - 40, 12); c.stroke();
        // Short oblique impressions, like a saddle-maker's border tool.
        for (let x = left + 38; x < w - left - 30; x += 13) {
          for (const y of [top + 16, h - top - 16]) {
            c.beginPath(); c.moveTo(x - 2, y - 2); c.lineTo(x + 2, y + 2); c.stroke();
          }
        }
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          c.save(); c.translate(w / 2 + sx * (fw / 2 - 30), h / 2 + sy * (fh / 2 - 38));
          c.scale(-sx, -sy); c.lineWidth = 2.3; sprig(c, 53, 18); c.restore();
        }
      });
      this.relief(target, x0, y0, { raised: false, color: palette.accent, bevel: 3 });
    }
    this.mark(glyphs);
    this.relief(target, x0, y0, { raised: false, color: palette.text, bevel: Math.max(3, fontPx * .035) });
  }

  theme(target, x0, y0, glyphs, { style, palette, flourish, crop, gutter }) {
    const { w, h } = this;
    const left = gutter + 13, top = h * (1 - crop) / 2 + 9;
    target.save(); target.translate(x0, y0);
    if (style === 'parchment') {
      // Uneven deckled edges and fibres distinguish a manuscript strip from
      // the rigid plate. Small damage stays outside the name's fitting box.
      target.beginPath();
      for (let x = left; x <= w - left; x += 6) {
        const y = top + noise(x, 3) * 5;
        if (x === left) target.moveTo(x, y); else target.lineTo(x, y);
      }
      for (let x = w - left; x >= left; x -= 6) target.lineTo(x, h - top - noise(x, 9) * 5);
      target.closePath();
      target.save(); target.clip();
      target.fillStyle = palette.surface; target.fill();
      const edge = target.createLinearGradient(0, top, 0, h - top);
      edge.addColorStop(0, 'rgba(70,37,19,.26)'); edge.addColorStop(.14, 'rgba(70,37,19,0)');
      edge.addColorStop(.86, 'rgba(70,37,19,0)'); edge.addColorStop(1, 'rgba(70,37,19,.22)');
      target.fillStyle = edge; target.fillRect(left, top, w - 2 * left, h - 2 * top);
      for (let y = top; y < h - top; y += 4) for (let x = left; x < w - left; x += 5) {
        target.globalAlpha = noise(x, y | 0) * .09;
        target.fillStyle = '#5e3f25'; target.fillRect(x, y, 1 + noise(y | 0, x) * 5, .7);
      }
      target.restore();
      if (flourish !== 'none') {
        target.strokeStyle = target.fillStyle = palette.accent; target.lineWidth = 2;
        for (const y of [top + 22, h - top - 22]) {
          target.beginPath(); target.moveTo(left + 26, y); target.lineTo(w - left - 26, y); target.stroke();
        }
        if (flourish === 'full') for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          target.save(); target.translate(w / 2 + sx * (w / 2 - left - 28), h / 2 + sy * (h / 2 - top - 39));
          target.scale(-sx, -sy); sprig(target, 57, 14); target.restore();
        }
      }
    } else {
      // Arcane and Celtic share the same cool ink and quiet blue ground.
      // The centre stays quiet, and the entire inscription stays scene-lit.
      const halo = target.createRadialGradient(w / 2, h / 2, 12, w / 2, h / 2, w * .45);
      halo.addColorStop(0, palette.surface + '80'); halo.addColorStop(1, palette.surface + '00');
      target.fillStyle = halo; target.fillRect(left, top, w - left * 2, h - top * 2);
      if (style === 'celtic' && flourish !== 'none') {
        // Scottish Celtic-inspired interlace, outside the name's fitting box.
        // Full pairs the central four-loop knot with returning plaits;
        // rule keeps just the central knot and fine rules.
        const c = this.ctx;
        c.clearRect(0, 0, w, h);
        for (const sy of [-1, 1]) {
          const y = h / 2 + sy * 96;
          knotSeal(c, w / 2, y, palette.accent);
          if (flourish === 'full') {
            for (const sx of [-1, 1]) {
              const centre = w / 2 + sx * 160;
              knotBand(c, centre - 99, centre + 99, y, 11, 4, palette.accent);
            }
          }
          if (flourish === 'rule') {
            c.save(); c.strokeStyle = palette.accent; c.lineWidth = 1.5;
            for (const sx of [-1, 1]) {
              c.beginPath(); c.moveTo(w / 2 + sx * 45, y);
              c.lineTo(w / 2 + sx * 264, y); c.stroke();
            }
            c.restore();
          }
        }
        target.drawImage(this.mask, 0, 0);
      } else if (style === 'arcane' && flourish !== 'none') {
        target.strokeStyle = target.fillStyle = palette.accent; target.lineWidth = 2;
        for (const sy of [-1, 1]) {
          const y = h / 2 + sy * 91;
          for (const sx of [-1, 1]) {
            target.beginPath(); target.moveTo(w / 2 + sx * 27, y);
            target.quadraticCurveTo(w / 2 + sx * 125, y + sy * 17, w / 2 + sx * 240, y - sy * 6); target.stroke();
          }
          diamond(target, w / 2, y, 5);
          if (flourish === 'full') {
            target.beginPath(); target.arc(w / 2, y, 14, 0, Math.PI * 2); target.stroke();
            for (const sx of [-1, 1]) {
              diamond(target, w / 2 + sx * 192, y + sy * 6, 4);
              for (let i = 0; i < 3; i++) {
                target.beginPath(); target.arc(w / 2 + sx * (54 + i * 15), y + sy * (8 + i * 2), 1.7, 0, Math.PI * 2); target.fill();
              }
            }
          }
        }
      }
    }
    target.fillStyle = palette.text; glyphs(target);
    target.restore();
  }

  emboss(target, x0, y0, glyphs, lay, chalk, palette) {
    const { w, h } = this;
    const mid = h / 2 + h * .016;
    this.mark((c) => {
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
    this.relief(target, x0, y0, { raised: true, chalk, color: palette.accent, bevel: 2.5 });
    this.mark(glyphs);
    this.relief(target, x0, y0, { raised: true, chalk, color: palette.text, bevel: Math.max(2.5, lay.fontPx * .035) });
  }
}
