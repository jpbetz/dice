// Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
import {readFileSync} from 'node:fs';import {inflateSync} from 'node:zlib';
function decodePng(buf) {
  let p = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`rooted: unexpected PNG (depth ${bitDepth}, color ${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const rows=[];
for(const path of process.argv.slice(2)){
 const buf=readFileSync(path),im=decodePng(buf),regions={};
 for(const [name,x,y,w,h] of [['nav',0,792,390,52],['quickTrayAndNav',0,660,390,184],['savedTrayAndNav',0,619,390,225]]){
  if(im.w<x+w||im.h<y+h)continue;
  const bytes=Buffer.concat(Array.from({length:h},(_,i)=>im.px.subarray(((y+i)*im.w+x)*im.bpp,((y+i)*im.w+x+w)*im.bpp)));
  regions[name]={x,y,w,h,sha256:hash(bytes),bytes:bytes.length};
 }
 rows.push({path,pngSha256:hash(buf),width:im.w,height:im.h,bpp:im.bpp,regions});
}
console.log(JSON.stringify({_copyright:'Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0',method:'Existing tools/steps/rooted.mjs PNG decoder; SHA-256 over decoded row-major RGB bytes in exact unmodified source PNG regions.',rows},null,2));
