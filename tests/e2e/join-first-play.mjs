/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {tapControl} from './roll-flows.mjs';
import {typeControl} from './explicit-library-fixture.mjs';

export const joinFirstPlayScenarios=[
  {name:'join-quick-or-explicit-random',tags:['first-play','seat','profiles','cuj1','cuj3'],async fn(ctx){
    const host=await ctx.rawPlayer('Organizer');
    await ctx.api('/api/settings',{playerId:host.playerId,settings:{system:'soul-deal',tableName:'The Copper Lantern'}});
    for(const [origin,random] of [['127.0.0.158',false],['127.0.0.159',true]]){
      const guest=await ctx.newTable({origin,anon:true});
      await guest.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},guest.page.sessionId);
      await guest.emulateCoarsePointer(true);
      await guest.waitFor('window.__diceDebug.seatPicker.system==="soul-deal"');
      const original=await guest.eval('JSON.parse(localStorage.getItem("dice.profiles.v1"))');
      assert.equal(await guest.eval('document.querySelector(".seat-quick").classList.contains("preselected")'),true);
      assert.equal(await guest.eval('document.querySelector(".seat-deal").classList.contains("preselected")'),false);
      if(random){
        await tapControl(guest,'.seat-deal');
        assert.equal(await guest.eval('document.querySelector(".seat-deal").classList.contains("preselected")'),true);
        assert.deepEqual(await guest.eval('JSON.parse(localStorage.getItem("dice.profiles.v1"))'),original,'choosing Random does not create a profile before Join');
      }
      await typeControl(guest,'#name-input',random?'Riley':'Sam');await tapControl(guest,'#name-join');await guest.waitOnline();
      const current=await guest.eval('JSON.parse(localStorage.getItem("dice.profiles.v1"))');
      for(const profile of original.profiles)assert.deepEqual(current.profiles.find(p=>p.id===profile.id),profile,'all original profiles survive Join');
      assert.equal(current.profiles.length,original.profiles.length+(random?1:0));
      assert.equal((await guest.dbg('groups')).length,random?18:0);
      assert.deepEqual(await guest.dbg('profiles.shared'),[]);
      if(!random)assert.equal(await guest.eval('document.getElementById("quick-dice").hidden'),false);
    }
    // A stored library with no stored display name is still kept work.
    const kept=await ctx.newTable({origin:'127.0.0.160',name:'Keeper'});
    await kept.dbg("profiles.reset('soul-deal')");await kept.dbg("setGroups([{name:'Kept roll',notation:'7d8'}])");
    const original=await kept.eval('JSON.parse(localStorage.getItem("dice.profiles.v1"))');
    const returned=await ctx.newTable({origin:'127.0.0.160',anon:true});
    await returned.waitFor('window.__diceDebug.seatPicker.system==="soul-deal"');
    await tapControl(returned,'.seat-deal');await typeControl(returned,'#name-input','Returned');await tapControl(returned,'#name-join');await returned.waitOnline();
    const after=await returned.eval('JSON.parse(localStorage.getItem("dice.profiles.v1"))');
    assert.equal(after.profiles.length,original.profiles.length+1);
    for(const profile of original.profiles)assert.deepEqual(after.profiles.find(p=>p.id===profile.id),profile,'Random never removes a profile because the display name is absent');
  }},
];
