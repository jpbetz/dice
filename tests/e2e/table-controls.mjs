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
import {tapControl} from './roll-flows.mjs';
import {type as typeControl, key} from '../fixtures/visible-input.mjs';

const inputName = (tab, name) => tab.eval(`(() => {
  const input=document.getElementById('set-table-name'); input.value=${JSON.stringify(name)};
  input.dispatchEvent(new Event('input',{bubbles:true}));
})()`);
const click = (tab, selector) => tab.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

export const tableControlScenarios = [
  {
    name:'felt-previews-on-demand', tags:['smoke','table-controls','settings','felt-previews'],
    async fn(ctx) {
      const a=await ctx.newTable({origin:'127.0.0.109',name:'Alice'});
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',
        {width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
      await a.emulateCoarsePointer();
      const info=()=>a.dbg('feltPreviewInfo()');
      const initial=await info();
      assert.equal(initial.previews,0,'closed settings generate no preview images');
      assert.equal(initial.tiles,1,'only the mat in use has a full-size texture');
      await a.dbg("openSettings('you')");
      await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.equal((await info()).previews,0,'Preferences does not build Appearance');
      await a.dbg('closeSettingsModal()');
      await tapControl(a,'#table-open');await tapControl(a,'#snav-staging');
      await a.waitFor(`!!document.getElementById('table-preview').style.backgroundImage`);
      await a.eval("document.getElementById('felt-swatches').scrollIntoView({block:'center'})");
      await a.waitFor(`[...document.querySelectorAll('#felt-swatches .swatch-dot')].every(el=>el.style.backgroundImage)`);
      const drawn=await info();
      assert.ok(drawn.previews>=10,'visible choices still show their real cloth');
      assert.equal(drawn.tiles,1,'previews do not retain full-size textures for unused mats');
      assert.ok(drawn.bytes<1000000,'the catalogue keeps thumbnail-sized images');
      const before=await a.dbg('felt.id');
      await tapControl(a,'[data-felt="ocean"]');
      assert.equal(await a.dbg('felt.id'),before,'previewing a choice leaves the shared mat unchanged');
      await a.eval("document.getElementById('table-preview').scrollIntoView({block:'center'})");
      await a.waitFor(`document.getElementById('table-preview').style.backgroundImage===document.querySelector('[data-felt="ocean"] .swatch-dot').style.backgroundImage`);
      await tapControl(a,'#table-edit-apply');
      await a.waitFor('window.__diceDebug.felt.id==="ocean"');
      await tapControl(a,'#settings-close');
      await a.waitFor('window.__diceDebug.feltPreviewInfo().pending===0');
      assert.equal((await info()).tiles,2,'only applying a mat retains its full-size texture');
      // Reopening uses cached previews, with no new image work queued.
      await a.dbg("openSettings('staging')");
      await a.eval("document.getElementById('felt-swatches').scrollIntoView({block:'center'})");
      await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.equal((await info()).paints,drawn.paints,'unchanged thumbnails are reused');
      await a.eval(`window.__oldFeltPreview=document.querySelector('[data-felt="ocean"] .swatch-dot').style.backgroundImage`);
      await a.dbg('devOpen()');
      assert.deepEqual((await a.dbg("devFeltSet('ocean',{feltBase:'#315674'})")).refused,[]);
      await a.dbg('devClose()');
      await a.dbg("openSettings('staging')");
      await a.eval("document.getElementById('felt-swatches').scrollIntoView({block:'center'})");
      await a.waitFor(`(()=>{const image=document.querySelector('[data-felt="ocean"] .swatch-dot').style.backgroundImage;return image&&image!==window.__oldFeltPreview;})()`);
      assert.equal((await info()).previews,drawn.previews,'editing a mat replaces its cached thumbnail');
      await a.eval("document.getElementById('table-preview').scrollIntoView({block:'center'})");
      await a.waitFor(`document.getElementById('table-preview').style.backgroundImage===document.querySelector('[data-felt="ocean"] .swatch-dot').style.backgroundImage`);
      await tapControl(a,'#settings-close');
      await a.waitFor('window.__diceDebug.feltPreviewInfo().pending===0');
    },
  },
  {
    name:'table-controls', tags:['smoke','table-controls','settings','cuj2'],
    async fn(ctx) {
      const a=await ctx.newTable({origin:'127.0.0.101',name:'Alice'});
      const b=await ctx.newTable({origin:'127.0.0.102',name:'Bob'});
      await a.roll('2d6');
      const seat=await a.playerId(), room=await a.eval('location.search');
      const library=await a.dbg('groups');
      const felt=await a.dbg('felt.id');
      await click(a,'#table-open');
      assert.equal(await a.eval(`document.getElementById('left-panel').inert`),false,'desktop setup leaves the table usable');
      assert.equal(await a.eval(`document.querySelectorAll('.table-person').length`),2);
      await inputName(a,'The Copper Lantern');
      await click(a,'#snav-staging');
      await click(a,'[data-felt="ocean"]');
      assert.equal(await a.dbg('felt.id'),felt,'preview does not repaint the live table');
      assert.equal(await b.dbg('felt.id'),felt,'preview changes nothing for Bob');
      assert.notEqual(await b.eval('document.title'),'The Copper Lantern — Dice Table');
      assert.match(await a.eval(`document.getElementById('table-preview-label').textContent`),/Ocean/);
      // Incoming play and an unrelated shared edit continue around the workspace.
      await b.roll('1d6'); await a.settle();
      const roll=await a.rollId();
      await b.dbg(`setZoom('medium')`);
      await a.waitFor(`window.__diceDebug.tableEdit.values.zoom === 'medium'`);
      assert.ok(!(await a.dbg('tableEdit')).dirty.includes('zoom'),'an untouched setting follows the live table');
      await click(a,'#table-edit-apply');
      await b.waitFor(`window.__diceDebug.settings.tableName === 'The Copper Lantern' && window.__diceDebug.felt.id === 'ocean'`);
      await a.waitFor(`!window.__diceDebug.tableEdit.busy`);
      assert.equal(await b.eval('document.title'),'The Copper Lantern — Dice Table');
      assert.equal(await a.dbg('settings.zoom'),'medium','the patch preserves Bob’s unrelated change');
      assert.equal(await a.rollId(),roll,'Apply preserves the roll being read');
      assert.equal(await a.playerId(),seat); assert.equal(await a.eval('location.search'),room);
      assert.deepEqual(await a.dbg('groups'),library,'setup never replaces a personal library');
      assert.ok(await a.eval(`localStorage.getItem('dice.tables.v1').includes('The Copper Lantern')`),'recents use the chosen name');
      // A failed write retains the tentative edit for retry.
      await click(a,'[data-felt="plum"]');
      await a.page.browser.send('Network.enable',{},a.page.sessionId);
      await a.page.browser.send('Network.setBlockedURLs',{urls:['*/api/settings']},a.page.sessionId);
      await click(a,'#table-edit-apply');
      await a.waitFor(`!window.__diceDebug.tableEdit.busy && document.getElementById('table-edit-status').textContent.includes('Couldn’t')`);
      assert.equal(await b.dbg('felt.id'),'ocean');
      assert.ok((await a.dbg('tableEdit')).dirty.includes('felt'));
      await a.page.browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
      await click(a,'#table-edit-apply');
      await b.waitFor(`window.__diceDebug.felt.id === 'plum'`);
      await a.waitFor(`!window.__diceDebug.tableEdit.busy`);
      // A conflicting edit is visible; Reset adopts the current room.
      await click(a,'[data-felt="ocean"]');
      await b.dbg(`setFelt('crimson')`);
      await a.waitFor(`window.__diceDebug.tableEdit.conflicts.includes('felt')`);
      assert.match(await a.eval(`document.getElementById('table-edit-status').textContent`),/Someone changed/);
      await b.dbg(`setFelt('plum')`);
      await a.waitFor(`!window.__diceDebug.tableEdit.conflicts.includes('felt')`);
      assert.equal((await a.dbg('tableEdit')).values.felt,'ocean','restoring the shared base keeps the local candidate');
      assert.ok((await a.dbg('tableEdit')).dirty.includes('felt'));
      await b.dbg(`setFelt('crimson')`);
      await a.waitFor(`window.__diceDebug.tableEdit.conflicts.includes('felt')`);
      await click(a,'#table-edit-reset');
      assert.equal((await a.dbg('tableEdit')).values.felt,'crimson');
      await click(a,'[data-felt="sand"]');
      await click(a,'#table-edit-cancel');
      assert.equal(await a.dbg('tableEdit'),null);
      assert.equal(await b.dbg('felt.id'),'crimson','Cancel discards only the local edit');
      assert.equal(await a.eval('document.activeElement.id'),'table-open');
      await click(a,'#my-dice'); await a.waitFor('window.__diceDebug.diceGallery.open');
      assert.equal(await a.eval(`document.getElementById('settings-modal').classList.contains('hidden')`),true);
    },
  },
  {
    name:'table-controls-phone',tags:['table-controls','touch','settings'],
    async fn(ctx) {
      const a=await ctx.newTable({origin:'127.0.0.103',name:'Alice'});
      const size=(width,height,mobile=true)=>a.page.browser.send('Emulation.setDeviceMetricsOverride',
        {width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
      await size(390,844); await a.emulateCoarsePointer(true);
      await a.eval(`localStorage.removeItem('dice.panels.v1')`); await a.reload();
      const layout=await a.eval(`({dice:document.getElementById('my-dice').getBoundingClientRect().toJSON(),nav:document.getElementById('workspace-nav').getBoundingClientRect().toJSON(),scene:document.getElementById('scene-container').getBoundingClientRect().toJSON(),width:document.body.scrollWidth})`);
      assert.equal(layout.dice.height,0,'phone dice-set selection stays in the expanded roll controls');
      assert.equal(layout.scene.left,0);assert.equal(layout.scene.width,390);
      assert.equal(layout.nav.height,52,'one navigation row leaves the playing surface full width');
      assert.equal(layout.width,390);
      await tapControl(a,'#workspace-nav [data-workspace="dice"]');
      assert.equal(await a.dbg('workspaces.current'),'dice');
      const dice=await a.eval(`document.getElementById('my-dice').getBoundingClientRect().toJSON()`);
      assert.ok(dice.height>=34&&dice.top>=0&&dice.bottom<=844,'Dice is visible beside the expanded roll controls');
      assert.equal(await a.eval(`document.getElementById('my-dice').closest('#draft-actions')?.id`),'draft-actions');
      await tapControl(a,'#my-dice');await a.waitFor('window.__diceDebug.diceGallery.open');
      await tapControl(a,'.dg-close');
      assert.equal(await a.eval('document.activeElement.id'),'my-dice');
      await tapControl(a,'#workspace-back');
      await tapControl(a,'#table-open');
      assert.equal(await a.eval(`document.getElementById('left-panel').inert`),true);
      await tapControl(a,'#snav-table');await key(a,'ArrowRight','ArrowRight',39);
      assert.equal(await a.eval('document.activeElement.id'),'snav-staging','keyboard arrows reach Appearance inside the sheet');
      assert.equal(await a.dbg('settingsDest()'),'staging');
      await key(a,'ArrowLeft','ArrowLeft',37);
      const zoom = await a.dbg('settings.zoom');
      await tapControl(a,'#zoom-picker [aria-checked="true"]');await key(a,'ArrowRight','ArrowRight',39);
      assert.notEqual((await a.dbg('tableEdit')).values.zoom,zoom,'arrows change the tentative rolling-area selection');
      assert.equal(await a.dbg('settings.zoom'),zoom,'keyboard selection still waits for Apply');
      // Follow actual keyboard focus to the final action, without applying it.
      for(let i=0;i<30&&await a.eval('document.activeElement.id')!=='table-edit-apply';i++)await key(a,'Tab','Tab',9);
      assert.equal(await a.eval('document.activeElement.id'),'table-edit-apply');
      await key(a,'Tab','Tab',9);
      assert.equal(await a.eval('document.activeElement.id'),'settings-close');
      await size(390,440);
      await typeControl(a,'#set-table-name','Not applied');
      const bounds=await a.eval(`({input:document.getElementById('set-table-name').getBoundingClientRect().toJSON(),apply:document.getElementById('table-edit-apply').getBoundingClientRect().toJSON()})`);
      assert.ok(bounds.input.top>=0 && bounds.apply.bottom<=440,'name and Apply fit a shorter keyboard viewport');
      await key(a,'Escape','Escape',27);
      assert.equal(await a.eval('document.activeElement.id'),'table-open');
      assert.notEqual(await a.dbg('settings.tableName'),'Not applied');
      await size(390,844);await tapControl(a,'#phone-more');await tapControl(a,'#phone-tool-preferences');
      const pref=await a.eval(`document.getElementById('settings-panel').getBoundingClientRect().toJSON()`);
      assert.ok(pref.top>=0 && pref.bottom<=844,'device preferences fit the phone viewport');
      assert.ok(await a.eval(`document.getElementById('presentation-picker').getBoundingClientRect().top>=0 && document.getElementById('set-ambience').getBoundingClientRect().bottom<=844`),'presentation and sound choices remain visible together');
      assert.equal(await a.eval(`document.getElementById('settings-title').textContent`),'Preferences');
      await size(1000,844,false);
      await a.waitFor(`!document.getElementById('left-panel').inert`);
      assert.equal(await a.eval('document.activeElement.id'),'settings-close');
      await tapControl(a,'#settings-close');
      assert.equal(await a.eval('document.activeElement.id'),'toggle-settings','closing after a desktop resize returns to the visible Preferences entry');
      await tapControl(a,'#toggle-settings');await size(390,844);
      await a.waitFor(`document.getElementById('left-panel').inert`);
      await tapControl(a,'#settings-close');
      assert.equal(await a.eval('document.activeElement.id'),'phone-more','the reverse breakpoint uses the visible More entry');
      // A borrowed task entry is hidden when its workspace closes. Its return
      // destination must be usable on both layouts without reopening a task.
      for(const width of [390,1000]) {
        await size(width,844,width===390);
        await tapControl(a,'#workspace-nav [data-workspace="dice"]');
        await tapControl(a,'#workspace .workspace-tools button:nth-child(2)');
        assert.equal(await a.dbg('settingsDest()'),'stuff');
        await tapControl(a,'#settings-close');
        assert.equal(await a.eval(`document.activeElement.matches('#workspace-nav [data-workspace="dice"]')`),true,'library returns to the visible Rolls entry');
        await tapControl(a,'#workspace-nav [data-workspace="tables"]');
        await tapControl(a,'#workspace-table-overview [data-focus-key="setup"]');
        await tapControl(a,'#settings-close');
        assert.equal(await a.eval('document.activeElement.id'),'table-open','setup returns to the visible table label');
      }
    },
  },
  {
    name:'settings-destinations',tags:['settings','chrome','look'],
    async fn(ctx) {
      const a=await ctx.newTable({origin:'localhost',name:'Alice'});
      const home={table:['set-table-name','set-invite','system-picker','zoom-picker'],
        staging:['venue-picker','felt-swatches','tower-picker'],you:['set-sound','set-chips','set-ambience'],
        stuff:['profile-rows','profile-newname','profile-new','profile-deal','portable-open','portable-zone']};
      assert.deepEqual(await a.eval(`[...document.querySelectorAll('#settings-nav button')].map(b=>b.dataset.dest)`),['table','staging']);
      let tableFrame;
      for(const [dest,ids] of Object.entries(home)) {
        await a.dbg(`openSettings(${JSON.stringify(dest)})`);
        for(const id of ids) assert.equal(await a.eval(`document.getElementById(${JSON.stringify(id)}).closest('.settings-dest').id`),'dest-'+dest);
        const state=await a.eval(`({visible:[...document.querySelectorAll('.settings-dest')].filter(s=>!s.classList.contains('hidden')).map(s=>s.id),nav:!document.getElementById('settings-nav').hidden,footer:!document.getElementById('table-edit-footer').hidden,frame:document.getElementById('settings-panel').getBoundingClientRect().toJSON()})`);
        assert.deepEqual(state.visible,['dest-'+dest]);
        const shared=['table','staging'].includes(dest);
        assert.equal(state.nav,shared); assert.equal(state.footer,shared);
        assert.ok(state.frame.bottom<=await a.eval('innerHeight'));
        if(shared) {
          if(tableFrame) assert.equal(state.frame.height,tableFrame.height,'Table and Appearance keep the same frame');
          tableFrame=state.frame;
          assert.equal(await a.eval(`document.querySelector('#settings-nav [aria-checked="true"]').dataset.dest`),dest);
        }
      }
      assert.equal(await a.eval(`document.getElementById('portable-zone').classList.contains('hidden')`),true,'library entry keeps the text editor folded');
      await ctx.browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:493,deviceScaleFactor:1,mobile:false},a.page.sessionId);
      try {
        await a.dbg('openSettings("staging")');
        const scroll=await a.eval(`(()=>{const s=document.getElementById('settings-scroll');s.scrollTop=s.scrollHeight;return {over:s.scrollHeight>s.clientHeight,bottom:s.getBoundingClientRect().bottom,footer:document.getElementById('table-edit-footer').getBoundingClientRect().top,clip:document.getElementById('felt-swatches').scrollHeight>document.getElementById('felt-swatches').clientHeight}})()`);
        assert.ok(scroll.over,'a short window has one explicit content scroll');
        assert.ok(scroll.bottom<=scroll.footer,'Apply remains outside the scrolling content');
        assert.equal(scroll.clip,false,'the mat catalogue has no nested hidden rows');
      } finally { await ctx.browser.send('Emulation.clearDeviceMetricsOverride',{},a.page.sessionId); }
    },
  },
];
