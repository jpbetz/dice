/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {TABLE_DESIGNS} from './table-designs.js';
const KEY='dice.home-covers.v1',MAX_COVERS=8,MAX_BYTES=1024*1024;
let cache={};try{const stored=JSON.parse(localStorage.getItem(KEY)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))cache=stored;}catch{}
const pending=new Map();let queue=Promise.resolve(),preview=null,resolvePreview=null;
function remember(key,url){
  if(typeof url!=='string'||!url.startsWith('data:image/png;base64,')||url.length>220000)return;
  cache[key]=url;const keys=Object.keys(cache);while(keys.length>MAX_COVERS)delete cache[keys.shift()];
  const text=JSON.stringify(cache);if(text.length<=MAX_BYTES)try{localStorage.setItem(KEY,text);}catch{/* cover caching is optional */}
}
export function homeCover(cover){
  const id=cover?.venue;if(!TABLE_DESIGNS[id])return Promise.resolve(null);
  const key=TABLE_DESIGNS[id].model;if(typeof cache[key]==='string'&&cache[key].length<=220000&&cache[key].startsWith('data:image/png;base64,'))return Promise.resolve(cache[key]);
  if(pending.has(key))return pending.get(key);
  const visible=()=>document.hidden?new Promise(resolve=>{const show=()=>{if(!document.hidden){document.removeEventListener('visibilitychange',show);resolve();}};document.addEventListener('visibilitychange',show);}):Promise.resolve();
  const request=queue.then(async()=>{
    await visible();
    if(!preview){const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:480px;height:270px;pointer-events:none';host.setAttribute('aria-hidden','true');document.body.append(host);
      const {createTablePreview}=await import('./tablepreview.js');preview=createTablePreview(host,state=>{if(state.status==='ready'||state.status==='failed')resolvePreview?.(state);});}
    const state=await new Promise(resolve=>{resolvePreview=resolve;preview.show(id);if(preview.state.status==='ready')resolve(preview.state);});
    resolvePreview=null;if(state.status!=='ready'){preview.pause();return null;}await visible();const url=preview.capture();preview.pause();remember(key,url);return url;
  }).catch(()=>null);
  queue=request;pending.set(key,request);request.finally(()=>pending.delete(key));return request;
}
