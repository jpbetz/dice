/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';

// Real browser input after scrolling and hit testing. Never invoke an element's
// click handler directly: covered, hidden and inert controls must fail the test.
export async function click(table,selector){
  await table.page.browser.send('Page.bringToFront',{},table.page.sessionId);
  const point=await table.eval(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return {error:'missing'};node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);return {x,y,ok:r.width>0&&r.height>0&&!node.disabled&&!node.closest('[inert]')&&!!top&&(node===top||node.contains(top)),hit:top?top.tagName+'#'+top.id:null};})()`);
  assert.equal(point.ok,true,`visible input target ${selector} (${point.hit||point.error||'not hit'})`);
  const at={x:point.x,y:point.y,button:'left',clickCount:1};
  for(const [type,buttons] of [['mouseMoved',0],['mousePressed',1],['mouseReleased',0]])await table.page.browser.send('Input.dispatchMouseEvent',{type,...at,buttons},table.page.sessionId);
}
export async function type(table,selector,value){
  await click(table,selector);const send=(type,extra={})=>table.page.browser.send('Input.dispatchKeyEvent',{type,...extra},table.page.sessionId);
  await send('rawKeyDown',{key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await send('keyUp',{key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await table.page.browser.send('Input.insertText',{text:value},table.page.sessionId);
}
export async function key(table,key,code,windowsVirtualKeyCode){for(const type of ['rawKeyDown','keyUp'])await table.page.browser.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode},table.page.sessionId);}
