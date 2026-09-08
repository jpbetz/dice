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

// Evaluated in the browser by the scenario and the screenshot step. Probe
// the real painter after shrinking to a ~224px name band, like the near seat
// in the 1600x900 table. Alpha measures holes, independent of felt/ink color.
export async function probeCelticWeave() {
  const { ToolingPainter } = await import('/js/placard-tooling.js');
  const painter = new ToolingPainter(640, 320);
  const target = document.createElement('canvas'); target.width = 640; target.height = 320;
  painter.theme(target.getContext('2d'), 0, 0, () => {}, {
    style: 'celtic', flourish: 'full', crop: .95, gutter: 16,
    palette: { text: '#ffffff', accent: '#ffffff', surface: '#000000' },
  });
  const scaled = document.createElement('canvas'); scaled.width = 224; scaled.height = 112;
  const c = scaled.getContext('2d'); c.drawImage(painter.mask, 0, 0, 224, 112);
  const { data } = c.getImageData(0, 0, 224, 112);
  const alpha = (x, y) => {
    x = x * .35 - .5; y = y * .35 - .5;
    const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
    const a = (dx, dy) => data[((iy + dy) * 224 + ix + dx) * 4 + 3];
    return Math.round(a(0, 0) * (1 - u) * (1 - v) + a(1, 0) * u * (1 - v)
      + a(0, 1) * (1 - u) * v + a(1, 1) * u * v);
  };
  const samples = [];
  for (const side of [-1, 1]) for (const row of [-1, 1]) {
    // Both crossing orientations, read from the reference drawing. Along
    // the under-strand we must see ribbon, gap, bridge, gap, ribbon again.
    for (const [sx, sy, dir] of [[281.068, 124.8, 1], [358.284, 124.8, 1],
      [435.5, 124.8, 1], [512.716, 124.8, 1], [396.892, 163.408, -1], [319.676, 86.192, -1]]) {
      const x = 320 + side * 165 + (sx - 396.892) * .285;
      const y = 160 + row * 112 - (sy - 124.8) * .285;
      const at = d => alpha(x + d / Math.SQRT2, y - dir * d / Math.SQRT2);
      samples.push({ side, row, sx, sy, bridge: at(0),
        gaps: [-1, 1].map(sign => Math.min(...[4, 5, 6, 7, 8].map(d => at(sign * d)))),
        returns: [-1, 1].map(sign => Math.max(...[9, 10, 11, 12, 13].map(d => at(sign * d)))),
      });
    }
  }
  return { samples, png: scaled.toDataURL().split(',')[1] };
}
