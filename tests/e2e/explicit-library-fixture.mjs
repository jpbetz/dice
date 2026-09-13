/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {tapControl} from './roll-flows.mjs';

// Profiles are private until a player checks their library sharing control.
// Set up the library task, then exercise the real, hit-tested publication act.
export async function shareProfiles(table,ids){
  await table.dbg('openSettings("stuff")');
  for(const id of ids){
    await tapControl(table,`.library-card[data-profile="${id}"]`);
    const selector=`[data-share-profile="${id}"]`;
    assert.equal(await table.eval(`document.querySelector(${JSON.stringify(selector)}).checked`),false);
    await tapControl(table,selector);
    await table.waitFor(`window.__diceDebug.profiles.shared.includes(${JSON.stringify(id)})`);
  }
  await table.dbg('publishPools()'); // Drain the already-authorized publication.
  await tapControl(table,'#settings-close');
}

export async function typeControl(table,selector,value){
  await tapControl(table,selector);
  for(const type of ['rawKeyDown','keyUp'])await table.page.browser.send('Input.dispatchKeyEvent',
    {type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},table.page.sessionId);
  await table.page.browser.send('Input.insertText',{text:value},table.page.sessionId);
}

export async function pickOfferedProfile(table,name){
  const index=await table.eval(`(()=>{const rows=[...document.querySelectorAll('#seat-mine-rows button')];
    return rows.findIndex(row=>row.classList.contains('seat-foreign')&&row.firstElementChild?.textContent===${JSON.stringify(name)});})()`);
  assert.ok(index>=0,`${name} is offered by name`);
  await tapControl(table,`#seat-mine-rows button:nth-of-type(${index+1})`);
}
