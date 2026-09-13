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

import { dealRack, dealName } from './seed.js';

// New play has a different default from unstamped historical libraries.
// The latter retain meanings.js DEFAULT_SYSTEM for backward interpretation.
export const NEW_TABLE_SYSTEM = 'none';
export const QUICK_ROLLS = Object.freeze(['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d6', 'd100']);
export const STARTER_KITS = Object.freeze([
  {id:'soul-deal', name:'Soul Deal', description:'A priced character rack: attributes, skills, and motivations.', interpretation:'Soul Deal'},
  {id:'dnd', name:'D&D', description:'Familiar checks, saves, and damage rolls.', interpretation:'D&D'},
  {id:'none', name:'Everyday rolls', description:'A small collection of familiar rolls to rename and keep.', interpretation:'Numbers only'},
]);

export function previewStarterKit(id, rng = Math.random) {
  const kit = STARTER_KITS.find(k => k.id === id);
  if (!kit) return null;
  return {...kit, profileName:dealName(id, rng), pools:dealRack(id, rng)};
}

export function renderQuickRolls(host, {roll, build, compact = false}) {
  host.replaceChildren();
  const grid = document.createElement('div');
  grid.className = 'quick-rolls' + (compact ? ' quick-rolls-compact' : '');
  grid.setAttribute('role','group'); grid.setAttribute('aria-label','Quick dice');
  for (const notation of QUICK_ROLLS) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn quick-roll';
    button.dataset.quick = notation; button.textContent = notation;
    button.title = `Roll ${notation}`; button.setAttribute('aria-label',`Roll ${notation}`);
    button.addEventListener('click', () => roll(notation));
    grid.append(button);
  }
  const button = document.createElement('button');
  button.type='button'; button.className='btn ghost dice-mode-link';
  button.textContent='Build dice…'; button.addEventListener('click',build);
  host.append(grid,button);
}

// One preview is kept until an explicit Add. Merely browsing deals no saved
// profile and writes no table setting. The displayed pools ARE the added pools.
export function createStarterKitChooser(host, {add, tableLabel, changed}) {
  let candidate = null;
  host.innerHTML = `<div class="starter-choices" role="group" aria-label="Starter kits"></div>
    <section class="starter-preview" hidden><h3></h3><p class="starter-description"></p>
    <p class="starter-context"></p><ul class="starter-pools"></ul>
    <div class="starter-actions"><button type="button" class="btn starter-add">Add as a new profile</button>
    <button type="button" class="btn ghost starter-another">Deal another</button></div></section>
    <p class="starter-status" role="status"></p>`;
  const $ = s => host.querySelector(s);
  function preview(id) {
    candidate = previewStarterKit(id);
    $('.starter-preview').hidden = !candidate;
    if (!candidate) return;
    $('.starter-status').textContent='';
    $('.starter-preview h3').textContent=candidate.profileName;
    $('.starter-description').textContent=`${candidate.name} · ${candidate.pools.length} saved rolls. ${candidate.description}`;
    $('.starter-context').textContent=`Reads as ${candidate.interpretation}. This table stays ${tableLabel()}.`;
    $('.starter-pools').replaceChildren(...candidate.pools.map(pool => {
      const li=document.createElement('li');
      const name=document.createElement('span'); name.textContent=pool.name;
      const notation=document.createElement('code'); notation.textContent=pool.notation;
      li.append(name,notation); return li;
    }));
    host.querySelectorAll('[data-kit]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.kit===id)));
    $('.starter-add').disabled=false;
  }
  for (const kit of STARTER_KITS) {
    const button=document.createElement('button');
    button.type='button'; button.className='btn'; button.dataset.kit=kit.id;
    button.textContent=kit.name; button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>preview(kit.id)); $('.starter-choices').append(button);
  }
  $('.starter-another').addEventListener('click',()=>{if(candidate) preview(candidate.id);});
  $('.starter-add').addEventListener('click',()=>{
    if(!candidate) return;
    const result=add(candidate);
    $('.starter-status').textContent=result.status;
    if(result.ok) { $('.starter-add').disabled=true; changed?.(); }
  });
  return {get candidate(){return candidate;}, update(){
    if(candidate) $('.starter-context').textContent=`Reads as ${candidate.interpretation}. This table stays ${tableLabel()}.`;
  }};
}
