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
import { assert } from './harness.mjs';

export const personalKitScenarios = [
  {
    name: 'personal-kit', tags: ['smoke', 'personal-kit', 'settings', 'seat'],
    async fn(ctx) {
      const a = await ctx.newTable({origin:'127.0.0.91', name:'Alice',query:'&stability=stable'});
      const b = await ctx.newTable({origin:'127.0.0.92', name:'Bob'});
      const seat = await a.playerId();
      const profiles = await a.dbg('groups');
      assert.equal(await a.eval(`performance.getEntriesByType('resource').some(r => /dicegallery|dice-gallery/.test(r.name))`), false,
        'the unopened collection loads no module, styles, or portrait images');
      await a.eval(`document.getElementById('identity-chip').click()`);
      assert.equal(await a.eval('document.activeElement.id'), 'idm-name-input');
      await a.eval(`document.getElementById('idm-name-input').value='Alicia'; document.getElementById('idm-name-save').click()`);
      await b.waitFor(`window.__diceDebug.players.some(p => p.name==='Alicia')`);
      assert.equal(await a.playerId(), seat, 'editing your name does not reseat you');
      assert.deepEqual(await a.dbg('groups'), profiles, 'a display-name edit leaves the character library alone');
      await a.dbg(`setDiceSet('std')`);
      await a.roll('2d6'); await b.settle();
      const oldRoll = await a.rollId();
      const count = await a.logCount();
      const geometry = (await a.dbg('renderAudit()')).geometries;
      await a.eval(`document.getElementById('my-dice').click()`);
      await a.waitFor('window.__diceDebug.diceGallery.open');
      await a.waitFor(`document.querySelector('.dg-preview img').naturalWidth === 560`);
      assert.equal((await a.dbg('renderAudit()')).geometries, geometry, 'gallery imagery constructs no scene geometry');
      assert.equal(await a.eval(`!!document.querySelector('.dg-card[data-set="symbols.monster"]')`), false,
        'stable gallery does not offer beta dice');
      await a.eval(`document.querySelector('.dg-card[data-set="tidewrack.seaglass"]').click()`);
      await a.waitFor(`document.querySelector('.dg-preview img').naturalWidth === 560 && !document.querySelector('.dg-preview img').hidden`);
      assert.equal(await a.dbg('diceSet'), 'std', 'browsing does not change your default');
      assert.equal(await a.rollId(), oldRoll, 'browsing preserves the existing roll');
      assert.equal(await a.logCount(), count, 'preview never creates a shared roll');
      await a.eval(`document.querySelector('.dg-favorite').click(); document.querySelector('.dg-use').click()`);
      assert.equal(await a.dbg('diceSet'), 'tidewrack.seaglass');
      assert.equal(await a.eval(`window.__diceDebug.currentRoll.set || 'std'`), 'std', 'already authored dice retain their original appearance');
      await a.eval(`document.querySelector('.dg-close').click()`);
      assert.equal(await a.eval('document.activeElement.id'), 'my-dice', 'close returns focus to the visible opener');
      await a.roll('2d6'); await b.settle();
      assert.equal(await b.eval('window.__diceDebug.currentRoll.set'), 'tidewrack.seaglass', 'the selected dice reach the other player');
      const late = await ctx.newTable({origin:'127.0.0.93',name:'Cora'});
      await late.settle();
      assert.equal(await late.eval('window.__diceDebug.currentRoll.set'), 'tidewrack.seaglass', 'late arrival sees the authored selection');
      await a.reload();
      assert.equal(await a.dbg('diceSet'), 'tidewrack.seaglass', 'choice survives reload');
      await a.dbg('openDiceGallery(null)');
      assert.ok((await a.dbg('diceGallery')).favorites.includes('tidewrack.seaglass'), 'favorites survive reload');
      await a.eval(`document.querySelector('[data-filter="favorites"]').click()`);
      assert.deepEqual(await a.eval(`[...document.querySelectorAll('.dg-card')].map(b=>b.dataset.set)`), ['tidewrack.seaglass']);
      await a.dbg('openSettings("you")');
      assert.equal((await a.dbg('diceGallery')).open, false, 'opening another destination closes the collection');
    },
  },
  {
    name: 'personal-kit-phone', tags: ['personal-kit', 'touch', 'settings'],
    async fn(ctx) {
      const a = await ctx.newTable({origin:'127.0.0.94',name:'Alice',query:'&stability=stable'});
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',
        {width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
      await a.emulateCoarsePointer(true);
      await a.eval(`localStorage.removeItem('dice.panels.v1')`);
      await a.reload();
      assert.equal((await a.dbg('panelState')).allCollapsed, true, 'fresh phone starts compact');
      await a.eval(`document.getElementById('my-dice').click()`);
      await a.waitFor('window.__diceDebug.diceGallery.open');
      const box = await a.eval(`document.getElementById('dice-gallery').getBoundingClientRect().toJSON()`);
      assert.ok(box.left >= 0 && box.right <= 390 && box.bottom <= 844, 'sheet fits the phone');
      assert.equal(await a.eval(`document.getElementById('dice-gallery').getAttribute('aria-modal')`), 'true');
      assert.equal(await a.eval(`document.getElementById('left-panel').inert`), true, 'covered phone controls leave focus order');
      await a.eval(`document.querySelector('.dg-rolls').focus(); document.querySelector('.dg-rolls').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
      assert.equal(await a.eval('document.activeElement.className'), 'dg-close', 'Tab wraps within the phone sheet');
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',
        {width:1000,height:844,deviceScaleFactor:1,mobile:false},a.page.sessionId);
      await a.waitFor(`!document.getElementById('left-panel').inert`);
      assert.equal(await a.eval(`document.getElementById('dice-gallery').hasAttribute('aria-modal')`), false,
        'expanding to a desktop drawer releases the table');
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',
        {width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
      await a.waitFor(`document.getElementById('left-panel').inert`);
      await a.eval(`document.querySelector('.dg-close').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      assert.equal((await a.dbg('diceGallery')).open, false);
      assert.equal(await a.eval(`document.getElementById('left-panel').inert`), false);
      assert.equal(await a.eval('document.activeElement.id'), 'my-dice');
      await a.eval(`document.getElementById('identity-chip').click()`);
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',
        {width:390,height:440,deviceScaleFactor:1,mobile:true},a.page.sessionId);
      const edit = await a.eval(`({input:document.getElementById('idm-name-input').getBoundingClientRect().toJSON(),save:document.getElementById('idm-name-save').getBoundingClientRect().toJSON()})`);
      assert.ok(edit.input.top >= 0 && edit.save.bottom <= 440, 'name and Save remain usable with a shorter keyboard viewport');
      await a.eval(`document.getElementById('idm-name-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      assert.equal(await a.eval(`document.getElementById('identity-menu').classList.contains('hidden')`), true);
    },
  },
];
