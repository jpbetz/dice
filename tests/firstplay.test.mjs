/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {NEW_TABLE_SYSTEM,QUICK_ROLLS,previewStarterKit} from '../js/firstplay.js';
import {parseNotation} from '../js/notation.js';
import {DEFAULT_SYSTEM} from '../js/meanings.js';
assert.equal(NEW_TABLE_SYSTEM,'none');
assert.equal(DEFAULT_SYSTEM,'soul-deal','historical unstamped imports keep their interpretation');
for(const roll of QUICK_ROLLS) assert.equal(parseNotation(roll).ok,true);
const preview=previewStarterKit('soul-deal',()=>0.4);
assert.equal(preview.pools.length,18);
assert.equal(previewStarterKit('unknown'),null);
const totals={};
for(const pool of preview.pools) {
  const spec=parseNotation(pool.notation).spec;
  totals[pool.category]=(totals[pool.category]||0)+spec.dice.reduce((sum,type)=>sum+Number(type.slice(1)),0);
}
assert.deepEqual(totals,{Attributes:100,Skills:100,Motivations:30},'explicit Soul Deal kit retains the priced deal');
console.log('firstplay: passed');
