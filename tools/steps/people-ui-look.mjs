/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {fixture,account,people,idle,seedFriendship,seedHome} from '../../tests/fixtures/people-app.mjs';
import {click} from '../../tests/fixtures/visible-input.mjs';
import {assertResultLayout} from '../../tests/e2e/player-results.mjs';

export default async function run(stage){
  const f=await fixture(null),one=await f.context('g_people_look'),two=await f.context('people-look-friend');
  try{
    const a=await one.newTable({origin:'127.0.0.1',name:'Alice'}),b=await two.newTable({origin:'127.0.0.1',name:'Bram'});
    const size=(width,height,mobile=false)=>a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
    await size(1440,900);
    await one.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern',venue:'copper'}});
    await a.waitFor('window.__diceDebug.settings.tableName==="The Copper Lantern"');
    await a.roll('1d20+3'); // Arrange the actual lone-player result before opening People.
    await account(a,{name:'Sam'});await account(b,{name:'Riley'});
    const ids=await seedFriendship(a,b);
    await seedHome(a,{toPersonId:ids.second});
    await two.api('/api/settings',{playerId:await b.playerId(),settings:{tableName:'The Stone Circle',venue:'copper'}});
    const received=(await seedHome(b,{toPersonId:ids.first})).invitation;
    assert.ok(received.id);await people(a);
    console.log(await stage.shot(a,'people-desktop-lone.png'));
    const others=[];
    for(const name of ['Bram','Cora','Dev'])others.push(await one.rawPlayer(name));
    for(const player of others){
      await one.api('/api/roll',{playerId:player.playerId,notation:'2d6'});
      await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(player.name)}`);await a.settle();
    }
    await a.waitFor('document.querySelectorAll("#workspace-people-current .workspace-person").length===4');
    await click(a,'#people-tab-friends');
    console.log(await stage.shot(a,'people-desktop-four.png'));
    await click(a,'#people-tab-invitations');
    await a.waitFor('document.querySelector("#people-inbox .social-home-cover img")');
    await a.eval('document.getElementById("people-inbox").scrollIntoView({block:"start",behavior:"instant"})');
    console.log(await stage.shot(a,'people-invitation-desktop.png'));
    await size(390,844,true);await a.emulateCoarsePointer(true);await a.reload();
    await people(a);await click(a,'#people-tab-invitations');
    await a.waitFor('document.querySelector("#people-inbox .social-home-cover img")');
    await a.eval('document.getElementById("people-inbox").scrollIntoView({block:"start",behavior:"instant"})');
    console.log(await stage.shot(a,'people-invitation-phone.png'));
    assert.equal(await a.eval('document.documentElement.scrollWidth'),390);
    await click(a,'#people-tab-friends');
    console.log(await stage.shot(a,'people-friends-phone.png'));
    await click(a,'#workspace-back');
    console.log('phone four-player bounds',await assertResultLayout(a,true));
    console.log(await stage.shot(a,'people-return-phone-four.png'));
    await people(a);await click(a,'#people-tab-presence');
    console.log(await stage.shot(a,'people-presence-phone.png'));
    assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
  }finally{await f.close();}
}
