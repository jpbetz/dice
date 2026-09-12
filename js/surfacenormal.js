// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0
import * as THREE from 'three';

// Tileable canvas height -> OpenGL tangent normals. CanvasTexture flips Y,
// therefore green is +dH/d(canvas y). The normalConvention diagnostic checks
// this sign against a synthetic ridge; extracting it does not change pixels.
export function heightToNormal(heightCanvas, strength) {
  const s = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const octx = out.getContext('2d');
  const img = octx.createImageData(s, s);
  const h = (x, y) => src[((((y % s) + s) % s) * s + (((x % s) + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength * 2;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength * 2; // see the note above
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

