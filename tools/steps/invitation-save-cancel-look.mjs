/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {fixture} from '../../tests/fixtures/people-app.mjs';
import {invitationSaveCancellation} from '../../tests/fixtures/invitation-journey.mjs';
export default async function run(stage){
  for(const nextTask of ['close invitation','browse At table']){
    const f=await fixture(null);
    try{await invitationSaveCancellation(f,{nextTask,shot:async(page,name)=>console.log(await stage.shot(page,`invitation-save-${nextTask==='close invitation'?'close':'table'}-${name}.png`))});}
    finally{await f.close();}
  }
}
