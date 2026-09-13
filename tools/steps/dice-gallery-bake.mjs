/*
Copyright 2026 The Dice Table Authors
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
*/

// Offline portraits of the actual dice. The gallery only loads these images;
// it never warms the whole catalogue's geometry/material/WebGL caches.
// node tools/drive.mjs tools/steps/dice-gallery-bake.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default async function run(stage) {
  const dir = fileURLToPath(new URL('../../models/dice-gallery/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Portraits');
  const ids = await a.eval(`import('/js/themes.js').then(m => ['std', ...Object.keys(m.SETS)])`);
  for (const id of ids) {
    const data = await a.eval(`(async () => {
      const {dieArtURL} = await import('/js/diceart.js');
      const canvas = document.createElement('canvas');
      canvas.width = 560; canvas.height = 280;
      const ctx = canvas.getContext('2d');
      for (const [type,x,y,w] of [['d12',6,76,178],['d6',375,75,175],['d20',165,4,252]]) {
        const url = dieArtURL(type, ${JSON.stringify(id)});
        if (!url) throw new Error('No rendered portrait for '+type);
        const img = new Image(); img.src = url; await img.decode();
        ctx.drawImage(img,x,y,w,w);
      }
      return canvas.toDataURL('image/webp',0.92).split(',')[1];
    })()`);
    writeFileSync(`${dir}${id}.webp`, Buffer.from(data, 'base64'));
    console.log(`portrait ${id}`);
  }
}
