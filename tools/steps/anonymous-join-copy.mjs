/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {tapControl} from '../../tests/e2e/roll-flows.mjs';
import {typeControl} from '../../tests/e2e/explicit-library-fixture.mjs';
export default async function run(stage){
  const host=await stage.ctx.rawPlayer('Organizer');
  await stage.ctx.api('/api/settings',{playerId:host.playerId,settings:{tableName:'The Copper Lantern'}});
  const guest=await stage.ctx.newTable({origin:'127.0.0.157',anon:true});
  await guest.waitFor('document.getElementById("seat-table-name").textContent.includes("The Copper Lantern")');
  const copy=await guest.eval('document.querySelector("#name-panel > p.hint:not([id])").textContent');
  assert.equal(copy,'Saved rolls stay private until you share them with this table.');
  assert.deepEqual(await guest.dbg('profiles.shared'),[]);
  await guest.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},guest.page.sessionId);
  console.log(await stage.shot(guest,'anonymous-join-desktop.png'));
  await guest.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},guest.page.sessionId);
  await guest.emulateCoarsePointer(true);
  // Reload without a name or library edits so phone layout initializes at 390px.
  await guest.eval('window.__reloading = true');
  await guest.page.browser.send('Page.reload',{},guest.page.sessionId);
  await guest.waitFor('!window.__reloading && window.__diceDebug?.seatPicker && document.querySelector(".seat-quick.preselected")');
  assert.equal(await guest.eval('document.querySelector(".seat-deal").classList.contains("preselected")'),false);
  console.log(await stage.shot(guest,'anonymous-join-phone.png'));
  await typeControl(guest,'#name-input','Alice');await tapControl(guest,'#name-join');await guest.waitOnline();
  assert.deepEqual(await guest.dbg('groups'),[],'ordinary anonymous Join preserves product Quick dice');
  assert.deepEqual(await guest.dbg('profiles.shared'),[],'Join does not grant publication consent');
  assert.deepEqual(guest.page.errors,[]);
}
