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
import {assert} from './harness.mjs';
export const libraryWorkspaceScenarios = [{
  name:'library-workspace', tags:['smoke','library-workspace','profiles','settings'],
  async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.104',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.105',name:'Bob'});
    await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
    const size=(width,height)=>a.page.browser.send('Emulation.setDeviceMetricsOverride',
      {width,height,deviceScaleFactor:1,mobile:width<761},a.page.sessionId);
    const click=selector=>a.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const type=(id,value)=>a.eval(`(()=>{const i=document.getElementById(${JSON.stringify(id)});i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    const choose=id=>click(`.library-card[data-profile="${id}"]`);
    const escape=()=>a.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
    const submit=()=>a.eval(`document.getElementById('library-rename').requestSubmit()`);
    await a.dbg(`profiles.reset('soul-deal')`);
    const original=await a.dbg('profiles.active');
    const saved=await a.dbg('groups');
    await a.dbg(`profiles.copyFrom({name:'Nessa',system:'soul-deal',pools:[{name:'Longbow',notation:'1d20+5',category:'Combat'},{name:'Stealth',notation:'1d20+7',category:'Skills'}]})`);
    await a.dbg(`profiles.copyFrom({name:'Different system',system:'dnd',pools:[{name:'Shield',notation:'1d6'}]})`);
    const nessa=(await a.dbg('profiles.list')).find(p=>p.name==='Nessa');
    await size(1440,900);
    await a.roll('6d6 t3'); const rid=await a.rollId();
    const turn=await a.dbg(`turnState(${JSON.stringify(rid)})`);
    const layout=await a.eval(`document.getElementById('rail').getBoundingClientRect().toJSON()`);
    await click('#identity-chip'); await click('#idm-library');
    const frame=await a.eval(`({root:document.getElementById('settings-panel').getBoundingClientRect().toJSON(),list:document.querySelector('.library-browser').getBoundingClientRect().toJSON(),detail:document.getElementById('library-detail').getBoundingClientRect().toJSON()})`);
    assert.ok(frame.root.width>=1000 && frame.list.right<=frame.detail.left,'a focused library has room for the list and saved rolls');
    assert.equal(await a.eval(`document.getElementById('left-panel').inert`),true);
    await type('library-search','stealth');
    assert.equal(await a.eval(`document.querySelectorAll('.library-card').length`),1,'find a character by a saved roll');
    await choose(nessa.id);
    assert.equal(await a.eval(`document.getElementById('library-name').textContent`),'Nessa');
    assert.deepEqual(await a.eval(`[...document.querySelectorAll('.library-roll code')].map(e=>e.textContent)`),['1d20+5','1d20+7']);
    assert.equal((await a.dbg('profiles.active')).id,original.id,'selection previews without switching');
    assert.deepEqual(await a.dbg('groups'),saved);
    await click('#library-rename-open'); await type('library-rename-input',''); await submit();
    assert.equal(await a.eval(`document.getElementById('library-rename').hidden`),false,'invalid name retains the form');
    await type('library-rename-input','Nessa the Swift');
    // A failed local write must retain both the candidate and the kept library.
    await a.eval(`window.__librarySetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='dice.profiles.v1')throw new Error('test storage refusal');return window.__librarySetItem.call(this,k,v)}`);
    await submit();
    assert.equal((await a.dbg('profiles.list')).find(p=>p.id===nessa.id).name,'Nessa');
    assert.equal(await a.eval(`document.getElementById('library-rename-input').value`),'Nessa the Swift');
    await a.eval(`Storage.prototype.setItem=window.__librarySetItem;delete window.__librarySetItem`);
    await submit();
    assert.equal((await a.dbg('profiles.list')).find(p=>p.id===nessa.id).name,'Nessa the Swift');
    await click('#library-duplicate');
    const copy=(await a.dbg('profiles.list')).find(p=>p.name==='Nessa the Swift 2');
    assert.ok(copy,'Duplicate makes an independent named copy');
    assert.equal((await a.dbg('profiles.active')).id,original.id);
    await click('#library-delete-open');
    assert.match(await a.eval(`document.getElementById('library-delete-question').textContent`),/Nessa the Swift 2/);
    assert.match(await a.eval(`document.getElementById('library-delete-impact').textContent`),/2 saved rolls/);
    await click('#library-delete-cancel');
    assert.ok((await a.dbg('profiles.list')).some(p=>p.id===copy.id));
    await click('#library-delete-open');
    await a.eval(`window.__librarySetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='dice.profiles.v1')throw new Error('test storage refusal');return window.__librarySetItem.call(this,k,v)}`);
    await click('#library-delete-confirm');
    assert.ok((await a.dbg('profiles.list')).some(p=>p.id===copy.id),'failed deletion keeps the character in memory');
    assert.equal(await a.eval(`document.getElementById('library-delete').hidden`),false,'failed deletion remains reviewable');
    await a.eval(`Storage.prototype.setItem=window.__librarySetItem;delete window.__librarySetItem`);
    await click('#library-delete-confirm');
    assert.ok(!(await a.dbg('profiles.list')).some(p=>p.id===copy.id));
    await type('library-search','');
    const other=(await a.dbg('profiles.list')).find(p=>p.name==='Different system');
    await choose(other.id);
    assert.equal(await a.eval(`document.getElementById('library-use').disabled`),true,'a different procedure is explained before switching');
    assert.match(await a.eval(`document.getElementById('library-use-note').textContent`),/This table uses/);
    await b.dbg(`profiles.reset('soul-deal')`);
    await b.dbg(`profiles.rename(window.__diceDebug.profiles.active.id,'Bobs character')`);
    await b.dbg(`setGroups([{name:'Bobs spear',notation:'1d20+3'}])`);
    await click('[data-library-page="shared"]');
    await a.waitFor(`document.getElementById('table-profile-rows').textContent.includes('Bobs character')`);
    assert.equal(await a.eval(`[...document.querySelectorAll('#table-profile-rows .pp-name')].filter(e=>e.textContent.includes('Bobs character')).length`),1,'the active character appears once, with its owner');
    await a.eval(`(()=>{const r=[...document.querySelectorAll('#table-profile-rows .pp-row')].find(e=>e.textContent.includes('Bobs character'));r.querySelector('button').click()})()`);
    assert.ok((await a.dbg('profiles.list')).some(p=>p.name==='Bobs character'));
    assert.equal((await a.dbg('profiles.active')).id,original.id,'copying a teammate never replaces the active rolls');
    await click('#portable-open');
    assert.ok(await a.eval(`document.getElementById('portable-text').value.includes('Nessa the Swift')`));
    await click('[data-library-page="mine"]');
    await b.roll('2d6'); await a.settle();
    assert.equal(await a.rollId(),await b.rollId(),'another player rolls while the library is open');
    const after=await a.dbg(`turnState(${JSON.stringify(rid)})`);
    assert.deepEqual(after.throws,turn.throws); assert.deepEqual(after.values,turn.values);
    await click('#settings-close');
    assert.equal(await a.eval('document.activeElement.id'),'identity-chip');
    assert.deepEqual(await a.eval(`document.getElementById('rail').getBoundingClientRect().toJSON()`),layout,'root UI uses no more space');
    await size(390,844); await a.emulateCoarsePointer(true);
    // Enough characters to exercise returning to a scrolled list.
    for(let i=0;i<8;i++) await a.dbg(`profiles.copyFrom({name:'Extra ${i}',system:'soul-deal',pools:[]})`);
    await click('#identity-chip'); await click('#idm-library');
    const last=(await a.dbg('profiles.list')).at(-1);
    await a.eval(`(()=>{const c=document.querySelector('.library-card[data-profile="${last.id}"]');c.scrollIntoView({block:'center'});c.focus({preventScroll:true})})()`);
    const scroll=await a.eval(`document.getElementById('profile-rows').scrollTop`);
    await choose(last.id);
    assert.equal(await a.eval(`document.querySelector('.library-browser').offsetParent`),null);
    assert.equal(await a.eval('document.activeElement.id'),'library-back');
    await click('#library-back');
    assert.equal(await a.eval(`document.getElementById('profile-rows').scrollTop`),scroll);
    assert.equal(await a.eval('document.activeElement.dataset.profile'),last.id);
    await type('library-search','nessa'); await choose(nessa.id);
    const use=await a.eval(`document.getElementById('library-use').getBoundingClientRect().toJSON()`);
    assert.ok(use.top>0 && use.bottom<844,'Use is visible without scrolling');
    await click('#library-back'); await size(390,440);
    await a.eval(`document.getElementById('library-create').open=true;document.getElementById('profile-newname').focus()`);
    const create=await a.eval(`({button:document.getElementById('profile-new').getBoundingClientRect().toJSON(),footer:document.getElementById('library-footer').getBoundingClientRect().toJSON()})`);
    assert.ok(create.button.top>0 && create.button.bottom<=create.footer.top,'short-screen creation keeps both actions clear of the footer');
    await escape(); await choose(nessa.id);
    await size(390,440); await click('#library-rename-open');
    const form=await a.eval(`({input:document.getElementById('library-rename-input').getBoundingClientRect().toJSON(),save:document.querySelector('#library-rename [type="submit"]').getBoundingClientRect().toJSON(),width:document.body.scrollWidth})`);
    assert.ok(form.input.top>=0 && form.save.bottom<=440,'rename and Save fit the keyboard viewport');
    assert.equal(form.width,390);
    await size(844,390);
    await a.waitFor(`document.querySelector('#library-rename [type="submit"]').getBoundingClientRect().bottom<=document.querySelector('.library-detail-scroll').getBoundingClientRect().bottom`);
    assert.equal(await a.eval('document.activeElement.id'),'library-rename-input','rotation preserves the edit focus');
    await escape();
    assert.equal(await a.eval(`document.getElementById('settings-modal').classList.contains('hidden')`),false,'Escape first cancels the form');
    await click('#library-use');
    assert.equal((await a.dbg('profiles.active')).id,nessa.id);
    assert.deepEqual((await a.dbg('groups')).map(p=>p.name),['Longbow','Stealth']);
    assert.equal(await a.eval(`document.getElementById('left-panel').inert`),false);
    await a.dbg(`profiles.use(${JSON.stringify(original.id)})`);
    assert.deepEqual(await a.dbg('groups'),saved,'the outgoing character kept every roll');
  },
}];
