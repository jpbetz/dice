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

const inputName = (tab, name) => tab.eval(`(() => {
  const input=document.getElementById('set-table-name'); input.value=${JSON.stringify(name)};
  input.dispatchEvent(new Event('input',{bubbles:true}));
})()`);
const click = (tab, selector) => tab.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

export const tableControlScenarios = [
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
      const layout=await a.eval(`({dice:document.getElementById('my-dice').getBoundingClientRect().toJSON(),name:document.getElementById('identity-chip').getBoundingClientRect().toJSON(),roll:document.getElementById('rail-roll-wrap').getBoundingClientRect().toJSON(),width:document.body.scrollWidth})`);
      assert.ok(layout.dice.height>=34 && layout.dice.top>layout.name.bottom,'dice selection belongs to the phone roll controls');
      assert.equal(await a.eval(`document.getElementById('my-dice').closest('#phone-roll-tray')?.id`),'phone-roll-tray');
      assert.ok(layout.roll.top<=125,'management controls do not reclaim the space above Roll');
      assert.equal(layout.width,390);
      await click(a,'#table-open');
      assert.equal(await a.eval(`document.getElementById('left-panel').inert`),true);
      await a.eval(`document.getElementById('snav-table').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))`);
      assert.equal(await a.eval('document.activeElement.id'),'snav-staging','keyboard arrows reach Appearance inside the sheet');
      assert.equal(await a.dbg('settingsDest()'),'staging');
      await a.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))`);
      const zoom = await a.dbg('settings.zoom');
      await a.eval(`document.querySelector('#zoom-picker [aria-checked="true"]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))`);
      assert.notEqual((await a.dbg('tableEdit')).values.zoom,zoom,'arrows change the tentative rolling-area selection');
      assert.equal(await a.dbg('settings.zoom'),zoom,'keyboard selection still waits for Apply');
      await a.eval(`document.getElementById('table-edit-apply').focus();document.getElementById('table-edit-apply').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
      assert.equal(await a.eval('document.activeElement.id'),'settings-close');
      await size(390,440);
      await a.eval(`document.getElementById('set-table-name').focus()`);
      await inputName(a,'Not applied');
      const bounds=await a.eval(`({input:document.getElementById('set-table-name').getBoundingClientRect().toJSON(),apply:document.getElementById('table-edit-apply').getBoundingClientRect().toJSON()})`);
      assert.ok(bounds.input.top>=0 && bounds.apply.bottom<=440,'name and Apply fit a shorter keyboard viewport');
      await a.eval(`document.getElementById('set-table-name').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      assert.equal(await a.eval('document.activeElement.id'),'table-open');
      assert.notEqual(await a.dbg('settings.tableName'),'Not applied');
      await size(390,844); await click(a,'#toggle-settings');
      const pref=await a.eval(`document.getElementById('settings-panel').getBoundingClientRect().toJSON()`);
      assert.ok(pref.top>=0 && pref.bottom<=844,'device preferences fit the phone viewport');
      assert.ok(await a.eval(`document.getElementById('presentation-picker').getBoundingClientRect().top>=0 && document.getElementById('set-ambience').getBoundingClientRect().bottom<=844`),'presentation and sound choices remain visible together');
      assert.equal(await a.eval(`document.getElementById('settings-title').textContent`),'Preferences');
      await size(1000,844,false);
      await a.waitFor(`!document.getElementById('left-panel').inert`);
      assert.equal(await a.eval('document.activeElement.id'),'settings-close');
      await click(a,'#settings-close');
      assert.equal(await a.eval('document.activeElement.id'),'toggle-settings');
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
