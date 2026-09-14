/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {fixture} from '../../tests/fixtures/people-app.mjs';
import {invitationJourney} from '../../tests/fixtures/invitation-journey.mjs';

export default async function run(stage){
  const f=await fixture(null);
  try{await invitationJourney(f,{shot:async(page,name)=>console.log(await stage.shot(page,'invitation-'+name+'.png'))});}
  finally{await f.close();}
}
