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

// Shared by the developer controls and the canvas painter; no browser imports.
export const STYLES = Object.freeze(['tent', 'plate', 'inlay', 'stamp', 'embossed', 'parchment', 'arcane']);
export const FONTS = Object.freeze(['theme', 'serif', 'book', 'sans', 'mono']);
export const WEIGHTS = Object.freeze(['regular', 'bold']);
export const PALETTES = Object.freeze(['theme', 'custom']);
export const FONT_DEFAULT = Object.freeze({ family: 'theme', weight: 'bold', spacing: 0 });
export const PALETTE_DEFAULT = Object.freeze({ mode: 'theme', text: '#efe6d2', accent: '#bba170', surface: '#78543c' });
const FAMILIES = {
  serif: 'Georgia, serif',
  book: '"Palatino Linotype", "Book Antiqua", "Bitstream Charter", Palatino, serif',
  sans: '"Trebuchet MS", Arial, sans-serif',
  mono: '"Courier New", monospace',
};
export function fontCSS(dress, px) {
  const family = dress.font.family === 'theme'
    ? (dress.style === 'parchment' ? 'book' : dress.style === 'arcane' ? 'sans' : 'serif')
    : dress.font.family;
  return `${dress.font.weight === 'regular' ? 400 : 700} ${px}px ${FAMILIES[family] || FAMILIES.serif}`;
}
export function paletteFor(dress) {
  if (dress.palette.mode === 'custom') return { ...dress.palette };
  const chalk = dress.ink.tone === 'chalk';
  switch (dress.style) {
    // Unfilled blind tooling in natural hide, including when the inlay's
    // chalk tone was selected. Pale metallic lettering was the bronze illusion.
    case 'stamp': return { text: '#38281f', accent: '#493326', surface: '#805b43' };
    case 'embossed': return { text: chalk ? '#c0ccdc' : '#c89741', accent: chalk ? '#c0ccdc' : '#c89741', surface: '#78543c' };
    case 'parchment': return { text: '#483127', accent: '#995444', surface: '#e0c697' };
    case 'arcane': return { text: '#d3f4ed', accent: '#7bc7c1', surface: '#233c50' };
    default: return { text: chalk && dress.style === 'inlay' ? '#efe6d2' : '#5a4632', accent: '#b98f4a', surface: '#e3d8bd' };
  }
}
export const hexRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const mixColor = (a, b, t) => {
  const aa = hexRGB(a), bb = hexRGB(b);
  return '#' + aa.map((v, i) => Math.round(v + (bb[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// One width calculation for fitting and painting. Zero tracking preserves
// native kerning; positive tracking measures exactly the glyphs we draw.
export function lettering(ctx, text, font, spacing) {
  ctx.font = font;
  const chars = [...text], widths = chars.map((c) => ctx.measureText(c).width);
  const width = spacing === 0 ? ctx.measureText(text).width
    : widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  return { width, draw(c, x, y) {
    c.font = font; c.textBaseline = 'middle';
    if (!spacing) { c.textAlign = 'center'; c.fillText(text, x, y); return; }
    c.textAlign = 'left';
    let at = x - width / 2;
    for (let i = 0; i < chars.length; i++) { c.fillText(chars[i], at, y); at += widths[i] + spacing; }
  } };
}
